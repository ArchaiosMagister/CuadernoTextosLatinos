/**
 * Primera conexión funcional de CuadernoTextosLatinos sobre el DOM y la
 * biblioteca originales de Examinator2. No recrea sus plantillas ni su CSS.
 * El único estado académico pertenece a EditionPane + WorkspaceRepository.
 */
import {createEditionPane,WORKING_EDITION_ID} from './edition-app.js';
import {IndexedDbCorpusRepository} from '../storage/indexeddb-corpus-repository.js';
import {WorkspaceRepository,type EditionSnapshotV1} from '../storage/workspace-repository.js';
import {DownloadedWorksRepository} from '../storage/downloaded-works.js';
import {upsertText,type TextDraft} from '../core/editor-operations.js';
import {nextNotebookTextTitle} from '../core/notebook-titles.js';
import {parseExaminatorCatalogue,originalWorkUrl,convertPerseusXml,
  type ExaminatorCatalogue,type ExaminatorEntry} from '../core/examinator-library.js';
import type {LibraryEntry,LibraryWork} from '../core/library.js';
import type {CorpusSnapshot} from '../ports/corpus-repository.js';

type Entry=ExaminatorEntry & {local?:LibraryEntry};
type DisplayEntry=Entry & {i:number;have:boolean;builtin:boolean};
type SelectionInput={urn:string;text:string;author:string;obra:string;cita:string};
type OriginalBridge={
  Propose?:{citeRef:(a:string,b:string,levels?:string[])=>string};
  openLibrary?:()=>Promise<void>;
  setTextFromLibrary?:(selection:SelectionInput)=>void;
  toast:(text:string,duration?:number)=>void;
  modal:(title:string,body:HTMLElement|string,
    actions:{label:string;primary?:boolean;onclick?:()=>void|Promise<void>}[])=>{close:()=>void};
  roman:(n:string|number)=>string;
};
const host=window as unknown as Window & {
  M:OriginalBridge;
  api:{
    web:boolean;
    call:(method:string,args?:{ids?:number[];urn?:string})=>Promise<unknown>;
    on:(event:string,listener:(payload:any)=>void)=>void;
  };
};
const M=host.M;
if(!M)throw new Error('No se ha cargado el código original de Examinator2.');
const repo=new IndexedDbCorpusRepository();
const workspace=new WorkspaceRepository();
const downloads=new DownloadedWorksRepository('cuaderno-original-examinator2-obras');
const composer=createEditionPane({
  autoApply:true,
  autoVocabulary:false,
  onAddSource:()=>openLibrary(),
});
const works=new Map<string,LibraryWork>();
const ownCache=new Set<string>();
let corpus:CorpusSnapshot;
let notebooks:EditionSnapshotV1[]=[];
let currentId:string|null=null;
let catalogue:ExaminatorCatalogue;
let allEntries:Entry[]=[];
let busy=false;
const listeners=new Map<string,Set<(value:any)=>void>>();
const notify=(event:string,value:unknown)=>{
  for(const cb of listeners.get(event)??[]){try{cb(value);}catch(error){console.error(error);}}
};
const el=<K extends keyof HTMLElementTagNameMap>(name:K,cls='',label=''):HTMLElementTagNameMap[K]=>{
  const n=document.createElement(name);if(cls)n.className=cls;if(label)n.textContent=label;return n;
};
function button(text:string,onClick:()=>void|Promise<void>,cls='tbtn'):HTMLButtonElement{
  const b=el('button',cls,text);b.type='button';
  b.addEventListener('click',()=>{void Promise.resolve(onClick()).catch(error=>M.toast(String(error),5500));});
  return b;
}
function active():boolean{return Boolean(currentId&&composer.activeEdition()?.id===currentId);}
async function reload():Promise<void>{
  [corpus,notebooks]=await Promise.all([repo.load(),workspace.listEditions()]);
}
function item(urn:string):Entry{
  const found=allEntries.find(e=>e.urn===urn);
  if(!found)throw new Error('La obra no existe en el catálogo original.');
  return found;
}
function available(entry:Entry):boolean{return Boolean(entry.local||ownCache.has(entry.urn));}
async function loadWork(urn:string):Promise<LibraryWork>{
  const cached=works.get(urn);
  if(cached)return cached;
  const meta=item(urn);
  let work:LibraryWork|null=null;
  if(meta.local){
    const response=await fetch(new URL('../library/'+meta.local.file,import.meta.url));
    if(!response.ok)throw new Error('No se ha podido leer la obra '+meta.title+'.');
    work=await response.json() as LibraryWork;
  }else work=await downloads.get(urn);
  if(!work||work.urn!==urn||!Array.isArray(work.lines)||!work.lines.length)
    throw new Error('Primero descarga esta obra desde la biblioteca.');
  works.set(urn,work);
  return work;
}
const indexCatalogue=():DisplayEntry[]=>allEntries.map((meta,i)=>({
  ...meta,i,have:available(meta),builtin:Boolean(meta.local),
}));
async function downloadWorks(ids:number[]):Promise<{started:boolean;total:number;busy?:boolean}>{
  if(busy)return {started:false,total:0,busy:true};
  const chosen=ids.map(i=>indexCatalogue()[i]).filter((x):x is DisplayEntry=>Boolean(x&&!x.have&&x.path));
  if(!chosen.length)return {started:false,total:0};
  busy=true;
  // Conservamos los mensajes originales de progreso y el evento dl-done.
  void (async()=>{
    const errors:{author:string;title:string;error:string}[]=[];
    let done=0;
    for(const entry of chosen){
      try{
        const source=originalWorkUrl(catalogue,entry);
        const response=await fetch(source);
        if(!response.ok)throw new Error('HTTP '+response.status);
        const converted=convertPerseusXml(await response.text(),entry,source);
        await downloads.save(converted);ownCache.add(entry.urn);works.set(entry.urn,converted);
      }catch(error){errors.push({author:entry.author,title:entry.title,error:String(error)});}
      done++;
      notify('dl-progress',{done,total:chosen.length,current:entry.author+' · '+entry.title});
    }
    busy=false;
    notify('dl-done',{done,total:chosen.length,errors,error:errors.length?'Algunas obras no se han descargado.':''});
  })();
  return {started:true,total:chosen.length};
}
async function removeWorks(ids:number[]):Promise<void>{
  for(const i of ids){
    const entry=indexCatalogue()[i];
    if(!entry||entry.builtin)continue;
    await downloads.remove(entry.urn);
    ownCache.delete(entry.urn);works.delete(entry.urn);
  }
}
function citation(a:string,b:string):string{
  const format=(c:string):string[]=>{
    const p=String(c).split('.');
    if(p.length>1&&/^\d+$/.test(p[0]!))p[0]=M.roman(p[0]!);
    return p;
  };
  const join=(p:string[])=>p.length>2?p[0]+' '+p.slice(1).join(', '):p.join(' ');
  const A=format(a);
  if(!b||b===a)return join(A);
  const B=format(b);
  let k=0;
  while(k<A.length-1&&k<B.length-1&&A[k]===B[k])k++;
  if(k===A.length-1&&A.length===B.length)return join(A)+'-'+B[B.length-1];
  return join(A)+' – '+join(B);
}
M.Propose={citeRef:(a,b)=>citation(a,b)};
host.api={
  web:true,
  on(event,listener){
    if(!listeners.has(event))listeners.set(event,new Set());
    listeners.get(event)!.add(listener);
  },
  async call(method,args={}){
    switch(method){
      case 'catalog':return indexCatalogue();
      case 'work':return loadWork(String(args.urn??''));
      case 'download':return downloadWorks(args.ids??[]);
      case 'deleteTexts':return removeWorks(args.ids??[]);
      default:throw new Error('Método de escritorio no disponible en el cuaderno: '+method);
    }
  },
};
/** Conexión real con el lematizador de Examinator2 (Collatinus).
 * Se carga de forma diferida y NO se reutiliza la base de Examinator2 original.
 * Su análisis no sustituye una verificación individual ni una decisión docente.
 */
type LatinToken={w:string;sel?:{lid:number};proper?:boolean;amb?:boolean};
type LatinLemma={lid:number;head:string;trad:string;note:string;proper:boolean};
type CollatinusApi={call:(method:string,args?:Record<string,unknown>)=>Promise<unknown>};
let collatinusPromise:Promise<CollatinusApi>|null=null;
async function collatinus():Promise<CollatinusApi>{
  if(!collatinusPromise)collatinusPromise=(async()=>{
    const adaptedApi=host.api;
    try{
      for(const name of ['datos.js','incluidos.js','shim.js']){
        await script(new URL('./collatinus/'+name,document.baseURI).href);
      }
      const originalApi=host.api as unknown as CollatinusApi;
      host.api=adaptedApi;
      await script(new URL('./collatinus/motor.js',document.baseURI).href);
      await originalApi.call('warm');
      return originalApi;
    }finally{host.api=adaptedApi;}
  })().catch(e=>{collatinusPromise=null;throw e;});
  return collatinusPromise;
}
/** No se infiere un gentilicio por su sufijo: lista editorial de gentilicios
 * latinos ya presentes en el repertorio docente/Collatinus. */
const GENTILICS=new Set([
  'romanus','gallus','helvetius','helvetii','graecus','latinus',
  'hispanus','hispaniensis','atheniensis','sabinus','sequanus',
  'poenus','punicus','italus','lacedemonius','lacaedemonius',
]);
const lexKey=(value:string)=>value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/æ/g,'ae')
  .replace(/œ/g,'oe').toLowerCase().trim();
async function enrichVocabulary(latin:string,placementId:string,editionId:string):Promise<void>{
  try{
    const engine=await collatinus();
    const tokens=await engine.call('analyze',{text:latin}) as LatinToken[];
    if(!Array.isArray(tokens))throw new Error('Collatinus devolvió un análisis inesperado.');
    const ids=[...new Set(tokens.filter(x=>x.sel&&(!x.amb||x.proper))
      .map(x=>x.sel!.lid))];
    if(!ids.length)return;
    const entries=await engine.call('vocabEntries',{lids:ids,mode:'modelo'}) as LatinLemma[];
    if(!Array.isArray(entries))throw new Error('Collatinus no devolvió enunciados.');
    const chosen=new Set(tokens.filter(x=>x.sel&&(!x.amb||x.proper))
      .map(x=>x.sel!.lid));
    const approved=entries.filter(x=>{
      const lemma=lexKey(x.head.split(',')[0]??'');
      return chosen.has(x.lid)&&(x.proper||GENTILICS.has(lemma));
    }).map(x=>({
      headword:x.head,lemma:x.head,meaning:x.trad||null,note:x.note||null,
    }));
    // No escribir resultados tardíos en otro cuaderno o aparición.
    if(currentId!==editionId||composer.activeEdition()?.id!==editionId||
       !composer.activeEdition()?.placements.some(x=>x.id===placementId))return;
    await composer.addCollatinusVocabulary(placementId,approved);
  }catch(error){
    console.warn('No se pudo terminar la lematización Collatinus:',error);
    M.toast('El texto se ha guardado; el análisis Collatinus queda pendiente. '
      +'Puedes editar su vocabulario manualmente.',6000);
  }
}
async function addText(input:TextDraft):Promise<void>{
  if(!active())throw new Error('Primero abre o crea un cuaderno.');
  if(!input.title.trim()||!input.latin.trim())throw new Error('El fragmento y el título no pueden estar vacíos.');
  const before=await repo.load();
  const match=before.corpus.texts.find(t=>t.latin===input.latin.trim()
    &&t.source.author===(input.author.trim()||null)
    &&t.source.work===(input.work.trim()||null)
    &&t.source.reference===(input.reference.trim()||null));
  const id=match?.id??'doc.'+crypto.randomUUID();
  if(!match){
    await repo.save(upsertText(before.corpus,input,id,new Date().toISOString()),before.revision);
    window.dispatchEvent(new CustomEvent('corpus-updated'));
  }
  // El título de la aparición es propio del cuaderno, aunque el fragmento
  // ya exista en la biblioteca con un título distinto (o en otro cuaderno).
  if(!await composer.addSourceToNotebook(id,input.title))
    throw new Error('No se ha podido añadir el pasaje al cuaderno.');
  await reload();
  render();M.toast('Fragmento incorporado al cuaderno.');
  const editionId=currentId,placement=composer.activePlacement();
  if(editionId&&placement){
    void enrichVocabulary(input.latin,placement.id,editionId);
  }
}
M.setTextFromLibrary=(fragment)=>{
  void addText({
    // 1A: título didáctico numerado dentro de cada cuaderno; nunca obra/capítulo.
    title:nextNotebookTextTitle(composer.activeEdition()?.placements??[]),
    latin:fragment.text,author:fragment.author,work:fragment.obra,reference:fragment.cita,
  }).catch(error=>M.toast('No se ha guardado el fragmento: '+String(error),6500));
};

function currentTitle():string{
  return composer.activeEdition()?.title??'Ningún cuaderno abierto';
}
async function createNotebook():Promise<void>{
  const title=window.prompt('Título del nuevo cuaderno');
  if(!title?.trim())return;
  const id=await composer.createNotebookNamed(title);
  if(!id)throw new Error('El editor no ha creado el cuaderno.');
  currentId=id;await reload();render();
  M.toast('Cuaderno creado. Selecciona un pasaje en Biblioteca.');
}
async function openNotebook(id:string):Promise<void>{
  if(!await composer.openEdition(id))throw new Error('No se ha podido abrir el cuaderno.');
  currentId=id;await reload();render();
}
function openNotebooks():void{
  const content=el('div','');
  const saved=notebooks.filter(n=>n.edition.id!==WORKING_EDITION_ID)
    .sort((a,b)=>b.edition.updatedAt.localeCompare(a.edition.updatedAt));
  if(!saved.length)content.append(el('p','muted','Todavía no hay cuadernos guardados.'));
  let close=()=>{};
  for(const x of saved){
    const row=el('div','row original-open-row');
    row.append(el('span','',x.edition.title),button('Abrir',async()=>{
      close();await openNotebook(x.edition.id);
    },'hbtn'));
    content.append(row);
  }
  const m=M.modal('Abrir cuaderno',content,[{label:'Cerrar'}]);
  close=m.close;
}
async function saveNotebook():Promise<void>{
  if(!active())throw new Error('Primero crea o abre un cuaderno.');
  if(!await composer.flush())throw new Error('El guardado no ha terminado correctamente.');
  await reload();M.toast('Cuaderno guardado.');
}
function openLibrary():void{
  if(!active()){M.toast('Abre o crea un cuaderno antes de seleccionar textos.',5000);return;}
  if(!M.openLibrary)throw new Error('La biblioteca original no se ha cargado.');
  void M.openLibrary().catch(e=>M.toast('Biblioteca: '+String(e),5500));
}
function openOwnTexts():void{
  if(!active()){M.toast('Abre primero un cuaderno.',4500);return;}
  const panel=el('div','');
  const list=el('div','original-own-list');
  const input=el('input');input.type='search';input.placeholder='Buscar textos propios…';
  input.setAttribute('aria-label','Buscar textos guardados');
  panel.append(input,list);
  let close=()=>{};
  const populate=()=>{
    list.replaceChildren();
    const needle=input.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const matching=corpus.corpus.texts.filter(t=>
      [t.title,t.source.author??'',t.source.work??''].join(' ')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(needle));
    for(const t of matching)list.append(button(t.title,async()=>{
      close();
      if(!await composer.addSourceToNotebook(t.id))throw Error('No se ha añadido el texto.');
      await reload();render();
    },'tbtn'));
    if(!matching.length)list.append(el('p','muted','No hay textos con ese filtro.'));
  };
  input.addEventListener('input',populate);
  populate();
  panel.append(button('Pegar texto propio',()=>{
    close();pasteText();
  },'tbtn'));
  const modal=M.modal('Textos propios',panel,[{label:'Cerrar'}]);close=modal.close;
}
function pasteText():void{
  if(!active())return;
  const form=el('form','original-paste');
  const inputs=new Map<string,HTMLInputElement|HTMLTextAreaElement>();
  for(const [field,name] of [
    ['title','Título'],['author','Autor'],['work','Obra'],
    ['reference','Referencia'],['latin','Texto latino'],
  ] as const){
    const label=el('label','field'),caption=el('span','',name);
    const input=field==='latin'?el('textarea'):el('input');
    if(field==='latin')(input as HTMLTextAreaElement).rows=7;
    input.setAttribute('aria-label',name);
    if(field==='title')input.value=nextNotebookTextTitle(composer.activeEdition()?.placements??[]);
    inputs.set(field,input);label.append(caption,input);form.append(label);
  }
  let close=()=>{};
  const save=button('Añadir al cuaderno',async()=>{
    const value=(name:string)=>inputs.get(name)?.value.trim()??'';
    await addText({title:value('title'),author:value('author'),work:value('work'),
      reference:value('reference'),latin:value('latin')});
    close();
  },'hbtn primary');
  form.append(save);
  form.addEventListener('submit',event=>{event.preventDefault();save.click();});
  const modal=M.modal('Pegar texto latino',form,[{label:'Cancelar'}]);close=modal.close;
}
function selectFormat():void{
  if(!active()){M.toast('Abre un cuaderno para configurar el formato.');return;}
  const controls=Array.from(composer.element.querySelectorAll<HTMLButtonElement>('.edition-menu-nav button'));
  const format=controls.find(b=>b.textContent?.includes('Formato'));
  if(!format){M.toast('Abre un texto para cambiar el formato.');return;}
  format.click();document.querySelector('#editor')?.scrollTo({top:0,behavior:'smooth'});
}
function exportDoc(type:'word'|'pdf'):void{
  if(!active()){M.toast('Abre un cuaderno para exportarlo.');return;}
  const candidates=Array.from(composer.element.querySelectorAll<HTMLButtonElement>('.edition-toolbar-actions button'));
  const action=candidates.find(b=>type==='word'?
    b.textContent?.includes('Exportar Word'):b.textContent?.includes('PDF / Imprimir'));
  if(!action){M.toast('No se ha encontrado la exportación del cuaderno.',4500);return;}
  action.click();
}
function render():void{
  const left=document.getElementById('editor');
  const page=document.getElementById('sheet');
  if(!left||!page)throw new Error('Falta el documento original de Examinator2.');
  left.replaceChildren();
  document.body.dataset.hasEditor=String(active());
  const summary=el('section','card');
  summary.append(el('h3','','Cuaderno de textos latinos'),
    el('p','',currentTitle()));
  if(active()){
    const edition=composer.activeEdition()!;
    summary.append(el('p','small muted',edition.placements.length+' textos en este cuaderno.'));
    const actions=el('div','row');
    actions.append(button('+ Texto',openLibrary,'hbtn primary'),
      button('Textos propios',openOwnTexts,'tbtn'),
      button('Pegar',pasteText,'tbtn'));
    summary.append(actions);
    const index=el('div','original-text-index');
    for(const [i,p] of edition.placements.entries()){
      index.append(button((i+1)+'. '+p.text.title,async()=>{
        if(await composer.selectPlacement(p.id))M.toast('Texto seleccionado.');
      },'tbtn'));
    }
    if(index.childElementCount)summary.append(index);
    left.append(summary,composer.element);
    page.textContent='';
  }else{
    summary.append(el('p','muted','Crea un cuaderno o abre uno guardado. La biblioteca conserva el aspecto y los controles originales de Examinator2.'));
    summary.append(button('Nuevo cuaderno',createNotebook,'hbtn primary'),
      button('Abrir cuaderno',openNotebooks,'hbtn'));
    left.append(summary);
    page.replaceChildren(el('h2','','Cuaderno de textos latinos'),
      el('p','','Elige «Nuevo» o «Abrir» para empezar. Aquí aparecerá la vista A4 del cuaderno.'));
  }
  document.title=currentTitle()+' · Cuaderno de textos latinos';
}
function wireButtons():void{
  const byId=(id:string):HTMLButtonElement=>{
    const node=document.getElementById(id);
    if(!(node instanceof HTMLButtonElement))throw new Error('Falta '+id);
    return node;
  };
  byId('btnNew').onclick=()=>{void createNotebook().catch(e=>M.toast(String(e),5000));};
  byId('btnOpen').onclick=openNotebooks;
  byId('btnSave').onclick=()=>{void saveNotebook().catch(e=>M.toast(String(e),5000));};
  byId('btnLib').onclick=openLibrary;
  byId('btnLists').onclick=openOwnTexts;
  byId('btnSettings').onclick=selectFormat;
  byId('btnDocx').onclick=()=>exportDoc('word');
  byId('btnPdf').onclick=()=>exportDoc('pdf');
  document.getElementById('lib')?.addEventListener('click',event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    const row=target.closest<HTMLElement>('.rtext .rl');
    if(!row)return;
    const selected=window.getSelection();
    if(selected&&!selected.isCollapsed)return;
    const text=row.querySelector<HTMLElement>('.rx');
    if(!text)return;
    const range=document.createRange();range.selectNodeContents(text);
    selected?.removeAllRanges();selected?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  },true);
}
function script(url:string):Promise<void>{
  return new Promise((resolve,reject)=>{
    const s=el('script');s.src=url;s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('No se ha cargado la biblioteca original: '+url));
    document.body.append(s);
  });
}
void (async()=>{
  try{
    const [local,full,downloaded]=await Promise.all([
      fetch(new URL('../library/catalog.json',import.meta.url)),
      fetch(new URL('../library/examinator-catalog.json',import.meta.url)),
      downloads.list(),
    ]);
    if(!local.ok||!full.ok)throw Error('Faltan los catálogos de textos.');
    const localWorks=(await local.json() as {works:LibraryEntry[]}).works;
    if(!Array.isArray(localWorks))throw Error('Catálogo offline inválido.');
    catalogue=parseExaminatorCatalogue(await full.json());
    const entries=new Map<string,Entry>(catalogue.entries.map(x=>[x.urn,{...x}]));
    for(const x of localWorks){
      const original=entries.get(x.urn);
      entries.set(x.urn,original?{...original,local:x}:{
        urn:x.urn,path:'',author:x.author,title:x.title,latin:x.latin,
        genre:x.genre,description:x.editorial,local:x,
      });
    }
    allEntries=[...entries.values()];
    downloaded.forEach(x=>ownCache.add(x));
    await composer.open();
    await reload();
    wireButtons();
    await script(new URL('./js/library.js',document.baseURI).href);
    render();
  }catch(e){
    console.error(e);
    const target=document.getElementById('editor');
    if(target)target.textContent='No se ha podido iniciar el cuaderno: '+String(e);
  }
})();
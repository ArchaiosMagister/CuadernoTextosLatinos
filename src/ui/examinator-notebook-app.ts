import type {GrammarReviewDecisionV1} from '../core/edition-model.js';
import {fingerprintForMark} from '../core/edition-validation.js';
import {proposeCollatinusGrammar,type CollatinusGrammarToken,type CollatinusGrammarProposal} from '../core/collatinus-grammar.js';
import {renderGrammarEditor} from './grammar-editor.js';
import type {CorpusV1} from '../core/model.js';
import {validateCorpus} from '../core/validation.js';
/**
 * Primera conexión funcional de CuadernoTextosLatinos sobre el DOM y la
 * biblioteca originales de Examinator2. No recrea sus plantillas ni su CSS.
 * El único estado académico pertenece a EditionPane + WorkspaceRepository.
 */
import {createEditionPane,WORKING_EDITION_ID} from './edition-app.js';
import {IndexedDbCorpusRepository} from '../storage/indexeddb-corpus-repository.js';
import {WorkspaceRepository,WorkspaceConflictError,type EditionSnapshotV1} from '../storage/workspace-repository.js';
import {combineNotebookCorpora,createNotebookBackup,createWorkspaceBackup,importNotebookDependencies,prepareWorkspaceRestore,readNotebookBackup,restoreWorkspaceBackup,WORKSPACE_BACKUP_MAX_CHARACTERS} from '../storage/workspace-backup.js';
import {DownloadedWorksRepository} from '../storage/downloaded-works.js';
import {deleteText,upsertText,type TextDraft} from '../core/editor-operations.js';
import {nextNotebookTextTitle} from '../core/notebook-titles.js';
import {readTeacherDocx,type ParsedTeacherDocx} from '../core/docx-import.js';
import {parseExaminatorCatalogue,originalWorkUrl,convertPerseusXml,
  type ExaminatorCatalogue,type ExaminatorEntry} from '../core/examinator-library.js';
import {foldLatin,type LibraryEntry,type LibraryWork} from '../core/library.js';
import {allGrammarTags,catalogDepth,findTagByLabel,isCustomTagLabelValid,matchesGrammarFilters,placementGrammarTags} from '../core/grammar-tags.js';
import {PREFERRED_VOCABULARY_KEY,parsePreferredVocabulary,preferredFor,vocabularyKey,
  type VocabularyQuantityMode} from '../core/vocabulary-preferences.js';
import type {CollatinusVocabularyCandidate} from './edition-app.js';

type Entry=ExaminatorEntry & {local?:LibraryEntry};
type DisplayEntry=Entry & {i:number;have:boolean;builtin:boolean};
type SelectionInput={urn:string;text:string;author:string;obra:string;cita:string};
type OriginalBridge={
  Propose?:{citeRef:(a:string,b:string,levels?:string[])=>string};
  openLibrary?:()=>Promise<void>;
  setTextFromLibrary?:(selection:SelectionInput)=>void;
  toast:(text:string,duration?:number)=>void;
  modal:(title:string,body:HTMLElement|string,
    actions:{label:string;primary?:boolean;onclick?:()=>void|false|Promise<void|false>}[],options?:{noFocus?:boolean;width?:string})=>{close:()=>void};
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
  findCorpusSource:async id=>(await loadCombinedCorpus()).texts.find(text=>text.id===id),
  onAnalyzeVocabulary:(latin,quantity)=>collatinusVocabulary(latin,quantity),
});
const works=new Map<string,LibraryWork>();
const ownCache=new Set<string>();
let corpus:CorpusV1;
let notebooks:EditionSnapshotV1[]=[];
let currentId:string|null=null;
const lastNotebookKey='cuaderno-examinator-ultimo-v1';
function rememberNotebook():void{
  try{
    if(currentId)localStorage.setItem(lastNotebookKey,currentId);
    else localStorage.removeItem(lastNotebookKey);
  }catch{/* almacenamiento opcional */}
}
function downloadBackup(json:string,name:string):void{
  const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const link=el('a');link.href=url;
  link.download=name+'-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function restoreNotebooks(file:File):Promise<void>{
  if(file.size>WORKSPACE_BACKUP_MAX_CHARACTERS)throw Error('La copia supera 64 MiB.');
  if(!await composer.flush())throw Error('No se han guardado los cambios pendientes.');
  const json=await file.text();
  const backup=await readNotebookBackup(json);
  if(backup){
    const {edition,fingerprint,dependencies}=backup;
    const id='edition.import.'+fingerprint;
    if(await workspace.loadEdition(id)){
      await openNotebook(id);M.toast('Esta copia ya se había importado.');
      return;
    }
    if(!window.confirm('¿Importar «'+edition.title+'» como cuaderno independiente?'))return;
    const timestamp=new Date().toISOString();
    try{
      const imported={...edition,id,legacyNotebookId:null,updatedAt:timestamp};
      const historical=(await repo.load()).corpus;
      await workspace.commitEdition(id,0,{command:'ui.restore-notebook',targetId:id,timestamp},
        ()=>imported,dependencies?local=>importNotebookDependencies(imported,dependencies,local,historical):undefined);
    }catch(error){
      if(!(error instanceof WorkspaceConflictError)||!await workspace.loadEdition(id))throw error;
    }
    await openNotebook(id);
    return;
  }
  const preview=await prepareWorkspaceRestore(workspace,json);
  if(!window.confirm('La copia contiene '+preview.target.notebookCount+
    ' cuadernos. ¿Descargar un respaldo del espacio actual antes de sustituirlo?'))return;
  downloadBackup(preview.currentSafetyBackupJson,'copia-antes-de-restaurar');
  if(!window.confirm('Comprueba que has guardado el JSON. ¿Confirmas la sustitución del espacio editorial?'))return;
  await restoreWorkspaceBackup(workspace,json,{
    confirmReplace:true,safetyBackupExported:true,
    currentSafetyBackupJson:preview.currentSafetyBackupJson,
    expectedWorkspaceRevision:preview.expectedWorkspaceRevision,
  });
  composer.closeEdition();currentId=null;rememberNotebook();
  await reload();render();
  M.toast('Espacio editorial restaurado.');
}
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
async function loadCombinedCorpus():Promise<CorpusV1>{
  const [historical,editorial]=await Promise.all([repo.load(),workspace.loadCorpus()]);
  return combineNotebookCorpora(editorial.corpus,historical.corpus);
}
async function reload():Promise<void>{
  [corpus,notebooks]=await Promise.all([loadCombinedCorpus(),workspace.listEditions()]);
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
type LatinToken={w:string;sel?:{lid:number};proper?:boolean;amb?:boolean;lplain?:string;lemma?:string;
  cands?:Array<{lid:number;trad?:string}>};
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
/** Lemas de Collatinus para cualquier palabra reconocida del texto.
 * Los significados se toman solo de Collatinus o del banco preferente del cuaderno.
 * Ninguna ficha se presenta como verificación docente individual.
 */
async function collatinusVocabulary(latin:string,quantity:VocabularyQuantityMode):
  Promise<CollatinusVocabularyCandidate[]>{
  const engine=await collatinus();
  const tokens=await engine.call('analyze',{text:latin}) as LatinToken[];
  if(!Array.isArray(tokens))throw new Error('Collatinus devolvió un análisis inesperado.');
  const ids=[...new Set(tokens.filter(t=>t.sel).map(t=>t.sel!.lid))];
  if(!ids.length)return [];
  const entries=await engine.call('vocabEntries',{lids:ids,mode:quantity}) as LatinLemma[];
  if(!Array.isArray(entries))throw new Error('Collatinus no devolvió enunciados.');
  const tokenGlosses=new Map<number,string>(),tokenLemmas=new Map<number,string>();
  const forms=new Map<number,Set<string>>();
  for(const token of tokens){
    if(!token.sel)continue;
    const existingForms=forms.get(token.sel.lid)??new Set<string>();
    existingForms.add(token.w);forms.set(token.sel.lid,existingForms);
    if(!tokenLemmas.has(token.sel.lid))
      tokenLemmas.set(token.sel.lid,token.lplain||token.lemma||token.w);
    const gloss=token.cands?.find(c=>c.lid===token.sel?.lid)?.trad?.trim();
    if(gloss&&!tokenGlosses.has(token.sel.lid))tokenGlosses.set(token.sel.lid,gloss);
  }
  let preferred:ReturnType<typeof parsePreferredVocabulary>=[];
  try{preferred=parsePreferredVocabulary(localStorage.getItem(PREFERRED_VOCABULARY_KEY));}
  catch(error){console.warn('El vocabulario preferente necesita revisión:',error);}
  return entries.filter(x=>ids.includes(x.lid)).map(x=>{
    const lemma=tokenLemmas.get(x.lid)||x.head.split(',')[0]||'';
    const saved=preferredFor(preferred,lemma);
    const proper=x.proper||GENTILICS.has(vocabularyKey(lemma));
    return {
      lemma,
      headword:saved?.headword??x.head,
      meaning:saved?.meaning??x.trad?.trim()??tokenGlosses.get(x.lid)??null,
      note:saved?.note??x.note??null,
      proper,forms:[...(forms.get(x.lid)??[])],
      glossesSeparated:saved?.glossesSeparated??false,
    };
  });
}
// La escritura diferida del vocabulario comparte la revisión editorial con las incorporaciones.
let pendingSourceWrite:Promise<unknown>=Promise.resolve();
function writeSource<T>(operation:()=>Promise<T>):Promise<T>{
  const next=pendingSourceWrite.then(operation);
  pendingSourceWrite=next.catch(()=>{});
  return next;
}
async function enrichVocabulary(latin:string,placementId:string,editionId:string):Promise<void>{
  try{
    const placement=composer.activeEdition()?.placements.find(x=>x.id===placementId);
    const entries=await collatinusVocabulary(latin,placement?.vocabularyQuantityMode??'modelo');
    await writeSource(async()=>{
      if(currentId!==editionId||composer.activeEdition()?.id!==editionId||
         !composer.activeEdition()?.placements.some(x=>x.id===placementId&&x.text.latin===latin.trim()))return;
      await composer.addCollatinusVocabulary(placementId,entries,latin.trim());
    });
  }catch(error){
    console.warn('No se pudo terminar la lematización Collatinus:',error);
    M.toast('El texto se ha guardado; el análisis Collatinus queda pendiente. '
      +'Puedes editar su vocabulario manualmente.',6000);
  }
}
function addText(input:TextDraft):Promise<void>{
  const target=currentId;
  return writeSource(async()=>{
    if(currentId!==target)throw Error('El cuaderno activo cambió antes de añadir el texto.');
    await addSourceText(input);
  });
}
async function addSourceText(input:TextDraft):Promise<void>{
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
  currentId=id;rememberNotebook();await reload();render();
  M.toast('Cuaderno creado. Selecciona un pasaje en Biblioteca.');
}
async function openNotebook(id:string):Promise<void>{
  if(!await composer.openEdition(id))throw new Error('No se ha podido abrir el cuaderno.');
  currentId=id;rememberNotebook();await reload();render();
}
let deletingNotebook=false;
async function deleteNotebook(id:string):Promise<void>{
  if(deletingNotebook)return;
  deletingNotebook=true;
  try{
    if(!await composer.flush())throw Error('No se han guardado los cambios pendientes.');
    const snapshot=await workspace.loadEdition(id);
    if(!snapshot||snapshot.edition.legacyNotebookId!==null)
      throw Error('Este cuaderno no se puede eliminar.');
    const title=snapshot.edition.title;
    if(!window.confirm('¿Eliminar definitivamente «'+title+'» y su historial? '+
      'Te recomendamos hacer antes una copia de seguridad desde la tarjeta del cuaderno, '+
      'pero no es obligatorio. Esta acción no se puede deshacer.'))return;
    await workspace.deleteEdition(id,snapshot.revision);
    if(currentId===id){
      currentId=null;rememberNotebook();
      composer.closeEdition();
    }
    await reload();render();
    M.toast('Cuaderno eliminado.');
  }finally{deletingNotebook=false;}
}
function openNotebooks():void{
  const content=el('div','');
  const saved=notebooks.filter(n=>n.edition.id!==WORKING_EDITION_ID)
    .sort((a,b)=>b.edition.updatedAt.localeCompare(a.edition.updatedAt));
  if(!saved.length)content.append(el('p','muted','Todavía no hay cuadernos guardados.'));
  let close=()=>{};
  for(const x of saved){
    const row=el('div','row original-open-row');
    const details=el('span','',x.edition.title);
    details.append(el('small','muted',' · '+x.edition.placements.length+' textos · '+
      new Date(x.edition.updatedAt).toLocaleString('es')));
    row.append(details,button('Abrir',async()=>{
      close();await openNotebook(x.edition.id);
    },'hbtn'));
    row.append(button('Hacer copia',async()=>{
      if(!await composer.flush())throw Error('Hay cambios pendientes de guardar.');
      const saved=await workspace.loadEdition(x.edition.id);
      if(!saved)throw Error('El cuaderno ya no está disponible.');
      downloadBackup(await createNotebookBackup(saved.edition,await loadCombinedCorpus()),'copia-cuaderno');
    },'tbtn'));
    if(x.edition.legacyNotebookId===null){
      const remove=button('Eliminar',async()=>{
        await deleteNotebook(x.edition.id);
        if(notebooks.some(n=>n.edition.id===x.edition.id))return;
        close();openNotebooks();
      },'tbtn');
      remove.setAttribute('aria-label','Eliminar cuaderno '+x.edition.title);
      row.append(remove);
    }else row.append(el('small','muted','Cuaderno histórico protegido'));
    content.append(row);
  }
  const m=M.modal('Gestionar cuadernos',content,[{label:'Cerrar'}]);
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
  const panel=el('div','');
  const list=el('div','original-own-list');
  panel.append(el('p','muted','Aquí se guardan las fuentes de los pasajes añadidos desde la biblioteca o pegados en un cuaderno.'));
  const input=el('input');input.type='search';input.placeholder='Buscar textos propios…';
  input.setAttribute('aria-label','Buscar textos guardados');
  const tagFilter=el('select');tagFilter.setAttribute('aria-label','Filtrar por etiqueta gramatical');
  tagFilter.multiple=true;tagFilter.size=4;
  const tags=allGrammarTags(corpus);
  for(const tag of tags){
    const option=el('option','','· '.repeat(catalogDepth(tag,tags))+tag.label);
    option.value=tag.id;tagFilter.append(option);
  }
  const filtersPanel=el('details');
  filtersPanel.append(el('summary','','Filtrar por etiquetas'),tagFilter);
  panel.append(input,filtersPanel,list);
  let close=()=>{};
  const populate=()=>{
    list.replaceChildren();
    const needle=foldLatin(input.value);
    const filters=Array.from(tagFilter.selectedOptions,option=>option.value);
    const matching=corpus.texts.filter(t=>
      foldLatin([t.title,t.source.author??'',t.source.work??''].join(' ')).includes(needle)
      && (matchesGrammarFilters(t.tagIds,filters,tags) || notebooks.some(notebook=>
        notebook.edition.placements.some(placement=>placement.source.sourceId===t.id
          && matchesGrammarFilters(placementGrammarTags(placement),filters,tags)))));
    for(const t of matching){
      const row=el('article','original-own-row');
      row.append(el('strong','',t.title));
      const source=[t.source.author,t.source.work,t.source.reference].filter(Boolean).join(' · ');
      if(source)row.append(el('small','muted',source));
      if(active()){
        const add=button('Añadir al cuaderno',async()=>{
          close();
          if(!await writeSource(()=>composer.addSourceToNotebook(t.id)))throw Error('No se ha añadido el texto.');
          await reload();render();
          const editionId=currentId,placement=composer.activePlacement();
          if(editionId&&placement)void enrichVocabulary(placement.text.latin,placement.id,editionId);
        },'tbtn');
        add.setAttribute('aria-label','Añadir «'+t.title+'» al cuaderno');
        row.append(add);
      }
      const remove=button('Quitar del banco',async()=>{
        if(!window.confirm('¿Quitar «'+t.title+'» del banco? Los cuadernos conservarán sus textos.'))return;
        await writeSource(async()=>{
          for(const repository of [repo,workspace]){
            const saved=await (repository===repo?repo.load():workspace.loadCorpus());
            if(!saved.corpus.texts.some(text=>text.id===t.id))continue;
            const next=deleteText(saved.corpus,t.id);
            if(repository===repo)await repo.save(next,saved.revision);
            else await workspace.saveCorpus(next,saved.revision);
          }
        });
        await reload();populate();M.toast('Texto retirado del banco.');
      },'tbtn');
      remove.setAttribute('aria-label','Quitar del banco: '+t.title);
      row.append(remove);list.append(row);
    }
    if(!matching.length)list.append(el('p','muted','No hay textos con ese filtro.'));
  };
  input.addEventListener('input',populate);
  tagFilter.addEventListener('change',populate);
  populate();
  if(active())panel.append(button('Pegar texto propio',()=>{
    close();pasteText();
  },'tbtn'));
  const modal=M.modal('Banco de textos',panel,[{label:'Cerrar'}]);close=modal.close;
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
    save.disabled=true;
    try{
      await addText({title:value('title'),author:value('author'),work:value('work'),
        reference:value('reference'),latin:value('latin')});
      close();
    }finally{save.disabled=false;}
  },'hbtn primary');
  form.append(save);
  form.addEventListener('submit',event=>{event.preventDefault();save.click();});
  const modal=M.modal('Pegar texto latino',form,[{label:'Cancelar'}],{noFocus:true});close=modal.close;
  inputs.get('title')?.focus();
}

function reviewWordImport(documents:{file:string;data:ParsedTeacherDocx}[],failures:string[],editionId:string):void{
  const panel=el('div','word-review');
  const pending=[...documents];
  let importing=false;
  const failuresList=el('ul','word-import-errors');
  for(const problem of failures)failuresList.append(el('li','',problem));
  if(failures.length)panel.append(failuresList);
  const cards=new Map<ParsedTeacherDocx,HTMLElement>();
  for(const {file,data} of documents){
    const card=el('details','word-review-item');
    card.open=documents.length===1;
    const heading=el('summary','','');
    const title=el('span','',data.title||file);
    heading.append(title);
    if(documents.length>1&&file!==data.title)heading.append(el('small','muted',' · '+file));
    card.append(heading);
    const fields=el('div','word-review-fields');
    for(const [key,label] of [
      ['title','Título del texto'],['author','Autor'],['work','Obra'],['reference','Libro, capítulo o referencia'],
    ] as const){
      const field=el('label','field',label),input=el('input');
      input.value=data[key]??'';input.setAttribute('aria-label',label);
      input.addEventListener('input',()=>{
        if(key==='title'){
          data.title=input.value.trim();
          title.textContent=data.title||file;
        }else data[key]=input.value.trim()||null;
      });
      field.append(input);fields.append(field);
    }
    card.append(fields);
    const preview=el('textarea');preview.rows=3;preview.readOnly=true;preview.value=data.latin;
    preview.setAttribute('aria-label','Texto latino');
    card.append(preview,el('p','small muted',data.underlines.length+' subrayados · '+
      data.vocabulary.length+' entradas reales de vocabulario.'));
    if(data.warnings.length){
      const warnings=el('details');warnings.append(el('summary','','Avisos ('+data.warnings.length+')'));
      const list=el('ul');for(const warning of data.warnings)list.append(el('li','',warning));
      warnings.append(list);card.append(warnings);
    }
    cards.set(data,card);panel.append(card);
  }
  const importLabel=documents.length===1?'Incorporar al cuaderno':'Incorporar '+documents.length+' textos';
  const confirm=async():Promise<void|false>=>{
    if(importing)return false;
    importing=true;
    try{
      if(pending.some(({data})=>!data.title)){
        M.toast('Introduce un título para cada texto.');return false;
      }
      while(pending.length){
        const {data,file}=pending[0]!;
        const placement=await writeSource(async()=>{
          if(currentId!==editionId)throw Error('Vuelve al cuaderno donde elegiste los archivos.');
          if(!await composer.importTeacherDocument(data))throw Error('No se ha podido importar '+file+'.');
          return composer.activePlacement();
        });
        pending.shift();
        if(pending.length)cards.get(data)?.remove();
        if(placement)void enrichVocabulary(data.latin,placement.id,editionId);
      }
      await reload();render();M.toast(documents.length===1?'Word añadido y guardado en el cuaderno.':
        documents.length+' textos añadidos y guardados en el cuaderno.');
    }catch(error){
      await reload();render();M.toast(String(error),8000);return false;
    }finally{importing=false;}
  };
  M.modal('Revisar importación Word',panel,[{label:'Cancelar'},
    ...(documents.length?[{label:importLabel,primary:true,onclick:confirm}]:[])],
    {width:'min(700px, 96vw)',noFocus:true});
}
function importWord():void{
  if(!active()||!currentId){M.toast('Abre o crea un cuaderno antes de importar.');return;}
  const editionId=currentId;
  const picker=el('input');picker.type='file';picker.multiple=true;
  picker.accept='.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  picker.style.display='none';document.body.append(picker);
  picker.addEventListener('cancel',()=>picker.remove(),{once:true});
  picker.addEventListener('change',async()=>{
    const files=Array.from(picker.files??[]);picker.remove();
    if(!files.length)return;
    const documents:{file:string;data:ParsedTeacherDocx}[]=[],failures:string[]=[];
    for(const file of files){
      try{documents.push({file:file.name,data:await readTeacherDocx(file)});}
      catch(error){failures.push(file.name+' · '+String(error instanceof Error?error.message:error));}
    }
    reviewWordImport(documents,failures,editionId);
  },{once:true});
  picker.click();
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
async function openGrammarEditor():Promise<void>{
  if(!await composer.flush())throw Error('No se han guardado los cambios pendientes.');
  const placement=composer.activePlacement();
  if(!placement)return;
  const panel=el('div');
  const manual=el('div');
  const suggestions=el('div','collatinus-grammar-review');
  const notice=(message:string)=>M.toast(message,5000);
  panel.append(manual,button('Analizar etiquetas con Collatinus',analyze,'hbtn'),suggestions);
  let analyzing=false;
  async function analyze():Promise<void>{
    if(analyzing)return;
    analyzing=true;
    try{
      const latest=composer.activePlacement();
      if(!latest||latest.id!==placement!.id)return;
      const latin=latest.text.latin;
      suggestions.replaceChildren(el('p','','Analizando el pasaje…'));
      const engine=await collatinus();
      const tokens=await engine.call('analyze',{text:latin}) as CollatinusGrammarToken[];
      const rejected=new Set<string>();
      const corrections=new Map<number,{lid:number;morpho:string}>();
      const retired=(latest.grammarReview??[]).filter(item=>item.reviewRequired);
      for(const item of latest.grammarReview??[]){
        if(item.reviewRequired)continue;
        if(item.kind==='rejected')rejected.add([item.startUtf16,item.endUtf16,item.tagId].join(':'));
        else corrections.set(item.startUtf16,{lid:item.lid,morpho:item.morpho});
      }
      if(!latest.grammarReview){
        const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(latin)));
        const identity=Array.from(digest,n=>n.toString(16).padStart(2,'0')).join('');
        const key='cuaderno-collatinus-revision-v1:'+currentId+':'+latest.id+':'+identity;
        try{
          const state=JSON.parse(localStorage.getItem(key)??'null') as {
            rejected:string[];corrections:[number,{lid:number;morpho:string}][];
          }|null;
          for(const id of state?.rejected??[])if(typeof id==='string')rejected.add(id);
          for(const [position,reading] of state?.corrections??[])corrections.set(position,reading);
        }catch{/* el análisis continúa sin estas preferencias */ }
        if(rejected.size||corrections.size)await remember();
      }
      async function remember():Promise<void>{
        const decisions:GrammarReviewDecisionV1[]=[...retired];
        function anchor(start:number,end:number){
          return {startUtf16:start,endUtf16:end,exact:latin.slice(start,end),
            textFingerprint:fingerprintForMark(latin,start,end),reviewRequired:false};
        }
        for(const id of rejected){
          const match=/^(\d+):(\d+):([a-zA-Z0-9._-]+)$/u.exec(id);
          if(!match)continue;
          const start=Number(match[1]),end=Number(match[2]);
          if(start<end&&end<=latin.length&&latin.slice(start,end).trim())
            decisions.push({...anchor(start,end),kind:'rejected',tagId:match[3]!});
        }
        for(const token of tokens){
          const reading=corrections.get(token.s);
          if(reading&&token.w===latin.slice(token.s,token.e)
            &&token.cands?.some(c=>c.lid===reading.lid&&c.morphos.includes(reading.morpho)))
            decisions.push({...anchor(token.s,token.e),kind:'reading',...reading});
        }
        if(!await composer.setGrammarReview(latest!.id,latin,decisions))
          throw Error('No se ha podido guardar la decisión de revisión.');
      }
      const tags=allGrammarTags(corpus);
      const label=(id:string)=>tags.find(tag=>tag.id===id)?.label??id;
      function verifyText():boolean{
        const current=composer.activePlacement();
        return current?.id===latest!.id&&current.text.latin===latin;
      }
      function show():void{
        const annotated=tokens.map(token=>{
          const corrected=corrections.get(token.s);
          const found=token.cands?.find(c=>c.lid===corrected?.lid&&c.morphos.includes(corrected.morpho));
          return found&&corrected?{...token,sel:corrected,cands:[{...found,morphos:[corrected.morpho]}]}:token;
        });
        const proposals=proposeCollatinusGrammar(latin,annotated);
        const current=composer.activePlacement();
        const confirmed=current?.grammaticalSpans?.filter(span=>!span.reviewRequired)??[];
        const unresolved=tokens.filter(token=>!token.sel).map(token=>token.w);
        const ambiguous=tokens.filter(token=>(token.cands??[]).reduce((n,c)=>n+c.morphos.length,0)>1);
        suggestions.replaceChildren(el('p','','Propuestas de Collatinus · '+proposals.length+
          ' candidaturas · '+rejected.size+' descartadas'));
        if(unresolved.length)suggestions.append(el('p','','Sin análisis: '+unresolved.join(', ')));
        if(ambiguous.length){
          const ambiguity=el('details');
          ambiguity.append(el('summary','','Lecturas alternativas ('+ambiguous.length+')'));
          for(const token of ambiguous){
            const row=el('label','field',token.w);
            const choose=el('select');choose.setAttribute('aria-label','Lectura de '+token.w+' en posición '+token.s);
            const automatic=el('option','','Análisis de Collatinus');automatic.value='';choose.append(automatic);
            const readings=(token.cands??[]).flatMap(c=>c.morphos.map(morpho=>({
              lid:c.lid,morpho,label:c.lemma+' · '+(morpho||c.im),
            })));
            readings.forEach((reading,index)=>{
              const option=el('option','',reading.label);option.value=String(index);choose.append(option);
            });
            const correction=corrections.get(token.s);
            const index=readings.findIndex(reading=>reading.lid===correction?.lid&&reading.morpho===correction?.morpho);
            choose.value=index===-1?'':String(index);
            choose.addEventListener('change',async()=>{
              const reading=readings[Number(choose.value)];
              if(choose.value&&reading)corrections.set(token.s,{lid:reading.lid,morpho:reading.morpho});
              else corrections.delete(token.s);
              try{await remember();show();}catch(error){notice(String(error));}
            });
            row.append(choose);ambiguity.append(row);
          }
          suggestions.append(ambiguity);
        }
        const selectedProposals=new Map<CollatinusGrammarProposal,string>();
        async function accept(selections:Map<CollatinusGrammarProposal,string>):Promise<void>{
          if(!verifyText())throw Error('El pasaje cambió. Vuelve a analizarlo.');
          const assignments=[...selections].map(([proposal,tagId])=>({
            start:proposal.start,end:proposal.end,tagId,
            ...(tagId===proposal.tagId?{evidence:{
              engine:'Collatinus / instantánea integrada de Examinator2',
              rule:'cuaderno-gramatica-v1:'+proposal.tagId,evidence:proposal.evidence,
            }}:{}),
          }));
          if(!await composer.addGrammarSpans(assignments))throw Error('No se han guardado las etiquetas.');
          await update();show();
        }
        const acceptSelected=button('Aceptar las seleccionadas',()=>accept(selectedProposals),'hbtn');
        acceptSelected.disabled=true;
        suggestions.append(acceptSelected);
        for(const proposal of proposals){
          const id=[proposal.start,proposal.end,proposal.tagId].join(':');
          const row=el('details','grammar-proposal-card');
          const accepted=confirmed.some(span=>span.startUtf16===proposal.start&&span.endUtf16===proposal.end
            &&span.tagIds.includes(proposal.tagId));
          const discarded=rejected.has(id);
          row.dataset.state=accepted?'confirmed':discarded?'dismissed':'pending';
          row.append(el('summary','',latin.slice(proposal.start,proposal.end)+' · '+label(proposal.tagId)+
            (accepted?' · Confirmada':discarded?' · Descartada':' · Pendiente')));
          row.append(el('p','',proposal.evidence.join(' / ')));
          if(proposal.alternatives.length)row.append(el('p','','Lecturas alternativas: '+proposal.alternatives.join(' / ')));
          if(proposal.syntaxReview)row.append(el('p','hint','Requiere revisión sintáctica.'));
          if(!accepted&&!discarded){
            const choose=el('select');choose.setAttribute('aria-label','Etiqueta que se confirmará');
            for(const tag of tags){
              const option=el('option','',tag.label);option.value=tag.id;choose.append(option);
            }
            choose.value=proposal.tagId;
            const check=el('input');check.type='checkbox';
            const selectionLabel=el('label','','Seleccionar propuesta');selectionLabel.prepend(check);
            function selectProposal():void{
              if(check.checked)selectedProposals.set(proposal,choose.value);
              else selectedProposals.delete(proposal);
              acceptSelected.disabled=!selectedProposals.size;
            }
            check.addEventListener('change',selectProposal);choose.addEventListener('change',selectProposal);
            row.append(choose,selectionLabel,button('Aceptar',
              ()=>accept(new Map([[proposal,choose.value]])),'hbtn'),button('Descartar',async()=>{
              rejected.add(id);await remember();show();
            },'hbtn'));
          }
          suggestions.append(row);
        }
      }
      if(!verifyText())throw Error('El pasaje cambió. Vuelve a analizarlo.');
      show();
    }catch(error){
      suggestions.replaceChildren(el('p','','No se pudo analizar el pasaje. '+String(error)));
    }finally{analyzing=false;}
  }
  async function update():Promise<void>{
    await reload();
    const latest=composer.activePlacement();
    if(!latest||latest.id!==placement!.id)return;
    const filter=manual.querySelector<HTMLInputElement>('.grammar-tag-search')?.value;
    manual.replaceChildren(renderGrammarEditor(latest,corpus,{
      open:true,toggle:()=>{},notice,
      addSpan:composer.addGrammarSpan,removeSpan:composer.removeGrammarSpan,
      updated:update,
      saveTags:async ids=>{
        if(!await composer.setActiveTags(ids)){notice('No se han guardado las etiquetas.');return;}
        await update();
      },
      addCustomTag:async label=>{
        try{
          if(!isCustomTagLabelValid(label)){notice('Revisa el nombre de la etiqueta.');return;}
          const previous=await repo.load();
          let tag=findTagByLabel(label,allGrammarTags(await loadCombinedCorpus()));
          if(!tag){
            tag={id:'custom.'+crypto.randomUUID(),label:label.trim(),kind:'custom',parentId:null};
            await repo.save(validateCorpus({...previous.corpus,tags:[...previous.corpus.tags,tag]}),previous.revision);
          }
          if(!await composer.setActiveTags([...latest.grammaticalTagIds,tag.id]))
            throw Error('No se ha podido asignar la etiqueta.');
          await update();
        }catch(error){notice(String(error));}
      },
    }));
    if(filter){
      const search=manual.querySelector<HTMLInputElement>('.grammar-tag-search');
      if(search){search.value=filter;search.dispatchEvent(new Event('input'));}
    }
  }
  await update();
  M.modal('Etiquetas del texto',panel,[{label:'Cerrar'}]);
}

async function returnToHome():Promise<void>{
  if(!await composer.flush())throw Error('No se han podido guardar los cambios pendientes.');
  composer.closeEdition();currentId=null;rememberNotebook();
  await reload();render();
}
/** Pantalla de entrada, independiente de la hoja A4 y de cualquier cuaderno activo. */
function renderHome():HTMLElement{
  const home=el('section','card cuaderno-home');
  home.append(el('h3','','Cuaderno de textos latinos'));
  const heading=el('div','cuaderno-home-heading');
  heading.append(el('h4','','Mis cuadernos'));
  const actions=el('div','cuaderno-home-actions');
  actions.append(button('Nuevo cuaderno',createNotebook,'hbtn primary'));
  const restore=el('input');restore.type='file';restore.accept='.json,application/json';restore.hidden=true;
  restore.setAttribute('aria-label','Seleccionar copia de cuaderno');
  restore.addEventListener('change',async()=>{
    const file=restore.files?.[0];restore.value='';
    if(!file)return;
    try{await restoreNotebooks(file);}catch(error){M.toast('No se pudo importar la copia: '+String(error),6500);}
  });
  actions.append(button('Importar cuaderno',()=>restore.click(),'hbtn'),restore);
  heading.append(actions);home.append(heading);
  const grid=el('div','cuaderno-home-grid');
  const saved=notebooks.filter(n=>n.edition.id!==WORKING_EDITION_ID)
    .sort((a,b)=>b.edition.updatedAt.localeCompare(a.edition.updatedAt));
  if(!saved.length)grid.append(el('p','muted','No hay cuadernos todavía. Puedes crear uno nuevo.'));
  for(const record of saved){
    const edition=record.edition;
    const card=el('article','cuaderno-home-card');
    card.append(el('h5','',edition.title));
    card.append(el('p','small muted',edition.placements.length+' textos · '+
      new Date(edition.updatedAt).toLocaleDateString('es')));
    if(edition.legacyNotebookId!==null)card.append(el('p','small muted','Cuaderno histórico protegido'));
    const buttons=el('div','cuaderno-home-card-actions');
    buttons.append(button('Abrir',()=>openNotebook(edition.id),'hbtn primary'),
      button('Hacer copia',async()=>{
        if(!await composer.flush())throw Error('Hay cambios pendientes de guardar.');
        const current=await workspace.loadEdition(edition.id);
        if(!current)throw Error('El cuaderno ya no existe.');
        downloadBackup(await createNotebookBackup(current.edition,await loadCombinedCorpus()),'copia-cuaderno');
      },'hbtn'));
    if(edition.legacyNotebookId===null)buttons.append(button('Eliminar',()=>deleteNotebook(edition.id),'tbtn'));
    card.append(buttons);grid.append(card);
  }
  home.append(grid);
  const backups=el('details','cuaderno-home-backups');
  backups.append(el('summary','','Copia integral del espacio de trabajo'));
  backups.append(button('Descargar copia integral',async()=>{
    if(!await composer.flush())throw Error('No se han podido guardar los cambios pendientes.');
    downloadBackup(await createWorkspaceBackup(workspace,new Date(),(await repo.load()).corpus),'copia-editorial');
  },'hbtn'));
  home.append(backups);

  const bank=el('section','cuaderno-home-bank');
  const bankHeading=el('div','cuaderno-home-bank-heading');
  bankHeading.append(el('h4','','Banco de textos propios'),
    el('p','small muted',corpus.texts.length+' textos distintos'));
  bank.append(bankHeading);
  const search=el('input');search.type='search';
  search.placeholder='Buscar por texto, autor u obra';
  search.setAttribute('aria-label','Buscar en banco de textos propios');
  bank.append(search);
  const catalogue=allGrammarTags(corpus);
  const assignments=new Map<string,Set<string>>();
  for(const text of corpus.texts)assignments.set(text.id,new Set(text.tagIds));
  for(const notebook of notebooks)for(const placement of notebook.edition.placements){
    const id=placement.source.sourceId;
    if(!id||!assignments.has(id))continue;
    const ids=assignments.get(id)!;
    for(const tag of placementGrammarTags(placement))ids.add(tag);
  }
  const idsFor=(id:string):string[]=>[...(assignments.get(id)??[])];
  const listing=el('div','cuaderno-home-bank-list');
  function appendTextRows(target:HTMLElement,texts:typeof corpus.texts):void{
    if(!texts.length){target.append(el('p','small muted','No hay textos con ese filtro.'));return;}
    for(const text of texts){
      const row=el('details','cuaderno-home-text');
      row.append(el('summary','',text.title));
      const origin=[text.source.author,text.source.work,text.source.reference].filter(Boolean).join(' · ');
      if(origin)row.append(el('p','small muted',origin));
      row.append(el('p','cuaderno-home-latin',text.latin));
      target.append(row);
    }
  }
  function populate():void{
    listing.replaceChildren();
    const needle=foldLatin(search.value.trim());
    const matching=corpus.texts.filter(t=>foldLatin(
      [t.title,t.source.author??'',t.source.work??'',t.source.reference??''].join(' ')).includes(needle));
    const all=el('details','cuaderno-home-category');
    if(needle)all.open=true;
    all.append(el('summary','','Todos los textos ('+matching.length+')'));
    appendTextRows(all,matching);listing.append(all);
    const makeCategory=(tag:typeof catalogue[number],depth:number):HTMLElement=>{
      const texts=matching.filter(t=>matchesGrammarFilters(idsFor(t.id),[tag.id],catalogue));
      const group=el('details','cuaderno-home-category');
      if(depth)group.classList.add('cuaderno-home-subcategory');
      group.append(el('summary','',tag.label+' ('+texts.length+')'));
      const children=catalogue.filter(t=>t.parentId===tag.id);
      for(const child of children)group.append(makeCategory(child,depth+1));
      const direct=texts.filter(t=>idsFor(t.id).includes(tag.id));
      if(direct.length)appendTextRows(group,direct);
      return group;
    };
    for(const root of catalogue.filter(t=>t.parentId===null))
      listing.append(makeCategory(root,0));
    const without=matching.filter(t=>idsFor(t.id).length===0);
    const untagged=el('details','cuaderno-home-category');
    untagged.append(el('summary','','Sin etiquetar ('+without.length+')'));
    appendTextRows(untagged,without);listing.append(untagged);
  }
  search.addEventListener('input',populate);
  populate();bank.append(listing);
  home.append(bank);
  return home;
}
function render():void{
  const left=document.getElementById('editor');
  const page=document.getElementById('sheet');
  if(!left||!page)throw new Error('Falta el documento original de Examinator2.');
  left.replaceChildren();
  document.body.dataset.hasEditor=String(active());
  document.body.dataset.cuadernoHome=String(!active());
  if(!active()){
    page.replaceChildren();
    left.append(renderHome());
    document.title='Mis cuadernos · Cuaderno de textos latinos';
    return;
  }
  const summary=el('section','card');
  const choose=el('select');
  choose.setAttribute('aria-label','Elegir cuaderno');
  const placeholder=el('option','',active()?'Cerrar cuaderno':'Elige un cuaderno');
  placeholder.value='';placeholder.disabled=!active();
  choose.append(placeholder);
  for(const entry of notebooks.filter(n=>n.edition.id!==WORKING_EDITION_ID)
    .sort((a,b)=>b.edition.updatedAt.localeCompare(a.edition.updatedAt))){
    const edition=entry.edition;
    const option=el('option','',edition.title+' · '+edition.placements.length+' textos · '+
      new Date(edition.updatedAt).toLocaleDateString('es'));
    option.value=edition.id;choose.append(option);
  }
  choose.value=currentId??'';
  choose.addEventListener('change',async()=>{
    choose.disabled=true;
    try{
      if(choose.value)await openNotebook(choose.value);
      else{
        if(!await composer.flush())throw Error('No se han guardado los cambios pendientes.');
        composer.closeEdition();currentId=null;rememberNotebook();
        await reload();render();
      }
    }
    catch(error){choose.value=currentId??'';M.toast(String(error),5500);}
    finally{choose.disabled=false;}
  });
  summary.append(el('h3','','Cuaderno de textos latinos'),
    button('Volver a mis cuadernos',returnToHome,'hbtn'),choose,
    button('Gestionar cuadernos',openNotebooks,'hbtn'));
  const backups=el('details');
  backups.append(el('summary','','Copias de seguridad'));
  const controls=el('div','row');
  if(active())controls.append(button('Copia del cuaderno',async()=>{
    if(!await composer.flush())throw Error('No se han guardado los cambios pendientes.');
    const edition=composer.activeEdition();
    if(edition)downloadBackup(await createNotebookBackup(edition,await loadCombinedCorpus()),'copia-cuaderno');
  },'hbtn'));
  controls.append(button('Copia integral',async()=>{
    if(!await composer.flush())throw Error('No se han guardado los cambios pendientes.');
    downloadBackup(await createWorkspaceBackup(workspace,new Date(),(await repo.load()).corpus),'copia-editorial');
  },'hbtn'));
  const restore=el('input');restore.type='file';restore.accept='.json,application/json';restore.hidden=true;
  restore.addEventListener('change',async()=>{
    const file=restore.files?.[0];restore.value='';
    if(!file)return;
    restoreButton.disabled=true;
    try{await restoreNotebooks(file);}
    catch(error){M.toast(String(error),5500);}
    finally{restoreButton.disabled=false;}
  });
  const restoreButton=button('Restaurar copia',()=>restore.click(),'hbtn');
  controls.append(restoreButton,restore);backups.append(controls);summary.append(backups);
  if(active()){
    summary.append(el('p','small muted',composer.activeEdition()!.placements.length+' textos en este cuaderno.'),
      el('h4','','Añadir textos'));
    const actions=el('div','row');
    actions.append(button('Biblioteca',openLibrary,'hbtn primary'),
      button('Banco propio',openOwnTexts,'hbtn'),
      button('Pegar texto',pasteText,'hbtn'),
      button('Importar Word',importWord,'hbtn'));
    summary.append(actions);
    if(composer.activeEdition()!.placements.length)summary.append(button('Etiquetas gramaticales',openGrammarEditor,'hbtn'));
    left.append(summary,composer.element);
    page.textContent='';
  }else{
    left.append(summary);
    page.replaceChildren(el('h2','','Cuaderno de textos latinos'),
      el('p','','Elige «Nuevo» o «Abrir» para empezar. Aquí aparecerá la vista A4 del cuaderno.'));
  }
  document.title=currentTitle()+' · Cuaderno de textos latinos';
}
function wireThemeButton():void{
  const key='cuaderno-ui-theme-v1';
  let saved:'light'|'dark'='light';
  try{if(localStorage.getItem(key)==='dark')saved='dark';}catch{/* navegación privada */}
  const toggle=button('Modo oscuro',()=>{
    const current=document.documentElement.dataset.cuadernoTheme==='dark'?'dark':'light';
    const next=current==='dark'?'light':'dark';
    setTheme(next);
    try{localStorage.setItem(key,next);}catch{/* se conserva la sesión */}
  },'hbtn');
  toggle.id='btnCuadernoTheme';
  function setTheme(theme:'light'|'dark'):void{
    document.documentElement.dataset.cuadernoTheme=theme;
    toggle.textContent=theme==='dark'?'Modo claro':'Modo oscuro';
    toggle.title=theme==='dark'?'Activar modo claro':'Activar modo oscuro';
    toggle.setAttribute('aria-pressed',String(theme==='dark'));
  }
  const spacer=document.querySelector('header > .spacer');
  if(spacer)spacer.before(toggle);
  else document.querySelector('body > header')?.append(toggle);
  setTheme(saved);
}
function wireButtons():void{
  wireThemeButton();
  const byId=(id:string):HTMLButtonElement=>{
    const node=document.getElementById(id);
    if(!(node instanceof HTMLButtonElement))throw new Error('Falta '+id);
    return node;
  };
  byId('btnNew').onclick=async()=>{
    const controls=['btnNew','btnOpen','btnSave','btnLib','btnLists','btnSettings','btnDocx','btnPdf']
      .map(id=>byId(id)).filter(control=>!control.disabled);
    controls.forEach(control=>{control.disabled=true;});
    try{await createNotebook();}
    catch(error){M.toast(String(error),5000);}
    finally{controls.forEach(control=>{control.disabled=false;});}
  };
  byId('btnOpen').onclick=openNotebooks;
  byId('btnSave').onclick=()=>{void saveNotebook().catch(e=>M.toast(String(e),5000));};
  byId('btnLib').onclick=openLibrary;
  byId('btnLists').textContent='Banco de textos';
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
    if('serviceWorker' in navigator&&window.isSecureContext){
      const worker=new URL('../examinator-cuadernos/service-worker.js',import.meta.url);
      void navigator.serviceWorker.register(worker).catch(error=>{
        console.warn('No se pudo preparar el cuaderno experimental para usarlo sin conexión:',error);
      });
    }
    // Inicio siempre desde Mis cuadernos, sin reabrir automáticamente el último.
    composer.closeEdition();currentId=null;render();
  }catch(e){
    console.error(e);
    const target=document.getElementById('editor');
    if(target)target.textContent='No se ha podido iniciar el cuaderno: '+String(e);
  }
})();
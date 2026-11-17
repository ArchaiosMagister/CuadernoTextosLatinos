/**
 * Flujo notebook-first de CuadernoTextosLatinos.
 * Convive con la interfaz previa mientras se valida en ?nuevo=1.
 * La fuente de verdad sigue siendo WorkspaceRepository/NotebookEditionV1.
 */
import {foldLatin,findCitation,
  type LibraryEntry,type LibraryWork} from '../core/library.js';
import {readReaderSelection,type ReaderFragment} from './reader-selection.js';
import {upsertText,type TextDraft} from '../core/editor-operations.js';
import {createBackup} from '../core/backup.js';
import {parseExaminatorCatalogue,searchExaminatorWorks,originalWorkUrl,convertPerseusXml,
  type ExaminatorCatalogue,type ExaminatorEntry} from '../core/examinator-library.js';
import {DownloadedWorksRepository} from '../storage/downloaded-works.js';
import {allGrammarTags,findTagByLabel,GRAMMAR_GROUP_IDS,
  matchesGrammarTag,isCustomTagLabelValid} from '../core/grammar-tags.js';
import {summarizeNotebook} from '../core/notebook-overview.js';
import {onlineSearchUrl,parseOnlineSearch,onlinePageUrl,parseOnlinePage,
  type OnlinePage,type OnlineSearchResult} from '../core/online-sources.js';
import {validateCorpus} from '../core/validation.js';
import {createEditionPane,WORKING_EDITION_ID} from './edition-app.js';
import {IndexedDbCorpusRepository} from '../storage/indexeddb-corpus-repository.js';
import {WorkspaceRepository,type EditionSnapshotV1} from '../storage/workspace-repository.js';
import {createWorkspaceBackup} from '../storage/workspace-backup.js';
import type {CorpusSnapshot} from '../ports/corpus-repository.js';
import type {TextPlacementV1} from '../core/edition-model.js';

const corpusRepo=new IndexedDbCorpusRepository();
const workspace=new WorkspaceRepository();
const downloadedWorks=new DownloadedWorksRepository();
type Stage='home'|'editor';
type LibraryItem=ExaminatorEntry & {local?:LibraryEntry};
type View='edit'|'sources'|'authors'|'manual'|'online';
type SourceForm={title:string;author:string;work:string;reference:string;latin:string};
const newForm=():SourceForm=>({title:'',author:'',work:'',reference:'',latin:''});
function el<K extends keyof HTMLElementTagNameMap>(kind:K,cls='',text=''):HTMLElementTagNameMap[K]{
  const x=document.createElement(kind);if(cls)x.className=cls;if(text)x.textContent=text;return x;
}
function button(text:string,fn:()=>void|Promise<void>,cls='btn btn-outline'):HTMLButtonElement{
  const x=el('button',cls,text);x.type='button';x.addEventListener('click',()=>{void fn();});return x;
}
function labelled(name:string,value:string,change:(s:string)=>void,multi=false):HTMLElement{
  const label=el('label','simple-field');
  const input=multi?el('textarea','field-control'):el('input','field-control');
  input.value=value;if(multi)(input as HTMLTextAreaElement).rows=9;
  input.addEventListener('input',()=>change(input.value));
  label.append(el('span','',name),input);return label;
}
function saveJson(json:string,filename:string):void{
  const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const a=el('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}

export function mountNotebookApp(root:HTMLElement):void{
  const composer=createEditionPane({autoApply:true});
  let stage:Stage='home',view:View='edit',selectedId:string|null=null;
  let corpus:CorpusSnapshot|null=null,editions:EditionSnapshotV1[]=[];
  let catalogue:LibraryEntry[]=[],work:LibraryWork|null=null,readerSelection:ReaderFragment|null=null;
  let examinator:ExaminatorCatalogue|null=null,remoteAvailable=new Set<string>();
  let genreFilter='',onlyDownloaded=false,marked=new Set<string>();
  let libraryDownloading=false,libraryProgress='',libraryError='',catalogueMode:'all'|'my'='all';
  let startReaderAt=0;
  const works=new Map<string,LibraryWork>();
  let busy=false,feedback='Abre o crea un cuaderno.',failed=false;
  let authorSearch='',form=newForm();
  let preserveSelection=false,tagsOpen=false;
  let onlineTerm='',onlineResults:OnlineSearchResult[]=[],onlinePage:OnlinePage|null=null;
  let onlineLatin='',onlineAuthor='',onlineTitle='',onlineFeedback='';

  function notice(text:string,error=false):void{
    feedback=text;failed=error;
    const target=root.querySelector<HTMLElement>('.simple-status');
    if(target){target.textContent=text;target.dataset.error=String(error);}
  }
  function activeEdition():EditionSnapshotV1|undefined{
    return editions.find(e=>e.edition.id===selectedId);
  }
  async function reload():Promise<void>{
    [corpus,editions]=await Promise.all([corpusRepo.load(),workspace.listEditions()]);
  }
  async function createNotebook():Promise<void>{
    const name=window.prompt('Título del nuevo cuaderno');
    if(!name?.trim()||busy)return;
    busy=true;
    try{
      const id=await composer.createNotebookNamed(name);
      if(!id)throw new Error('No se pudo crear el cuaderno. Revisa el editor.');
      selectedId=id;await reload();stage='editor';view='sources';render();
      notice('Cuaderno creado. Selecciona el primer texto; todavía no se ha generado ninguna ficha vacía.');
    }catch(e){notice(String(e),true);}finally{busy=false;}
  }
  async function openNotebook(id:string):Promise<void>{
    if(busy)return;
    busy=true;
    try{
      if(!await composer.openEdition(id))throw new Error('No se pudo abrir el cuaderno.');
      selectedId=id;stage='editor';view='edit';tagsOpen=false;
      await reload();render();notice('Cuaderno abierto. Los cambios se guardan automáticamente.');
    }catch(e){notice(String(e),true);}finally{busy=false;}
  }
  async function renameNotebook(id:string):Promise<void>{
    const source=editions.find(x=>x.edition.id===id);
    if(!source||busy)return;
    const title=window.prompt('Nuevo título del cuaderno',source.edition.title);
    if(!title?.trim()||title.trim()===source.edition.title)return;
    busy=true;
    try{
      if(!await composer.flush())throw new Error('No se han guardado los cambios pendientes.');
      const now=new Date().toISOString();
      await workspace.commitEdition(id,source.revision,
        {command:'ui.rename-from-notebooks',targetId:id,timestamp:now},previous=>{
          if(!previous)throw new Error('El cuaderno no existe.');
          return {...previous,title:title.trim(),updatedAt:now};
        });
      await reload();render();notice('Título guardado sin cambiar textos, preguntas ni vocabulario.');
    }catch(e){notice('No se ha podido renombrar: '+String(e),true);}finally{busy=false;}
  }
  async function deleteNotebook(id:string):Promise<void>{
    const original=editions.find(x=>x.edition.id===id);
    if(!original||busy)return;
    if(!window.confirm('¿Eliminar el cuaderno «'+original.edition.title+'» y su historial? Los textos de la biblioteca y los demás cuadernos se conservan. Descarga una copia de seguridad antes de confirmar.'))return;
    busy=true;
    try{
      if(!await composer.flush())throw new Error('No se han guardado los cambios pendientes.');
      // Copia íntegra, verificable con SHA-256, anterior a la eliminación.
      const backup=await createWorkspaceBackup(workspace);
      saveJson(backup,'copia-antes-de-eliminar-cuaderno-'+new Date().toISOString().slice(0,10)+'.json');
      if(!window.confirm('Comprueba que has guardado el archivo JSON en Archivos. ¿Confirmas la eliminación definitiva de «'+original.edition.title+'»?')){
        notice('Eliminación cancelada: no se ha modificado ningún cuaderno.');return;
      }
      const latest=await workspace.loadEdition(id);
      if(!latest||latest.revision!==original.revision)
        throw new Error('El cuaderno cambió en otra pestaña. Actualiza la lista antes de eliminarlo.');
      await workspace.deleteEdition(id,original.revision);
      if(composer.activeEdition()?.id===id)composer.closeEdition();
      if(selectedId===id){selectedId=null;stage='home';}
      await reload();render();notice('Cuaderno eliminado. La biblioteca común y los demás cuadernos no han cambiado.');
    }catch(e){notice('No se ha eliminado: '+String(e),true);}finally{busy=false;}
  }
  async function addFromLibrary(id:string):Promise<void>{
    if(busy||!selectedId)return;busy=true;
    try{
      if(!await composer.addSourceToNotebook(id))throw new Error('El editor no ha podido incorporar el texto.');
      view='edit';await reload();render();
      notice('Texto disponible en este cuaderno. Preguntas y vocabulario son independientes de otros cuadernos.');
    }catch(e){notice(String(e),true);}finally{busy=false;}
  }
  async function storeText(data:TextDraft):Promise<void>{
    if(busy||!selectedId)return;
    if(!data.title.trim()||!data.latin.trim()){
      notice('Completa el título y el texto latino.',true);return;
    }
    busy=true;
    try{
      const previous=await corpusRepo.load();
      const match=previous.corpus.texts.find(t=>t.latin===data.latin.trim()
        &&t.source.author===(data.author.trim()||null)
        &&t.source.work===(data.work.trim()||null)
        &&t.source.reference===(data.reference.trim()||null));
      const id=match?.id??'doc.'+crypto.randomUUID();
      if(!match){
        corpus=await corpusRepo.save(upsertText(previous.corpus,data,id,new Date().toISOString()),previous.revision);
        window.dispatchEvent(new CustomEvent('corpus-updated'));
      }
      busy=false;
      await addFromLibrary(id);
      form=newForm();
    }catch(e){notice('No se ha guardado el texto: '+String(e),true);}finally{busy=false;}
  }
  async function addFromWork(latin:string,reference:string):Promise<void>{
    if(!work)return;
    await storeText({title:work.author+' · '+work.latin+' '+reference,
      latin,author:work.author,work:work.latin,reference});
  }
  async function showWork(meta:LibraryItem):Promise<void>{
    if(busy)return;busy=true;
    try{
      let candidate=works.get(meta.urn);
      if(!candidate&&meta.local){
        const response=await fetch(new URL('../library/'+meta.local.file,import.meta.url));
        if(!response.ok)throw new Error('No se pudo abrir la obra ('+response.status+').');
        const raw:unknown=await response.json();
        if(!raw||typeof raw!=='object'||!Array.isArray((raw as LibraryWork).lines)
          ||!(raw as LibraryWork).lines.length||(raw as LibraryWork).urn!==meta.urn)
          throw new Error('Catálogo de pasajes incompleto.');
        candidate=raw as LibraryWork;
      }
      if(!candidate)candidate=await downloadedWorks.get(meta.urn)??undefined;
      if(!candidate)throw new Error('Marca la obra y selecciona «Descargar las marcadas».');
      works.set(meta.urn,candidate);
      work=candidate;readerSelection=null;startReaderAt=0;render();
    }catch(e){notice(String(e),true);}finally{busy=false;}
  }
  function readerSelectionChanged():void{
    if((view!=='authors'&&view!=='sources')||!work||preserveSelection)return;
    const host=root.querySelector<HTMLElement>('.simple-reader-lines');
    if(!host)return;
    const sel=window.getSelection();
    const next=readReaderSelection(work,host,sel);
    if(next)readerSelection=next;
    else if(sel?.isCollapsed&&sel.anchorNode&&host.contains(sel.anchorNode))readerSelection=null;
    const action=root.querySelector<HTMLButtonElement>('[data-range-add]');
    if(action)action.disabled=!readerSelection;
    const message=root.querySelector<HTMLElement>('.exlib-select-status');
    if(message)message.textContent=readerSelection
      ?'Selección: '+readerSelection.reference+' ('+readerSelection.wordCount+' palabras)'
      :'Selecciona con el ratón o el dedo el fragmento que quieras.';
  }
  async function saveTags(ids:readonly string[]):Promise<void>{
    if(busy)return;busy=true;
    try{
      if(!await composer.setActiveTags(ids))throw new Error('El editor no ha podido guardar las etiquetas.');
      await reload();tagsOpen=true;render();notice('Etiquetas guardadas exclusivamente en esta aparición.');
    }catch(e){notice(String(e),true);}finally{busy=false;}
  }
  async function addCustomTag(label:string):Promise<void>{
    const name=label.trim(),p=composer.activePlacement();
    if(!p||!isCustomTagLabelValid(name))return;
    busy=true;
    try{
      const previous=await corpusRepo.load();
      const all=allGrammarTags(previous.corpus);
      let match=findTagByLabel(name,all);
      if(!match){
        match={id:'custom.'+crypto.randomUUID(),label:name,kind:'custom',parentId:null};
        corpus=await corpusRepo.save(validateCorpus({...previous.corpus,
          tags:[...previous.corpus.tags,match]}),previous.revision);
        window.dispatchEvent(new CustomEvent('corpus-updated'));
      }
      busy=false;
      await saveTags([...new Set([...p.grammaticalTagIds,match.id])]);
    }catch(e){notice('No se ha registrado la etiqueta: '+String(e),true);}finally{busy=false;}
  }
  function tagsPanel(placement:TextPlacementV1):HTMLElement{
    const detail=el('details','simple-grammar');detail.open=tagsOpen;
    detail.addEventListener('toggle',()=>{tagsOpen=detail.open;});
    detail.append(el('summary','','Etiquetas gramaticales ('+placement.grammaticalTagIds.length+')'));
    const body=el('div','simple-grammar-body');
    body.append(el('p','hint','Etiquetas manuales del texto actual. No modifican las demás apariciones.'));
    const all=allGrammarTags(corpus!.corpus);
    const children=(parent:string,host:HTMLElement,depth=0):void=>{
      for(const tag of all.filter(t=>t.parentId===parent)){
        const row=el('label','simple-tag-option');
        row.style.paddingLeft=(Math.min(depth,4)*12+5)+'px';
        const cb=el('input');cb.type='checkbox';cb.checked=placement.grammaticalTagIds.includes(tag.id);
        cb.setAttribute('aria-label',tag.label);
        cb.addEventListener('change',()=>{
          const next=new Set(placement.grammaticalTagIds);
          if(cb.checked)next.add(tag.id);else next.delete(tag.id);
          void saveTags([...next]);
        });
        row.append(cb,el('span','',tag.label));host.append(row);
        if(depth<5)children(tag.id,host,depth+1);
      }
    };
    for(const groupId of GRAMMAR_GROUP_IDS){
      const group=all.find(t=>t.id===groupId);
      if(!group)continue;
      const details=el('details','simple-tag-group');
      details.open=placement.grammaticalTagIds.some(id=>matchesGrammarTag(id,groupId,all));
      details.append(el('summary','',group.label));
      const list=el('div','simple-tag-group-list');children(groupId,list);
      details.append(list);body.append(details);
    }
    const custom=all.filter(t=>t.kind==='custom');
    if(custom.length){
      const group=el('details','simple-tag-group');
      group.append(el('summary','','Personalizadas'));
      for(const tag of custom){
        const row=el('label','simple-tag-option'),cb=el('input');
        cb.type='checkbox';cb.checked=placement.grammaticalTagIds.includes(tag.id);
        cb.addEventListener('change',()=>{
          const next=new Set(placement.grammaticalTagIds);
          if(cb.checked)next.add(tag.id);else next.delete(tag.id);
          void saveTags([...next]);
        });
        row.append(cb,el('span','',tag.label));group.append(row);
      }
      body.append(group);
    }
    const own=el('div','simple-new-tag'),input=el('input','field-control');
    input.placeholder='Nueva etiqueta personalizada';
    input.setAttribute('aria-label','Nueva etiqueta gramatical');
    own.append(input,button('Añadir',()=>addCustomTag(input.value)));
    body.append(own);
    const fragments=el('details','notebook-fragments');
    fragments.append(el('summary','','Etiquetar fragmentos del texto ('+
      (placement.grammaticalSpans?.length??0)+')'));
    const segment=el('div','notebook-fragment-editor');
    segment.append(el('p','hint','Selecciona una expresión latina dentro del campo siguiente y elige su construcción gramatical.'));
    const area=el('textarea','field-control');
    area.readOnly=true;area.rows=6;area.value=placement.text.latin;
    area.setAttribute('aria-label','Seleccionar fragmento latino');
    const choose=el('select','field-control');
    choose.setAttribute('aria-label','Construcción del fragmento');
    for(const tag of all){
      const option=el('option','',tag.label);option.value=tag.id;choose.append(option);
    }
    const add=button('Etiquetar selección',async()=>{
      const start=area.selectionStart,end=area.selectionEnd;
      if(!choose.value||end<=start){notice('Selecciona primero un fragmento latino.',true);return;}
      if(await composer.addGrammarSpan(start,end,choose.value)){
        await reload();tagsOpen=true;render();
        notice('Etiqueta de fragmento guardada sin modificar las preguntas.');
      }else notice('No se ha podido guardar la etiqueta de fragmento.',true);
    },'btn btn-primary');
    segment.append(area,choose,add);
    const saved=el('div','notebook-fragment-items');
    for(const span of placement.grammaticalSpans??[]){
      const row=el('div','notebook-fragment-row');
      const names=span.tagIds.map(id=>all.find(t=>t.id===id)?.label??id);
      row.append(el('span','',span.exact+' · '+names.join(', ')+
        (span.reviewRequired?' · Revisar anclaje':'')));
      row.append(button('Quitar',async()=>{
        if(!await composer.removeGrammarSpan(span.id))return;
        await reload();tagsOpen=true;render();
        notice('Etiqueta de fragmento retirada; texto y preguntas intactos.');
      }));
      saved.append(row);
    }
    segment.append(saved);fragments.append(segment);
    body.append(fragments);detail.append(body);return detail;
  }
  function summaryCard(edition:EditionSnapshotV1):HTMLElement{
    const card=el('section','simple-grammar-summary');
    const info=summarizeNotebook(edition.edition,corpus!.corpus);
    card.append(el('h3','','Resumen gramatical'),el('p','simple-total',
      info.total+' textos · '+info.distinctTexts+' fuentes distintas · '+info.withoutTags+' sin etiquetar'));
    if(info.counts.length){
      const counts=el('div','simple-counts');
      for(const t of info.counts){
        const row=el('div','simple-count-row');
        row.append(el('span','',t.label));
        const jump=button(String(t.count),async()=>{
          const active=composer.activeEdition();
          const all=allGrammarTags(corpus!.corpus);
          const hit=active?.placements.find(p=>p.grammaticalTagIds.some(id=>
            matchesGrammarTag(id,t.id,all)));
          if(hit&&await composer.selectPlacement(hit.id)){view='edit';render();}
        },'notebook-count-jump');
        jump.title='Ver el primer texto con '+t.label;
        jump.setAttribute('aria-label',t.count+' textos: buscar '+t.label);
        row.append(jump);counts.append(row);
      }
      card.append(counts);
    }else card.append(el('p','hint','Todavía no se han asignado etiquetas.'));
    return card;
  }
  function renderHome():HTMLElement{
    const main=el('main','notebook-home');
    const top=el('section','notebook-home-head');
    top.append(el('h2','','Mis cuadernos'),
      el('p','hint','Un cuaderno se crea vacío y se abre al instante. Los textos pueden reutilizarse sin compartir preguntas ni vocabulario.'));
    top.append(button('+ Crear cuaderno',createNotebook,'btn btn-primary'));
    main.append(top);
    const books=editions.filter(e=>e.edition.id!==WORKING_EDITION_ID)
      .sort((a,b)=>b.edition.updatedAt.localeCompare(a.edition.updatedAt));
    const list=el('div','notebook-cards');
    for(const saved of books){
      const card=el('article','notebook-card'),info=summarizeNotebook(saved.edition,corpus!.corpus);
      card.append(el('h3','',saved.edition.title),
        el('p','hint',info.total+' textos · '+info.distinctTexts+' fuentes · '+info.withoutTags+' sin etiquetar'));
      const actions=el('div','simple-actions');
      const remove=button('Eliminar',()=>deleteNotebook(saved.edition.id),'btn btn-outline notebook-danger');
      remove.disabled=saved.edition.legacyNotebookId!==null;
      if(remove.disabled)remove.title='Cuaderno histórico protegido para conservar la migración.';
      actions.append(button('Abrir',()=>openNotebook(saved.edition.id),'btn btn-primary'),
        button('Renombrar',()=>renameNotebook(saved.edition.id)),remove);
      card.append(actions);list.append(card);
    }
    if(!books.length)list.append(el('p','hint','No hay cuadernos editoriales. Crea el primero o importa uno anterior.'));
    main.append(list);
    if(corpus!.corpus.notebooks.length){
      const earlier=el('details','simple-legacy-notebooks');
      earlier.append(el('summary','','Cuadernos históricos (importación sin pérdida de datos)'));
      for(const item of corpus!.corpus.notebooks)earlier.append(button(item.title+' · '+item.textIds.length+' textos',async()=>{
        if(!await composer.importLegacyNotebook(item.id))return;
        await reload();
        const found=editions.find(e=>e.edition.legacyNotebookId===item.id);
        if(found)await openNotebook(found.edition.id);
      }));
      main.append(earlier);
    }
    return main;
  }
  async function searchOnline():Promise<void>{
    if(busy)return;busy=true;onlineFeedback='Buscando obras en Wikisource latina…';
    try{
      const response=await fetch(onlineSearchUrl(onlineTerm));
      if(!response.ok)throw new Error('El servicio online respondió '+response.status);
      onlineResults=parseOnlineSearch(await response.json());
      onlineFeedback=onlineResults.length
        ?onlineResults.length+' páginas encontradas. Abre una para revisar el latín.'
        :'No se han encontrado páginas con esa búsqueda.';
      onlinePage=null;render();
    }catch(e){onlineFeedback='No ha sido posible consultar Wikisource: '+String(e);render();}
    finally{busy=false;}
  }
  async function openOnline(item:OnlineSearchResult):Promise<void>{
    if(busy)return;busy=true;onlineFeedback='Leyendo el texto original…';
    try{
      const response=await fetch(onlinePageUrl(item.title));
      if(!response.ok)throw new Error('No se ha obtenido la obra ('+response.status+').');
      const page=parseOnlinePage(await response.json());
      const html=new DOMParser().parseFromString(page.html,'text/html');
      for(const hidden of Array.from(html.querySelectorAll(
        'script,style,nav,table,.mw-editsection,.reference,.reflist,.toc,.navbox,.metadata,.noprint')))
        hidden.remove();
      const content=html.querySelector('.mw-parser-output')??html.body;
      const paragraphs=Array.from(content.querySelectorAll('p,blockquote,pre'))
        .map(p=>p.textContent?.replace(/\s+/g,' ').trim()??'').filter(Boolean);
      const extracted=paragraphs.length?paragraphs.join('\n\n'):content.textContent?.trim()??'';
      if(extracted.length<20)throw new Error('La página no ofrece un texto latino legible.');
      onlinePage=page;onlineLatin=extracted.slice(0,100_000);
      onlineTitle=page.title;onlineAuthor='';
      onlineFeedback='Texto obtenido. Revisa y recorta el fragmento antes de añadirlo.';
      render();
    }catch(e){onlineFeedback='No se ha abierto la página: '+String(e);render();}
    finally{busy=false;}
  }
  function renderOnline():HTMLElement{
    const pane=el('section','notebook-online');
    pane.append(el('h2','','Autores y obras online · Wikisource latina'),
      el('p','hint','Consulta pública sin enviar datos de tu cuaderno. Revisa el texto y selecciona el fragmento; no se importa automáticamente.'));
    const search=el('div','simple-ref-jump'),input=el('input','field-control');
    input.type='search';input.placeholder='Autor u obra, por ejemplo Cicero';input.value=onlineTerm;
    input.setAttribute('aria-label','Buscar obras online');
    input.addEventListener('input',()=>{onlineTerm=input.value;});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void searchOnline();}});
    search.append(input,button('Buscar online',searchOnline,'btn btn-primary'));pane.append(search);
    pane.append(el('p','hint',onlineFeedback));
    const results=el('div','notebook-online-results');
    for(const item of onlineResults)results.append(button(item.title,()=>openOnline(item),'simple-source-row'));
    pane.append(results);
    pane.append(button('Cancelar y volver al texto',()=>{view='edit';render();}));
    if(onlinePage){
      const form=el('section','simple-manual');
      form.append(el('h3','','Revisar y añadir fragmento'),
        el('p','hint','La fuente puede contener encabezados o notas de edición: elimina lo que no sea parte del texto latino.'));
      form.append(labelled('Título del texto',onlineTitle,v=>{onlineTitle=v;}));
      form.append(labelled('Autor',onlineAuthor,v=>{onlineAuthor=v;}));
      form.append(labelled('Fragmento latino (editable)',onlineLatin,v=>{onlineLatin=v;},true));
      const link=el('a','','Consultar fuente y licencia de la página');
      link.href=onlinePage.url;link.target='_blank';link.rel='noopener noreferrer';form.append(link);
      const original=onlinePage;
      form.append(button('Añadir fragmento revisado',async()=>{
        await storeText({title:onlineTitle,author:onlineAuthor,work:original.title,
          reference:'Wikisource latina',latin:onlineLatin});
      },'btn btn-primary'));
      pane.append(form);
    }
    return pane;
  }
  function renderManual():HTMLElement{
    const section=el('section','simple-manual'),formEl=el('form','simple-manual-form');
    section.append(el('h2','','Pegar texto propio'),el('p','hint',
      'El texto no se añade hasta que pulses «Añadir». Cancelar no crea fichas en blanco.'));
    for(const [key,label] of [['title','Título'],['author','Autor'],['work','Obra'],
      ['reference','Referencia'],['latin','Texto latino']] as const)
      formEl.append(labelled(label,form[key],value=>{form={...form,[key]:value};},key==='latin'));
    const actions=el('div','simple-actions');
    actions.append(button('Añadir al cuaderno',()=>storeText({...form}),'btn btn-primary'),
      button('Cancelar',()=>{view='edit';render();}));
    formEl.append(actions);formEl.addEventListener('submit',e=>{e.preventDefault();actions.querySelector('button')?.click();});
    section.append(formEl);return section;
  }

  function libraryItems():LibraryItem[]{
    const items=new Map<string,LibraryItem>();
    for(const e of examinator?.entries??[])items.set(e.urn,{...e});
    for(const local of catalogue){
      const old=items.get(local.urn);
      if(old)items.set(local.urn,{...old,local});
      else items.set(local.urn,{urn:local.urn,path:'',author:local.author,
        title:local.title,genre:local.genre,latin:local.latin,description:local.editorial,local});
    }
    return [...items.values()];
  }
  function knownLocal(meta:LibraryItem):boolean{
    return Boolean(meta.local)||remoteAvailable.has(meta.urn);
  }
  async function downloadSelected():Promise<void>{
    if(libraryDownloading||!examinator)return;
    const pending=libraryItems().filter(meta=>marked.has(meta.urn)&&!knownLocal(meta)&&meta.path);
    if(!pending.length){notice('Marca primero obras de Perseus que no estén descargadas.');return;}
    libraryDownloading=true;libraryError='';
    let done=0;const problems:string[]=[];
    const update=()=>{
      libraryProgress='Descargando '+done+' de '+pending.length+'…';
      const node=root.querySelector<HTMLElement>('.exlib-progress');
      if(node)node.textContent=libraryProgress;
    };
    update();
    try{
      const queue=pending.slice();
      const worker=async()=>{
        while(queue.length){
          const meta=queue.shift();if(!meta)break;
          try{
            const url=originalWorkUrl(examinator!,meta);
            const response=await fetch(url);
            if(!response.ok)throw new Error('HTTP '+response.status);
            const xml=await response.text();
            const converted=convertPerseusXml(xml,meta,url);
            await downloadedWorks.save(converted);
            remoteAvailable.add(meta.urn);
          }catch(e){problems.push(meta.author+' · '+meta.title+': '+String(e));}
          finally{done++;update();}
        }
      };
      await Promise.all([worker(),worker()]);
      marked.clear();libraryProgress='Descarga terminada: '+(done-problems.length)+' de '+done+' obras.';
      libraryError=problems.length?problems.slice(0,4).join(' | '):'';
      render();notice(libraryError||libraryProgress,Boolean(problems.length));
    }finally{libraryDownloading=false;}
  }
  async function deleteSelectedWorks():Promise<void>{
    if(libraryDownloading)return;
    const ids=[...marked].filter(id=>remoteAvailable.has(id)&&!catalogue.some(x=>x.urn===id));
    if(!ids.length){notice('No hay obras descargadas para eliminar (las incluidas no se borran).');return;}
    if(!window.confirm('¿Quitar '+ids.length+' obras descargadas de este navegador? Los cuadernos y textos ya incorporados no se modifican.'))return;
    libraryDownloading=true;
    try{
      for(const id of ids){await downloadedWorks.remove(id);remoteAvailable.delete(id);works.delete(id);}
      if(work&&ids.includes(work.urn)){work=null;readerSelection=null;}
      marked.clear();libraryProgress=ids.length+' obras descargadas retiradas de la caché.';
      render();notice(libraryProgress);
    }catch(e){notice('No se ha podido actualizar la caché: '+String(e),true);}
    finally{libraryDownloading=false;}
  }
  function renderSources():HTMLElement{return renderAuthors();}
  /** Biblioteca de Examinator2: filtros, descargas y lector en dos paneles. */
  function renderAuthors():HTMLElement{
    const shell=el('section','exlib'),header=el('div','exlib-head');
    header.append(el('strong','','Biblioteca'),
      el('span','hint','César, Eutropio y Nepote incluidos · catálogo completo de Perseus (Examinator2)'));
    header.append(button('Volver al cuaderno',()=>{view='edit';render();}));
    shell.append(header);
    const body=el('div','exlib-body'),left=el('aside','exlib-catalog'),
      right=el('section','exlib-reading'),filters=el('div','exlib-filters');
    const search=el('input','field-control');search.type='search';
    search.placeholder='Autor u obra…';search.value=authorSearch;
    search.setAttribute('aria-label','Autor u obra');
    const genre=el('select','field-control');
    genre.setAttribute('aria-label','Todos los géneros');
    const genres=[...new Set(libraryItems().map(e=>e.genre))].sort((a,b)=>a.localeCompare(b,'es'));
    for(const name of ['',...genres]){
      const option=el('option','',name||'Todos los géneros');option.value=name;genre.append(option);
    }
    genre.value=genreFilter;
    const only=el('label','exlib-only');
    const cb=el('input');cb.type='checkbox';cb.checked=onlyDownloaded;
    only.append(cb,el('span','','solo descargadas'));
    filters.append(search,genre,only);
    const tools=el('div','exlib-actions');
    tools.append(button('Descargar las marcadas',downloadSelected,'btn btn-outline'),
      button('Eliminar las marcadas',deleteSelectedWorks,'btn btn-outline'));
    const progress=el('span','exlib-progress',libraryProgress);
    tools.append(progress);
    const list=el('div','exlib-list'),listing=()=>{
      list.replaceChildren();
      if(catalogueMode==='my'){
        const needle=foldLatin(authorSearch);
        const own=corpus?.corpus.texts.filter(t=>
          !needle||foldLatin([t.title,t.source.author??'',t.source.work??''].join(' ')).includes(needle))??[];
        for(const text of own){
          const item=el('div','exlib-row exlib-owned');
          const contents=button(text.title,()=>addFromLibrary(text.id),'exlib-local-title');
          const descriptor=el('small','',[text.source.author,text.source.work,text.source.reference]
            .filter(Boolean).join(' · '));
          item.append(contents,descriptor);list.append(item);
        }
        if(!own.length)list.append(el('p','hint','No hay textos propios con ese filtro.'));
        return;
      }
      const have=new Set(libraryItems().filter(knownLocal).map(x=>x.urn));
      const shown=searchExaminatorWorks(libraryItems(),authorSearch,genreFilter,onlyDownloaded,have);
      for(const meta of shown){
        const available=knownLocal(meta);
        const row=el('div','exlib-row'+(available?' available':'')+(work?.urn===meta.urn?' current':''));
        row.dataset.urn=meta.urn;
        const check=el('input');check.type='checkbox';check.checked=marked.has(meta.urn);
        check.setAttribute('aria-label','Marcar '+meta.author+' '+meta.title);
        check.addEventListener('change',()=>{if(check.checked)marked.add(meta.urn);else marked.delete(meta.urn);});
        const content=button('',async()=>{
          if(!available){notice('Marca esta obra y pulsa «Descargar las marcadas».');return;}
          await showWork(meta);
        },'exlib-item');
        content.append(el('strong','',meta.author+' · '+meta.title));
        content.append(el('small','',meta.latin+' · '+meta.genre));
        const badge=el('span','exlib-badge',
          meta.local?'incluida':remoteAvailable.has(meta.urn)?'descargada':'online');
        row.append(check,content,badge);list.append(row);
      }
      if(!shown.length)list.append(el('p','hint','No hay obras con ese filtro.'));
      const count=root.querySelector<HTMLElement>('.exlib-count');
      if(count)count.textContent=shown.length+' obras';
    };
    search.addEventListener('input',()=>{authorSearch=search.value;listing();});
    genre.addEventListener('change',()=>{genreFilter=genre.value;listing();});
    cb.addEventListener('change',()=>{onlyDownloaded=cb.checked;listing();});
    const modes=el('div','exlib-modes');
    modes.append(button('Biblioteca Perseus',()=>{
      catalogueMode='all';render();
    },'exlib-mode'+(catalogueMode==='all'?' active':'')),
    button('Mis textos',()=>{catalogueMode='my';render();},
      'exlib-mode'+(catalogueMode==='my'?' active':'')));
    left.append(filters,modes,tools,list);
    const count=el('div','exlib-count');left.append(count);
    if(libraryError)left.append(el('p','hint',libraryError));
    listing();
    const readerHeader=el('div','exlib-reader-head');
    if(!work){
      readerHeader.append(el('p','hint','Elige una obra incluida o descargada para leerla.'));
      right.append(readerHeader);
    }else{
      readerHeader.append(el('div','exlib-reader-title',work.author+', '+work.latin),
        el('p','hint',work.title+' · '+(work.levels??[]).join(' / ')));
      const controls=el('div','exlib-reader-controls');
      const location=el('input','field-control');location.placeholder='Ir a… (p. ej. 1.6)';
      location.setAttribute('aria-label','Ir a referencia');
      const jump=()=>{
        const at=findCitation(work!,location.value);
        if(at<0){notice('No encuentro ese pasaje.',true);return;}
        startReaderAt=Math.max(0,at-12);readerSelection=null;render();
        root.querySelector<HTMLElement>('.exlib-reading .simple-reader-line[data-index="'+at+'"]')
          ?.scrollIntoView({block:'center'});
      };
      location.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();jump();}});
      controls.append(location,button('Ir a',jump,'btn btn-outline'));
      const selectionLabel=el('span','exlib-select-status',
        readerSelection
        ?'Selección: '+readerSelection.reference+' ('+readerSelection.wordCount+' palabras)'
        :'Selecciona con el ratón o el dedo el fragmento que quieras.');
      const add=button('Usar la selección',async()=>{
        if(readerSelection)await addFromWork(readerSelection.latin,readerSelection.reference);
      },'btn btn-primary');
      add.dataset.rangeAdd='true';add.disabled=!readerSelection;
      add.addEventListener('pointerdown',()=>{preserveSelection=true;});
      add.addEventListener('pointercancel',()=>{preserveSelection=false;});
      add.addEventListener('click',()=>{preserveSelection=false;});
      controls.append(selectionLabel,add);
      readerHeader.append(controls);right.append(readerHeader);
      const readArea=el('div','exlib-reader-lines simple-reader-lines reader-lines');
      const end=Math.min(work.lines.length,startReaderAt+450);
      let prev='';
      for(let index=startReaderAt;index<end;index++){
        const line=work.lines[index]!;
        const row=el('div','reader-line simple-reader-line exlib-reader-row'+(line.k==='h'?' heading':''));
        row.dataset.index=String(index);row.dataset.c=line.c;row.tabIndex=0;
        const citation=el('span','reader-ref',line.c===prev?'':line.c);prev=line.c;
        const latin=el('span','reader-latin',line.t);
        row.append(citation,latin);
        row.addEventListener('click',()=>{
          const sel=window.getSelection();
          if(sel&&!sel.isCollapsed){readerSelectionChanged();return;}
          readerSelection={latin:line.t,reference:line.c,wordCount:line.t.split(/\s+/u).length,
            startLine:index,endLine:index};
          const action=root.querySelector<HTMLButtonElement>('[data-range-add]');
          if(action)action.disabled=false;
          const status=root.querySelector<HTMLElement>('.exlib-select-status');
          if(status)status.textContent='Selección: '+line.c+' ('+readerSelection.wordCount+' palabras)';
        });
        row.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();row.click();}});
        readArea.append(row);
      }
      readArea.addEventListener('pointerup',()=>window.setTimeout(readerSelectionChanged,0));
      readArea.addEventListener('touchend',()=>window.setTimeout(readerSelectionChanged,120),{passive:true});
      right.append(readArea);
      const pagination=el('div','exlib-page');
      pagination.append(el('span','',String(startReaderAt+1)+'–'+end+' / '+work.lines.length+' pasajes'),
        button('Anterior',()=>{startReaderAt=Math.max(0,startReaderAt-450);readerSelection=null;render();},
          'btn btn-outline'),
        button('Siguientes pasajes',()=>{startReaderAt=Math.min(Math.max(0,work!.lines.length-1),startReaderAt+450);
          readerSelection=null;render();},'btn btn-outline'));
      right.append(pagination);
    }
    body.append(left,right);shell.append(body);
    const footer=el('div','exlib-footer');
    footer.append(el('span','hint','Fuentes: Perseus Digital Library · Eutropio, The Latin Library (incluido) · Nepote, Perseus.'));
    footer.append(button('Pegar otro texto',()=>{form=newForm();view='manual';render();},
        'btn btn-outline'),button('Autores online (Wikisource)',()=>{view='online';render();},
        'btn btn-outline'),button('Volver al cuaderno',()=>{view='edit';render();}));
    shell.append(footer);return shell;
  }
  function renderEditor():HTMLElement{
    const main=el('main','notebook-editor'),edition=composer.activeEdition();
    if(!edition)return main;
    const head=el('div','notebook-editor-head');
    head.append(el('h2','',edition.title),el('p','hint',edition.placements.length+' textos en este cuaderno'));
    const actions=el('div','simple-actions');
    actions.append(button('+ NUEVO',async()=>{
      if(!await composer.flush()){notice('Guarda los cambios antes de añadir un texto.',true);return;}
      view='sources';render();
      notice('Selecciona un texto o pega uno propio; cancelar no crea ninguna ficha.');
    },'btn btn-primary'));
    actions.append(button('Biblioteca',()=>{view='sources';render();}));
    actions.append(button('Buscar autores y obras',()=>{view='authors';render();}));
    actions.append(button('Pegar texto',()=>{form=newForm();view='manual';render();}));
    actions.append(button('Volver a cuadernos',async()=>{
      if(!await composer.flush())return;
      await reload();stage='home';view='edit';render();
    }));
    head.append(actions);main.append(head);
    const sourceMode=view==='sources'||view==='authors';
    const layout=el('div','notebook-editor-layout'+(sourceMode?' source-mode':'')),
      aside=el('aside','notebook-editor-aside');
    aside.append(el('h3','','Índice de textos'));
    for(const [index,p] of edition.placements.entries()){
      aside.append(button((index+1)+'. '+p.text.title,async()=>{
        if(await composer.selectPlacement(p.id)){view='edit';render();}
      },'simple-source-row'+(composer.activePlacement()?.id===p.id?' selected':'')));
    }
    if(!edition.placements.length)aside.append(el('p','hint','Cuaderno vacío: añade el primer texto.'));
    const active=composer.activePlacement();
    if(active)aside.append(tagsPanel(active));
    if(corpus)aside.append(summaryCard({revision:activeEdition()?.revision??0,edition}));
    layout.append(aside);
    const content=el('div','notebook-editor-content');
    if(view==='sources')content.append(renderSources());
    else if(view==='authors')content.append(renderAuthors());
    else if(view==='online')content.append(renderOnline());
    else if(view==='manual')content.append(renderManual());
    else if(edition.placements.length){
      const tagBar=el('div','notebook-question-tags');
      const selected=composer.activePlacement();
      const catalog=allGrammarTags(corpus!.corpus);
      const allIds=new Set([...(selected?.grammaticalTagIds??[]),
        ...(selected?.grammaticalSpans??[]).flatMap(span=>span.tagIds)]);
      const names=[...allIds].map(id=>catalog.find(t=>t.id===id)?.label??id);
      tagBar.append(el('strong','','Construcciones del texto'),
        el('span','',names.length?names.join(' · '):'Sin etiquetar'));
      tagBar.append(button('Editar etiquetas',()=>{
        tagsOpen=true;render();
        root.querySelector<HTMLElement>('.notebook-editor-aside .simple-grammar')
          ?.scrollIntoView({block:'nearest',behavior:'smooth'});
      }));
      content.append(tagBar,composer.element);
    }else{
      const start=el('div','simple-start');
      start.append(el('h2','','Añade el primer texto'),
        el('p','','El cuaderno ya está guardado, pero aún no contiene preguntas ni fichas vacías.'));
      start.append(button('Buscar autores',()=>{view='authors';render();},'btn btn-primary'),
        button('Elegir de la biblioteca',()=>{view='sources';render();}),
        button('Pegar texto',()=>{form=newForm();view='manual';render();}));
      content.append(start);
    }
    layout.append(content);main.append(layout);return main;
  }
  function render():void{
    if(!corpus){root.replaceChildren(el('p','hint','Cargando cuadernos y biblioteca…'));return;}
    root.replaceChildren();
    const app=el('div','simple-app notebook-first');app.dataset.stage=stage;
    const header=el('header','simple-header');
    header.append(el('p','simple-eyebrow','CUADERNO DE TEXTOS LATINOS'),el('h1','','Mis cuadernos'));
    const tabs=el('nav','simple-tabs');
    tabs.append(button('Cuadernos',async()=>{
      if(!await composer.flush())return;await reload();stage='home';render();
    },'simple-tab'+(stage==='home'?' active':'')));
    if(selectedId)tabs.append(button('Editor',()=>{stage='editor';render();},
      'simple-tab'+(stage==='editor'?' active':'')));
    header.append(tabs);app.append(header);
    app.append(stage==='home'?renderHome():renderEditor());
    const status=el('p','simple-status',feedback);status.role='status';
    status.setAttribute('aria-live','polite');status.dataset.error=String(failed);app.append(status);
    const advanced=el('details','simple-advanced');
    advanced.append(el('summary','','Datos y opciones avanzadas'));
    const controls=el('div','simple-advanced-content');
    controls.append(button('Copia integral JSON (cuadernos e historial)',async()=>{
      try{
        if(!await composer.flush())return;
        saveJson(await createWorkspaceBackup(workspace),
          'cuadernos-backup-'+new Date().toISOString().slice(0,10)+'.json');
        notice('Copia de seguridad del espacio editorial preparada.');
      }catch(e){notice('No se generó la copia: '+String(e),true);}
    }));
    controls.append(button('Copia JSON de la biblioteca histórica',async()=>{
      try{
        const source=await corpusRepo.load();
        saveJson(await createBackup(source.corpus),
          'biblioteca-textos-backup-'+new Date().toISOString().slice(0,10)+'.json');
        notice('Copia del banco histórico preparada. Conserva los dos archivos JSON.');
      }catch(e){notice('No se generó la copia de biblioteca: '+String(e),true);}
    }));
    const legacy=el('a','','Interfaz de transición anterior');legacy.href='?';controls.append(legacy);
    advanced.append(controls);app.append(advanced);root.append(app);
  }
  document.addEventListener('selectionchange',readerSelectionChanged);
  render();
  void (async()=>{
    try{
      const [original,response,fullResponse,cached]=await Promise.all([corpusRepo.load(),
        fetch(new URL('../library/catalog.json',import.meta.url)),
        fetch(new URL('../library/examinator-catalog.json',import.meta.url)),
        downloadedWorks.list()]);
      if(!response.ok)throw new Error('No se puede cargar el catálogo local.');
      const data:unknown=await response.json();
      if(!data||typeof data!=='object'||!Array.isArray((data as {works?:unknown}).works))
        throw new Error('Catálogo incompleto.');
      if(!fullResponse.ok)throw new Error('Falta el catálogo Perseus de Examinator2.');
      const full:unknown=await fullResponse.json();
      examinator=parseExaminatorCatalogue(full);
      remoteAvailable=new Set(cached);
      corpus=original;catalogue=(data as {works:LibraryEntry[]}).works;
      await composer.open();await reload();render();
      notice('Listo: abre un cuaderno o crea uno nuevo.');
    }catch(e){notice('Error de inicio: '+String(e),true);render();}
  })();
}

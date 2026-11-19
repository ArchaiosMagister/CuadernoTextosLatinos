/**
 * Primera interfaz de composición editorial.
 * Usa exclusivamente NotebookEditionV1 y WorkspaceRepository: la hoja es una proyección,
 * no una segunda fuente de datos. El legado de fase 2 permanece intacto.
 */
import type { NotebookEditionV1, TextPlacementV1, VocabularyEntryV1 } from '../core/edition-model.js';
import { createEdition, createPlacement, placementFromCorpus } from '../core/edition-factory.js';
import type {ParsedTeacherDocx} from '../core/docx-import.js';
import {applyParsedTeacherDocx} from '../core/docx-import-apply.js';
import { choiceHeading, editOptionStatement, editPlacementText, editQuestionStatement,
  editSlotManual, editVocabulary, insertManualVocabulary, movePlacement, moveSession,
  scorePlacement, setQuestionPoints, toggleOption, toggleQuestion,
} from '../core/edition-operations.js';
import { fingerprintForMark, validateEdition } from '../core/edition-validation.js';
import type { EditorSessionV1 } from '../core/edition-model.js';
import { IndexedDbCorpusRepository } from '../storage/indexeddb-corpus-repository.js';
import { WorkspaceConflictError, WorkspaceRepository, type EditionSnapshotV1 } from '../storage/workspace-repository.js';
import { prepareLegacyMigration, executeLegacyMigration, type LegacyMigrationPlanV1 } from '../storage/workspace-migration.js';
import { createWorkspaceBackup } from '../storage/workspace-backup.js';
import { createAcademicControls } from './academic-controls.js';
import { createOfflineTeacherBankV1 } from '../core/academic-teacher-bank.js';
import { splitInlineItalics } from '../core/edition-inline-formatting.js';
import { suggestVocabulary, acceptVocabulary, type VocabularyDecisionV1, type VocabularyProposalV1 } from '../core/vocabulary-suggestions.js';
import { createNotebookDocx, notebookExportWarnings, exportQuestionHeading } from '../export/notebook-documents.js';
import {formattedVocabularyMeaning} from '../core/vocabulary-format.js';
import {PREFERRED_VOCABULARY_KEY,parsePreferredVocabulary,putPreferredVocabulary,
  preferredFor,vocabularyKey,vocabularySortKey,
  type VocabularyQuantityMode,type VocabularySelectionMode} from '../core/vocabulary-preferences.js';
import {exactLatinLineHeightPt,extraLatinSpacingPt} from '../core/latin-spacing.js';
import {isUnreviewedAutoVocabulary} from '../core/vocabulary-cleanup.js';

const workspace = new WorkspaceRepository();
const legacy = new IndexedDbCorpusRepository();
const optionNames: Record<string,string> = {
  preverb:'Modificación preverbial', phonetics:'Evolución fonética',
  prefix:'Prefijos', latinism:'Latinismos',
};
type Menu = 'text' | 'questions' | 'vocabulary' | 'format' | 'notebook';
const labels: {key:Menu;label:string}[] = [
  {key:'text',label:'Texto'}, {key:'questions',label:'Preguntas'},
  {key:'vocabulary',label:'Vocabulario'}, {key:'format',label:'Formato'},
  {key:'notebook',label:'Cuaderno'},
];
function node<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',value=''):HTMLElementTagNameMap[K] {
  const e=document.createElement(tag);if(cls)e.className=cls;if(value)e.textContent=value;return e;
}
function action(label:string,callback:()=>void|Promise<void>,cls='btn btn-outline'):HTMLButtonElement {
  const e=node('button',cls,label);e.type='button';e.addEventListener('click',()=>{void callback();});return e;
}
function textField(label:string,value:string,change:(value:string)=>void,multiline=false):HTMLElement {
  const wrap=node('label','edition-field');
  wrap.append(node('span','edition-field-label',label));
  const input=multiline?node('textarea','field-control'):node('input','field-control');
  input.value=value;
  if(multiline)(input as HTMLTextAreaElement).rows=7;
  input.addEventListener('input',()=>change(input.value));
  wrap.append(input);return wrap;
}
function numberField(label:string,value:number,min:number,max:number,step:number,change:(n:number)=>void):HTMLElement {
  const wrap=node('label','edition-field');wrap.append(node('span','edition-field-label',label));
  const input=node('input','field-control');input.type='number';input.min=String(min);input.max=String(max);
  input.step=String(step);input.value=String(value);
  input.addEventListener('change',()=>{
    const n=Number(input.value);
    if(Number.isFinite(n)&&n>=min&&n<=max)change(n);
    else input.value=String(value);
  });
  wrap.append(input);return wrap;
}
function download(text:string,filename:string):void {
  const blob=new Blob([text],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);
  link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
function buildMarkedLatin(p:TextPlacementV1):HTMLElement {
  const paragraph=node('p','edition-latin');
  paragraph.dataset.placementId=p.id;
  const raw=p.text.latin, marks=[...p.text.markup].sort((a,b)=>a.startUtf16-b.startUtf16);
  let position=0;
  for(const mark of marks){
    if(mark.startUtf16<position)continue;
    paragraph.append(document.createTextNode(raw.slice(position,mark.startUtf16)));
    const part=node('span',mark.kind==='morph-underline'?'edition-underlined':'edition-roman');
    part.textContent=raw.slice(mark.startUtf16,mark.endUtf16);
    if(mark.reviewRequired){part.classList.add('edition-review');part.title='Revisión del anclaje necesaria';}
    paragraph.append(part);position=mark.endUtf16;
  }
  paragraph.append(document.createTextNode(raw.slice(position)));
  return paragraph;
}
function paperFor(edition:NotebookEditionV1,p:TextPlacementV1,index:number,total:number):HTMLElement {
  const f=edition.format;
  const paper=node('article','edition-paper');
  paper.setAttribute('aria-label','Vista previa del texto '+(index+1));
  paper.style.fontFamily='"'+f.fontFamily.replaceAll('"','')+'", Palatino, "Book Antiqua", Georgia, serif';
  paper.style.fontSize=f.fontSizePt+'pt';paper.style.lineHeight='1.3';
  paper.style.padding=[f.marginsPt.top,f.marginsPt.right,f.marginsPt.bottom,f.marginsPt.left].map(x=>x+'pt').join(' ');
  paper.style.setProperty('--edition-bottom-padding',f.marginsPt.bottom+'pt');
  const head=node('header','edition-paper-head');
  head.append(node('h2','edition-paper-title',p.text.title));
  const source=node('p','edition-paper-source');
  if(p.text.author)source.append(document.createTextNode(p.text.author));
  if(p.text.work){source.append(document.createTextNode(p.text.author?', ':''));source.append(node('em','',p.text.work));}
  if(p.text.reference)source.append(document.createTextNode(' '+p.text.reference));
  const latin=buildMarkedLatin(p);latin.style.lineHeight=f.lineSpacingPt+'pt';
  latin.style.marginBottom=extraLatinSpacingPt(f.fontSizePt,f.lineSpacingPt)+'pt';
  head.append(source);paper.append(head,latin);
  const included=p.vocabulary.filter(v=>v.included).sort((a,b)=>
    vocabularySortKey(a.headword).localeCompare(vocabularySortKey(b.headword),'es',{sensitivity:'base'}));
  if(included.length){
    const box=node('section','edition-vocabulary');
    box.append(node('h3','','Vocabulario'));
    for(const v of included){
      const item=node('p','edition-vocabulary-line');
      item.append(node('em','',v.headword));
      item.append(document.createTextNode(v.meaning?': '+formattedVocabularyMeaning(v.meaning,v.glossesSeparated):': [significado pendiente]'));
      if(v.note)item.append(document.createTextNode(' ('+v.note+')'));
      box.append(item);
    }
    paper.append(box);
  }
  const questions=node('ol','edition-questions');
  questions.style.rowGap=f.questionGapPt+'pt';
  for(const q of p.questions.filter(x=>x.enabled)){
    const li=node('li','edition-question');
    const style=q.styleOverride;
    if(style){li.style.marginTop=style.beforePt+'pt';li.style.marginBottom=style.afterPt+'pt';}
    li.append(node('strong','',exportQuestionHeading(q,f.showPoints)));
    if(q.kind==='choice'){
      const list=node('ol','edition-choice-options');
      list.style.rowGap=(style?.subquestionGapPt??3)+'pt';
      for(const option of q.options.filter(o=>o.enabled)){
        const row=node('li');
        const statement=option.statement.value;
        for(const segment of splitInlineItalics(statement)){
          row.append(segment.italic?node('em','',segment.text):document.createTextNode(segment.text));
        }
        // Los derivados preverbiales son datos internos: nunca imprimir un solucionario.
        if(option.kind!=='preverb'&&option.slots.length){
          row.append(document.createTextNode(' '));
          option.slots.forEach((slot,index)=>{
            if(index)row.append(document.createTextNode(', '));
            row.append(node('em','',slot.value));
          });
          row.append(document.createTextNode('.'));
        }
        list.append(row);
      }
      li.append(list);
    }
    questions.append(li);
  }
  paper.append(questions);
  const footer=node('footer','edition-paper-footer',String(index+1)+' | '+String(total));
  footer.title='Numeración provisional de hojas en pantalla; la paginación real se validará en la exportación';
  paper.append(footer);
  return paper;
}
/** Hoja imprimible derivada del mismo modelo que la vista previa, sin datos duplicados. */
export function renderNotebookPrintPages(edition:NotebookEditionV1):HTMLElement {
  const root=node('main','edition-print-root');
  root.setAttribute('aria-label','Cuaderno A4 para impresión PDF');
  for(const [index,p] of edition.placements.entries()){
    root.append(paperFor(edition,p,index,edition.placements.length));
  }
  return root;
}
function freshId(prefix:string):string{return prefix+'.'+crypto.randomUUID();}
function now():string{return new Date().toISOString();}
function formatPoints(p:TextPlacementV1):string {
  return (scorePlacement(p)/100).toLocaleString('es-ES')+' / 8 puntos';
}
/** Edición de trabajo: los textos preparados se guardan aquí hasta que
 * el docente elige qué apariciones incluir en uno o varios cuadernos. */
export const WORKING_EDITION_ID='ed.seleccion-textos';
export interface CollatinusVocabularyCandidate {
  lemma:string;headword:string;meaning:string|null;note:string|null;
  proper?:boolean;glossesSeparated?:boolean;
}

/** Mantiene el panel y el borrador vivos aunque el usuario cambie a Biblioteca. */
export function createEditionPane(options:{
  autoApply?:boolean;autoVocabulary?:boolean;onAddSource?:()=>void;
  onAnalyzeVocabulary?:(latin:string,quantity:VocabularyQuantityMode)=>
    Promise<CollatinusVocabularyCandidate[]>;
}={}):{
  element:HTMLElement;
  open:()=>Promise<void>;
  flush:()=>Promise<boolean>;
  importLegacyNotebook:(id:string)=>Promise<boolean>;
  openSourceText:(textId:string)=>Promise<boolean>;
  prepareFromIds:(textIds:readonly string[],title:string)=>Promise<boolean>;
  openEdition:(editionId:string)=>Promise<boolean>;
  syncSourceTags:(textId:string,tagIds:readonly string[])=>Promise<boolean>;
  removeWorkingSource:(textId:string)=>Promise<boolean>;
  createNotebookNamed:(title:string)=>Promise<string|null>;
  addSourceToNotebook:(textId:string,titleOverride?:string)=>Promise<boolean>;
  importTeacherDocument:(doc:ParsedTeacherDocx)=>Promise<boolean>;
  selectPlacement:(placementId:string)=>Promise<boolean>;
  activePlacement:()=>TextPlacementV1|null;
  activeEdition:()=>NotebookEditionV1|null;
  addCollatinusVocabulary:(placementId:string,
    entries:readonly CollatinusVocabularyCandidate[])=>Promise<boolean>;
  setActiveTags:(ids:readonly string[])=>Promise<boolean>;
  addGrammarSpan:(start:number,end:number,tagId:string)=>Promise<boolean>;
  removeGrammarSpan:(id:string)=>Promise<boolean>;
  renameActiveNotebook:(title:string)=>Promise<boolean>;
  closeEdition:()=>void;
} {
  const autoApply=options.autoApply===true;
  const element=node('section','edition-shell');
  element.setAttribute('aria-label','Editor del cuaderno');
  let editions:EditionSnapshotV1[]=[];
  let active:string|null=null,current:EditionSnapshotV1|null=null,draft:NotebookEditionV1|null=null;
  let session:EditorSessionV1|null=null;
  let menu:Menu='text',mobile:'config'|'preview'='config';
  let zoom=85,loaded=false,loading:Promise<void>|null=null;
  let message='Cargando el espacio editorial…',error=false;
  let pendingMigration:LegacyMigrationPlanV1|null=null;
  let migrationConfirmed=false;
  let saving:Promise<boolean>|null=null;
  let saveTimer:ReturnType<typeof setTimeout>|null=null;
  let vocabularyBank:ReturnType<typeof createOfflineTeacherBankV1>|null=null;
  let vocabPreview:{placementId:string;baseline:string;proposals:VocabularyProposalV1[];
    choices:VocabularyDecisionV1[]}|null=null;
  let exportReview:{kind:'word'|'pdf';warnings:string[];baseline:string}|null=null;
  const academics=createAcademicControls(workspace,{
    snapshot:()=>current,flush,
    saved:next=>{
      current=next;
      editions=editions.map(e=>e.edition.id===next.edition.id?next:e);
      draft=structuredClone(next.edition);
      vocabPreview=null;exportReview=null;
      paint();
    },
    status:setMessage,repaint:paint,
  },{autoApply});
  document.addEventListener('selectionchange',()=>{
    const pages=element.querySelector<HTMLElement>('.edition-paper-pages');
    if(pages)academics.savePaperSelection(pages);
  });

  function setMessage(value:string,isError=false):void {
    message=value;error=isError;
    const el=element.querySelector<HTMLElement>('.edition-save-state');
    if(el){el.textContent=value;el.dataset.error=String(isError);}
  }
  function selection():TextPlacementV1|null{
    return draft?.placements.find(p=>p.id===session?.activePlacementId)??draft?.placements[0]??null;
  }
  function markDirty():void {
    setMessage('Cambios pendientes de guardar…');
    if(saveTimer!==null)clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{saveTimer=null;void flush();},700);
    paintPreview();
  }
  function apply(operation:(edition:NotebookEditionV1,at:string)=>NotebookEditionV1):void {
    if(!draft)return;
    try{
      draft=operation(draft,now());
      vocabPreview=null;exportReview=null;
      academics.clear();
      element.querySelector('.edition-academic-review')?.remove();
      markDirty();
    }
    catch(e){setMessage('No se ha aplicado el cambio: '+String(e instanceof Error?e.message:e),true);}
  }
  async function flush():Promise<boolean>{
    if(saveTimer!==null){clearTimeout(saveTimer);saveTimer=null;}
    if(saving){const ok=await saving;return ok?flush():false;}
    if(!current||!draft)return true;
    if(JSON.stringify(draft)===JSON.stringify(current.edition))return true;
    const baseline=current,prepared=structuredClone(draft),target=selection()?.id??draft.id;
    try{validateEdition(prepared);}
    catch(e){setMessage('No se puede guardar todavía: '+(e instanceof Error?e.message:String(e)),true);return false;}
    setMessage('Guardando…');
    saving=(async()=>{
      try{
        const saved=await workspace.commitEdition(baseline.edition.id,baseline.revision,
          {command:'ui.edit',targetId:target,timestamp:now()},previous=>{
            if(JSON.stringify(previous)!==JSON.stringify(baseline.edition)){
              throw new WorkspaceConflictError(baseline.revision,baseline.revision+1);
            }
            return prepared;
          });
        current=saved;
        editions=editions.map(e=>e.edition.id===saved.edition.id?saved:e);
        setMessage('Guardado · revisión '+saved.revision);
        return true;
      }catch(e){
        setMessage('Error: cambios conservados. '+(e instanceof Error?e.message:String(e)),true);
        return false;
      }
    })();
    const ok=await saving;saving=null;
    if(!ok)return false;
    return draft && JSON.stringify(draft)!==JSON.stringify(current.edition)?flush():true;
  }
  async function refresh(force=false):Promise<void>{
    if(loading)return loading;
    if(loaded&&!force)return;
    loading=(async()=>{
      try{
        if(force && !await flush())return;
        const items=await workspace.listEditions();
        editions=items;
        vocabPreview=null;exportReview=null;
        academics.clear();
        active=items.some(x=>x.edition.id===active)?active:items[0]?.edition.id??null;
        current=items.find(x=>x.edition.id===active)??null;
        draft=current?structuredClone(current.edition):null;
        session=draft?{
          activeEditionId:draft.id,activePlacementId:draft.placements[0]?.id??null,
          mode:'text',activeMenu:menu,previewZoom:zoom,scrollByPlacementId:{},
        }:null;
        loaded=true;
        setMessage(current?'Cuaderno editorial cargado.':'Crea un cuaderno o importa los de la biblioteca.');
        paint();
      }catch(e){setMessage('Error al abrir el editor: '+(e instanceof Error?e.message:String(e)),true);paint();}
      finally{loading=null;}
    })();
    return loading;
  }
  function changeEdition(id:string):Promise<void>{
    return (async()=>{
      if(!await flush())return;
      const snapshot=editions.find(x=>x.edition.id===id);if(!snapshot)return;
      academics.clear();vocabPreview=null;exportReview=null;
      active=id;current=snapshot;draft=structuredClone(snapshot.edition);
      session={activeEditionId:id,activePlacementId:draft.placements[0]?.id??null,
        mode:'text',activeMenu:menu,previewZoom:zoom,scrollByPlacementId:{}};
      paint();
    })();
  }
  function navigate(command:'previous'|'next'|'whole'|{placementId:string}):Promise<void>{
    return (async()=>{
      if(!draft||!session||!await flush())return;
      academics.clear();vocabPreview=null;exportReview=null;
      session=moveSession(draft,session,command);
      paint();
    })();
  }
  /** El cuaderno nace vacío, con ID e historial propio: no hay edición intermedia. */
  async function createNotebookNamed(title:string):Promise<string|null>{
    if(!title.trim()||title.trim().length>250){
      setMessage('Escribe un título válido de hasta 250 caracteres.',true);return null;
    }
    if(!await flush())return null;
    const at=now(),id=freshId('ed');
    try{
      const fresh=createEdition({id,legacyNotebookId:null,title:title.trim(),timestamp:at,placements:[]});
      const saved=await workspace.commitEdition(id,0,
        {command:'ui.create-direct-notebook',targetId:id,timestamp:at},()=>fresh);
      editions=[...editions,saved];
      await changeEdition(id);
      return id;
    }catch(e){
      setMessage('No se ha creado el cuaderno: '+(e instanceof Error?e.message:String(e)),true);
      return null;
    }
  }
  /** Añadir al cuaderno ACTIVO sin modificar ni clonar otros cuadernos. */
  async function addSourceToNotebook(textId:string,titleOverride?:string):Promise<boolean>{
    if(!await flush()||!current||!draft||!session)return false;
    try{
      const text=(await legacy.load()).corpus.texts.find(t=>t.id===textId);
      if(!text)throw new Error('El texto ya no existe en la biblioteca.');
      const existing=draft.placements.find(p=>p.source.kind==='corpus'&&p.source.sourceId===textId);
      if(existing){
        await navigate({placementId:existing.id});
        setMessage('Este texto ya figura en el cuaderno; se abre sin duplicarlo.');
        return true;
      }
      const at=now(),place=placementFromCorpus(text,freshId('place'),at,()=>freshId('item'));
      // Un pasaje puede tener títulos docentes diferentes en cuadernos distintos.
      // La biblioteca compartida, los títulos históricos y las fuentes no cambian.
      if(titleOverride?.trim())place.text.title=titleOverride.trim();
      const id=current.edition.id;
      const saved=await workspace.commitEdition(id,current.revision,
        {command:'ui.add-source-direct',targetId:place.id,timestamp:at},old=>{
          if(!old)throw new Error('Cuaderno no disponible.');
          if(old.placements.some(p=>p.source.kind==='corpus'&&p.source.sourceId===textId))
            throw new Error('El texto se ha añadido desde otra pestaña. Recarga el cuaderno.');
          return validateEdition({...old,updatedAt:at,placements:[...old.placements,place]});
        });
      current=saved;draft=structuredClone(saved.edition);
      editions=editions.map(e=>e.edition.id===id?saved:e);
      session={...session,activePlacementId:place.id,mode:'text'};
      academics.clear();vocabPreview=null;exportReview=null;
      menu='questions';mobile='config';
      if(autoApply && options.autoVocabulary!==false){
        const p=selection();
        if(p&&p.vocabulary.length===0){
          try{applyVocabularyAutomatically(p,true);await flush();}
          catch(err){setMessage('Texto añadido. Revisa el vocabulario: '+String(err),true);}
        }
      }
      paint();
      if(autoApply)await academics.generateInitial(place.id);
      setMessage('Texto incorporado con preguntas generadas; puedes modificar cualquiera.');
      return true;
    }catch(e){
      setMessage('No se pudo añadir: '+(e instanceof Error?e.message:String(e)),true);return false;
    }
  }

  /** Un Word es una aparición manual aislada del Corpus original. */
  async function importTeacherDocument(doc:ParsedTeacherDocx):Promise<boolean>{
    if(!draft||!session||!current||!await flush())return false;
    if(!doc.title.trim()||!doc.latin.trim())return false;
    const at=now(),editionId=current.edition.id;
    const place=createPlacement({
      id:freshId('place'),
      source:{kind:'manual',sourceId:null,urn:null,importedAt:at},
      title:doc.title,latin:doc.latin,author:doc.author,work:doc.work,
      reference:doc.reference,
    },()=>freshId('item'));
    try{
      // Prevalidar el documento completo antes del primer commit: un DOCX
      // malformado no debe dejar una aparición a medio importar.
      const prospective=applyParsedTeacherDocx(place,doc,()=>freshId('item'));
      validateEdition({...draft,updatedAt:at,
        placements:[...draft.placements,prospective]});
      const saved=await workspace.commitEdition(editionId,current.revision,
        {command:'ui.import-docx',targetId:place.id,timestamp:at},old=>{
          if(!old)throw Error('No existe el cuaderno.');
          return validateEdition({...old,updatedAt:at,placements:[...old.placements,place]});
        });
      current=saved;draft=structuredClone(saved.edition);
      editions=editions.map(x=>x.edition.id===editionId?saved:x);
      session={...session,activePlacementId:place.id,mode:'text'};
      academics.clear();vocabPreview=null;exportReview=null;
      // Generación con los bancos antes de insertar las decisiones docentes;
      // así quedan las palabras documentadas como reserva de huecos.
      if(autoApply)await academics.generateInitial(place.id);
      if(!draft)throw Error('El cuaderno no está disponible.');
      const updateAt=now();
      // Validar ANTES de dar la importación por aceptada: a diferencia de
      // apply(), un fallo de anclajes o datos no puede quedar silenciado.
      draft=validateEdition({...draft,updatedAt:updateAt,
        placements:draft.placements.map(p=>p.id===place.id
          ?applyParsedTeacherDocx(p,doc,()=>freshId('item')):p)});
      vocabPreview=null;exportReview=null;academics.clear();markDirty();
      if(!await flush())throw Error('No se pudo guardar el documento importado.');
      // El modo Examinator2 NO debe poblar automáticamente todo el vocabulario
      // cuando un DOCX no tenga tabla; solo el proceso conservador Collatinus.
      if(!doc.vocabulary.length && options.autoVocabulary!==false){
        const selected=selection();
        if(selected)try{applyVocabularyAutomatically(selected,true);await flush();}
          catch(error){setMessage('Documento incorporado; vocabulario pendiente: '+String(error),true);}
      }
      menu='questions';mobile='config';paint();
      setMessage('Word incorporado: subrayados y palabras docentes conservados; huecos completados cuando hay candidatos.');
      return true;
    }catch(error){
      setMessage('Importación fallida: '+(error instanceof Error?error.message:String(error)),true);
      return false;
    }
  }
  async function selectPlacement(placementId:string):Promise<boolean>{
    if(!draft?.placements.some(p=>p.id===placementId)||!session||!await flush())return false;
    session=moveSession(draft,session,{placementId});
    academics.clear();vocabPreview=null;exportReview=null;paint();
    return true;
  }
  async function setActiveTags(ids:readonly string[]):Promise<boolean>{
    const p=selection();
    if(!p||!draft)return false;
    const unique=[...new Set(ids)];
    apply((edition,at)=>validateEdition({...edition,updatedAt:at,
      placements:edition.placements.map(x=>x.id===p.id?{...x,grammaticalTagIds:unique}:x)}));
    const saved=await flush();paint();return saved;
  }
  async function addGrammarSpan(start:number,end:number,tagId:string):Promise<boolean>{
    const placement=selection();
    if(!placement||!draft||!tagId)return false;
    const latin=placement.text.latin;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)
      ||start<0||end>latin.length||end<=start||!latin.slice(start,end).trim()){
      setMessage('Selecciona un fragmento latino no vacío.',true);return false;
    }
    const span={id:freshId('span'),startUtf16:start,endUtf16:end,
      exact:latin.slice(start,end),textFingerprint:fingerprintForMark(latin,start,end),
      tagIds:[tagId],reviewRequired:false};
    apply((edition,at)=>validateEdition({...edition,updatedAt:at,
      placements:edition.placements.map(p=>p.id===placement.id
        ?{...p,grammaticalSpans:[...(p.grammaticalSpans??[]),span]}:p)}));
    const saved=await flush();paint();return saved;
  }
  async function removeGrammarSpan(id:string):Promise<boolean>{
    const placement=selection();
    if(!placement||!draft||!(placement.grammaticalSpans??[]).some(x=>x.id===id))return false;
    apply((edition,at)=>validateEdition({...edition,updatedAt:at,
      placements:edition.placements.map(p=>p.id===placement.id
        ?{...p,grammaticalSpans:(p.grammaticalSpans??[]).filter(x=>x.id!==id)}:p)}));
    const saved=await flush();paint();return saved;
  }
  async function renameActiveNotebook(title:string):Promise<boolean>{
    if(!draft||!title.trim()||title.trim().length>250)return false;
    apply((edition,at)=>validateEdition({...edition,title:title.trim(),updatedAt:at}));
    const saved=await flush();paint();return saved;
  }
  function closeEdition():void{
    if(saveTimer!==null){clearTimeout(saveTimer);saveTimer=null;}
    active=null;current=null;draft=null;session=null;
    academics.clear();vocabPreview=null;exportReview=null;
    paint();
  }
  async function createNotebook():Promise<void>{
    if(!await flush())return;
    const title=window.prompt('Título del nuevo cuaderno');
    if(!title?.trim())return;
    const at=now(),id=freshId('ed');
    try{
      const fresh=createEdition({id,legacyNotebookId:null,title:title.trim(),timestamp:at,placements:[]});
      const saved=await workspace.commitEdition(id,0,{command:'ui.create',targetId:id,timestamp:at},()=>fresh);
      editions=[...editions,saved];await changeEdition(id);
    }catch(e){setMessage('No se ha creado: '+(e instanceof Error?e.message:String(e)),true);}
  }
  /** Solo retira la aparición de trabajo; preserva sin cambios todos los
   * cuadernos exportables que ya se hayan preparado a partir de ella. */
  async function removeWorkingSource(textId:string):Promise<boolean>{
    if(!await flush())return false;
    try{
      const saved=await workspace.loadEdition(WORKING_EDITION_ID);
      if(!saved)return true;
      if(!saved.edition.placements.some(p=>p.source.sourceId===textId))return true;
      const at=now();
      const updated=await workspace.commitEdition(WORKING_EDITION_ID,saved.revision,
        {command:'ui.remove-working-source',targetId:textId,timestamp:at},previous=>{
          if(!previous)throw new Error('La edición de trabajo no está disponible');
          return validateEdition({...previous,updatedAt:at,
            placements:previous.placements.filter(p=>p.source.sourceId!==textId)});
        });
      editions=editions.map(e=>e.edition.id===WORKING_EDITION_ID?updated:e);
      if(active===WORKING_EDITION_ID){
        current=updated;draft=structuredClone(updated.edition);
        if(session)session={...session,activePlacementId:draft.placements[0]?.id??null};
        paint();
      }
      return true;
    }catch(err){
      setMessage('El texto original se ha eliminado, pero queda una copia de trabajo. '+
        (err instanceof Error?err.message:String(err)),true);
      return false;
    }
  }

  /** Selección directa: un texto guardado se añade sin duplicar la fuente
   * a la edición de trabajo; preguntas, vocabulario y cambios se conservan. */
  async function openSourceText(textId:string):Promise<boolean>{
    await refresh();
    if(!await flush())return false;
    try{
      const text=(await legacy.load()).corpus.texts.find(t=>t.id===textId);
      if(!text)throw new Error('No existe el texto seleccionado. Recarga la lista.');
      editions=await workspace.listEditions();
      const previous=editions.find(x=>x.edition.id===WORKING_EDITION_ID);
      let entry=previous?.edition.placements.find(p=>
        p.source.kind==='corpus'&&p.source.sourceId===textId)??null;
      const at=now();
      if(!previous){
        entry=placementFromCorpus(text,freshId('place'),at,()=>freshId('item'));
        const fresh=createEdition({
          id:WORKING_EDITION_ID,legacyNotebookId:null,
          title:'Textos seleccionados',timestamp:at,placements:[entry],
        });
        const created=await workspace.commitEdition(WORKING_EDITION_ID,0,
          {command:'ui.open-source',targetId:textId,timestamp:at},()=>fresh);
        editions.push(created);
      }else if(!entry){
        entry=placementFromCorpus(text,freshId('place'),at,()=>freshId('item'));
        const added=entry;
        const updated=await workspace.commitEdition(WORKING_EDITION_ID,previous.revision,
          {command:'ui.open-source',targetId:textId,timestamp:at},prior=>{
            if(!prior)throw new Error('Falta la edición de trabajo.');
            if(prior.placements.some(p=>p.source.kind==='corpus'&&p.source.sourceId===textId))
              return prior;
            return validateEdition({...prior,updatedAt:at,placements:[...prior.placements,added]});
          });
        editions=editions.map(x=>x.edition.id===WORKING_EDITION_ID?updated:x);
      }
      await changeEdition(WORKING_EDITION_ID);
      if(session&&entry)session={...session,activePlacementId:entry.id,mode:'text'};
      menu='questions';
      mobile='config';
      if(autoApply&&options.autoVocabulary!==false&&entry){
        const currentPlacement=selection();
        if(currentPlacement&&currentPlacement.id===entry.id&&currentPlacement.vocabulary.length===0){
          try{applyVocabularyAutomatically(currentPlacement,true);await flush();}
          catch(err){setMessage('El texto se ha abierto; revisa su vocabulario: '+String(err),true);}
        }
      }
      paint();
      setMessage('Texto listo para editar: preguntas, vocabulario y vista previa A4.');
      return true;
    }catch(err){
      setMessage('No se pudo abrir el texto: '+(err instanceof Error?err.message:String(err)),true);
      return false;
    }
  }

  /** Crea una edición independiente solo con los textos elegidos. Copia las
   * preguntas editadas de la selección sin modificar sus originales. */
  async function prepareFromIds(textIds:readonly string[],title:string):Promise<boolean>{
    if(!await flush())return false;
    const chosen=[...new Set(textIds)];
    if(!chosen.length||!title.trim()){
      setMessage('Elige al menos un texto y escribe el título del cuaderno.',true);return false;
    }
    try{
      const corpus=(await legacy.load()).corpus;
      const byId=new Map(corpus.texts.map(t=>[t.id,t]));
      for(const id of chosen)if(!byId.has(id))throw new Error('Texto no encontrado: '+id);
      const working=await workspace.loadEdition(WORKING_EDITION_ID);
      const drafts=new Map(working?.edition.placements.filter(p=>p.source.kind==='corpus'&&p.source.sourceId)
        .map(p=>[p.source.sourceId!,p])??[]);
      const at=now();
      const placements=chosen.map(id=>{
        const saved=drafts.get(id);
        const source=byId.get(id)!;
        if(!saved)return placementFromCorpus(source,freshId('place'),at,()=>freshId('item'));
        return {...structuredClone(saved),id:freshId('place'),grammaticalTagIds:[...source.tagIds]};
      });
      const id=freshId('ed');
      const edition=createEdition({
        id,legacyNotebookId:null,title:title.trim(),timestamp:at,placements,
      });
      const created=await workspace.commitEdition(id,0,
        {command:'ui.prepare-selected',targetId:id,timestamp:at},()=>edition);
      editions=await workspace.listEditions();
      if(!editions.some(e=>e.edition.id===created.edition.id))editions.push(created);
      await changeEdition(id);
      menu='notebook';
      mobile='config';
      paint();
      setMessage('Cuaderno preparado: '+placements.length+' textos seleccionados. Listo para Word/PDF.');
      return true;
    }catch(err){
      setMessage('No se pudo preparar el cuaderno: '+(err instanceof Error?err.message:String(err)),true);
      return false;
    }
  }

  async function openEdition(editionId:string):Promise<boolean>{
    if(!await flush())return false;
    editions=await workspace.listEditions();
    if(!editions.some(e=>e.edition.id===editionId))return false;
    await changeEdition(editionId);
    menu='notebook';paint();return true;
  }

  /** Sincronizar solo las etiquetas de la edición de trabajo tras guardar el
   * corpus docente. La operación no regenera ninguna pregunta ni vocabulario. */
  async function syncSourceTags(textId:string,tagIds:readonly string[]):Promise<boolean>{
    if(!await flush())return false;
    try{
      const currentWorking=await workspace.loadEdition(WORKING_EDITION_ID);
      if(!currentWorking)return true;
      const p=currentWorking.edition.placements.find(p=>p.source.kind==='corpus'&&p.source.sourceId===textId);
      if(!p || JSON.stringify(p.grammaticalTagIds)===JSON.stringify(tagIds))return true;
      const at=now();
      const saved=await workspace.commitEdition(WORKING_EDITION_ID,currentWorking.revision,
        {command:'ui.sync-grammar',targetId:p.id,timestamp:at},prior=>{
          if(!prior)throw new Error('No existe la edición de trabajo.');
          return validateEdition({...prior,updatedAt:at,placements:prior.placements.map(x=>
            x.id===p.id?{...x,grammaticalTagIds:[...tagIds]}:x)});
        });
      editions=editions.map(e=>e.edition.id===WORKING_EDITION_ID?saved:e);
      if(current?.edition.id===WORKING_EDITION_ID){
        current=saved;draft=structuredClone(saved.edition);paint();
      }
      return true;
    }catch(err){setMessage('Etiquetas guardadas en el texto, pero la vista editorial requiere actualización: '+
      (err instanceof Error?err.message:String(err)),true);return false;}
  }

  /**
   * Puente no destructivo entre «Cuadernos» (CorpusV1) y el compositor A4.
   * Un cuaderno histórico se importa una sola vez; importaciones sucesivas
   * agregan únicamente los IDs de texto pendientes, sin sobrescribir el
   * texto, vocabulario, preguntas ni orden que el docente editó en A4.
   */
  async function importLegacyNotebook(legacyNotebookId:string):Promise<boolean>{
    if(!await flush())return false;
    try{
      const source=await legacy.load();
      const book=source.corpus.notebooks.find(item=>item.id===legacyNotebookId);
      if(!book)throw new Error('El cuaderno original ya no existe. Actualiza la biblioteca.');
      const texts=new Map(source.corpus.texts.map(text=>[text.id,text]));
      for(const textId of book.textIds){
        if(!texts.has(textId))throw new Error('Falta un texto del cuaderno original: '+textId);
      }
      // Refrescar antes de decidir si el cuaderno ya se importó (otra pestaña
      // podría haberlo creado). Nunca generar un duplicado por pulsar dos veces.
      editions=await workspace.listEditions();
      const previous=editions.find(item=>item.edition.legacyNotebookId===book.id);
      const at=now();
      if(previous){
        const assigned=new Set(previous.edition.placements.map(p=>p.source.sourceId));
        const pending=book.textIds.filter(id=>!assigned.has(id));
        if(!pending.length){
          await changeEdition(previous.edition.id);
          menu='notebook';paint();
          setMessage('«'+book.title+'» ya está preparado. No se han duplicado textos.');
          return true;
        }
        const added=pending.map(id=>placementFromCorpus(texts.get(id)!,freshId('place'),at,
          ()=>freshId('item')));
        const saved=await workspace.commitEdition(previous.edition.id,previous.revision,
          {command:'ui.import-legacy',targetId:book.id,timestamp:at},edition=>{
            if(!edition || edition.legacyNotebookId!==book.id){
              throw new Error('El cuaderno editorial cambió durante la importación.');
            }
            // Revalidar sobre el estado de la transacción evita sobrescribir
            // cualquier otra modificación del documento.
            return validateEdition({...edition,updatedAt:at,
              placements:[...edition.placements,...added]});
          });
        editions=editions.map(item=>item.edition.id===saved.edition.id?saved:item);
        await changeEdition(saved.edition.id);
        menu='notebook';paint();
        setMessage('Se han incorporado '+pending.length+' texto(s) nuevos de «'+book.title+
          '». Las preguntas, el vocabulario y los textos ya editados se conservan.');
        return true;
      }
      const placements=book.textIds.map(id=>placementFromCorpus(texts.get(id)!,freshId('place'),
        at,()=>freshId('item')));
      const id=freshId('ed');
      const edition=createEdition({id,legacyNotebookId:book.id,title:book.title,
        timestamp:at,placements});
      const saved=await workspace.commitEdition(id,0,
        {command:'ui.import-legacy',targetId:book.id,timestamp:at},()=>edition);
      editions=[...editions,saved];
      await changeEdition(saved.edition.id);
      menu='notebook';paint();
      setMessage('Cuaderno «'+book.title+'» preparado con '+placements.length+
        ' texto(s). Los originales continúan en «Cuadernos».');
      return true;
    }catch(err){
      setMessage('No se pudo preparar el cuaderno original: '+
        (err instanceof Error?err.message:String(err)),true);
      return false;
    }
  }

  function legacyNotebookPicker():HTMLElement {
    const container=node('section','edition-import-legacy');
    container.append(node('h3','','Traer cuaderno existente'),
      node('p','hint','Copia al editor los textos de «Cuadernos» en el orden guardado. Si ya estaba preparado, añade solo los textos nuevos sin cambiar tus preguntas ni el vocabulario.'));
    const choice=node('select','field-control');
    choice.setAttribute('aria-label','Elegir cuaderno de Cuadernos');
    const importButton=action('Preparar cuaderno seleccionado',async()=>{
      if(!choice.value)return;
      await importLegacyNotebook(choice.value);
    },'btn btn-primary');
    importButton.disabled=true;
    const row=node('div','edition-inline-edit');
    row.append(choice,importButton);
    container.append(row);
    void legacy.load().then(snapshot=>{
      if(!container.isConnected)return;
      choice.replaceChildren();
      for(const notebook of snapshot.corpus.notebooks){
        const option=node('option','',
          notebook.title+' ('+notebook.textIds.length+' texto(s))');
        option.value=notebook.id;
        choice.append(option);
      }
      importButton.disabled=!snapshot.corpus.notebooks.length;
      if(!snapshot.corpus.notebooks.length){
        choice.append(node('option','','Primero crea un cuaderno en «Cuadernos»'));
        importButton.disabled=true;
      }
    }).catch(err=>setMessage('No se pudieron listar los cuadernos: '+String(err),true));
    return container;
  }

  async function undo():Promise<void>{
    if(!current||!await flush())return;
    try{
      const restored=await workspace.undoLast(current.edition.id,current.revision,now());
      current=restored;editions=editions.map(e=>e.edition.id===restored.edition.id?restored:e);
      draft=structuredClone(restored.edition);
      vocabPreview=null;exportReview=null;
      academics.clear();
      if(session && !draft.placements.some(p=>p.id===session?.activePlacementId))
        session={...session,activePlacementId:draft.placements[0]?.id??null};
      setMessage('Último cambio deshecho. Revisión '+restored.revision);paint();
    }catch(e){setMessage('No se puede deshacer: '+(e instanceof Error?e.message:String(e)),true);}
  }
  async function backup():Promise<void>{
    if(!await flush())return;
    try{
      const text=await createWorkspaceBackup(workspace);
      download(text,'cuaderno-editorial-'+now().replace(/[:.]/g,'-')+'.json');
      setMessage('Copia editorial JSON v2 preparada. Consérvala fuera del navegador.');
    }catch(e){setMessage('No se pudo crear la copia: '+(e instanceof Error?e.message:String(e)),true);}
  }
  async function prepareMigration():Promise<void>{
    try{
      pendingMigration=await prepareLegacyMigration(legacy);
      migrationConfirmed=false;
      download(pendingMigration.legacyBackupJson,'cuaderno-legado-v1-'+now().replace(/[:.]/g,'-')+'.json');
      setMessage('Copia original v1 descargada. Verifica que la has guardado antes de confirmar.');
      paint();
    }catch(e){setMessage('Error de preparación: '+(e instanceof Error?e.message:String(e)),true);}
  }
  async function migrate():Promise<void>{
    if(!pendingMigration||!migrationConfirmed)return;
    try{
      await executeLegacyMigration(workspace,pendingMigration,
        {legacyBackupExported:true,confirmCreateWorkspace:true},legacy);
      pendingMigration=null;await refresh(true);
      setMessage('Cuadernos importados sin modificar la base original.');
    }catch(e){setMessage('Migración cancelada: '+(e instanceof Error?e.message:String(e)),true);}
  }

  function paintPreview():void {
    const target=element.querySelector<HTMLElement>('.edition-paper-pages');
    if(!target)return;
    target.replaceChildren();
    if(!draft||!session){target.append(node('p','hint','Elige un cuaderno.'));return;}
    const placements=session.mode==='whole-notebook'?draft.placements:
      draft.placements.filter(p=>p.id===(selection()?.id??''));
    if(!placements.length){target.append(node('p','hint','Este cuaderno no contiene textos. Añádelos desde «Cuaderno».'));return;}
    for(const p of placements)target.append(paperFor(draft,p,draft.placements.indexOf(p),draft.placements.length));
    target.style.zoom=String(zoom/100);
    const review=element.querySelector<HTMLElement>('.edition-preview-note');
    if(review)review.textContent='Word numera las páginas físicas. En Safari, el PDF por impresión puede salir sin numeración 1 | N: si la necesitas, abre el DOCX en Pages y expórtalo como PDF. Comprueba los saltos en textos largos.';
  }
  function menuText(panel:HTMLElement,p:TextPlacementV1):void {
    const mutate=(key:'title'|'author'|'work'|'reference'|'latin')=>(value:string)=>{
      apply((e,at)=>editPlacementText(e,p.id,key,key==='latin'||key==='title'?value:value.trim()||null,at));
    };
    const latin=textField('Texto latino',p.text.latin,mutate('latin'),true);
    panel.append(textField('Título del texto',p.text.title,mutate('title')),
      textField('Autor',p.text.author??'',mutate('author')),
      textField('Obra',p.text.work??'',mutate('work')),
      textField('Libro, capítulo o referencia',p.text.reference??'',mutate('reference')),
      latin);
    const textArea=latin.querySelector('textarea');
    if(textArea)panel.append(academics.renderTextSelect(p,textArea));
    panel.append(node('p','hint','La edición no altera el fragmento original de la biblioteca. Los subrayados se conservan por aparición; si cambia su contexto se señala revisión.'));
  }
  function menuQuestions(panel:HTMLElement,p:TextPlacementV1):void {
    // Índice compacto a la manera de Examinator2: navegar a cada tarjeta sin
    // duplicar sus campos ni modificar las palabras y decisiones del docente.
    const names:Record<string,string>={
      translation:'Traducción',syntax:'Sintaxis',morphology:'Morfología',choice:'Elección',
    };
    const overview=node('nav','edition-question-index');
    overview.setAttribute('aria-label','Ir a una pregunta');
    overview.append(node('strong','','Preguntas del texto'));
    const shortcuts=node('div','edition-question-shortcuts');
    for(const [index,q] of p.questions.entries()){
      const jump=action(String(index+1)+'. '+(names[q.kind]??q.kind),()=>{
        panel.querySelectorAll<HTMLElement>('.edition-question-panel')[index]
          ?.scrollIntoView({block:'nearest',behavior:'auto'});
      },'btn btn-outline edition-question-jump');
      if(!q.enabled)jump.classList.add('is-inactive');
      shortcuts.append(jump);
    }
    overview.append(shortcuts);
    panel.append(overview);
    for(const q of p.questions){
      const section=node('section','edition-question-panel');
      section.dataset.kind=q.kind;
      if(!q.enabled)section.classList.add('is-inactive');
      const top=node('div','edition-question-top');
      const check=node('input');check.type='checkbox';check.checked=q.enabled;
      check.setAttribute('aria-label','Incluir pregunta '+q.kind);
      check.addEventListener('change',()=>{
        apply((e,at)=>toggleQuestion(e,p.id,q.id,check.checked,at));paint();
      });
      const heading=({
        translation:'1. Traducción',syntax:'2. Sintaxis',
        morphology:'3. Morfología',choice:'4. Elección',
      } as Record<string,string>)[q.kind]??q.kind;
      top.append(check,node('h3','',heading),
        node('span','edition-question-status',q.enabled?'Incluida':'No incluida'));
      section.append(top);
      section.append(textField('Enunciado',q.statement.value,value=>{
        apply((e,at)=>editQuestionStatement(e,p.id,q.id,value,at));
      }));
      const points=node('div','edition-question-points');
      points.append(numberField('Puntos',q.pointsHundredths/100,0,100,.25,value=>{
        apply((e,at)=>setQuestionPoints(e,p.id,q.id,Math.round(value*100),at));paint();
      }));
      section.append(points);
      if(q.kind==='morphology')academics.renderMorph(section,p,q);
      if(q.kind==='choice'){
        const options=q.options;
        for(const [idx,o] of options.entries()){
          const opt=node('div','edition-option');
          const head=node('label','edition-option-head');
          const checkOption=node('input');checkOption.type='checkbox';checkOption.checked=o.enabled;
          checkOption.addEventListener('change',()=>{
            apply((e,at)=>toggleOption(e,p.id,q.id,o.id,checkOption.checked,at));paint();
          });
          head.append(checkOption,node('strong','',String.fromCharCode(97+idx)+'. '+optionNames[o.kind]));
          opt.append(head,textField('Enunciado del apartado',o.statement.value,value=>{
            apply((e,at)=>editOptionStatement(e,p.id,q.id,o.id,value,at));
          }));
          opt.append(node('p','hint','Para aplicar cursiva a una palabra dentro del enunciado, rodéala de *asteriscos*.'));
          for(const [slotIndex,slot] of o.slots.entries()){
            const word=node('div','edition-inline-edit');
            word.append(textField('Palabra',slot.value,value=>{
              apply((e,at)=>editSlotManual(e,p.id,q.id,o.id,slot.id,value,at));
            }));
            word.append(action('Quitar',()=>{
              apply((e,at)=>validateEdition({...e,updatedAt:at,placements:e.placements.map(x=>
                x.id!==p.id?x:{...x,questions:x.questions.map(item=>item.id!==q.id||item.kind!=='choice'?item:{
                  ...item,options:item.options.map(opt=>opt.id!==o.id?opt:{...opt,slots:opt.slots.filter(s=>s.id!==slot.id)}),
                })})}));paint();
            }));
            academics.renderSlot(word,p,q,o,slot.id,slotIndex);
            opt.append(word);
          }
          const input=node('input','field-control');input.placeholder='Añadir término manual…';
          const add=action('+ Término',()=>{
            const value=input.value.trim();if(!value)return;
            apply((e,at)=>validateEdition({...e,updatedAt:at,
              placements:e.placements.map(x=>x.id!==p.id?x:{...x,questions:x.questions.map(item=>
                item.id!==q.id||item.kind!=='choice'?item:{...item,options:item.options.map(opt=>opt.id!==o.id?opt:{...opt,slots:[
                  ...opt.slots,{id:freshId('slot'),value,origin:'manual' as const,locked:true,
                    proposedLemmaId:null,provenance:null},
                ]})})})}));paint();
          },'btn btn-outline');
          const row=node('div','edition-inline-edit');row.append(input,add);opt.append(row);
          academics.renderOption(opt,p,q,o);
          section.append(opt);
        }
        academics.renderQuestion(section,p,q);
        const count=q.options.filter(o=>o.enabled).length;
        section.append(node('p',count<q.requiredCount?'edition-error':'hint',
          choiceHeading(q)+(count<q.requiredCount?' Faltan apartados activos.':'')));
      }
      panel.append(section);
    }
    const total=scorePlacement(p);
    panel.append(node('p',total===800?'edition-score':'edition-error',
      'Total activo: '+formatPoints(p)+(total===800?'':' · revisión necesaria')));
  }
  function applyVocabularyAutomatically(p:TextPlacementV1,onlyWhenEmpty=false):number{
    if(!draft||(onlyWhenEmpty&&p.vocabulary.length))return 0;
    vocabularyBank??=createOfflineTeacherBankV1();
    const proposals=suggestVocabulary(p,vocabularyBank.bank);
    if(!proposals.length)return 0;
    // Lemas inequívocos del banco; los demás conservan la forma textual y
    // se guardan como pendientes de revisión, nunca como lemas verificados.
    const seen=new Set<string>();
    const decisions=proposals.map(item=>{
      const headword=item.lemma??item.surface;
      const normalized=headword.toLocaleLowerCase('es').normalize('NFC');
      const selected=!seen.has(normalized);
      seen.add(normalized);
      return {surface:item.surface,selected,headword,meaning:''};
    });
    apply((e,at)=>acceptVocabulary(e,p.id,proposals,decisions,
      ()=>freshId('voc'),at));
    return decisions.filter(x=>x.selected).length;
  }
  /** Propuestas del Collatinus original: respetan las entradas manuales y
   * no se presentan como verificaciones filológicas individuales. */
  async function addCollatinusVocabulary(placementId:string,
    entries:readonly CollatinusVocabularyCandidate[]):Promise<boolean>{
    if(!draft||!current||!draft.placements.some(p=>p.id===placementId))return false;
    if(!await flush())return false;
    const p=draft.placements.find(p=>p.id===placementId);
    if(!p)return false;
    const clean=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLocaleLowerCase('es').trim();
    const seen=new Set(p.vocabulary.flatMap(v=>[clean(v.headword),clean(v.lemma)]));
    let order=p.vocabulary.reduce((m,v)=>Math.max(m,v.order),-1)+1;
    const next:VocabularyEntryV1[]=[];
    for(const entry of entries){
      const headword=entry.headword.trim(),lemma=entry.lemma.trim();
      if(!headword||!lemma||headword.length>500||seen.has(clean(headword))||
         seen.has(clean(lemma)))continue;
      seen.add(clean(headword));seen.add(clean(lemma));
      next.push({
        id:freshId('voc'),lemma,headword,meaning:entry.meaning?.trim()||null,
        note:entry.note?.trim()||null,included:Boolean(entry.meaning?.trim()),order:order++,
        provenance:null,reviewState:'needs-review',origin:'generated',locked:false,
        glossesSeparated:entry.glossesSeparated===true,collatinusSource:true,
      });
    }
    if(!next.length)return true;
    apply((e,at)=>validateEdition({...e,updatedAt:at,
      placements:e.placements.map(x=>x.id!==placementId?x:{
        ...x,vocabulary:[...x.vocabulary,...next],
      })}));
    const ok=await flush();
    if(ok){
      // Collatinus se resuelve de forma asíncrona. Nunca reconstruir el menú
      // mientras el docente está escribiendo una entrada manual: se perdería
      // el texto de los inputs todavía sin guardar (regresión en WebKit).
      const focus=document.activeElement;
      const editingManual=focus instanceof HTMLElement&&
        focus.closest('.edition-vocab-add')!==null;
      if(editingManual)paintPreview();
      else paint();
      setMessage('Collatinus: '+next.length+
        ' nombres propios o gentilicios incorporados como propuestas revisables.');
    }
    return ok;
  }
  function prepareVocabulary(p:TextPlacementV1):void{
    if(!draft)return;
    try{
      if(autoApply){
        const n=applyVocabularyAutomatically(p);
        setMessage(n?'Añadidas '+n+' entradas editables. Formas ambiguas o desconocidas: revisión pendiente.':
          'No hay nuevas formas para añadir al vocabulario.');
        paint();
        return;
      }
      vocabularyBank??=createOfflineTeacherBankV1();
      const proposals=suggestVocabulary(p,vocabularyBank.bank);
      vocabPreview={placementId:p.id,baseline:JSON.stringify(draft),
        proposals,choices:proposals.map(item=>({
          surface:item.surface,selected:item.selected,
          headword:item.lemma??item.surface,meaning:'',
        }))};
      if(!proposals.length)setMessage('Todas las formas únicas ya tienen una entrada o no hay texto que analizar.');
      else setMessage('Propuestas preparadas: '+proposals.length+
        ' formas. Revisa los lemas y completa manualmente los significados antes de confirmar.');
      paint();
    }catch(e){setMessage('No se pudieron preparar las candidaturas: '+(e instanceof Error?e.message:String(e)),true);}
  }
  function renderVocabularySuggestions(panel:HTMLElement,p:TextPlacementV1):void{
    const view=vocabPreview;
    if(!view||view.placementId!==p.id)return;
    const section=node('section','edition-vocab-preview');
    section.setAttribute('aria-label','Propuestas de vocabulario');
    section.append(node('h3','','Candidaturas del texto'));
    section.append(node('p','hint',
      'La identificación de una forma no implica un significado certificado. Sin información documental se presenta la forma como provisional. Nada se añade hasta confirmar.'));
    for(const [index,item] of view.proposals.entries()){
      const decision=view.choices[index]!;
      const row=node('div','edition-vocab-candidate');
      const label=node('label','edition-option-head');
      const check=node('input');check.type='checkbox';check.checked=decision.selected;
      check.setAttribute('aria-label','Añadir '+item.surface);
      check.addEventListener('change',()=>{decision.selected=check.checked;});
      label.append(check,node('strong','',item.surface+' · '+item.occurrences+' aparición(es)'));
      row.append(label,node('p','hint',item.status==='lemma-documented'?
        'Lema documentado por forma individual: '+item.lemma+' (significado sin verificar)':
        item.status==='ambiguous'?'Forma con análisis ambiguos: decide el enunciado.':
        'Forma sin lema documentado en el banco disponible. El enunciado es provisional.'));
      const name=textField('Enunciado del vocabulario',decision.headword,value=>{decision.headword=value;});
      const meaning=textField('Significado (rellenar por el docente)',decision.meaning,value=>{decision.meaning=value;});
      row.append(name,meaning);
      section.append(row);
    }
    const controls=node('div','edition-inline-edit');
    controls.append(action('Cancelar propuestas',()=>{vocabPreview=null;paint();}));
    const accept=action('Añadir términos seleccionados',()=>{
      if(!draft||!vocabPreview)return;
      if(JSON.stringify(draft)!==vocabPreview.baseline){
        setMessage('El texto o vocabulario ha cambiado. Prepara las propuestas de nuevo.',true);return;
      }
      const snapshot=vocabPreview;
      apply((e,at)=>acceptVocabulary(e,p.id,snapshot.proposals,snapshot.choices,
        ()=>freshId('voc'),at));
      paint();
    },'btn btn-primary');
    accept.disabled=!view.proposals.length;
    controls.append(accept);section.append(controls);
    panel.append(section);
  }
  /** Reanalizar el texto completo con Collatinus sin destruir correcciones,
   * identificadores, orden ni selección individual del cuaderno.
   */
  async function refreshCollatinusVocabulary(p:TextPlacementV1):Promise<void>{
    if(!options.onAnalyzeVocabulary){
      prepareVocabulary(p);
      return;
    }
    if(!draft||!await flush())return;
    const source=draft.placements.find(x=>x.id===p.id);
    if(!source)return;
    const editionId=draft.id,latin=source.text.latin;
    const qty=source.vocabularyQuantityMode??'modelo';
    setMessage('Analizando vocabulario con Collatinus…');
    try{
      const entries=await options.onAnalyzeVocabulary(latin,qty);
      if(!Array.isArray(entries)||entries.length===0){
        throw new Error('Collatinus no ha proporcionado lemas para el texto; comprueba el análisis.');
      }
      if(!draft||draft.id!==editionId||
        draft.placements.find(x=>x.id===p.id)?.text.latin!==latin){
        setMessage('El texto ha cambiado durante el análisis. No se ha sobrescrito el vocabulario.',true);
        return;
      }
      let added=0,refreshed=0;
      // Validar antes de aplicar: una sola entrada inválida nunca debe
      // cancelar silenciosamente todo el vocabulario.
      const nextEdition=validateEdition({...draft,updatedAt:now(),
        placements:draft.placements.map(x=>{
          if(x.id!==p.id)return x;
          const old=[...x.vocabulary],seen=new Set<string>();
          let order=old.reduce((max,v)=>Math.max(max,v.order),-1)+1;
          const mode=x.vocabularySelectionMode??'elegir';
          for(const candidate of entries){
            const lemma=candidate.lemma.trim(),headword=candidate.headword.trim();
            const key=vocabularyKey(lemma);
            if(!key||!headword||seen.has(key))continue;
            seen.add(key);
            const i=old.findIndex(v=>vocabularyKey(v.lemma)===key||
              vocabularyKey(v.headword)===key);
            if(i>=0){
              const previous=old[i]!;
              if(previous.origin==='generated'&&!previous.locked){
                old[i]={...previous,lemma,headword,meaning:candidate.meaning?.trim()||null,
                  note:candidate.note?.trim()||null,glossesSeparated:candidate.glossesSeparated===true,
                  collatinusSource:true,included:mode==='todo'?true:previous.included};
                refreshed++;
              }else if(mode==='todo')old[i]={...previous,included:true};
              continue;
            }
            added++;
            old.push({id:freshId('voc'),lemma,headword,
              meaning:candidate.meaning?.trim()||null,note:candidate.note?.trim()||null,
              included:mode==='todo'||Boolean(candidate.proper&&candidate.meaning),
              order:order++,provenance:null,reviewState:'needs-review',
              origin:'generated',locked:false,
              glossesSeparated:candidate.glossesSeparated===true,collatinusSource:true});
          }
          return {...x,vocabulary:old};
        }),
      });
      apply((_edition,at)=>({...nextEdition,updatedAt:at}));
      const focus=document.activeElement;
      if(focus instanceof HTMLElement&&focus.closest('.edition-vocab-add'))paintPreview();
      else paint();
      setMessage('Collatinus: '+added+' entradas nuevas, '+refreshed+
        ' enunciados actualizados. Las correcciones manuales se conservan.');
    }catch(err){
      setMessage('No se pudo actualizar Collatinus: '+
        (err instanceof Error?err.message:String(err)),true);
    }
  }
  function menuVocabulary(panel:HTMLElement,p:TextPlacementV1):void {
    const selectionMode=p.vocabularySelectionMode??'elegir';
    const quantityMode=p.vocabularyQuantityMode??'modelo';
    const toolbar=node('div','edition-vocab-toolbar');
    const modes=node('div','edition-vocab-modes');
    modes.setAttribute('role','group');
    modes.setAttribute('aria-label','Selección de vocabulario');
    for(const [key,label] of [
      ['elegir','Elegir las palabras'],['todo','Todo el texto'],
    ] as const){
      const button=action(label,()=>{
        apply((edition,at)=>validateEdition({...edition,updatedAt:at,
          placements:edition.placements.map(x=>x.id!==p.id?x:{
            ...x,vocabularySelectionMode:key,
            vocabulary:x.vocabulary.map(v=>({...v,included:key==='todo'?true:
              v.origin==='manual'?v.included:false})),
          }),
        }));
        paint();
        if(key==='todo')void refreshCollatinusVocabulary(p);
      },'btn '+(selectionMode===key?'btn-primary':'btn-outline'));
      button.setAttribute('aria-pressed',String(selectionMode===key));
      modes.append(button);
    }
    toolbar.append(modes);
    const qtyLabel=node('label','edition-vocab-quantity');
    qtyLabel.append(node('span','','Cantidades'));
    const qty=node('select','field-control');
    qty.setAttribute('aria-label','Cantidades vocálicas');
    for(const [key,label] of [
      ['modelo','Vocales en sílaba abierta'],
      ['todas','Todas las vocales'],
      ['largas','Solo las largas'],
      ['ninguna','Sin cantidades'],
    ] as const){
      const option=node('option','',label);option.value=key;qty.append(option);
    }
    qty.value=quantityMode;
    qty.addEventListener('change',()=>{
      const mode=qty.value as VocabularyQuantityMode;
      apply((edition,at)=>validateEdition({...edition,updatedAt:at,
        placements:edition.placements.map(x=>x.id!==p.id?x:
          {...x,vocabularyQuantityMode:mode}),
      }));
      paint();
      void refreshCollatinusVocabulary(p);
    });
    qtyLabel.append(qty);toolbar.append(qtyLabel);
    panel.append(toolbar);
    const scan=action(options.onAnalyzeVocabulary
      ?'Buscar otras formas con Collatinus (actualizar)'
      :options.autoVocabulary===false?'Buscar otras formas (opcional)'
        :'Proponer vocabulario del texto',
      ()=>refreshCollatinusVocabulary(p),'btn btn-outline');
    panel.append(scan);
    if(!options.onAnalyzeVocabulary)renderVocabularySuggestions(panel,p);

    const items=[...p.vocabulary].sort((a,b)=>
      vocabularySortKey(a.headword).localeCompare(vocabularySortKey(b.headword),
        'es',{sensitivity:'base'}));
    const chosen=items.filter(v=>v.included).length;
    panel.append(node('p','hint',items.length
      ?chosen+' de '+items.length+' entradas seleccionadas. Solo se imprimen las marcadas.'
      :'No hay vocabulario todavía. Collatinus añade inicialmente los nombres propios; '
       +'elige «Todo el texto» para obtener los demás lemas.'));
    let preferred:ReturnType<typeof parsePreferredVocabulary>=[];
    try{preferred=parsePreferredVocabulary(localStorage.getItem(PREFERRED_VOCABULARY_KEY));}
    catch(err){panel.append(node('p','edition-error',
      'El vocabulario preferente guardado necesita revisión: '+String(err)));}
    if(items.length){
      const headers=node('div','edition-vocab-column-heads');
      for(const label of ['','Enunciado','Traducción','Aclaración','Guardar',''])
        headers.append(node('span','',label));
      panel.append(headers);
      const list=node('div','edition-vocab-list');
      list.setAttribute('aria-label','Entradas de vocabulario editables');
      for(const v of items){
        const row=node('div','edition-vocab-row'+(v.included?'':' off'));
        row.dataset.vocabularyId=v.id;
        const check=node('input');
        check.type='checkbox';check.className='edition-vocab-include';
        check.checked=v.included;check.setAttribute('aria-label','Incluir '+v.headword);
        check.title='Incluir en el cuaderno';
        check.addEventListener('change',()=>{
          apply((e,at)=>editVocabulary(e,p.id,v.id,'included',check.checked,at));
          row.classList.toggle('off',!check.checked);
        });
        row.append(check);
        const saved=preferredFor(preferred,v.lemma);
        const isSaved=Boolean(saved&&saved.headword===v.headword&&
          saved.meaning===(v.meaning??'')&&saved.note===(v.note??'')&&
          saved.glossesSeparated===Boolean(v.glossesSeparated));
        let saveButton:HTMLButtonElement|null=null;
        const changed=()=>{
          if(saveButton){saveButton.textContent='Guardar';
            saveButton.classList.remove('is-saved');}
        };
        for(const [key,label,css] of [
          ['headword','Enunciado','edition-vocab-headword'],
          ['meaning','Traducción','edition-vocab-meaning'],
          ['note','Aclaración','edition-vocab-note'],
        ] as const){
          const input=node('input','field-control '+css);
          input.type='text';input.value=key==='headword'?v.headword:
            key==='meaning'?v.meaning??'':v.note??'';
          input.placeholder=label;
          input.setAttribute('aria-label',label+' de '+v.headword);
          input.addEventListener('input',()=>{
            if(key==='headword'&&!input.value.trim())return;
            apply((e,at)=>editVocabulary(e,p.id,v.id,key,
              input.value.trim()||(key==='headword'?'':null),at));
            changed();
          });
          input.addEventListener('blur',()=>{
            if(key==='headword'&&!input.value.trim()){
              input.value=draft?.placements.find(x=>x.id===p.id)?.vocabulary
                .find(x=>x.id===v.id)?.headword??v.headword;
            }
          });
          row.append(input);
        }
        saveButton=action(isSaved?'✓ Guardada':'Guardar',async()=>{
          if(!await flush())return;
          const current=draft?.placements.find(x=>x.id===p.id)
            ?.vocabulary.find(x=>x.id===v.id);
          if(!current)return;
          if(!current.headword.trim()||!current.meaning?.trim()){
            setMessage('Escribe un enunciado y una traducción antes de guardar.',true);
            return;
          }
          try{
            const old=parsePreferredVocabulary(localStorage.getItem(PREFERRED_VOCABULARY_KEY));
            const next=putPreferredVocabulary(old,{
              lemma:current.lemma,headword:current.headword,meaning:current.meaning,
              note:current.note??'',glossesSeparated:current.glossesSeparated===true,
            });
            localStorage.setItem(PREFERRED_VOCABULARY_KEY,JSON.stringify(next));
            saveButton!.textContent='✓ Guardada';
            saveButton!.classList.add('is-saved');
            setMessage('Corrección guardada para futuros cuadernos en este dispositivo.');
          }catch(err){setMessage('No se pudo guardar el vocabulario preferente: '+String(err),true);}
        },'btn btn-outline edition-vocab-save'+(isSaved?' is-saved':''));
        saveButton.setAttribute('aria-label','Guardar corrección de '+v.headword);
        row.append(saveButton);
        const remove=action('×',()=>{
          if(!window.confirm('¿Quitar esta entrada? No se modificará el texto latino.'))return;
          apply((e,at)=>validateEdition({...e,updatedAt:at,
            placements:e.placements.map(x=>x.id!==p.id?x:
              {...x,vocabulary:x.vocabulary.filter(w=>w.id!==v.id)}),
          }));
          paint();
        },'btn btn-outline edition-vocab-remove');
        remove.setAttribute('aria-label','Quitar '+v.headword);
        row.append(remove);
        if(v.origin==='manual'||v.glossesSeparated){
          const split=node('label','edition-vocab-split');
          const toggle=node('input');toggle.type='checkbox';toggle.checked=v.glossesSeparated===true;
          toggle.setAttribute('aria-label','Glosas separadas de '+v.headword);
          toggle.addEventListener('change',()=>{
            apply((e,at)=>editVocabulary(e,p.id,v.id,'glossesSeparated',toggle.checked,at));
            changed();
          });
          split.append(toggle,node('span','','Glosas separadas (ejemplo: grande | camino)'));
          row.append(split);
        }
        if(options.onAnalyzeVocabulary&&(v.collatinusSource||v.origin==='generated')){
          remove.remove();
          const reset=action('↺',async()=>{
            try{
              const latest=draft?.placements.find(x=>x.id===p.id);
              if(!latest)return;
              const candidates=await options.onAnalyzeVocabulary!(
                latest.text.latin,latest.vocabularyQuantityMode??'modelo');
              const candidate=candidates.find(x=>vocabularyKey(x.lemma)===vocabularyKey(v.lemma));
              if(!candidate){setMessage('Collatinus no encuentra este lema.',true);return;}
              apply((e,at)=>validateEdition({...e,updatedAt:at,
                placements:e.placements.map(x=>x.id!==p.id?x:{
                  ...x,vocabulary:x.vocabulary.map(w=>w.id!==v.id?w:{
                    ...w,lemma:candidate.lemma,headword:candidate.headword,
                    meaning:candidate.meaning,note:candidate.note,
                    glossesSeparated:candidate.glossesSeparated===true,
                    collatinusSource:true,origin:'generated',locked:false,
                    reviewState:'needs-review',
                  }),
                }),
              }));
              paint();
            }catch(err){setMessage('No se pudo restablecer: '+String(err),true);}
          },'btn btn-outline edition-vocab-reset');
          reset.title='Restablecer la entrada de Collatinus';
          reset.setAttribute('aria-label','Restablecer '+v.headword);
          row.append(reset);
        }
        list.append(row);
      }
      panel.append(list);
    }
    const actions=node('div','edition-vocab-bulk');
    actions.append(action('Marcar todas',()=>{
      apply((e,at)=>validateEdition({...e,updatedAt:at,
        placements:e.placements.map(x=>x.id!==p.id?x:{
          ...x,vocabularySelectionMode:'todo' as VocabularySelectionMode,
          vocabulary:x.vocabulary.map(v=>({...v,included:true})),
        }),
      }));paint();
    }),action('Desmarcar todas',()=>{
      apply((e,at)=>validateEdition({...e,updatedAt:at,
        placements:e.placements.map(x=>x.id!==p.id?x:{
          ...x,vocabularySelectionMode:'elegir' as VocabularySelectionMode,
          vocabulary:x.vocabulary.map(v=>({...v,included:false})),
        }),
      }));paint();
    }));
    panel.append(actions);
    const unreviewed=items.filter(isUnreviewedAutoVocabulary);
    if(unreviewed.length){
      panel.append(action('Retirar '+unreviewed.length+' propuestas automáticas sin glosa',()=>{
        if(!window.confirm('¿Retirar únicamente las propuestas automáticas sin glosa ni edición manual?'))return;
        apply((e,at)=>validateEdition({...e,updatedAt:at,
          placements:e.placements.map(x=>x.id!==p.id?x:{
            ...x,vocabulary:x.vocabulary.filter(v=>!isUnreviewedAutoVocabulary(v)),
          }),
        }));paint();
      },'btn btn-outline edition-vocab-cleanup'));
    }
    const headword=node('input','field-control');headword.placeholder='Enunciado o lema';
    headword.setAttribute('aria-label','Enunciado nuevo');
    const meaning=node('input','field-control');meaning.placeholder='Significado';
    meaning.setAttribute('aria-label','Traducción nueva');
    const add=action('Añadir entrada',()=>{
      const lemma=headword.value.trim();if(!lemma)return;
      const manualMeaning=meaning.value.trim()||null;
      apply((e,at)=>{
        const latest=e.placements.find(item=>item.id===p.id);
        if(!latest)throw new Error('El texto ya no existe en el cuaderno.');
        const order=latest.vocabulary.reduce((m,v)=>Math.max(m,v.order),-1)+1;
        const entry:VocabularyEntryV1={id:freshId('voc'),lemma,headword:lemma,
          meaning:manualMeaning,note:null,included:true,order,
          provenance:null,reviewState:'manual',origin:'manual',locked:true};
        return insertManualVocabulary(e,p.id,entry,at);
      });paint();
    },'btn btn-primary');
    const row=node('div','edition-vocab-add');row.append(headword,meaning,add);
    panel.append(row);
  }
  function menuFormat(panel:HTMLElement):void {
    if(!draft)return;
    const f=draft.format;
    const update=(fn:(d:NotebookEditionV1)=>void)=>apply((e,at)=>{
      const next=structuredClone(e);fn(next);next.updatedAt=at;return validateEdition(next);
    });
    panel.append(numberField('Tamaño del texto (pt)',f.fontSizePt,6,32,.5,n=>{
      update(x=>{
        const extra=extraLatinSpacingPt(x.format.fontSizePt,x.format.lineSpacingPt);
        x.format.fontSizePt=n;
        x.format.lineSpacingPt=exactLatinLineHeightPt(n,extra);
      });paint();
    }),numberField('Espacio adicional entre líneas (pt)',extraLatinSpacingPt(f.fontSizePt,f.lineSpacingPt),0,45,.5,n=>{
      update(x=>{x.format.lineSpacingPt=exactLatinLineHeightPt(x.format.fontSizePt,n);});paint();
    }),numberField('Separación entre preguntas (pt)',f.questionGapPt,0,72,1,n=>{
      update(x=>{x.format.questionGapPt=n;});paint();
    }));
    const family=node('select','field-control');family.setAttribute('aria-label','Tipografía');
    for(const value of ['Palatino Linotype','Palatino','Georgia','Times New Roman']){
      const option=node('option','',value);option.value=value;family.append(option);
    }
    family.value=f.fontFamily;family.addEventListener('change',()=>{
      update(x=>{x.format.fontFamily=family.value;});paint();
    });
    panel.append(family);
    const margins=node('div','edition-margin-grid');
    for(const [key,label] of [['top','Superior'],['right','Derecho'],['bottom','Inferior'],['left','Izquierdo']] as const){
      margins.append(numberField('Margen '+label+' (cm)',Number((f.marginsPt[key]/28.3464567).toFixed(2)),0,5,.1,n=>{
        update(x=>{x.format.marginsPt[key]=Number((n*28.3464567).toFixed(2));});paint();
      }));
    }
    panel.append(margins);
    const points=node('label','edition-option-head');
    const check=node('input');check.type='checkbox';check.checked=f.showPoints;
    check.addEventListener('change',()=>{update(x=>{x.format.showPoints=check.checked;});paint();});
    points.append(check,node('span','','Mostrar puntuación de las preguntas'));panel.append(points);
    panel.append(node('p','hint','El interlineado se expresa como espacio adicional al interlineado normal, al estilo de Word: 3 pt suele ser suficiente. Los cuadernos anteriores conservan su altura de línea hasta que se ajuste este valor. Formato común a todos los textos; el zoom de lectura no cambia el tamaño editorial.'));
  }
  function menuNotebook(panel:HTMLElement):void {
    if(!draft)return;
    const e=draft;
    panel.append(legacyNotebookPicker());
    panel.append(textField('Título del cuaderno',e.title,value=>{
      apply((edition,at)=>validateEdition({...edition,title:value,updatedAt:at}));
    }));
    const list=node('ol','edition-notebook-list');
    e.placements.forEach((p,index)=>{
      const li=node('li','edition-notebook-row');
      li.append(node('span','',p.text.title+' · '+formatPoints(p)));
      const prev=action('↑',()=>{apply((ed,at)=>movePlacement(ed,p.id,index-1,at));paint();});
      prev.disabled=index===0;
      const next=action('↓',()=>{apply((ed,at)=>movePlacement(ed,p.id,index+1,at));paint();});
      next.disabled=index===e.placements.length-1;
      const remove=action('Quitar',()=>{
        if(!window.confirm('¿Quitar esta aparición del cuaderno? El texto original permanecerá en la biblioteca.'))return;
        apply((ed,at)=>validateEdition({...ed,updatedAt:at,placements:ed.placements.filter(x=>x.id!==p.id)}));
        if(session?.activePlacementId===p.id&&draft)session={...session,activePlacementId:draft.placements[0]?.id??null};
        paint();
      });
      li.append(prev,next,remove);list.append(li);
    });
    panel.append(list);
    const picker=node('select','field-control');picker.setAttribute('aria-label','Texto guardado para añadir');
    const add=action('Añadir desde Mis textos',async()=>{
      if(!picker.value||!await flush()||!current||!draft)return;
      try{
        const corpus=(await legacy.load()).corpus;
        const found=corpus.texts.find(t=>t.id===picker.value);
        if(!found)throw new Error('Texto no encontrado en la biblioteca local');
        const at=now(),placement=placementFromCorpus(found,freshId('place'),at,()=>freshId('item'));
        apply((ed,t)=>validateEdition({...ed,updatedAt:t,placements:[...ed.placements,placement]}));
        if(session)session={...session,activePlacementId:placement.id,mode:'text'};
        paint();
      }catch(err){setMessage('No se ha añadido: '+(err instanceof Error?err.message:String(err)),true);}
    },'btn btn-primary');
    const row=node('div','edition-inline-edit');row.append(picker,add);panel.append(row);
    void legacy.load().then(s=>{
      if(!picker.isConnected)return;
      picker.replaceChildren();
      for(const text of s.corpus.texts){const op=node('option','',text.title);op.value=text.id;picker.append(op);}
      add.disabled=!s.corpus.texts.length;
      if(!s.corpus.texts.length)picker.append(node('option','','Guarda primero textos en «Mis textos»'));
    }).catch(e=>setMessage('No se pudo leer Mis textos: '+String(e),true));
    panel.append(node('p','hint','Una misma fuente puede tener varias apariciones independientes. Reordenar no regenera preguntas ni vocabulario.'));
  }
  function docFilename(edition:NotebookEditionV1,draftExport:boolean):string{
    const safe=edition.title.normalize('NFC').replace(/[\\/:*?"<>|]+/g,'-')
      .replace(/\s+/g,' ').trim().slice(0,85)||'cuaderno';
    return 'cuaderno-'+safe+(draftExport?'-borrador':'')+'.docx';
  }
  function exportBytes(bytes:Uint8Array,filename:string):void{
    // Un ArrayBuffer propio mantiene compatibilidad con BlobPart en TS y Safari.
    const buffer=new ArrayBuffer(bytes.length);
    new Uint8Array(buffer).set(bytes);
    const url=URL.createObjectURL(new Blob([buffer],{
      type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));
    const link=node('a');link.href=url;link.download=filename;
    document.body.append(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function openPrint(edition:NotebookEditionV1):void{
    document.querySelector('.edition-print-root')?.remove();
    const target=renderNotebookPrintPages(edition);
    document.body.append(target);
    const cleanup=()=>{target.remove();window.removeEventListener('afterprint',cleanup);};
    window.addEventListener('afterprint',cleanup,{once:true});
    // Impresión nativa: en iPad Safari el usuario elige «Guardar como PDF».
    window.print();
  }
  async function exportNotebook(kind:'word'|'pdf',approved=false):Promise<void>{
    if(!await flush()||!current)return;
    try{
      const edition=current.edition;
      if(!edition.placements.length)throw new Error('Añade un texto antes de exportar.');
      const warnings=notebookExportWarnings(edition);
      if(warnings.length && (!approved||exportReview?.kind!==kind||
          exportReview.baseline!==JSON.stringify(edition))){
        exportReview={kind,warnings,baseline:JSON.stringify(edition)};
        paint();return;
      }
      exportReview=null;
      paint(); // El aviso no debe permanecer abierto tras exportar.
      if(kind==='word'){
        exportBytes(createNotebookDocx(edition),docFilename(edition,warnings.length>0));
        setMessage('DOCX '+(warnings.length?'de borrador ':'')+'preparado. Comprueba su maquetación antes de imprimirlo.');
      }else{
        setMessage('Abriendo impresión A4. Atención: Safari puede omitir 1 | N; para conservarlo, exporta Word y genera el PDF con Pages.');
        openPrint(edition);
      }
    }catch(e){setMessage('No se pudo exportar: '+(e instanceof Error?e.message:String(e)),true);}
  }
  function renderExportReview():HTMLElement|null{
    if(!exportReview)return null;
    const review=node('section','edition-export-review');
    review.setAttribute('aria-label','Revisión previa a exportar');
    review.append(node('h3','','Cuaderno pendiente de revisión'));
    review.append(node('p','hint',
      'La edición todavía contiene observaciones. Si exportas, el documento se identificará como borrador; no se alterará ningún dato.'));
    if(exportReview.kind==='pdf')review.append(node('p','hint',
      'Safari no admite la caja marginal CSS de numeración física. Su PDF puede carecer de 1 | N. Para conservar los números abre el DOCX en Pages y exporta desde allí.'));
    const items=node('ul','edition-academic-diff');
    for(const warning of exportReview.warnings.slice(0,50))items.append(node('li','',warning));
    if(exportReview.warnings.length>50)items.append(node('li','','Hay más observaciones; revisa los textos restantes.'));
    review.append(items);
    const row=node('div','edition-inline-edit');
    row.append(action(exportReview.kind==='word'?'Exportar borrador Word':'Imprimir borrador / Guardar PDF',
      ()=>exportNotebook(exportReview!.kind,true),'btn btn-primary'));
    row.append(action('Cancelar',()=>{exportReview=null;paint();}));
    review.append(row);return review;
  }
  function paint():void {
    element.replaceChildren();
    const header=node('div','edition-toolbar');
    const title=node('h2','','Editor de cuadernos');
    const status=node('span','edition-save-state',message);status.dataset.error=String(error);
    header.append(title,status);
    const tools=node('div','edition-toolbar-actions');
    const choose=node('select','field-control');choose.setAttribute('aria-label','Elegir cuaderno editorial');
    for(const e of editions){const o=node('option','',e.edition.title);o.value=e.edition.id;choose.append(o);}
    if(active)choose.value=active;
    choose.disabled=!editions.length;
    choose.addEventListener('change',()=>{void changeEdition(choose.value);});
    tools.append(choose,action('+ Cuaderno',createNotebook,'btn btn-primary'),
      action('Guardar',async()=>{await flush();}),
      action('Deshacer',undo),action('Copia JSON',backup),
      action('Exportar Word',()=>exportNotebook('word')),
      action('PDF / Imprimir',()=>exportNotebook('pdf')));
    header.append(tools);element.append(header);
    if(!draft||!session){
      const empty=node('div','edition-empty');
      empty.append(node('h3','','Comienza un cuaderno editorial'),
        node('p','','La biblioteca y tus cuadernos anteriores se conservan. Puedes migrarlos de forma explícita con una copia verificada o crear un cuaderno nuevo.'));
      const migration=action('Preparar migración de cuadernos antiguos',prepareMigration,'btn btn-outline');
      empty.append(legacyNotebookPicker());
      empty.append(node('p','hint','Importación completa de la biblioteca anterior (avanzado):'));
      empty.append(migration);
      if(pendingMigration){
        empty.append(node('p','hint',
          'Copia preparada: '+pendingMigration.notebookCount+' cuadernos, '+pendingMigration.textCount+
          ' textos y '+pendingMigration.placementCount+' apariciones.'));
        const label=node('label','edition-option-head');
        const input=node('input');input.type='checkbox';input.checked=migrationConfirmed;
        input.addEventListener('change',()=>{migrationConfirmed=input.checked;paint();});
        label.append(input,node('span','','He conservado la copia JSON v1 y autorizo crear el espacio editorial sin alterar los datos antiguos.'));
        empty.append(label);
        const go=action('Importar a espacio editorial',migrate,'btn btn-primary');
        go.disabled=!migrationConfirmed;empty.append(go);
      }
      element.append(empty);return;
    }
    const n=draft.placements.length;
    const idx=draft.placements.findIndex(p=>p.id===session?.activePlacementId);
    const nav=node('div','edition-navigation');
    const previous=action('Anterior',()=>navigate('previous'));
    previous.disabled=n===0||idx<=0;
    const next=action('Siguiente',()=>navigate('next'));
    next.disabled=n===0||idx>=n-1;
    nav.append(previous,node('strong','edition-counter',n?'Texto '+(idx+1)+' de '+n:'Sin textos'),next);
    const selector=node('select','field-control');selector.setAttribute('aria-label','Ir a texto del cuaderno');
    for(const p of draft.placements){
      const opt=node('option','',p.text.title);opt.value=p.id;selector.append(opt);
    }
    selector.value=selection()?.id??'';selector.disabled=!n;
    selector.addEventListener('change',()=>{void navigate({placementId:selector.value});});
    nav.append(selector);
    const whole=action(session.mode==='whole-notebook'?'Ver texto seleccionado':'Ver cuaderno completo',
      ()=>navigate(session?.mode==='whole-notebook'?{placementId:selection()?.id??draft!.placements[0]?.id??''}:'whole'));
    whole.disabled=!n;
    nav.append(whole);
    nav.setAttribute('aria-label','Navegación de textos encima de la vista previa');
    const review=academics.review();
    if(review)element.append(review);
    const exportNotice=renderExportReview();
    if(exportNotice)element.append(exportNotice);
    const mobileSwitch=node('div','edition-mobile-switch');
    for(const [key,label] of [['config','Configurar'],['preview','Vista previa']] as const){
      const b=action(label,()=>{mobile=key;paint();},
        'btn '+(mobile===key?'btn-primary':'btn-outline'));
      mobileSwitch.append(b);
    }
    element.append(mobileSwitch);
    const layout=node('div','edition-layout');
    const editor=node('aside','edition-settings'+(mobile==='preview'?' edition-mobile-hidden':''));
    const navMenus=node('div','edition-menu-nav');
    navMenus.setAttribute('role','navigation');
    navMenus.setAttribute('aria-label','Secciones del cuaderno');
    for(const m of labels){
      const tab=action(m.label,()=>{menu=m.key;paint();},
        'btn '+(menu===m.key?'btn-primary':'btn-outline'));
      tab.setAttribute('aria-current',String(menu===m.key?'page':'false'));
      navMenus.append(tab);
    }
    editor.append(navMenus);
    const panel=node('div','edition-menu-content edition-menu-'+menu);
    const placement=selection();
    if(menu==='notebook')menuNotebook(panel);
    else if(menu==='format')menuFormat(panel);
    else if(placement && menu==='text')menuText(panel,placement);
    else if(placement && menu==='questions')menuQuestions(panel,placement);
    else if(placement && menu==='vocabulary')menuVocabulary(panel,placement);
    else panel.append(node('p','hint','Añade un texto desde el menú «Cuaderno» para comenzar.'));
    editor.append(panel);
    // La barra pertenece a la columna de la hoja, pero permanece visible
    // cuando la vista previa está temporalmente oculta en iPad vertical.
    const previewStack=node('div','edition-preview-stack');
    previewStack.append(nav);
    const preview=node('section','edition-preview'+(mobile==='config'?' edition-mobile-hidden':''));
    const papers=node('div','edition-paper-pages');
    papers.addEventListener('pointerup',()=>academics.savePaperSelection(papers));
    papers.addEventListener('touchend',()=>window.setTimeout(()=>academics.savePaperSelection(papers),80),{passive:true});
    const bar=node('div','edition-preview-bar');
    bar.append(node('strong','','Vista A4'));
    if(options.onAddSource)bar.append(action('+ Añadir al cuaderno',
      options.onAddSource,'btn btn-primary edition-add-source'));
    const zoomControls=node('div','edition-zoom-controls');
    const zoomField=numberField('Zoom (%)',zoom,50,130,5,value=>{
      zoom=value;syncZoomButtons();paintPreview();
    });
    const zoomInput=zoomField.querySelector('input');
    const zoomIn=action('+',()=>setZoom(zoom+5),'btn btn-outline edition-zoom-step');
    const zoomOut=action('−',()=>setZoom(zoom-5),'btn btn-outline edition-zoom-step');
    zoomIn.setAttribute('aria-label','Aumentar zoom');
    zoomOut.setAttribute('aria-label','Reducir zoom');
    function syncZoomButtons():void {
      zoomIn.disabled=zoom>=130;zoomOut.disabled=zoom<=50;
      if(zoomInput)zoomInput.value=String(zoom);
    }
    function setZoom(value:number):void {
      zoom=Math.max(50,Math.min(130,value));syncZoomButtons();paintPreview();
    }
    syncZoomButtons();
    zoomControls.append(zoomIn,zoomField,zoomOut);
    bar.append(zoomControls);
    bar.append(academics.renderPaperSelect(papers));
    // Los controles Anterior / Siguiente van justo encima del papel; no se
    // reproducen en la cabecera ni alteran el modelo al cambiar de posición.
    preview.append(bar,papers);
    preview.append(node('p','edition-preview-note','Vista en pantalla · sin exportación todavía.'));
    previewStack.append(preview);
    layout.append(editor,previewStack);element.append(layout);
    paintPreview();
  }
  return {element,open:()=>refresh(),flush,importLegacyNotebook,
    openSourceText,prepareFromIds,openEdition,syncSourceTags,removeWorkingSource,
    createNotebookNamed,addSourceToNotebook,importTeacherDocument,selectPlacement,
    addCollatinusVocabulary,
    activePlacement:()=>selection()?structuredClone(selection()!):null,
    activeEdition:()=>draft?structuredClone(draft):null,
    setActiveTags,addGrammarSpan,removeGrammarSpan,renameActiveNotebook,closeEdition};
}

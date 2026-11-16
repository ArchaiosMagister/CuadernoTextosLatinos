/**
 * Primera interfaz de composición editorial.
 * Usa exclusivamente NotebookEditionV1 y WorkspaceRepository: la hoja es una proyección,
 * no una segunda fuente de datos. El legado de fase 2 permanece intacto.
 */
import type { NotebookEditionV1, TextPlacementV1, VocabularyEntryV1 } from '../core/edition-model.js';
import { createEdition, placementFromCorpus } from '../core/edition-factory.js';
import { choiceHeading, editOptionStatement, editPlacementText, editQuestionStatement,
  editSlotManual, editVocabulary, insertManualVocabulary, movePlacement, moveSession,
  scorePlacement, setQuestionPoints, toggleOption, toggleQuestion,
} from '../core/edition-operations.js';
import { validateEdition } from '../core/edition-validation.js';
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
  paper.style.fontSize=f.fontSizePt+'pt';paper.style.lineHeight=f.lineSpacingPt+'pt';
  paper.style.padding=[f.marginsPt.top,f.marginsPt.right,f.marginsPt.bottom,f.marginsPt.left].map(x=>x+'pt').join(' ');
  const head=node('header','edition-paper-head');
  head.append(node('h2','edition-paper-title',p.text.title));
  const source=node('p','edition-paper-source');
  if(p.text.author)source.append(document.createTextNode(p.text.author));
  if(p.text.work){source.append(document.createTextNode(p.text.author?', ':''));source.append(node('em','',p.text.work));}
  if(p.text.reference)source.append(document.createTextNode(' '+p.text.reference));
  head.append(source);paper.append(head,buildMarkedLatin(p));
  const included=p.vocabulary.filter(v=>v.included).sort((a,b)=>a.order-b.order||a.headword.localeCompare(b.headword,'es'));
  if(included.length){
    const box=node('section','edition-vocabulary');
    box.append(node('h3','','Vocabulario'));
    for(const v of included){
      const item=node('p','edition-vocabulary-line');
      item.append(node('em','',v.headword));
      item.append(document.createTextNode(v.meaning?': '+v.meaning:': [significado pendiente]'));
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
        if(option.slots.length){
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

/** Mantiene el panel y el borrador vivos aunque el usuario cambie a Biblioteca. */
export function createEditionPane():{element:HTMLElement;open:()=>Promise<void>;flush:()=>Promise<boolean>} {
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
  });
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
    for(const q of p.questions){
      const section=node('section','edition-question-panel');
      const top=node('div','edition-question-top');
      const check=node('input');check.type='checkbox';check.checked=q.enabled;
      check.setAttribute('aria-label','Incluir pregunta '+q.kind);
      check.addEventListener('change',()=>{
        apply((e,at)=>toggleQuestion(e,p.id,q.id,check.checked,at));paint();
      });
      top.append(check,node('h3','',({
        translation:'1. Traducción',syntax:'2. Sintaxis',
        morphology:'3. Morfología',choice:'4. Elección',
      } as Record<string,string>)[q.kind]??q.kind));
      section.append(top);
      section.append(textField('Enunciado',q.statement.value,value=>{
        apply((e,at)=>editQuestionStatement(e,p.id,q.id,value,at));
      }));
      section.append(numberField('Puntos',q.pointsHundredths/100,0,100,.25,value=>{
        apply((e,at)=>setQuestionPoints(e,p.id,q.id,Math.round(value*100),at));paint();
      }));
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
  function prepareVocabulary(p:TextPlacementV1):void{
    if(!draft)return;
    try{
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
  function menuVocabulary(panel:HTMLElement,p:TextPlacementV1):void {
    panel.append(action('Proponer vocabulario del texto',()=>prepareVocabulary(p),'btn btn-primary'));
    renderVocabularySuggestions(panel,p);
    const items=[...p.vocabulary].sort((a,b)=>a.order-b.order);
    for(const v of items){
      const group=node('div','edition-vocabulary-control');
      const check=node('input');check.type='checkbox';check.checked=v.included;
      check.setAttribute('aria-label','Incluir '+v.headword);
      check.addEventListener('change',()=>{apply((e,at)=>editVocabulary(e,p.id,v.id,'included',check.checked,at));paint();});
      group.append(check);
      for(const [key,label] of [['headword','Enunciado'],['meaning','Significado'],['note','Nota']] as const){
        group.append(textField(label,key==='headword'?v.headword:key==='meaning'?v.meaning??'':v.note??'',value=>{
          apply((e,at)=>editVocabulary(e,p.id,v.id,key,value.trim()||(key==='headword'?'':null),at));
        }));
      }
      group.append(action('Quitar',()=>{
        apply((e,at)=>validateEdition({...e,updatedAt:at,
          placements:e.placements.map(x=>x.id!==p.id?x:{...x,vocabulary:x.vocabulary.filter(w=>w.id!==v.id)})}));
        paint();
      }));
      panel.append(group);
    }
    if(!items.length)panel.append(node('p','hint','Sin vocabulario. Las entradas nuevas se identificarán como decisiones manuales; no se inventan significados.'));
    const headword=node('input','field-control');headword.placeholder='Enunciado o lema';
    const meaning=node('input','field-control');meaning.placeholder='Significado';
    const add=action('Añadir entrada',()=>{
      const lemma=headword.value.trim();
      if(!lemma)return;
      const entry:VocabularyEntryV1={id:freshId('voc'),lemma,headword:lemma,
        meaning:meaning.value.trim()||null,note:null,included:true,
        order:p.vocabulary.reduce((m,v)=>Math.max(m,v.order),-1)+1,
        provenance:null,reviewState:'manual',origin:'manual',locked:true};
      apply((e,at)=>insertManualVocabulary(e,p.id,entry,at));paint();
    },'btn btn-primary');
    const row=node('div','edition-vocab-add');row.append(headword,meaning,add);panel.append(row);
  }
  function menuFormat(panel:HTMLElement):void {
    if(!draft)return;
    const f=draft.format;
    const update=(fn:(d:NotebookEditionV1)=>void)=>apply((e,at)=>{
      const next=structuredClone(e);fn(next);next.updatedAt=at;return validateEdition(next);
    });
    panel.append(numberField('Tamaño del texto (pt)',f.fontSizePt,6,32,.5,n=>{
      update(x=>{x.format.fontSizePt=n;});paint();
    }),numberField('Interlineado (pt)',f.lineSpacingPt,6,80,.5,n=>{
      update(x=>{x.format.lineSpacingPt=n;});paint();
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
    panel.append(node('p','hint','Formato común a todos los textos. El zoom de lectura no cambia el tamaño editorial.'));
  }
  function menuNotebook(panel:HTMLElement):void {
    if(!draft)return;
    const e=draft;
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
    nav.append(whole);element.append(nav);
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
    for(const m of labels){
      navMenus.append(action(m.label,()=>{menu=m.key;paint();},
        'btn '+(menu===m.key?'btn-primary':'btn-outline')));
    }
    editor.append(navMenus);
    const panel=node('div','edition-menu-content');
    const placement=selection();
    if(menu==='notebook')menuNotebook(panel);
    else if(menu==='format')menuFormat(panel);
    else if(placement && menu==='text')menuText(panel,placement);
    else if(placement && menu==='questions')menuQuestions(panel,placement);
    else if(placement && menu==='vocabulary')menuVocabulary(panel,placement);
    else panel.append(node('p','hint','Añade un texto desde el menú «Cuaderno» para comenzar.'));
    editor.append(panel);
    const preview=node('section','edition-preview'+(mobile==='config'?' edition-mobile-hidden':''));
    const papers=node('div','edition-paper-pages');
    papers.addEventListener('pointerup',()=>academics.savePaperSelection(papers));
    papers.addEventListener('touchend',()=>window.setTimeout(()=>academics.savePaperSelection(papers),80),{passive:true});
    const bar=node('div','edition-preview-bar');
    bar.append(node('strong','','Vista A4'));
    bar.append(numberField('Zoom (%)',zoom,50,130,5,value=>{zoom=value;paintPreview();}));
    bar.append(academics.renderPaperSelect(papers));
    preview.append(bar,papers);
    preview.append(node('p','edition-preview-note','Vista en pantalla · sin exportación todavía.'));
    layout.append(editor,preview);element.append(layout);
    paintPreview();
  }
  return {element,open:()=>refresh(),flush};
}

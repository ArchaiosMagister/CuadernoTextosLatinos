/** Puente de controles docentes con el motor académico del repositorio.
 * Solo propone candidatos elegibles y los confirma mediante CAS e historial.
 * Ningún cambio de menú, zoom o cantidad regenera términos automáticamente.
 */
import type {
  ChoiceOptionV1, NotebookEditionV1, QuestionV1, TextPlacementV1,
} from '../core/edition-model.js';
import {
  AcademicQuestionEngineV1, type AcademicPlanV1, type AcademicSlotTargetV1,
  type AcademicMorphTargetV1,
} from '../core/academic-engine.js';
import {
  AcademicMorphTokenSelectorV1, type MorphTokenTargetV1,
} from '../core/academic-morph-selection.js';
import { createOfflineTeacherBankV1, academicTeacherSnapshotV1 } from '../core/academic-teacher-bank.js';
import { teacherPreverbBases, teacherAuditRecord } from '../core/academic-teacher-adapter.js';
import { choosePreverbBases,preverbBaseKeyForForm,preverbStatement,type PreverbSelection } from '../core/preverb-selection.js';
import {validateEdition} from '../core/edition-validation.js';
import type { AcademicSlotKindV1 } from '../core/academic-bank.js';
import type { EditionSnapshotV1 } from '../storage/workspace-repository.js';
import { WorkspaceRepository } from '../storage/workspace-repository.js';

type Choice = Extract<QuestionV1,{kind:'choice'}>;
type Morph = Extract<QuestionV1,{kind:'morphology'}>;
type RangeTarget = {placementId:string;start:number;end:number};
type Candidate = {id:string;value:string;detail:string};
type CandidatePending = {
  type:'candidate';kind:'token'|'morph'|'slot';label:string;
  revision:number;baseline:string;target:MorphTokenTargetV1|AcademicMorphTargetV1|AcademicSlotTargetV1;
  candidates:Candidate[];chosen:string;locked:boolean;replaceLocked:boolean;
};
type PlanPending = {
  type:'plan';label:string;plan:AcademicPlanV1;details:string[];
};
type Pending = CandidatePending|PlanPending;
type Bindings = {
  snapshot:()=>EditionSnapshotV1|null;
  flush:()=>Promise<boolean>;
  saved:(next:EditionSnapshotV1)=>void;
  status:(message:string,error?:boolean)=>void;
  repaint:()=>void;
};
const defaults:Record<AcademicSlotKindV1,number>={preverb:5,phonetics:4,prefix:4,latinism:4};
function el<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text=''):HTMLElementTagNameMap[K]{
  const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;
}
function button(label:string,act:()=>void|Promise<void>):HTMLButtonElement{
  const b=el('button','btn btn-outline',label);b.type='button';b.addEventListener('click',()=>{void act();});return b;
}
function summary(error:unknown):string{return error instanceof Error?error.message:String(error);}
function randomSeed():number{return crypto.getRandomValues(new Uint32Array(1))[0]??0;}
function safeToken(value:string,start:number,end:number):boolean {
  return start>=0 && end>start && end<=value.length
    && /^[\p{L}\p{M}]+$/u.test(value.slice(start,end))
    && (start===0||!(/[\p{L}\p{M}]/u.test(value[start-1]!)))
    && (end===value.length||!(/[\p{L}\p{M}]/u.test(value[end]!)));
}
function optionName(kind:AcademicSlotKindV1):string{
  return ({preverb:'Modificación preverbial',phonetics:'Evolución fonética',
    prefix:'Prefijos',latinism:'Latinismos'})[kind];
}
function rangeInParagraph(p:HTMLElement,selection:Selection):{start:number;end:number}|null{
  if(selection.rangeCount!==1||selection.isCollapsed)return null;
  const range=selection.getRangeAt(0);
  if(!p.contains(range.startContainer)||!p.contains(range.endContainer))return null;
  const startRange=range.cloneRange();
  startRange.selectNodeContents(p);
  startRange.setEnd(range.startContainer,range.startOffset);
  const endRange=range.cloneRange();
  endRange.selectNodeContents(p);
  endRange.setEnd(range.endContainer,range.endOffset);
  const start=startRange.toString().length,end=endRange.toString().length;
  return safeToken(p.textContent??'',start,end)?{start,end}:null;
}

export function createAcademicControls(repository:WorkspaceRepository,bind:Bindings,
  options:{autoApply?:boolean}={}){
  // El banco congelado no se modifica y se instancia únicamente cuando se abre un control.
  let services:ReturnType<typeof createOfflineTeacherBankV1>|null=null;
  let engine:AcademicQuestionEngineV1|null=null,selector:AcademicMorphTokenSelectorV1|null=null;
  const bases=teacherPreverbBases(academicTeacherSnapshotV1);
  const autoApply=options.autoApply===true;
  const counts=new Map<string,number>();
  const sourceForms=new Map<string,string[]>();
  const selectedBases=new Map<string,PreverbSelection>();
  const baseUsageSignatures=new Map<string,string>();
  const manuallySelectedBases=new Set<string>();
  const ruleFilters=new Map<string,Set<string>>();
  const rulesEnabled=new Set<string>();
  const replaceGroups=new Set<string>();
  let pending:Pending|null=null;
  let paperRange:RangeTarget|null=null;
  let working=false;
  const allRules=Array.from({length:20},(_,i)=>'N'+String(i+1).padStart(2,'0'));
  function service(){
    if(!services){
      services=createOfflineTeacherBankV1();
      engine=new AcademicQuestionEngineV1(services.bank);
      selector=new AcademicMorphTokenSelectorV1(services.bank);
    }
    return {report:services,engine:engine!,selector:selector!};
  }
  function clear():void{pending=null;paperRange=null;}
  function reject(error:unknown):void{bind.status('Propuesta no aplicada: '+summary(error),true);}
  function current(){
    const state=bind.snapshot();
    if(!state)throw new Error('Abre primero un cuaderno editorial.');
    return state;
  }
  function countFor(o:ChoiceOptionV1):number{
    return counts.get(o.id)??(o.slots.length||defaults[o.kind]);
  }
  function usedPreverbKeys(excludingOptionId:string):string[]{
    const edition=bind.snapshot()?.edition;
    if(!edition)return [];
    const used=new Set<string>();
    for(const placement of edition.placements)for(const question of placement.questions){
      if(question.kind!=='choice')continue;
      for(const option of question.options){
        if(option.id===excludingOptionId||option.kind!=='preverb'||!option.enabled)continue;
        const found=option.statement.value.match(/\*([^*]+)\* \(3\) y de \*([^*]+)\* \(2\)/u);
        if(!found)continue;
        for(const form of [found[1]!,found[2]!]){
          const key=preverbBaseKeyForForm(academicTeacherSnapshotV1,form);
          if(key)used.add(key);
        }
      }
    }
    return [...used].sort();
  }
  function preverbBasesFor(o:ChoiceOptionV1,p:TextPlacementV1):PreverbSelection{
    const used=usedPreverbKeys(o.id),signature=used.join('\0');
    let selected=selectedBases.get(o.id);
    if(!selected||(!manuallySelectedBases.has(o.id)&&baseUsageSignatures.get(o.id)!==signature)){
      selected=choosePreverbBases(academicTeacherSnapshotV1,p.text.latin,Math.random,used);
      selectedBases.set(o.id,selected);
      baseUsageSignatures.set(o.id,signature);
      sourceForms.set(o.id,[...selected.sourceKeys]);
    }
    return selected;
  }
  function sourceFor(o:ChoiceOptionV1,count=countFor(o),p?:TextPlacementV1):string[]{
    if(o.kind==='preverb'&&p)preverbBasesFor(o,p);
    const values=sourceForms.get(o.id)??[];
    return Array.from({length:count},(_,i)=>values[i]??'');
  }
  function rulesFor(q:Choice):readonly string[]|undefined{
    return rulesEnabled.has(q.id)?[...(ruleFilters.get(q.id)??new Set(allRules))]:undefined;
  }
  function replaceFor(id:string):boolean{return replaceGroups.has(id);}
  function fieldsFor(o:ChoiceOptionV1,p?:TextPlacementV1){
    const count=o.kind==='preverb'?5:countFor(o);
    return {
      count,
      sourceForms:o.kind==='preverb'?sourceFor(o,count,p):undefined,
      newSlotIds:Array.from({length:Math.max(0,count-o.slots.length)},()=> 'slot.'+crypto.randomUUID()),
    };
  }
  function prepareDetails(plan:AcademicPlanV1):string[]{
    const {report}=service();
    const old=JSON.parse(plan.baseline) as NotebookEditionV1;
    const placement=old.placements.find(p=>p.id===plan.target.placementId);
    const question=placement?.questions.find(q=>q.id===plan.target.questionId);
    if(!question||question.kind!=='choice')return [];
    const details:string[]=[];
    for(const group of plan.assignments){
      const option=question.options.find(o=>o.id===group.optionId);
      if(!option)continue;
      for(const item of group.items){
        const previous=option.slots.find(x=>x.id===item.slotId)?.value??'—';
        if(!item.candidateId){
          details.push(optionName(option.kind)+': se conserva «'+previous+'» (manual protegida).');
          continue;
        }
        const rec=report.bank.findVerified(item.candidateId);
        if(!rec)throw new Error('Candidato inexistente o no elegible.');
        const audit=teacherAuditRecord(report,item.candidateId);
        const existingSlots=old.placements.flatMap(placement=>placement.questions.flatMap(question=>
          question.kind==='choice'?question.options.flatMap(other=>other.slots):[]));
        const seenBefore=existingSlots.some(slot=>slot.id!==item.slotId&&
          slot.value.normalize('NFC').toLocaleLowerCase('es')===
            rec.value.normalize('NFC').toLocaleLowerCase('es'));
        details.push(optionName(option.kind)+': '+previous+' → '+rec.value+
          (seenBefore?' (reutilizada: no quedan nuevas candidatas compatibles)':'')+
          (audit?.semanticReviewRequired?' (significado orientativo; revisar)':''));
      }
    }
    return details;
  }
  function showCandidate(kind:CandidatePending['kind'],label:string,
    target:CandidatePending['target'],rows:Candidate[],locked:boolean,baseline:string,revision:number):void{
    if(!rows.length)throw new Error('No hay candidatos elegibles para esta selección; no se han modificado datos.');
    pending={type:'candidate',kind,label,target,candidates:rows,
      chosen:rows.length===1?rows[0]!.id:'',locked,replaceLocked:false,baseline,revision};
    bind.repaint();
  }
  async function withSaved(work:(s:EditionSnapshotV1)=>void|Promise<void>):Promise<void>{
    if(working)return;working=true;
    try{
      if(!await bind.flush())throw new Error('Primero resuelve los cambios que no se pudieron guardar.');
      await work(current());
    }catch(e){reject(e);}
    finally{working=false;}
  }
  function candidateRows(kind:'morphology'|AcademicSlotKindV1,
    rows:readonly {id:string;value:string;analysis:string|null;lemmaId:string|null}[]):Candidate[]{
    const report=service().report;
    return rows.map(r=>{
      const data=report.bank.findVerified(r.id),audit=teacherAuditRecord(report,r.id);
      return {id:r.id,value:r.value,
        detail:kind==='morphology'
          ? (r.lemmaId??'?')+' · '+(r.analysis??'Análisis no disponible')
          : (audit?.semanticReviewRequired?'Aviso: indicación semántica orientativa':'Ficha elegible del banco docente')+
            (data?.sourceForm?' · base '+data.sourceForm:'')};
    });
  }
  async function commitPlanDirect(plan:AcademicPlanV1,label:string,
    preverb?:{placementId:string;questionId:string;optionId:string;forms:readonly [string,string]}):Promise<void>{
    let saved=await service().engine.commit(repository,plan,new Date().toISOString());
    if(preverb){
      const at=new Date().toISOString();
      const text=preverbStatement(preverb.forms);
      // Enunciados editados manualmente no se reescriben al regenerar.
      const placement=saved.edition.placements.find(p=>p.id===preverb.placementId);
      const question=placement?.questions.find(q=>q.id===preverb.questionId);
      const option=question?.kind==='choice'
        ?question.options.find(o=>o.id===preverb.optionId):null;
      // El ejercicio pide al alumnado CINCO derivados: no deben aparecer
      // impresos en el examen. El motor utiliza cinco candidatos internos,
      // pero la hoja muestra solo los dos verbos de partida (3 + 2).
      // Las entradas añadidas manualmente por el profesor no se eliminan.
      if(option){
        saved=await repository.commitEdition(saved.edition.id,saved.revision,
          {command:'ui.preverb-statement',targetId:preverb.optionId,timestamp:at},original=>{
            if(!original)throw new Error('Se ha perdido el cuaderno editorial.');
            return validateEdition({...original,updatedAt:at,
              placements:original.placements.map(p=>p.id!==preverb.placementId?p:{
                ...p,questions:p.questions.map(q=>q.id!==preverb.questionId||q.kind!=='choice'?q:{
                  ...q,options:q.options.map(o=>o.id!==preverb.optionId?o:{
                    ...o,
                    ...(o.statement.locked&&o.statement.origin==='manual'?{}:{
                      statement:{value:text,origin:'generated' as const,locked:false,lastEditAt:null},
                    }),
                    slots:o.slots.filter(slot=>slot.origin==='manual'),
                  }),
                }),
              }),
            });
          });
      }
    }
    pending=null;paperRange=null;replaceGroups.clear();
    bind.saved(saved);
    const repeated=prepareDetails(plan).filter(x=>x.includes('(reutilizada:')).length;
    bind.status(label+' aplicado directamente. Puedes cambiar cada término individualmente.'+
      (repeated?' Reutilizadas por agotamiento del banco: '+repeated+'.':''));
  }
  async function chooseCandidateDirect(kind:CandidatePending['kind'],
    target:CandidatePending['target'],rows:Candidate[],locked:boolean):Promise<void>{
    if(!rows.length)throw new Error('No hay propuestas documentadas para esta palabra.');
    if(locked){
      bind.status('Palabra manual protegida: se conserva sin reemplazarla.');
      return;
    }
    const chosen=rows[0]!.id;
    const saved=current();
    let next:EditionSnapshotV1;
    const {engine,selector}=service();
    if(kind==='token'){
      const plan=selector.prepare(saved.edition,target as MorphTokenTargetV1,chosen);
      next=await selector.commit(repository,plan,new Date().toISOString());
    }else if(kind==='morph'){
      const plan=engine.prepareMorph(saved.edition,target as AcademicMorphTargetV1,chosen,false);
      next=await engine.commit(repository,plan,new Date().toISOString());
    }else{
      const plan=engine.prepareSlot(saved.edition,target as AcademicSlotTargetV1,chosen,
        randomSeed(),false);
      next=await engine.commit(repository,plan,new Date().toISOString());
    }
    bind.saved(next);
    bind.status('Aplicado directamente'+(rows.length>1?
      ' · varias lecturas posibles: revisa la forma elegida.':'.'));
  }

  function requestSlot(p:TextPlacementV1,q:Choice,o:ChoiceOptionV1,slotId:string,index:number):void{
    void withSaved(async s=>{
      const target:AcademicSlotTargetV1={
        placementId:p.id,questionId:q.id,optionId:o.id,slotId,expectedRevision:s.revision,
        ...(o.kind==='preverb'?{sourceForm:sourceFor(o)[index]??''}:{}),
        ...(o.kind==='phonetics'&&rulesFor(q)!==undefined?{phoneticRules:rulesFor(q) as readonly string[]}:{}),
      };
      const academic=service().engine;
      const view=academic.previewSlot(s.edition,target);
      const rows=candidateRows(o.kind,view.candidates);
      if(autoApply)await chooseCandidateDirect('slot',target,rows,view.status==='locked');
      else showCandidate('slot','Sustituir una palabra de '+optionName(o.kind),target,
        rows,view.status==='locked',JSON.stringify(s.edition),s.revision);
    });
  }
  function requestMorph(p:TextPlacementV1,q:Morph,wordId:string):void{
    void withSaved(async s=>{
      const target:AcademicMorphTargetV1={
        placementId:p.id,questionId:q.id,wordId,expectedRevision:s.revision,
      };
      const view=service().engine.previewMorph(s.edition,target);
      const rows=candidateRows('morphology',view.candidates);
      if(autoApply)await chooseCandidateDirect('morph',target,rows,view.status==='locked');
      else showCandidate('morph','Reanalizar únicamente esta aparición',target,
        rows,view.status==='locked',JSON.stringify(s.edition),s.revision);
    });
  }
  function requestGroup(p:TextPlacementV1,q:Choice,o:ChoiceOptionV1):void{
    void withSaved(async s=>{
      const f=fieldsFor(o,p);
      const plan=service().engine.prepareSubquestion(s.edition,{
        placementId:p.id,questionId:q.id,optionId:o.id,expectedRevision:s.revision,
        desiredCount:f.count,newSlotIds:f.newSlotIds,
        ...(f.sourceForms?{sourceForms:f.sourceForms}:{}),
        ...(rulesFor(q)!==undefined?{phoneticRules:rulesFor(q) as readonly string[]}:{}),
        allowManualReplacement:replaceFor(o.id),seed:randomSeed(),
      });
      const details=prepareDetails(plan);
      if(!plan.assignments.some(g=>g.items.some(x=>x.candidateId))){
        throw new Error('No hay términos que sustituir; las palabras manuales permanecen protegidas.');
      }
      if(autoApply){
        const picked=o.kind==='preverb'?preverbBasesFor(o,p):null;
        await commitPlanDirect(plan,optionName(o.kind),
          picked?{placementId:p.id,questionId:q.id,optionId:o.id,forms:picked.forms}:undefined);
      }else{
        pending={type:'plan',label:'Regenerar solo '+optionName(o.kind),plan,details};
        bind.repaint();
      }
    });
  }
  function requestQuestion(p:TextPlacementV1,q:Choice):void{
    void withSaved(async s=>{
      const desiredCountByKind:Partial<Record<AcademicSlotKindV1,number>>={};
      const sourceFormsByKind:Partial<Record<AcademicSlotKindV1,readonly string[]>>={};
      const newSlotIdsByKind:Partial<Record<AcademicSlotKindV1,readonly string[]>>={};
      for(const o of q.options.filter(x=>x.enabled)){
        const f=fieldsFor(o,p);
        desiredCountByKind[o.kind]=f.count;
        newSlotIdsByKind[o.kind]=f.newSlotIds;
        if(f.sourceForms)sourceFormsByKind[o.kind]=f.sourceForms;
      }
      const plan=service().engine.prepareChoiceQuestion(s.edition,{
        placementId:p.id,questionId:q.id,expectedRevision:s.revision,
        desiredCountByKind,sourceFormsByKind,newSlotIdsByKind,
        ...(rulesFor(q)!==undefined?{phoneticRules:rulesFor(q) as readonly string[]}:{}),
        allowManualReplacement:replaceFor(q.id),seed:randomSeed(),
      });
      const details=prepareDetails(plan);
      if(!plan.assignments.some(g=>g.items.some(x=>x.candidateId)))
        throw new Error('No hay términos que regenerar.');
      if(autoApply){
        const preverb=q.options.find(o=>o.kind==='preverb'&&o.enabled);
        const picked=preverb?preverbBasesFor(preverb,p):null;
        await commitPlanDirect(plan,'Pregunta 4',
          preverb&&picked?{placementId:p.id,questionId:q.id,optionId:preverb.id,forms:picked.forms}:undefined);
      }else{
        pending={type:'plan',label:'Regenerar solo la pregunta 4',plan,details};
        bind.repaint();
      }
    });
  }
  function requestToken(target:RangeTarget):void{
    void withSaved(async s=>{
      const p=s.edition.placements.find(x=>x.id===target.placementId);
      const q=p?.questions.find(x=>x.kind==='morphology');
      if(!p||!q)throw new Error('No se encontró la pregunta de morfología.');
      if(!safeToken(p.text.latin,target.start,target.end))
        throw new Error('Selecciona exactamente una palabra latina completa.');
      const t:MorphTokenTargetV1={
        editionId:s.edition.id,placementId:p.id,questionId:q.id,expectedRevision:s.revision,
        startUtf16:target.start,endUtf16:target.end,markId:'mark.'+crypto.randomUUID(),
        wordId:'morph.'+crypto.randomUUID(),
      };
      const view=service().selector.preview(s.edition,t);
      const rows=view.candidates.map(x=>({id:x.id,value:view.surface,
        detail:x.lemmaId+' · '+x.analysis+' · '+x.reference}));
      if(autoApply)await chooseCandidateDirect('token',t,rows,false);
      else showCandidate('token','Subrayar y analizar «'+view.surface+'»',t,rows,false,
        JSON.stringify(s.edition),s.revision);
    });
  }
  async function confirm():Promise<void>{
    if(!pending||working)return;
    const original=pending;
    await withSaved(async s=>{
      if(!pending||pending!==original||s.revision!==(original.type==='plan'?
        original.plan.target.expectedRevision:original.revision)
        ||JSON.stringify(s.edition)!==(original.type==='plan'?
          original.plan.baseline:original.baseline)){
        throw new Error('El cuaderno cambió desde la propuesta. Solicita una nueva.');
      }
      const {engine,selector}=service();
      let next:EditionSnapshotV1;
      if(original.type==='plan'){
        next=await engine.commit(repository,original.plan,new Date().toISOString());
      }else{
        if(!original.chosen)throw new Error('Elige una propuesta verificada antes de confirmar.');
        if(original.locked&&!original.replaceLocked)
          throw new Error('La palabra manual está protegida. Autoriza expresamente su sustitución.');
        const e=s.edition;
        if(original.kind==='token'){
          const plan=selector.prepare(e,original.target as MorphTokenTargetV1,original.chosen);
          next=await selector.commit(repository,plan,new Date().toISOString());
        }else if(original.kind==='morph'){
          const plan=engine.prepareMorph(e,original.target as AcademicMorphTargetV1,
            original.chosen,original.replaceLocked);
          next=await engine.commit(repository,plan,new Date().toISOString());
        }else{
          const plan=engine.prepareSlot(e,original.target as AcademicSlotTargetV1,
            original.chosen,randomSeed(),original.replaceLocked);
          next=await engine.commit(repository,plan,new Date().toISOString());
        }
      }
      pending=null;paperRange=null;replaceGroups.clear();
      bind.saved(next);
      bind.status('Propuesta confirmada y guardada con historial. Revisión '+next.revision+'.');
    });
  }
  function review():HTMLElement|null{
    if(!pending)return null;
    const box=el('section','edition-academic-review');
    box.setAttribute('aria-label','Revisar propuesta académica');
    box.append(el('h3','',pending.label),
      el('p','hint','Comprueba la propuesta. Ninguna palabra cambiará hasta que confirmes.'));
    if(pending.type==='candidate'){
      const label=el('label','edition-field');
      label.append(el('span','edition-field-label','Candidatura verificada'));
      const select=el('select','field-control');
      const blank=el('option','','Selecciona un análisis o término');blank.value='';select.append(blank);
      for(const row of pending.candidates){
        const opt=el('option','',row.value+' — '+row.detail);opt.value=row.id;select.append(opt);
      }
      select.value=pending.chosen;
      select.addEventListener('change',()=>{
        if(pending?.type==='candidate')pending.chosen=select.value;
      });
      label.append(select);box.append(label);
      if(pending.locked){
        const consent=el('label','edition-option-head');
        const check=el('input');check.type='checkbox';check.checked=pending.replaceLocked;
        check.addEventListener('change',()=>{if(pending?.type==='candidate')pending.replaceLocked=check.checked;});
        consent.append(check,el('span','','Autorizo sustituir esta decisión manual protegida.'));
        box.append(consent);
      }
    }else{
      const items=el('ul','edition-academic-diff');
      for(const line of pending.details){items.append(el('li','',line));}
      box.append(items);
      if(pending.plan.replaceLocked)box.append(el('p','edition-error',
        'Has autorizado sustituir términos manuales en el alcance indicado.'));
    }
    const tools=el('div','edition-inline-edit');
    const accept=button('Confirmar propuesta',confirm);
    accept.classList.add('btn-primary');accept.classList.remove('btn-outline');
    const cancel=button('Cancelar',()=>{pending=null;bind.repaint();});
    tools.append(accept,cancel);box.append(tools);
    return box;
  }
  function setSourcesUi(section:HTMLElement,p:TextPlacementV1,o:ChoiceOptionV1):void{
    if(o.kind!=='preverb')return;
    const picked=preverbBasesFor(o,p);
    const wrap=el('fieldset','edition-source-forms');
    wrap.append(el('legend','','Dos verbos de partida: tres derivados + dos derivados'));
    const values=sourceFor(o,5,p);
    for(const [index,count] of [[0,3],[1,2]] as const){
      const label=el('label','edition-field');
      label.append(el('span','edition-field-label',
        'Verbo '+(index+1)+' · '+count+' derivados'+
        (picked.forms[index]?' · '+picked.forms[index]:'') ));
      const select=el('select','field-control');
      for(const base of bases){
        const opt=el('option','',base.enunciado+(base.requiresDisambiguation?' · homónimo':''));opt.value=base.selectionKey;
        select.append(opt);
      }
      select.value=values[index===0?0:3]??'';
      select.addEventListener('change',()=>{
        const first=index===0?select.value:values[0]!;
        const second=index===1?select.value:values[3]!;
        sourceForms.set(o.id,[first,first,first,second,second]);
        manuallySelectedBases.add(o.id);
        // Una elección manual sustituye la forma tomada del pasaje
        // por el lema del banco, sin declarar que aparece en el texto.
        const baseA=bases.find(x=>x.selectionKey===first);
        const baseB=bases.find(x=>x.selectionKey===second);
        if(baseA&&baseB){
          selectedBases.set(o.id,{sourceKeys:[first,first,first,second,second],
            forms:[baseA.lemma,baseB.lemma],source:'bank'});
        }
        bind.repaint();
      });
      label.append(select);wrap.append(label);
    }
    wrap.append(el('p','hint','Se priorizan bases del pasaje no utilizadas en otros textos; después se buscan nuevas en el banco. Solo se reutilizan si no quedan bases válidas.'));
    section.append(wrap);
  }
  function phoneticControls(section:HTMLElement,q:Choice):void{
    const details=el('details','edition-rules');
    const title=el('summary','','Normas fonéticas permitidas (N01–N20)');
    details.append(title);
    const enabled=el('label','edition-option-head');
    const check=el('input');check.type='checkbox';check.checked=rulesEnabled.has(q.id);
    check.addEventListener('change',()=>{
      if(check.checked)rulesEnabled.add(q.id);else rulesEnabled.delete(q.id);
      bind.repaint();
    });
    enabled.append(check,el('span','','Restringir a las normas seleccionadas'));
    details.append(enabled);
    if(rulesEnabled.has(q.id)){
      const rules=ruleFilters.get(q.id)??new Set(allRules);
      const grid=el('div','edition-rule-grid');
      for(const code of allRules){
        const label=el('label','edition-option-head');
        const input=el('input');input.type='checkbox';input.checked=rules.has(code);
        input.addEventListener('change',()=>{
          const next=new Set(ruleFilters.get(q.id)??allRules);
          if(input.checked)next.add(code);else next.delete(code);
          ruleFilters.set(q.id,next);
        });
        label.append(input,el('span','',code));grid.append(label);
      }
      details.append(grid);
    }
    section.append(details);
  }
  function consent(section:HTMLElement,key:string):void{
    const label=el('label','edition-option-head');
    const input=el('input');input.type='checkbox';input.checked=replaceGroups.has(key);
    input.addEventListener('change',()=>{
      if(input.checked)replaceGroups.add(key);else replaceGroups.delete(key);
    });
    label.append(input,el('span','','Permitir sustituir palabras manuales protegidas en esta operación'));
    section.append(label);
  }
  function renderOption(section:HTMLElement,p:TextPlacementV1,q:Choice,o:ChoiceOptionV1):void{
    const ui=el('div','edition-academic-option');
    const label=el('label','edition-field');
    label.append(el('span','edition-field-label','Cantidad para este apartado (sin regenerar automáticamente)'));
    const count=el('input','field-control');count.type='number';count.min='1';count.max='30';
    count.value=String(o.kind==='preverb'?5:countFor(o));
    if(o.kind==='preverb')count.disabled=true;
    count.addEventListener('change',()=>{
      const n=Number(count.value);
      if(!Number.isInteger(n)||n<1||n>30){count.value=String(countFor(o));return;}
      counts.set(o.id,n);bind.repaint();
    });
    label.append(count);ui.append(label);
    setSourcesUi(ui,p,o);
    consent(ui,o.id);
    ui.append(button((autoApply?'Generar ':'Proponer apartado ')+optionName(o.kind),()=>requestGroup(p,q,o)));
    section.append(ui);
  }
  function renderSlot(section:HTMLElement,p:TextPlacementV1,q:Choice,o:ChoiceOptionV1,slotId:string,index:number):void{
    section.append(button('Proponer solo esta palabra',()=>requestSlot(p,q,o,slotId,index)));
  }
  function renderQuestion(section:HTMLElement,p:TextPlacementV1,q:Choice):void{
    const ui=el('div','edition-academic-question');
    phoneticControls(ui,q);
    consent(ui,q.id);
    ui.append(button(autoApply?'Generar pregunta 4':'Proponer pregunta 4 completa',()=>requestQuestion(p,q)),
      el('p','hint',autoApply?'Los candidatos documentados se aplican directamente. Puedes editarlos después.':
        'Los apartados desactivados y las otras preguntas quedan intactos. Las propuestas se revisan antes de guardar.'));
    section.append(ui);
  }
  function renderMorph(section:HTMLElement,p:TextPlacementV1,q:Morph):void{
    const ui=el('div','edition-academic-morph');
    if(q.words.length){
      ui.append(el('h4','','Apariciones verificadas'));
      for(const word of q.words){
        const line=el('div','edition-academic-morph-row');
        line.append(el('span','',word.surface+' · '+(word.analysis??'Pendiente')+
          (word.locked?' · manual protegida':'')));
        line.append(button('Reanalizar aparición',()=>requestMorph(p,q,word.id)));
        ui.append(line);
      }
    }
    ui.append(el('p','hint',
      'Para añadir una aparición, selecciona una palabra completa en el campo Texto latino o sobre la hoja A4. Solo se admiten análisis individuales elegibles.'));
    section.append(ui);
  }
  function renderTextSelect(p:TextPlacementV1,area:HTMLTextAreaElement):HTMLElement{
    const row=el('div','edition-inline-edit edition-academic-select');
    const label=el('span','hint','Selecciona una palabra concreta en el campo latino.');
    const add=button('Subrayar palabra seleccionada',()=>{
      const start=area.selectionStart,end=area.selectionEnd;
      requestToken({placementId:p.id,start,end});
    });
    row.append(label,add);
    return row;
  }
  function capturePaperSelection(root:HTMLElement):RangeTarget|null{
    const selection=window.getSelection();
    if(!selection||selection.isCollapsed)return null;
    const range=selection.getRangeAt(0);
    const startNode=range.startContainer instanceof Element?range.startContainer:range.startContainer.parentElement;
    const paragraph=startNode?.closest<HTMLElement>('.edition-latin');
    if(!paragraph||!root.contains(paragraph)||!paragraph.dataset.placementId)return null;
    const offsets=rangeInParagraph(paragraph,selection);
    return offsets?{placementId:paragraph.dataset.placementId,start:offsets.start,end:offsets.end}:null;
  }
  function renderPaperSelect(root:HTMLElement):HTMLButtonElement{
    const add=button('Subrayar selección de la hoja',()=>{
      const selected=capturePaperSelection(root)??paperRange;
      if(!selected){bind.status('Selecciona una palabra latina completa en la hoja antes de pulsar el botón.',true);return;}
      requestToken(selected);
    });
    // Los tiradores de Safari pueden colapsar la selección al tocar el botón.
    // Guardamos exclusivamente la selección del texto de la hoja actual.
    add.addEventListener('pointerdown',()=>{paperRange=capturePaperSelection(root)??paperRange;});
    return add;
  }
  function savePaperSelection(root:HTMLElement):void{
    const selection=capturePaperSelection(root);
    if(selection)paperRange=selection;
  }
  /** Al incorporar un texto nuevo se rellenan las preguntas disponibles
   * sin formularios previos. El motor evita repetir fichas en el cuaderno
   * mientras existan otras candidatas documentadas.
   * No altera preguntas redactadas o protegidas por el docente.
   */
  async function generateInitial(placementId:string):Promise<void>{
    if(!autoApply)return;
    await withSaved(async first=>{
      const p=first.edition.placements.find(x=>x.id===placementId);
      if(!p)return;
      const question=p.questions.find(q=>q.kind==='choice');
      if(!question||question.kind!=='choice')return;
      // Solo se completa la pregunta original vacía, nunca se regenera
      // una ya preparada o modificada manualmente.
      if(question.options.some(o=>o.slots.length>0||
        (o.statement.locked&&o.statement.origin==='manual')))return;
      const desiredCountByKind:Partial<Record<AcademicSlotKindV1,number>>={};
      const sourceFormsByKind:Partial<Record<AcademicSlotKindV1,readonly string[]>>={};
      const newSlotIdsByKind:Partial<Record<AcademicSlotKindV1,readonly string[]>>={};
      for(const option of question.options.filter(x=>x.enabled)){
        const fields=fieldsFor(option,p);
        desiredCountByKind[option.kind]=fields.count;
        newSlotIdsByKind[option.kind]=fields.newSlotIds;
        if(fields.sourceForms)sourceFormsByKind[option.kind]=fields.sourceForms;
      }
      const plan=service().engine.prepareChoiceQuestion(first.edition,{
        placementId:p.id,questionId:question.id,expectedRevision:first.revision,
        desiredCountByKind,sourceFormsByKind,newSlotIdsByKind,
        seed:randomSeed(),allowManualReplacement:false,
      });
      if(plan.assignments.some(g=>g.items.some(x=>x.candidateId))){
        const preverb=question.options.find(o=>o.kind==='preverb'&&o.enabled);
        const picked=preverb?preverbBasesFor(preverb,p):null;
        await commitPlanDirect(plan,'Preguntas iniciales',
          preverb&&picked?{placementId:p.id,questionId:question.id,
            optionId:preverb.id,forms:picked.forms}:undefined);
      }
    });
    // Seleccionar automáticamente hasta dos formas con análisis individual
    // inequívoco, evitando repetirlas en otros textos del cuaderno.
    await withSaved(async first=>{
      const p=first.edition.placements.find(x=>x.id===placementId);
      const question=p?.questions.find(q=>q.kind==='morphology');
      if(!p||!question||question.kind!=='morphology'||question.words.length)return;
      const tokens=[...p.text.latin.matchAll(/[\p{L}\p{M}]+/gu)];
      const already=new Set(first.edition.placements.flatMap(x=>
        x.questions.filter(q=>q.kind==='morphology').flatMap(q=>
          q.kind==='morphology'?q.words.map(w=>w.surface.toLocaleLowerCase('es')):[])));
      const possible=tokens.flatMap(t=>{
        const surface=t[0],key=surface.toLocaleLowerCase('es');
        const records=service().report.bank.verified('morphology',surface);
        const unambiguous=new Set(records.map(r=>(r.lemmaId??'')+'|'+(r.analysis??''))).size===1;
        return records.length&&unambiguous
          ?[{surface,start:t.index!,end:t.index!+surface.length,key}]:[];
      });
      const unique=possible.filter(t=>!already.has(t.key));
      const pool=unique.length>=2?unique:possible;
      const taken=new Set<string>();
      for(const token of pool){
        if(taken.size>=2)break;
        if(taken.has(token.key))continue;
        const currentState=current();
        const currentPlacement=currentState.edition.placements.find(x=>x.id===placementId);
        if(!currentPlacement||currentPlacement.text.markup.some(m=>
          token.start<m.endUtf16&&m.startUtf16<token.end))continue;
        const target:MorphTokenTargetV1={
          editionId:currentState.edition.id,placementId,questionId:question.id,
          expectedRevision:currentState.revision,startUtf16:token.start,
          endUtf16:token.end,markId:'mark.'+crypto.randomUUID(),
          wordId:'morph.'+crypto.randomUUID(),
        };
        const inspection=service().selector.preview(currentState.edition,target);
        if(inspection.status!=='ready')continue;
        const plan=service().selector.prepare(currentState.edition,target);
        const saved=await service().selector.commit(repository,plan,new Date().toISOString());
        taken.add(token.key);bind.saved(saved);
      }
    });
  }
  return {
    clear,generateInitial,review,renderOption,renderSlot,renderQuestion,renderMorph,renderTextSelect,
    renderPaperSelect,savePaperSelection,
  };
}

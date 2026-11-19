import {foldLatin} from '../core/library.js';
import {allGrammarTags,GRAMMAR_GROUP_IDS,matchesGrammarTag,isCustomTagLabelValid}
  from '../core/grammar-tags.js';
import type {CorpusV1,LatinText,BankGrammarDecision} from '../core/model.js';
import type {CollatinusGrammarProposal} from '../core/collatinus-grammar.js';

/**
 * Etiquetado de una fuente: independiente de cualquier aparición del cuaderno.
 * Las candidaturas nunca se guardan como etiquetas hasta su confirmación humana.
 */
export interface BankGrammarBindings {
  current:()=>{text:LatinText;corpus:CorpusV1};
  saveTags:(ids:string[])=>Promise<void>;
  addCustomTag:(label:string)=>Promise<void>;
  analyze:()=>Promise<CollatinusGrammarProposal[]>;
  decide:(proposal:CollatinusGrammarProposal,chosenTagId:string|null)=>Promise<void>;
  notice:(message:string)=>void;
}
function el<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',value=''):HTMLElementTagNameMap[K]{
  const node=document.createElement(tag);node.className=cls;node.textContent=value;return node;
}
function button(label:string,handler:()=>void|Promise<void>,cls='hbtn'):HTMLButtonElement{
  const b=el('button',cls,label);b.type='button';
  b.addEventListener('click',async()=>{
    b.disabled=true;
    try{await handler();}catch(error){console.error(error);}finally{b.disabled=false;}
  });
  return b;
}
function key(p:CollatinusGrammarProposal):string{
  return [p.start,p.end,p.tagId].join(':');
}
function decisionFor(rows:readonly BankGrammarDecision[]|undefined,p:CollatinusGrammarProposal):
  BankGrammarDecision|undefined{
  return rows?.find(row=>row.startUtf16===p.start&&row.endUtf16===p.end&&
    row.tagId===p.tagId);
}
export function renderBankGrammarEditor(bind:BankGrammarBindings):HTMLElement{
  const root=el('div','bank-grammar-editor');
  const current=bind.current();
  root.append(el('h3','','Etiquetas de «'+current.text.title+'»'));
  root.append(el('p','small muted',
    'Las etiquetas confirmadas pertenecen a la fuente. Al incorporarla a un cuaderno, se copian a su aparición independiente.'));
  const manual=el('section','bank-grammar-manual');
  const review=el('section','bank-grammar-review');
  let proposals:CollatinusGrammarProposal[]|null=null;
  let busy=false;
  let searchText='';
  function refreshManual():void{
    const {text,corpus}=bind.current();
    const tags=allGrammarTags(corpus);
    const selected=new Set(text.tagIds);
    manual.replaceChildren();
    manual.append(el('h4','','Confirmadas ('+selected.size+')'));
    const chips=el('div','grammar-chips');
    for(const id of selected){
      const tag=tags.find(tag=>tag.id===id);
      const chip=el('span','grammar-chip',tag?.label??id);
      chip.dataset.group=GRAMMAR_GROUP_IDS.find(group=>matchesGrammarTag(id,group,tags))??'custom';
      chips.append(chip);
    }
    if(!selected.size)chips.append(el('span','small muted','Sin etiquetas confirmadas'));
    manual.append(chips);
    const search=el('input','bank-grammar-search');
    search.type='search';search.placeholder='Buscar una etiqueta…';
    search.setAttribute('aria-label','Buscar etiqueta del banco');
    search.value=searchText;manual.append(search);
    const groupList=el('div','bank-grammar-groups');
    for(const groupId of GRAMMAR_GROUP_IDS){
      const group=tags.find(tag=>tag.id===groupId);
      if(!group)continue;
      const groupDetails=el('details','bank-grammar-group');
      groupDetails.open=text.tagIds.some(id=>matchesGrammarTag(id,groupId,tags));
      const descendants=tags.filter(tag=>tag.id!==groupId&&matchesGrammarTag(tag.id,groupId,tags));
      groupDetails.append(el('summary','',group.label+' ('+
        descendants.filter(tag=>selected.has(tag.id)).length+' seleccionadas)'));
      for(const tag of descendants){
        const line=el('label','bank-grammar-option');
        const checkbox=el('input');checkbox.type='checkbox';
        checkbox.checked=selected.has(tag.id);checkbox.setAttribute('aria-label',tag.label);
        checkbox.addEventListener('change',async()=>{
          const next=new Set(bind.current().text.tagIds);
          if(checkbox.checked)next.add(tag.id);else next.delete(tag.id);
          checkbox.disabled=true;
          try{await bind.saveTags([...next]);refreshManual();refreshReview();}
          catch(error){bind.notice('No se pudo guardar la etiqueta: '+String(error));checkbox.disabled=false;}
        });
        line.append(checkbox,el('span','',tag.label));
        groupDetails.append(line);
      }
      groupList.append(groupDetails);
    }
    const custom=tags.filter(tag=>tag.kind==='custom');
    if(custom.length){
      const group=el('details','bank-grammar-group');
      group.append(el('summary','','Personalizadas'));
      for(const tag of custom){
        const line=el('label','bank-grammar-option'),cb=el('input');
        cb.type='checkbox';cb.checked=selected.has(tag.id);
        cb.setAttribute('aria-label',tag.label);
        cb.addEventListener('change',async()=>{
          const next=new Set(bind.current().text.tagIds);
          if(cb.checked)next.add(tag.id);else next.delete(tag.id);
          try{await bind.saveTags([...next]);refreshManual();refreshReview();}
          catch(error){bind.notice('No se pudo guardar la etiqueta: '+String(error));}
        });
        line.append(cb,el('span','',tag.label));group.append(line);
      }
      groupList.append(group);
    }
    manual.append(groupList);
    const own=el('div','bank-grammar-own'),field=el('input');
    field.placeholder='Nueva etiqueta personalizada';field.setAttribute('aria-label','Nueva etiqueta del banco');
    own.append(field,button('Añadir etiqueta',async()=>{
      if(!isCustomTagLabelValid(field.value)){bind.notice('Revisa el nombre de la etiqueta.');return;}
      try{await bind.addCustomTag(field.value);refreshManual();}
      catch(error){bind.notice('No se pudo crear la etiqueta: '+String(error));}
    }));
    manual.append(own);
    function filter():void{
      searchText=search.value;
      const term=foldLatin(search.value);
      for(const group of Array.from(groupList.querySelectorAll<HTMLDetailsElement>('.bank-grammar-group'))){
        const options=Array.from(group.querySelectorAll<HTMLElement>('.bank-grammar-option'));
        for(const opt of options)opt.hidden=!!term&&!foldLatin(opt.textContent??'').includes(term);
        group.hidden=!!term&&options.every(opt=>opt.hidden);
        if(term&&!group.hidden)group.open=true;
      }
    }
    search.addEventListener('input',filter);filter();
  }
  function refreshReview():void{
    const {text,corpus}=bind.current();
    const tags=allGrammarTags(corpus);
    const label=(id:string)=>tags.find(tag=>tag.id===id)?.label??id;
    review.replaceChildren(el('h4','','Propuestas de Collatinus'));
    const analyze=button(proposals===null?'Analizar texto':'Reanalizar texto',async()=>{
      if(busy)return;
      busy=true;analyze.disabled=true;
      try{
        review.append(el('p','small muted','Analizando…'));
        proposals=await bind.analyze();refreshReview();
      }catch(error){bind.notice('Collatinus no ha podido analizar el texto: '+String(error));
        refreshReview();}
      finally{busy=false;analyze.disabled=false;}
    });
    review.append(analyze);
    if(proposals===null){
      review.append(el('p','small muted',
        'Ninguna propuesta se incorpora automáticamente. Examina y confirma las que correspondan.'));
      return;
    }
    if(!proposals.length){
      review.append(el('p','small muted','No hay propuestas automáticas reconocibles en este pasaje.'));
      return;
    }
    const decisions=text.bankGrammarDecisions??[];
    const pending=proposals.filter(p=>!decisionFor(decisions,p));
    const count=el('p','small muted',pending.length+' pendientes · '+
      (proposals.length-pending.length)+' revisadas');
    review.append(count);
    // Las propuestas pendientes se presentan primero, sin ocultar las decisiones anteriores.
    const ordered=[...pending,...proposals.filter(p=>decisionFor(decisions,p))];
    const checked=new Map<string,string>();
    const acceptSelected=button('Aceptar seleccionadas',async()=>{
      if(!checked.size)return;
      const selection=[...checked];
      for(const [id,tagId] of selection){
        const proposal=proposals?.find(p=>key(p)===id);
        if(proposal)await bind.decide(proposal,tagId);
      }
      refreshManual();refreshReview();
    });
    acceptSelected.disabled=true;review.append(acceptSelected);
    for(const proposal of ordered){
      const stored=decisionFor(decisions,proposal);
      const status=stored?.status==='accepted'?'Confirmada':stored?.status==='rejected'?'Descartada':'Pendiente';
      const card=el('article','bank-grammar-candidate');
      card.dataset.state=stored?.status??'pending';
      card.append(el('strong','',text.latin.slice(proposal.start,proposal.end)+' · '+label(proposal.tagId)));
      card.append(el('span','bank-grammar-state',status));
      if(proposal.syntaxReview)card.append(el('p','small muted','Requiere revisión sintáctica.'));
      const details=el('details','bank-grammar-evidence');
      details.append(el('summary','','Ver análisis y evidencia'));
      details.append(el('p','',proposal.evidence.join(' / ')));
      if(proposal.alternatives.length)
        details.append(el('p','','Lecturas alternativas: '+proposal.alternatives.join(' / ')));
      card.append(details);
      if(!stored){
        const choices=el('div','bank-grammar-candidate-actions');
        const select=el('select');select.setAttribute('aria-label','Etiqueta para '+text.latin.slice(proposal.start,proposal.end));
        for(const tag of tags){
          const option=el('option','',tag.label);option.value=tag.id;select.append(option);
        }
        select.value=proposal.tagId;
        const choose=el('label','bank-grammar-select');
        const box=el('input');box.type='checkbox';box.setAttribute('aria-label','Seleccionar propuesta '+key(proposal));
        box.addEventListener('change',()=>{
          if(box.checked)checked.set(key(proposal),select.value);
          else checked.delete(key(proposal));
          acceptSelected.disabled=!checked.size;
        });
        select.addEventListener('change',()=>{if(box.checked)checked.set(key(proposal),select.value);});
        choose.append(box,el('span','','Seleccionar'));
        choices.append(select,choose,button('Aceptar',async()=>{
          await bind.decide(proposal,select.value);refreshManual();refreshReview();
        }),button('Descartar',async()=>{
          await bind.decide(proposal,null);refreshReview();
        }));
        card.append(choices);
      }
      review.append(card);
    }
  }
  root.append(manual,review);
  refreshManual();refreshReview();return root;
}

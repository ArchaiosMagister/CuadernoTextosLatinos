import {foldLatin} from './library.js';

export interface CollatinusGrammarCandidate {
  lid:number;
  lemma:string;
  im:string;
  pos:string;
  morphos:string[];
}
export interface CollatinusGrammarToken {
  w:string;
  s:number;
  e:number;
  sent:number;
  pb:string;
  sel?:{lid:number;morpho:string}|null;
  cands?:CollatinusGrammarCandidate[];
  group?:number[];
}
export interface CollatinusGrammarProposal {
  start:number;
  end:number;
  tagId:string;
  evidence:string[];
  alternatives:string[];
  syntaxReview:boolean;
}
const pronouns:Record<string,string>={
  ipse:'enfatico',idem:'identidad',hic:'proximo',iste:'medio',ille:'lejano',
};
function readings(token:CollatinusGrammarToken):string[]{
  return (token.cands??[]).flatMap(c=>c.morphos.map(m=>c.lemma+' · '+(m||c.im||c.pos)));
}
function selected(token:CollatinusGrammarToken):CollatinusGrammarCandidate|undefined{
  return token.cands?.find(c=>c.lid===token.sel?.lid&&c.morphos.includes(token.sel.morpho));
}
function deponent(candidate:CollatinusGrammarCandidate):boolean{
  return /\b(?:dep\.(?=\s|$|[,;])|deponente\b)/u.test(candidate.im)
    || (foldLatin(candidate.lemma.split(',')[0]!).endsWith('r')&&/\bsum\b/u.test(candidate.im));
}
const finite=(description:string)=>/\b(?:indicativo|subjuntivo|imperativo)\b/u.test(description);

/** Propuestas trazables al léxico y los análisis del motor publicado. */
export function proposeCollatinusGrammar(latin:string,tokens:readonly CollatinusGrammarToken[]):CollatinusGrammarProposal[]{
  const proposals=new Map<string,CollatinusGrammarProposal>();
  const aligned=(t:CollatinusGrammarToken)=>Number.isSafeInteger(t.s)&&Number.isSafeInteger(t.e)
    &&t.s>=0&&t.e>t.s&&latin.slice(t.s,t.e)===t.w;
  function add(first:CollatinusGrammarToken,last:CollatinusGrammarToken,tagId:string,
    evidence:string,alternatives:string[],syntaxReview=false):void{
    if(!aligned(first)||!aligned(last)||first.s>last.s||first.sent!==last.sent)return;
    const key=[first.s,last.e,tagId].join(':');
    let proposal=proposals.get(key);
    if(!proposal){
      proposal={start:first.s,end:last.e,tagId,evidence:[],alternatives,syntaxReview};
      proposals.set(key,proposal);
    }
    if(!proposal.evidence.includes(evidence))proposal.evidence.push(evidence);
  }
  for(const [index,token] of tokens.entries()){
    const alternatives=[...new Set(readings(token))];
    for(const candidate of token.cands??[]){
      const dep=candidate.pos.includes('v')&&deponent(candidate);
      for(const morph of candidate.morphos){
        const evidence=candidate.lemma+' · '+(morph||candidate.im||candidate.pos);
        const tag=(id:string)=>add(token,token,'gram.'+id,evidence,alternatives.filter(r=>r!==evidence));
        const lemma=foldLatin(candidate.lemma.split(',')[0]!);
        if(candidate.pos.includes('p')){
          if(/pron\. rel\./u.test(candidate.im))tag('pron.relativo');
          const pronoun=pronouns[lemma];
          if(pronoun)tag('pron.'+pronoun);
        }
        if(!candidate.pos.includes('v'))continue;
        if(dep)tag('deponente');
        const infinitive=/^infinitivo de (presente|perfecto|futuro) (activo|pasivo)\b/u.exec(morph);
        if(infinitive){
          tag('inf.'+infinitive[1]);
          if(!dep||infinitive[2]==='activo')tag('inf.'+infinitive[2]);
        }
        if(/\bsubjuntivo\b/u.test(morph))tag('subjuntivo');
        if(!dep&&/\bpasivo\b/u.test(morph)&&(finite(morph)||infinitive))tag('voz.pasiva');
        if(morph.startsWith('participio de presente activo:'))tag('part.presente.activo');
        if(morph.startsWith('participio de futuro activo:'))tag('part.futuro.activo');
        if(morph.startsWith('participio de perfecto pasivo:'))tag(dep?'part.perfecto.deponente':'part.perfecto.pasivo');
        if(dep&&morph.startsWith('participio de perfecto activo:'))tag('part.perfecto.deponente');
      }
    }

    const candidate=selected(token);
    if(!candidate||!token.sel)continue;
    const morph=token.sel.morpho;
    const lemma=foldLatin(candidate.lemma.split(',')[0]!);
    // El motor agrupa por cercanía. Exigimos adyacencia y concordancia adicional.
    const aux=tokens[index+1];
    if(aux&&token.group?.includes(index+1)&&selected(aux)&&aux.sel
      &&foldLatin(selected(aux)!.lemma)==='sum'&&aux.pb===''&&aux.sent===token.sent){
      const auxMorph=aux.sel.morpho;
      const kind=/^participio de (perfecto pasivo|futuro activo): (nominativo|acusativo)/u.exec(morph);
      const evidence=candidate.lemma+' · '+morph+' + sum · '+auxMorph+' (formas adyacentes)';
      const other=[...alternatives,...readings(aux)];
      if(kind&&!deponent(candidate)){
        if(kind[2]==='nominativo'&&kind[1]==='perfecto pasivo'&&finite(auxMorph)
          &&['singular','plural'].some(number=>morph.endsWith(number)&&auxMorph.endsWith(number)))
          add(token,aux,'gram.voz.pasiva',evidence,other,true);
        if(/^infinitivo de presente activo$/u.test(auxMorph)){
          add(token,aux,kind[1]==='futuro activo'?'gram.inf.futuro':'gram.inf.perfecto',evidence,other,true);
          add(token,aux,kind[1]==='futuro activo'?'gram.inf.activo':'gram.inf.pasivo',evidence,other,true);
        }
      }
    }

    if(!candidate.pos.includes('c'))continue;
    const conditional=['si','nisi','sin'].includes(lemma);
    if(lemma!=='ut'&&!conditional)continue;
    const following=tokens.slice(index+1,index+9);
    const boundary=following.findIndex(t=>t.pb!==''||t.sent!==token.sent);
    const clause=boundary===-1?following:following.slice(0,boundary);
    const verb=clause.find(t=>selected(t)?.pos.includes('v')&&finite(t.sel?.morpho??''));
    if(verb?.sel){
      add(token,verb,conditional?'gram.condicional':'gram.ut',
        candidate.lemma+' · '+candidate.im+'; verbo finito '+verb.w+' · '+verb.sel.morpho,
        [...alternatives,...readings(verb)],true);
    }
  }
  return [...proposals.values()].sort((a,b)=>a.start-b.start||a.end-b.end||a.tagId.localeCompare(b.tagId));
}

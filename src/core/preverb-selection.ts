/**
 * Dos bases para modificación preverbial: 3 derivados + 2 derivados.
 * El banco docente es la fuente de derivaciones (no se inventan derivadas).
 * La coincidencia con una forma del pasaje es una preferencia heurística;
 * las formas ambiguas no se hacen pasar por lematización verificada.
 */
import type {TeacherAcademicSourceSnapshotV1} from './academic-teacher-adapter.js';

export interface PreverbSelection {
  readonly sourceKeys:readonly string[];
  readonly forms:readonly [string,string];
  readonly source:'passage'|'mixed'|'bank';
}
interface Base {
  prompt:string; enunciado:string; key:string; derivatives:readonly string[];
  perfectStem:string|null;
}
const normalize=(x:string)=>x.normalize('NFC').toLocaleLowerCase('es')
  .replace(/[āă]/gu,'a').replace(/[ēĕ]/gu,'e').replace(/[īĭ]/gu,'i')
  .replace(/[ōŏ]/gu,'o').replace(/[ūŭ]/gu,'u');
const tokenPattern=/[\p{L}\p{M}]+/gu;
const perfectEndings=['erunt','ere','eram','eras','erat','eramus','eratis','erant',
  'ero','eris','erit','erimus','eritis','erint','isti','istis','imus','it','i'];
const unique=<T>(values:readonly T[]):T[]=>[...new Set(values)];
function perfectStem(prompt:string,enunciado:string):string|null{
  const parts=enunciado.split(',').map(x=>normalize(x).trim());
  if(parts.length<3)return null;
  let perfect=parts[2]!;
  if(perfect==='—'||perfect==='-'||!perfect.endsWith('i'))return null;
  if(perfect.startsWith('-')){
    // Enunciados con perfecto abreviado: struo, -ere, -uxi => struxi.
    // Solo se reconstruye en el patrón -uo + -uxi documentado.
    if(!prompt.endsWith('uo')||!perfect.startsWith('-ux'))return null;
    perfect=prompt.slice(0,-2)+perfect.slice(1);
  }
  return /^[a-z]+i$/u.test(perfect)?perfect.slice(0,-1):null;
}
function bases(snapshot:TeacherAcademicSourceSnapshotV1):Base[]{
  return snapshot.preverbs.filter(x=>x.derivatives.length>=2).map(x=>({
    prompt:normalize(x.prompt),enunciado:x.enunciado,
    key:x.ambiguousPrompt?x.enunciado:x.prompt,
    derivatives:unique(x.derivatives.map(normalize)),
    perfectStem:perfectStem(normalize(x.prompt),x.enunciado),
  }));
}
function matchedToken(base:Base,word:string):boolean{
  const lemmas=[base.prompt,...base.derivatives];
  if(lemmas.includes(word))return true;
  if(!base.perfectStem)return false;
  for(const lemma of lemmas){
    // Un derivado como succedo + cessi genera el radical success-.
    // Se coteja la forma completa (no basta una coincidencia de prefijo).
    const prefix=lemma.endsWith(base.prompt)?lemma.slice(0,-base.prompt.length):'';
    const stem=prefix+base.perfectStem;
    if(perfectEndings.some(ending=>word===stem+ending))return true;
  }
  return false;
}
function rankedPassageBases(snapshot:TeacherAcademicSourceSnapshotV1,latin:string):{
  base:Base;word:string;
}[]{
  const words=unique([...latin.matchAll(tokenPattern)].map(x=>normalize(x[0]!)));
  const all=bases(snapshot);
  const result:{base:Base;word:string}[]=[];
  for(const word of words){
    // Primero coincidencia exacta; si la forma es compartida por bases
    // distintas, no imponemos una lematización arbitraria.
    const exact=all.filter(b=>[b.prompt,...b.derivatives].includes(word));
    const matches=exact.length?exact:all.filter(b=>matchedToken(b,word));
    if(matches.length===1&&!result.some(r=>r.base.key===matches[0]!.key))
      result.push({base:matches[0]!,word});
  }
  return result;
}
export function choosePreverbBases(snapshot:TeacherAcademicSourceSnapshotV1,
  latin:string,random=Math.random):PreverbSelection{
  const available=bases(snapshot);
  if(available.length<2)throw new Error('Se necesitan al menos dos bases documentadas.');
  const chosen:{base:Base;word:string;fromPassage:boolean}[]=[];
  const fromText=rankedPassageBases(snapshot,latin);
  // Para la primera base hacen falta tres derivados; para la segunda dos.
  for(const minimum of [3,2]){
    const found=fromText.find(x=>x.base.derivatives.length>=minimum&&
      !chosen.some(c=>c.base.key===x.base.key));
    if(found){chosen.push({...found,fromPassage:true});continue;}
    const candidates=available.filter(x=>x.derivatives.length>=minimum&&
      !chosen.some(c=>c.base.key===x.key));
    const draw=Math.max(0,Math.min(candidates.length-1,Math.floor(random()*candidates.length)));
    const base=candidates[draw]!;
    chosen.push({base,word:base.prompt,fromPassage:false});
  }
  const a=chosen[0]!,b=chosen[1]!;
  return {
    sourceKeys:[a.base.key,a.base.key,a.base.key,b.base.key,b.base.key],
    forms:[a.word,b.word],
    source:a.fromPassage&&b.fromPassage?'passage':a.fromPassage||b.fromPassage?'mixed':'bank',
  };
}
export function preverbStatement([first,second]:readonly [string,string]):string{
  return 'Modificación preverbial a partir de *'+first+'* (3) y de *'+second+
    '* (2). Cinco derivados en total en lengua propia.';
}

// Ejecutar tras npm run build. Usa el motor y el léxico exactos del artefacto.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { proposeCollatinusGrammar } from '../dist/core/collatinus-grammar.js';

const context=vm.createContext({setTimeout,console,TextDecoder,TextEncoder,URL});
context.window=context;
for(const name of ['datos','incluidos','shim','motor']){
  const url=new URL('../dist/examinator-cuadernos/collatinus/'+name+'.js',import.meta.url);
  vm.runInContext(await readFile(url,'utf8'),context,{filename:name+'.js'});
}
await context.api.call('warm');
const latin='Venit. Cum amicis venit. Cum veniret, quod dicit auditur. Amatus est. Missi erant. Loquitur. '+
  'Amavisse dicit. Amaturum esse dicit. Si veniat. Rogat ut audiat. Amando discit. Liber legendus. Quid faciat nescio.';
const tokens=await context.api.call('analyze',{text:latin});
const proposals=proposeCollatinusGrammar(latin,tokens);
const has=(fragment,id)=>proposals.some(p=>latin.slice(p.start,p.end)===fragment&&p.tagId===id);
const venit=tokens[0].cands.flatMap(c=>c.morphos);
assert.ok(venit.some(m=>m.startsWith('presente de indicativo')));
assert.ok(venit.some(m=>m.startsWith('perfecto de indicativo')));
assert.ok(tokens.filter(t=>t.w==='Cum').every(t=>t.cands.some(c=>c.pos.includes('r'))&&t.cands.some(c=>c.pos==='c')));
assert.ok(has('quod','gram.pron.relativo'));
assert.ok(has('Amatus est','gram.voz.pasiva'));
assert.ok(has('Missi erant','gram.voz.pasiva'));
assert.ok(has('Loquitur','gram.deponente'));
assert.ok(!has('Loquitur','gram.voz.pasiva'));
assert.ok(has('Amavisse','gram.inf.perfecto'));
assert.ok(has('Amaturum esse','gram.inf.futuro'));
assert.ok(has('Si veniat','gram.condicional'));
assert.ok(has('ut audiat','gram.ut'));
const manualTags=['gram.gerundio','gram.gerundivo','gram.interrogativa.indirecta'];
assert.ok(!proposals.some(p=>manualTags.includes(p.tagId)));
console.log('Collatinus integrado: '+tokens.length+' tokens y '+proposals.length+' propuestas verificadas.');

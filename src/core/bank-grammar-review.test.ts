import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCorpus} from './model.js';
import {upsertText} from './editor-operations.js';
import {validateCorpus} from './validation.js';
import {attachGrammarTags} from './grammar-tags.js';

const at='2026-11-19T20:00:00.000Z';
const source={title:'Texto',latin:'Amatus est.',author:'',work:'',reference:''};
function ready(){
  return upsertText(emptyCorpus(),source,'bank.tag01',at);
}
test('se guardan aceptaciones y descartes en el banco, y sobreviven al JSON',()=>{
  const base=ready();
  const tagged=attachGrammarTags(base,'bank.tag01',['gram.voz.pasiva']);
  const decisions=[
    {startUtf16:0,endUtf16:6,exact:'Amatus',tagId:'gram.voz.pasiva',
      status:'accepted' as const,chosenTagId:'gram.voz.pasiva'},
    {startUtf16:7,endUtf16:10,exact:'est',tagId:'gram.inf.presente',
      status:'rejected' as const,chosenTagId:null},
  ];
  const saved=validateCorpus({...tagged,texts:tagged.texts.map(t=>({
    ...t,bankGrammarDecisions:decisions,
  }))});
  const restored=validateCorpus(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.texts[0]?.bankGrammarDecisions,decisions);
  assert.deepEqual(restored.texts[0]?.tagIds,['gram.voz.pasiva']);
});
test('la validación descarta propuestas que ya no corresponden al pasaje',()=>{
  const base=ready(),one=base.texts[0]!;
  assert.throws(()=>validateCorpus({...base,texts:[{...one,bankGrammarDecisions:[{
    startUtf16:0,endUtf16:6,exact:'Amatur',tagId:'gram.voz.pasiva',
    status:'accepted',chosenTagId:'gram.voz.pasiva',
  }]}]}),/la lectura no coincide/);
  assert.throws(()=>validateCorpus({...base,texts:[{...one,bankGrammarDecisions:[{
    startUtf16:0,endUtf16:6,exact:'Amatus',tagId:'gram.voz.pasiva',
    status:'rejected',chosenTagId:'gram.voz.pasiva',
  }]}]}),/un descarte no puede/);
});
test('editar el texto original invalida decisiones anteriores, sin eliminarlas de otros textos',()=>{
  const base=ready();
  const input=validateCorpus({...base,texts:base.texts.map(t=>({
    ...t,bankGrammarDecisions:[{startUtf16:0,endUtf16:6,exact:'Amatus',
      tagId:'gram.voz.pasiva',status:'rejected' as const,chosenTagId:null}],
  }))});
  const changed=upsertText(input,{...source,id:'bank.tag01',latin:'Amatus erat.'},
    'ignored',at);
  assert.equal(changed.texts[0]?.bankGrammarDecisions,undefined);
});

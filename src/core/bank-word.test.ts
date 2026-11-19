import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyCorpus} from './model.js';
import {upsertText} from './editor-operations.js';
import {validateCorpus} from './validation.js';
import type {ParsedTeacherDocx} from './docx-import.js';

const now='2026-11-19T19:00:00.000Z';
const doc:ParsedTeacherDocx={
  title:'Pasaje de prueba',author:'César',work:'Bellum Gallicum',reference:'I 1',
  latin:'Gallia est omnis divisa.',underlines:[{startUtf16:0,endUtf16:6,exact:'Gallia'}],
  vocabulary:[{headword:'Gallia, -ae',meaning:'Galia'}],
  lexical:{preverb:[],phonetics:['fabam'],prefix:[],latinism:['alma mater']},
  preverbBases:null,warnings:[],
};
test('el banco guarda el documento completo y el JSON lo restaura con sus marcas',()=>{
  const saved=upsertText(emptyCorpus(),{
    title:doc.title,author:doc.author??'',work:doc.work??'',
    reference:doc.reference??'',latin:doc.latin,teacherDocument:doc,
  },'bank.word1',now);
  const restored=validateCorpus(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.texts[0]?.teacherDocument,doc);
  assert.equal(restored.texts[0]?.latin,doc.latin);
});
test('se rechazan metadatos Word manipulados y subrayados ajenos al texto',()=>{
  const stored=upsertText(emptyCorpus(),{
    title:doc.title,author:'',work:'',reference:'',latin:doc.latin,teacherDocument:doc,
  },'bank.word2',now);
  const tampered=structuredClone(stored);
  tampered.texts[0]!.teacherDocument!.underlines[0]!.exact='Galliae';
  assert.throws(()=>validateCorpus(tampered),/subrayado no coincide/);
});
test('editar el latín de una fuente invalida sus subrayados Word previos',()=>{
  const first=upsertText(emptyCorpus(),{
    title:doc.title,author:'',work:'',reference:'',latin:doc.latin,teacherDocument:doc,
  },'bank.word3',now);
  const next=upsertText(first,{
    id:'bank.word3',title:doc.title,author:'',work:'',reference:'',
    latin:'Gallia dividitur.',
  },'unused',now);
  assert.equal(next.texts[0]?.teacherDocument,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { createEdition, createPlacement } from '../core/edition-factory.js';
import { fingerprintForMark } from '../core/edition-validation.js';
import { createNotebookDocx, exportQuestionHeading, notebookExportWarnings } from './notebook-documents.js';
import { zipStore } from './zip-store.js';

const at='2026-11-15T15:00:00.000Z';
function fixture(){
  let index=0;
  const id=()=> 'item.'+(++index);
  const p=createPlacement({
    id:'place.1',title:'Los helvecios acumulan su equipaje',
    latin:'Rōma et Rōma, ăcĭes.',author:'Julio César',work:'De bello Gallico',
    reference:'I 24',
    source:{kind:'manual',sourceId:null,urn:null,importedAt:at},
  },id);
  p.text.markup.push({
    id:'mark.1',kind:'morph-underline',startUtf16:0,endUtf16:4,exact:'Rōma',
    textFingerprint:fingerprintForMark(p.text.latin,0,4),reviewRequired:false,
  });
  p.vocabulary.push({
    id:'voc.1',lemma:'acies',headword:'ăcĭes, –ēī',meaning:'línea de batalla',note:null,
    included:true,order:0,provenance:null,reviewState:'manual',origin:'manual',locked:true,
  });
  return createEdition({id:'ed.1',legacyNotebookId:null,title:'Cuaderno de César',
    timestamp:at,placements:[p]});
}
function files(bytes:Uint8Array):Map<string,string>{
  const decoder=new TextDecoder(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const result=new Map<string,string>();let position=0;
  while(position+30<=bytes.length&&view.getUint32(position,true)===0x04034b50){
    const method=view.getUint16(position+8,true);
    assert.equal(method,0,'sin compresión externa');
    const length=view.getUint32(position+18,true);
    const nameLength=view.getUint16(position+26,true),extra=view.getUint16(position+28,true);
    const path=decoder.decode(bytes.slice(position+30,position+30+nameLength));
    const begin=position+30+nameLength+extra;
    const content=decoder.decode(bytes.slice(begin,begin+length));
    result.set(path,content);position=begin+length;
  }
  assert.equal(view.getUint32(position,true),0x02014b50,'directorio central');
  return result;
}
function validXml(text:string){
  let error='';
  const document=new DOMParser({errorHandler:{warning:()=>{},error:(m)=>{error+=m;},fatalError:(m)=>{error+=m;}}})
    .parseFromString(text,'text/xml');
  assert.equal(error,'');
  assert.ok(document.documentElement);
}
test('ZIP STORE es autónomo, acepta UTF-8 y escribe directorio central',()=>{
  const archive=zipStore([{path:'datos.xml',content:'<r>Rōma, æ, œ</r>'}]);
  const entries=files(archive);
  assert.equal(entries.get('datos.xml'),'<r>Rōma, æ, œ</r>');
  assert.equal(new DataView(archive.buffer,archive.byteOffset,4).getUint32(0,true),0x04034b50);
});
test('DOCX produce un paquete OOXML legible, con fuentes y número de páginas',()=>{
  const doc=fixture(),bytes=createNotebookDocx(doc),entries=files(bytes);
  for(const path of ['[Content_Types].xml','_rels/.rels','word/document.xml',
    'word/_rels/document.xml.rels','word/footer1.xml','word/styles.xml','word/settings.xml','docProps/core.xml']){
    assert.ok(entries.has(path),path);
    validXml(entries.get(path)!);
  }
  const xml=entries.get('word/document.xml')!;
  assert.match(xml,/Los helvecios acumulan su equipaje/);
  assert.match(xml,/De bello Gallico/);
  assert.match(xml,/Rōma/);
  assert.match(xml,/ăcĭes, –ēī/);
  assert.match(xml,/línea de batalla/);
  assert.match(xml,/w:u w:val="single"/);
  assert.match(xml,/w:i\/>/);
  assert.match(xml,/Elige dos de estas cuatro preguntas \(2p\.\):/);
  assert.match(xml,/w:w="11906" w:h="16838"/);
  assert.match(xml,/<w:tblW w:w="\d+" w:type="dxa"\/>/);
  assert.match(xml,/<w:tblGrid><w:gridCol w:w="\d+"\/><\/w:tblGrid>/);
  assert.match(xml,/<w:t xml:space="preserve">Vocabulario<\/w:t>/);
  assert.match(xml,/<w:pPr><w:keepNext\/><w:keepLines\/>/);
  assert.match(entries.get('word/footer1.xml')!,/NUMPAGES/);
  assert.match(entries.get('word/footer1.xml')!,/PAGE/);
  assert.equal((xml.match(/w:pageBreakBefore/g)??[]).length,0);
});
test('Cada texto posterior empieza en nueva página sin modificar la edición',()=>{
  const edition=fixture(),original=JSON.stringify(edition);
  edition.placements.push({...structuredClone(edition.placements[0]!),id:'place.2',
    text:{...structuredClone(edition.placements[0]!.text),title:'Segundo texto',markup:[]},
    vocabulary:[],questions:edition.placements[0]!.questions.map(q=>({...q,id:q.id+'.2'}))});
  // Los IDs de las opciones también deben ser únicos en la aparición nueva.
  const second=edition.placements[1]!;
  second.questions=second.questions.map(q=>q.kind==='choice'?{
    ...q,options:q.options.map(o=>({...o,id:o.id+'.2',slots:[]})),
  }:q);
  const contents=files(createNotebookDocx(edition)).get('word/document.xml')!;
  assert.equal((contents.match(/w:pageBreakBefore/g)??[]).length,1);
  assert.equal((contents.match(/w:pgSz/g)??[]).length,1);
  assert.equal(JSON.stringify(fixture()),original);
});
test('El número de apartados modifica solo el rótulo y nunca reajusta los puntos',()=>{
  const edition=fixture(),q=edition.placements[0]!.questions.find(q=>q.kind==='choice')!;
  assert.equal(exportQuestionHeading(q,true),'Elige dos de estas cuatro preguntas (2p.):');
  if(q.kind!=='choice')throw new Error('Plantilla inesperada');
  q.options[3]!.enabled=false;
  assert.equal(exportQuestionHeading(q,true),'Elige dos de estas tres preguntas (2p.):');
  assert.equal(q.pointsHundredths,200);
});
test('La exportación reporta observaciones académicas sin modificar ni ocultar textos',()=>{
  const edition=fixture(),snapshot=JSON.stringify(edition);
  assert.ok(notebookExportWarnings(edition).some(x=>x.includes('Faltan palabras')));
  createNotebookDocx(edition);
  assert.equal(JSON.stringify(edition),snapshot);
});

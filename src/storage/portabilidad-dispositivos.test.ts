import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {WorkspaceRepository,WorkspaceConflictError} from './workspace-repository.js';
import {createWorkspaceBackup,readWorkspaceBackup} from './workspace-backup.js';
import {createEdition,createPlacement} from '../core/edition-factory.js';
import {validateEdition} from '../core/edition-validation.js';
import {emptyCorpus} from '../core/model.js';

const at='2026-11-20T12:00:00.000Z';
const img="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD2aiiigD//2Q==";
function makeEdition(id:string){
  const text=createPlacement({
    id:'p.1',title:'Los helvecios',latin:'Helvetii ex finibus suis exeunt.',
    author:'Caesar',work:'De bello Gallico',reference:'I, 2',
    source:{kind:'manual',sourceId:null,urn:null,importedAt:at},
  },()=> 'id.'+Math.random().toString(36).slice(2));
  return validateEdition({...createEdition({
    id,legacyNotebookId:null,title:'Cuaderno de Latín II',timestamp:at,
    placements:[text],
  }),cover:{
    title:'CUADERNO DE LATÍN II',subtitle:'Textos latinos',course:'2026-2027',
    studentLabel:'NOMBRE Y APELLIDOS:',groupLabel:'GRUPO:',
    imageDataUrl:img,imageCredit:'Prueba propia',colorMode:'gray',reflection:true,
  }});
}
test('Mac a iPad: copia íntegra transferida entre bases independientes sin perder portada ni referencias',async()=>{
  const mac=new WorkspaceRepository('test-portability-mac-'+crypto.randomUUID());
  const ipad=new WorkspaceRepository('test-portability-ipad-'+crypto.randomUUID());
  const edition=makeEdition('ed.portable');
  await mac.commitEdition(edition.id,0,
    {command:'create',targetId:edition.id,timestamp:at},()=>edition);
  const historical={...emptyCorpus(),texts:[{
    id:'txt.historical',title:'Texto histórico',latin:'Arma virumque cano.',
    source:{author:'Vergilius',work:'Aeneis',reference:'I, 1'},
    tagIds:[],createdAt:at,updatedAt:at,
  }]};
  const json=await createWorkspaceBackup(mac,new Date(at),historical);
  const verified=await readWorkspaceBackup(json);
  assert.equal(verified.preview.notebookCount,1);
  assert.equal(verified.preview.corpusTextCount,1);
  await ipad.replaceFromVerifiedSnapshot(verified.snapshot,0,true);
  const actual=await ipad.loadEdition(edition.id);
  assert.deepEqual(actual?.edition,edition);
  assert.match(actual!.edition.cover!.imageDataUrl,/^data:image\/jpeg;base64,/);
  assert.equal(actual!.edition.placements[0]!.text.reference,'I, 2');
  const corpus=await ipad.loadCorpus();
  assert.equal(corpus.corpus.texts[0]!.latin,'Arma virumque cano.');
  const back=await createWorkspaceBackup(ipad,new Date(at));
  const returned=await readWorkspaceBackup(back);
  assert.deepEqual(returned.snapshot.editions[0]!.edition,edition);
});
test('restauración con revisión caducada no sobrescribe el cuaderno que ya está en el iPad',async()=>{
  const mac=new WorkspaceRepository('test-portability-conflict-mac-'+crypto.randomUUID());
  const ipad=new WorkspaceRepository('test-portability-conflict-ipad-'+crypto.randomUUID());
  const edition=makeEdition('ed.original');
  await mac.commitEdition(edition.id,0,{command:'create',targetId:edition.id,timestamp:at},()=>edition);
  const file=await createWorkspaceBackup(mac,new Date(at));
  const verified=await readWorkspaceBackup(file);
  await ipad.commitEdition('ed.local',0,{command:'create',targetId:'ed.local',timestamp:at},
    ()=>makeEdition('ed.local'));
  await assert.rejects(ipad.replaceFromVerifiedSnapshot(verified.snapshot,0,true),
    (error:unknown)=>error instanceof WorkspaceConflictError);
  assert.ok(await ipad.loadEdition('ed.local'));
  assert.equal(await ipad.loadEdition('ed.original'),null);
});
test('los datos manipulados de la copia JSON no pueden restaurarse',async()=>{
  const mac=new WorkspaceRepository('test-portability-tamper-'+crypto.randomUUID());
  const edition=makeEdition('ed.verified');
  await mac.commitEdition(edition.id,0,{command:'create',targetId:edition.id,timestamp:at},()=>edition);
  const json=await createWorkspaceBackup(mac,new Date(at));
  const altered=json.replace('Cuaderno de Latín II','Cuaderno manipulado');
  assert.notEqual(altered,json);
  await assert.rejects(readWorkspaceBackup(altered));
});

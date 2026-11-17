import test from 'node:test';
import assert from 'node:assert/strict';
import {quotedMeaning} from './vocabulary-format.js';

test('comillas sencillas tipográficas por defecto y sin alterar la entrada editable',()=>{
  const text='línea de batalla';
  assert.equal(quotedMeaning(text),'‘línea de batalla’');
  assert.equal(text,'línea de batalla');
});
test('sin duplicar comillas que el docente haya introducido',()=>{
  for(const x of ['‘falange’','“falange”','«falange»',"'falange'",'"falange"']){
    assert.equal(quotedMeaning(x),x);
  }
  assert.equal(quotedMeaning('  ‘campo’  '),'‘campo’');
  assert.equal(quotedMeaning(null),null);
  assert.equal(quotedMeaning(''),null);
});

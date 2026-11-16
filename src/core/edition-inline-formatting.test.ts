import test from 'node:test';
import assert from 'node:assert/strict';
import {splitInlineItalics} from './edition-inline-formatting.js';

test('cursivas de palabras latinas dentro del enunciado sin HTML ni pérdida textual',()=>{
  assert.deepEqual(splitInlineItalics('a partir de *instruxit* (3) y de *successerunt* (2).'),[
    {text:'a partir de ',italic:false},{text:'instruxit',italic:true},
    {text:' (3) y de ',italic:false},{text:'successerunt',italic:true},
    {text:' (2).',italic:false},
  ]);
  assert.deepEqual(splitInlineItalics('Texto sin cursiva'),[{text:'Texto sin cursiva',italic:false}]);
  assert.deepEqual(splitInlineItalics('*incompleto'),[{text:'*incompleto',italic:false}]);
});

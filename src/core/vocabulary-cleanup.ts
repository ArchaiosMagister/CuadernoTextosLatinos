import type {VocabularyEntryV1} from './edition-model.js';

/** Identifica solo el residuo de la antigua lematización global sin glosas.
 * Nunca se eliminan entradas manuales, bloqueadas, documentadas ni anotadas.
 */
export function isUnreviewedAutoVocabulary(entry:VocabularyEntryV1):boolean{
  return entry.origin==='generated'&&entry.reviewState==='needs-review'&&
    !entry.locked&&entry.provenance===null&&
    !entry.meaning?.trim()&&!entry.note?.trim();
}

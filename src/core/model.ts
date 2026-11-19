/** Modelo persistido. No se introduce aún ninguna operación de edición. */
import type {ParsedTeacherDocx} from './docx-import.js';

export const CURRENT_SCHEMA_VERSION = 1 as const;

export interface TextSource {
  author: string | null;
  work: string | null;
  reference: string | null;
}

/** Revisión humana de propuestas por fragmento, conservada con el texto de origen. */
export interface BankGrammarDecision {
  startUtf16:number;
  endUtf16:number;
  exact:string;
  tagId:string;
  status:'accepted'|'rejected';
  chosenTagId:string|null;
}
export interface LatinText {
  id: string;
  title: string;
  latin: string;
  source: TextSource;
  /** Datos editoriales completos de un Word docente importado al banco. */
  teacherDocument?: ParsedTeacherDocx;
  /** Aceptaciones y descartes de Collatinus, sin atribución automática. */
  bankGrammarDecisions?: BankGrammarDecision[];
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Una etiqueta del catálogo y una personalizada son entidades distintas. */
export interface GrammarTag {
  id: string;
  label: string;
  kind: 'catalogue' | 'custom';
  parentId: string | null;
}

/** El orden de textIds determina el orden de los textos en el cuaderno. */
export interface Notebook {
  id: string;
  title: string;
  textIds: string[];
}

export interface CorpusV1 {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  texts: LatinText[];
  tags: GrammarTag[];
  notebooks: Notebook[];
}

export function emptyCorpus(): CorpusV1 {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, texts: [], tags: [], notebooks: [] };
}

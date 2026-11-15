import type { CorpusV1 } from '../core/model.js';

/** Contrato de persistencia; no existe todavía un adaptador de almacenamiento. */
export interface CorpusRepository {
  load(): Promise<CorpusV1 | null>;
  save(corpus: CorpusV1): Promise<void>;
}

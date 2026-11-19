import type { CorpusV1, LatinText, Notebook } from './model.js';
import { validateCorpus } from './validation.js';

export interface TextDraft {
  id?: string;
  title: string;
  latin: string;
  author: string;
  work: string;
  reference: string;
}
const nullText = (value: string): string | null => value.trim() || null;

export function upsertText(corpus: CorpusV1, draft: TextDraft, id: string, now: string): CorpusV1 {
  const previous = corpus.texts.find((entry) => entry.id === (draft.id || id));
  const entry: LatinText = {
    id: previous?.id ?? id,
    title: draft.title.trim(),
    latin: draft.latin.trim(),
    source: {
      author: nullText(draft.author),
      work: nullText(draft.work),
      reference: nullText(draft.reference),
    },
    tagIds: previous?.tagIds ?? [],
    createdAt: previous?.createdAt ?? now,
    updatedAt: previous && now < previous.createdAt ? previous.createdAt : now,
    ...(previous?.teacherDocx && previous.latin===draft.latin.trim()
      ? {teacherDocx:previous.teacherDocx} : {}),
  };
  const next = { ...corpus, texts: previous
    ? corpus.texts.map((item) => item.id === previous.id ? entry : item)
    : [...corpus.texts, entry],
  };
  return validateCorpus(next);
}

export function deleteText(corpus: CorpusV1, textId: string): CorpusV1 {
  const next: CorpusV1 = {
    ...corpus,
    texts: corpus.texts.filter((item) => item.id !== textId),
    notebooks: corpus.notebooks.map((book) => ({
      ...book,
      textIds: book.textIds.filter((id) => id !== textId),
    })),
  };
  return validateCorpus(next);
}

export function upsertNotebook(corpus: CorpusV1, name: string, id: string): CorpusV1 {
  const next: CorpusV1 = {
    ...corpus,
    notebooks: [...corpus.notebooks, { id, title: name.trim(), textIds: [] }],
  };
  return validateCorpus(next);
}

export function renameNotebook(corpus: CorpusV1, id: string, title: string): CorpusV1 {
  const next: CorpusV1 = {
    ...corpus,
    notebooks: corpus.notebooks.map((book) => book.id === id ? { ...book, title: title.trim() } : book),
  };
  return validateCorpus(next);
}

export function removeNotebook(corpus: CorpusV1, notebookId: string): CorpusV1 {
  return validateCorpus({
    ...corpus,
    notebooks: corpus.notebooks.filter((book) => book.id !== notebookId),
  });
}

/** Añade sin duplicar ni modificar el texto original: el orden de la lista es editorial. */
export function addTextToNotebook(corpus: CorpusV1, notebookId: string, textId: string): CorpusV1 {
  const next = {
    ...corpus,
    notebooks: corpus.notebooks.map((book) => book.id === notebookId && !book.textIds.includes(textId)
      ? { ...book, textIds: [...book.textIds, textId] }
      : book),
  };
  return validateCorpus(next);
}

export function removeTextFromNotebook(corpus: CorpusV1, notebookId: string, textId: string): CorpusV1 {
  const next = {
    ...corpus,
    notebooks: corpus.notebooks.map((book) => book.id === notebookId
      ? { ...book, textIds: book.textIds.filter((id) => id !== textId) }
      : book),
  };
  return validateCorpus(next);
}

export function moveTextInNotebook(corpus: CorpusV1, notebookId: string, textId: string, by: -1 | 1): CorpusV1 {
  const next = {
    ...corpus,
    notebooks: corpus.notebooks.map((book): Notebook => {
      if (book.id !== notebookId) return book;
      const current = book.textIds.indexOf(textId);
      const destination = current + by;
      if (current < 0 || destination < 0 || destination >= book.textIds.length) return book;
      const ids = [...book.textIds];
      [ids[current], ids[destination]] = [ids[destination]!, ids[current]!];
      return { ...book, textIds: ids };
    }),
  };
  return validateCorpus(next);
}

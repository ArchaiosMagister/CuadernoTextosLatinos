import { validateCorpus } from './validation.js';
const nullText = (value) => value.trim() || null;
export function upsertText(corpus, draft, id, now) {
    const previous = corpus.texts.find((entry) => entry.id === (draft.id || id));
    const entry = {
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
    };
    const next = { ...corpus, texts: previous
            ? corpus.texts.map((item) => item.id === previous.id ? entry : item)
            : [...corpus.texts, entry],
    };
    return validateCorpus(next);
}
export function deleteText(corpus, textId) {
    const next = {
        ...corpus,
        texts: corpus.texts.filter((item) => item.id !== textId),
        notebooks: corpus.notebooks.map((book) => ({
            ...book,
            textIds: book.textIds.filter((id) => id !== textId),
        })),
    };
    return validateCorpus(next);
}
export function upsertNotebook(corpus, name, id) {
    const next = {
        ...corpus,
        notebooks: [...corpus.notebooks, { id, title: name.trim(), textIds: [] }],
    };
    return validateCorpus(next);
}
export function renameNotebook(corpus, id, title) {
    const next = {
        ...corpus,
        notebooks: corpus.notebooks.map((book) => book.id === id ? { ...book, title: title.trim() } : book),
    };
    return validateCorpus(next);
}
export function removeNotebook(corpus, notebookId) {
    return validateCorpus({
        ...corpus,
        notebooks: corpus.notebooks.filter((book) => book.id !== notebookId),
    });
}
/** Añade sin duplicar ni modificar el texto original: el orden de la lista es editorial. */
export function addTextToNotebook(corpus, notebookId, textId) {
    const next = {
        ...corpus,
        notebooks: corpus.notebooks.map((book) => book.id === notebookId && !book.textIds.includes(textId)
            ? { ...book, textIds: [...book.textIds, textId] }
            : book),
    };
    return validateCorpus(next);
}
export function removeTextFromNotebook(corpus, notebookId, textId) {
    const next = {
        ...corpus,
        notebooks: corpus.notebooks.map((book) => book.id === notebookId
            ? { ...book, textIds: book.textIds.filter((id) => id !== textId) }
            : book),
    };
    return validateCorpus(next);
}
export function moveTextInNotebook(corpus, notebookId, textId, by) {
    const next = {
        ...corpus,
        notebooks: corpus.notebooks.map((book) => {
            if (book.id !== notebookId)
                return book;
            const current = book.textIds.indexOf(textId);
            const destination = current + by;
            if (current < 0 || destination < 0 || destination >= book.textIds.length)
                return book;
            const ids = [...book.textIds];
            [ids[current], ids[destination]] = [ids[destination], ids[current]];
            return { ...book, textIds: ids };
        }),
    };
    return validateCorpus(next);
}

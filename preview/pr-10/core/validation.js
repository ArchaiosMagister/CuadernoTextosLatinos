import { InvalidCorpusError } from './errors.js';
import { CURRENT_SCHEMA_VERSION, } from './model.js';
function invalid(path, detail) {
    throw new InvalidCorpusError(`${path}: ${detail}`);
}
function record(value, path, keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return invalid(path, 'se esperaba un objeto');
    }
    const item = value;
    for (const key of Object.keys(item)) {
        if (!keys.includes(key))
            invalid(`${path}.${key}`, 'campo desconocido');
    }
    for (const key of keys) {
        if (!Object.hasOwn(item, key))
            invalid(`${path}.${key}`, 'campo obligatorio ausente');
    }
    return item;
}
function nonBlank(value, path, max) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
        return invalid(path, `se esperaba texto no vacío de hasta ${max} caracteres`);
    }
    return value;
}
function nullableText(value, path) {
    return value === null ? null : nonBlank(value, path, 250);
}
function identifier(value, path) {
    const id = nonBlank(value, path, 120);
    if (id !== id.trim() || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id)) {
        return invalid(path, 'identificador inválido (usar letras ASCII, cifras, puntos, guiones o dos puntos)');
    }
    return id;
}
function timestamp(value, path) {
    if (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString() !== value) {
        return invalid(path, 'se esperaba una fecha UTC ISO 8601 válida');
    }
    return value;
}
function stringIds(value, path) {
    if (!Array.isArray(value))
        return invalid(path, 'se esperaba una lista');
    const result = value.map((entry, index) => identifier(entry, `${path}[${index}]`));
    if (new Set(result).size !== result.length)
        invalid(path, 'hay referencias repetidas');
    return result;
}
function source(value, path) {
    const data = record(value, path, ['author', 'work', 'reference']);
    return {
        author: nullableText(data.author, `${path}.author`),
        work: nullableText(data.work, `${path}.work`),
        reference: nullableText(data.reference, `${path}.reference`),
    };
}
function text(value, path) {
    const data = record(value, path, [
        'id', 'title', 'latin', 'source', 'tagIds', 'createdAt', 'updatedAt',
    ]);
    const createdAt = timestamp(data.createdAt, `${path}.createdAt`);
    const updatedAt = timestamp(data.updatedAt, `${path}.updatedAt`);
    if (updatedAt < createdAt)
        invalid(path, 'updatedAt es anterior a createdAt');
    return {
        id: identifier(data.id, `${path}.id`),
        title: nonBlank(data.title, `${path}.title`, 250),
        latin: nonBlank(data.latin, `${path}.latin`, 200_000),
        source: source(data.source, `${path}.source`),
        tagIds: stringIds(data.tagIds, `${path}.tagIds`),
        createdAt,
        updatedAt,
    };
}
function tag(value, path) {
    const data = record(value, path, ['id', 'label', 'kind', 'parentId']);
    if (data.kind !== 'catalogue' && data.kind !== 'custom') {
        invalid(`${path}.kind`, 'tipo de etiqueta no válido');
    }
    return {
        id: identifier(data.id, `${path}.id`),
        label: nonBlank(data.label, `${path}.label`, 160),
        kind: data.kind,
        parentId: data.parentId === null ? null : identifier(data.parentId, `${path}.parentId`),
    };
}
function notebook(value, path) {
    const data = record(value, path, ['id', 'title', 'textIds']);
    return {
        id: identifier(data.id, `${path}.id`),
        title: nonBlank(data.title, `${path}.title`, 250),
        textIds: stringIds(data.textIds, `${path}.textIds`),
    };
}
function uniqueIds(items, path) {
    const ids = new Set();
    for (const item of items) {
        if (ids.has(item.id))
            invalid(path, `identificador repetido: ${item.id}`);
        ids.add(item.id);
    }
}
function references(corpus) {
    const textIds = new Set(corpus.texts.map(({ id }) => id));
    const tagIds = new Set(corpus.tags.map(({ id }) => id));
    for (const entry of corpus.texts) {
        for (const id of entry.tagIds) {
            if (!tagIds.has(id))
                invalid(`texts.${entry.id}.tagIds`, `etiqueta inexistente: ${id}`);
        }
    }
    for (const book of corpus.notebooks) {
        for (const id of book.textIds) {
            if (!textIds.has(id))
                invalid(`notebooks.${book.id}.textIds`, `texto inexistente: ${id}`);
        }
    }
    const parents = new Map(corpus.tags.map(({ id, parentId }) => [id, parentId]));
    const state = new Map();
    function visit(id) {
        if (state.get(id) === 'visiting')
            invalid(`tags.${id}.parentId`, 'ciclo jerárquico');
        if (state.get(id) === 'done')
            return;
        state.set(id, 'visiting');
        const parent = parents.get(id);
        if (parent !== null && parent !== undefined) {
            if (!parents.has(parent))
                invalid(`tags.${id}.parentId`, `etiqueta padre inexistente: ${parent}`);
            visit(parent);
        }
        state.set(id, 'done');
    }
    for (const id of tagIds)
        visit(id);
}
/** Rechaza los datos inválidos antes de guardarlos o de importarlos. */
export function validateCorpus(input) {
    const data = record(input, 'corpus', ['schemaVersion', 'texts', 'tags', 'notebooks']);
    if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        invalid('corpus.schemaVersion', 'versión de esquema incompatible');
    }
    if (!Array.isArray(data.texts) || !Array.isArray(data.tags) || !Array.isArray(data.notebooks)) {
        invalid('corpus', 'texts, tags y notebooks deben ser listas');
    }
    const corpus = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        texts: data.texts.map((entry, index) => text(entry, `texts[${index}]`)),
        tags: data.tags.map((entry, index) => tag(entry, `tags[${index}]`)),
        notebooks: data.notebooks.map((entry, index) => notebook(entry, `notebooks[${index}]`)),
    };
    uniqueIds(corpus.texts, 'texts');
    uniqueIds(corpus.tags, 'tags');
    uniqueIds(corpus.notebooks, 'notebooks');
    references(corpus);
    return corpus;
}

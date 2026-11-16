import { InvalidCorpusError, UnsupportedSchemaVersionError } from './errors.js';
import { CURRENT_SCHEMA_VERSION } from './model.js';
import { validateCorpus } from './validation.js';
/** Pasarela versionada: futuras migraciones se añadirán aquí, nunca en silencio. */
export function migrateCorpus(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new InvalidCorpusError('El archivo debe contener un objeto JSON.');
    }
    const version = input.schemaVersion;
    if (version !== CURRENT_SCHEMA_VERSION) {
        throw new UnsupportedSchemaVersionError(version);
    }
    return validateCorpus(input);
}
/** No persiste ni sustituye los datos existentes: solo decodifica y valida. */
export function deserializeCorpus(json) {
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch {
        throw new InvalidCorpusError('El archivo no contiene JSON válido.');
    }
    return migrateCorpus(parsed);
}
export function serializeCorpus(data) {
    return JSON.stringify(validateCorpus(data), null, 2);
}

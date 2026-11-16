/** Modelo persistido. No se introduce aún ninguna operación de edición. */
export const CURRENT_SCHEMA_VERSION = 1;
export function emptyCorpus() {
    return { schemaVersion: CURRENT_SCHEMA_VERSION, texts: [], tags: [], notebooks: [] };
}

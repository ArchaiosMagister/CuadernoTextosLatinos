export class InvalidCorpusError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidCorpusError';
    }
}
export class UnsupportedSchemaVersionError extends Error {
    constructor(version) {
        super(`Versión del esquema no admitida: ${String(version)}.`);
        this.name = 'UnsupportedSchemaVersionError';
    }
}

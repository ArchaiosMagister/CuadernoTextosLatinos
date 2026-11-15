import { validateWorkspaceSnapshot, WorkspaceConflictError, WorkspaceRepository,
  type WorkspaceSnapshotV1 } from './workspace-repository.js';

export const WORKSPACE_BACKUP_FORMAT = 'cuaderno-textos-latinos-workspace';
export const WORKSPACE_BACKUP_VERSION = 2 as const;
export const WORKSPACE_BACKUP_MAX_CHARACTERS = 64 * 1024 * 1024;

export class WorkspaceBackupError extends Error {
  constructor(message: string) { super(message); this.name = 'WorkspaceBackupError'; }
}
export interface WorkspaceBackupPreviewV2 {
  exportedAt: string;
  workspaceRevision: number;
  notebookCount: number;
  placementCount: number;
  historyCount: number;
  corpusTextCount: number;
}
export interface WorkspaceBackupVerifiedV2 {
  snapshot: WorkspaceSnapshotV1;
  preview: WorkspaceBackupPreviewV2;
}
export interface WorkspaceRestorePreviewV2 {
  target: WorkspaceBackupPreviewV2;
  current: WorkspaceBackupPreviewV2;
  /** La interfaz debe permitir guardar este fichero antes de habilitar Restaurar. */
  currentSafetyBackupJson: string;
  expectedWorkspaceRevision: number;
}
export interface WorkspaceRestoreApprovalV2 {
  confirmReplace: boolean;
  safetyBackupExported: boolean;
  currentSafetyBackupJson: string;
  expectedWorkspaceRevision: number;
}

function utc(text: unknown): text is string {
  return typeof text === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text)
    && !Number.isNaN(Date.parse(text)) && new Date(text).toISOString() === text;
}
function canonical(snapshot: WorkspaceSnapshotV1): string {
  return JSON.stringify(validateWorkspaceSnapshot(snapshot));
}
async function hash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const sha = await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(sha),b => b.toString(16).padStart(2,'0')).join('');
}
function preview(snapshot: WorkspaceSnapshotV1, exportedAt: string): WorkspaceBackupPreviewV2 {
  return {
    exportedAt, workspaceRevision: snapshot.workspaceRevision,
    notebookCount: snapshot.editions.length,
    placementCount: snapshot.editions.reduce((n,entry)=>n+entry.edition.placements.length,0),
    historyCount: snapshot.history.length,
    corpusTextCount: snapshot.corpus?.corpus.texts.length ?? 0,
  };
}

/** Snapshot coherente obtenido en una sola transacción readonly en los cuatro stores. */
export async function createWorkspaceBackup(workspace: WorkspaceRepository, at = new Date()): Promise<string> {
  const snapshot = validateWorkspaceSnapshot(await workspace.snapshot());
  const exportedAt = at.toISOString();
  const sha256 = await hash(canonical(snapshot));
  const json = JSON.stringify({
    format:WORKSPACE_BACKUP_FORMAT,backupVersion:WORKSPACE_BACKUP_VERSION,
    exportedAt,sha256,snapshot,
  },null,2);
  if(json.length > WORKSPACE_BACKUP_MAX_CHARACTERS){
    throw new WorkspaceBackupError('La copia editorial supera 64 MiB. No se ha creado una copia parcial.');
  }
  return json;
}

/** Importar nunca escribe por sí solo: primero se valida forma, versión y SHA-256. */
export async function readWorkspaceBackup(json: string): Promise<WorkspaceBackupVerifiedV2> {
  if(json.length > WORKSPACE_BACKUP_MAX_CHARACTERS){
    throw new WorkspaceBackupError('Archivo demasiado grande para la versión editorial 2.');
  }
  let raw: unknown;
  try{raw=JSON.parse(json) as unknown;}catch{throw new WorkspaceBackupError('JSON editorial ilegible.');}
  if(!raw || typeof raw!=='object' || Array.isArray(raw)){
    throw new WorkspaceBackupError('La copia debe ser un objeto JSON.');
  }
  const r=raw as Record<string,unknown>;
  if(r.format!==WORKSPACE_BACKUP_FORMAT || r.backupVersion!==WORKSPACE_BACKUP_VERSION){
    throw new WorkspaceBackupError('No es una copia workspace v2 compatible. Las v1 se importan como legado.');
  }
  if(Object.keys(r).sort().join('|')!==['format','backupVersion','exportedAt','sha256','snapshot'].sort().join('|')){
    throw new WorkspaceBackupError('Formato de archivo editorial incompleto o desconocido.');
  }
  if(!utc(r.exportedAt) || typeof r.sha256!=='string'|| !/^[0-9a-f]{64}$/.test(r.sha256)){
    throw new WorkspaceBackupError('Fecha o huella de copia editorial inválida.');
  }
  const snapshot=validateWorkspaceSnapshot(r.snapshot);
  if(await hash(canonical(snapshot))!==r.sha256){
    throw new WorkspaceBackupError('La copia ha cambiado o está corrupta (SHA-256 diferente).');
  }
  return {snapshot,preview:preview(snapshot,r.exportedAt)};
}

/** Vista previa de la restauración y copia de seguridad del estado que se sustituiría. */
export async function prepareWorkspaceRestore(workspace: WorkspaceRepository, json: string,
  at = new Date()): Promise<WorkspaceRestorePreviewV2> {
  const target=await readWorkspaceBackup(json);
  const safe=await createWorkspaceBackup(workspace,at);
  // La lectura de seguridad puede diferir de la primera si otra pestaña guardó entretanto.
  const verifiedSafety=await readWorkspaceBackup(safe);
  return {
    target:target.preview, current:verifiedSafety.preview,
    currentSafetyBackupJson:safe,
    expectedWorkspaceRevision:verifiedSafety.snapshot.workspaceRevision,
  };
}

/**
 * Restauración atómica con doble confirmación. El caller DEBE ofrecer y guardar
 * primero la copia de seguridad actual. No se toca jamás IndexedDB histórica.
 */
export async function restoreWorkspaceBackup(workspace:WorkspaceRepository,json:string,
  approval:WorkspaceRestoreApprovalV2):Promise<WorkspaceSnapshotV1> {
  if(!approval.confirmReplace||!approval.safetyBackupExported){
    throw new WorkspaceBackupError('Falta confirmar la sustitución y la copia de seguridad del estado actual.');
  }
  const target=await readWorkspaceBackup(json);
  const safety=await readWorkspaceBackup(approval.currentSafetyBackupJson);
  const current=await workspace.snapshot();
  if(current.workspaceRevision!==approval.expectedWorkspaceRevision){
    throw new WorkspaceConflictError(approval.expectedWorkspaceRevision,current.workspaceRevision);
  }
  if(canonical(safety.snapshot)!==canonical(current)){
    throw new WorkspaceBackupError('La copia de seguridad previa no coincide con el workspace actual.');
  }
  await workspace.replaceFromVerifiedSnapshot(target.snapshot,approval.expectedWorkspaceRevision,true);
  const restored=await workspace.snapshot();
  const expected=validateWorkspaceSnapshot({...target.snapshot,workspaceRevision:approval.expectedWorkspaceRevision+1});
  if(canonical(restored)!==canonical(expected)){
    throw new WorkspaceBackupError('La restauración se escribió pero no coincide tras la verificación. Conserva la copia previa.');
  }
  return restored;
}

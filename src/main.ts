import { createBackup, MAX_BACKUP_CHARACTERS, readBackup } from './core/backup.js';
import type { LatinText } from './core/model.js';
import type { CorpusSnapshot } from './ports/corpus-repository.js';
import { IndexedDbCorpusRepository, RevisionConflictError } from './storage/indexeddb-corpus-repository.js';
import { getStoredVerificationText, syncVerificationEditor, VERIFICATION_TEXT_ID } from './ui/verification-editor.js';

const repo = new IndexedDbCorpusRepository();
const TEST_ID = VERIFICATION_TEXT_ID;

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error('No se encuentra el control ' + id);
  return node as T;
}

const controls = {
  sample: required<HTMLTextAreaElement>('latin-test'),
  save: required<HTMLButtonElement>('save-test'),
  reload: required<HTMLButtonElement>('reload'),
  export: required<HTMLButtonElement>('export-backup'),
  file: required<HTMLInputElement>('backup-file'),
  confirm: required<HTMLInputElement>('confirm-replace'),
  restore: required<HTMLButtonElement>('restore-backup'),
  status: required<HTMLElement>('status'),
  countTexts: required<HTMLElement>('count-texts'),
  countTags: required<HTMLElement>('count-tags'),
  countNotebooks: required<HTMLElement>('count-notebooks'),
  revision: required<HTMLElement>('revision'),
  lastText: required<HTMLElement>('last-text'),
};
let snapshot: CorpusSnapshot | null = null;
let busy = false;

function setStatus(message: string, error = false): void {
  controls.status.textContent = message;
  controls.status.dataset.error = String(error);
}

function refresh(): void {
  const data = snapshot?.corpus;
  controls.countTexts.textContent = data ? String(data.texts.length) : '—';
  controls.countTags.textContent = data ? String(data.tags.length) : '—';
  controls.countNotebooks.textContent = data ? String(data.notebooks.length) : '—';
  controls.revision.textContent = snapshot ? String(snapshot.revision) : '—';
  const testLatin = data ? getStoredVerificationText(data) : null;
  controls.lastText.textContent = testLatin ?? 'Ninguna todavía.';
}

function lock(isBusy: boolean): void {
  busy = isBusy;
  for (const button of [controls.save, controls.reload, controls.export, controls.restore]) {
    button.disabled = isBusy || snapshot === null;
  }
}

async function execute(action: () => Promise<void>): Promise<void> {
  if (busy) return;
  lock(true);
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(
      (error instanceof RevisionConflictError ? 'Otro acceso ha actualizado los datos. ' : '') + message,
      true,
    );
  } finally {
    lock(false);
    refresh();
  }
}

async function reload(): Promise<void> {
  if (!snapshot) throw new Error('El almacenamiento todavía no se ha inicializado.');
  const saved = getStoredVerificationText(snapshot.corpus);
  if (saved !== null && controls.sample.value !== saved && !window.confirm(
    'Hay cambios sin guardar en el campo de texto. ¿Descartarlos y mostrar la última versión guardada?',
  )) {
    setStatus('Recarga cancelada: se conserva el texto que estabas escribiendo.');
    return;
  }
  const latest = await repo.load();
  snapshot = latest;
  const found = syncVerificationEditor(latest.corpus, controls.sample);
  setStatus(found
    ? 'Datos locales leídos: el campo editable ya muestra el texto guardado.'
    : 'Datos locales leídos: no hay ningún texto de prueba guardado.');
}

function saveVerificationText(): Promise<void> {
  return execute(async () => {
    if (!snapshot) throw new Error('El almacenamiento todavía no se ha inicializado.');
    const latin = controls.sample.value.trim();
    if (!latin) throw new Error('Escribe un texto latino antes de guardarlo.');
    const original = snapshot.corpus;
    const existing = original.texts.find((entry) => entry.id === TEST_ID);
    const now = new Date().toISOString();
    const nextText: LatinText = existing
      ? { ...existing, latin, updatedAt: now < existing.createdAt ? existing.createdAt : now }
      : {
        id: TEST_ID, title: 'Texto de comprobación de la fase 1', latin,
        source: { author: null, work: null, reference: null },
        tagIds: [], createdAt: now, updatedAt: now,
      };
    const updated = {
      ...original,
      texts: existing
        ? original.texts.map((entry) => entry.id === TEST_ID ? nextText : entry)
        : [...original.texts, nextText],
    };
    snapshot = await repo.save(updated, snapshot.revision);
    controls.sample.value = nextText.latin;
    setStatus('Texto de prueba guardado. Al recargar la página, se mostrará este mismo texto.');
  });
}

function downloadJson(content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cuaderno-textos-latinos-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function exportBackup(): Promise<void> {
  return execute(async () => {
    // Leer la última revisión para la copia SIN adoptar su número en el editor.
    // De otro modo, exportar podría ocultar un conflicto entre dos pestañas.
    const latest = await repo.load();
    const file = await createBackup(latest.corpus);
    downloadJson(file);
    setStatus(latest.revision === snapshot?.revision
      ? 'Copia JSON preparada con los datos guardados (no incluye cambios sin guardar del campo). Consérvala fuera del navegador.'
      : 'Copia JSON preparada con la revisión más reciente. Otra pestaña ha modificado los datos: vuelve a leerlos antes de guardar cambios.');
  });
}

function restoreBackup(): Promise<void> {
  return execute(async () => {
    if (!snapshot) throw new Error('No hay almacenamiento local disponible.');
    if (!controls.confirm.checked) {
      throw new Error('Marca la confirmación de sustitución y guarda una copia de tus datos actuales.');
    }
    const file = controls.file.files?.item(0);
    if (!file) throw new Error('Selecciona primero un archivo JSON.');
    if (file.size > MAX_BACKUP_CHARACTERS) {
      throw new Error('El archivo supera el máximo admitido (32 MiB).');
    }
    // No se inicia transacción de escritura antes de verificar la copia.
    const incoming = await readBackup(await file.text());
    const current = await repo.load();
    if (current.revision !== snapshot.revision) {
      throw new RevisionConflictError(snapshot.revision, current.revision);
    }
    const ok = window.confirm(
      'ATENCIÓN: se sustituirán los datos guardados en ESTE navegador.\n\n'
      + 'Copia del ' + incoming.metadata.exportedAt + '\n'
      + 'Textos: ' + incoming.metadata.textCount
      + ' · Etiquetas: ' + incoming.metadata.tagCount
      + ' · Cuadernos: ' + incoming.metadata.notebookCount
      + '\n\n¿Has descargado una copia de tus datos actuales y deseas continuar?',
    );
    if (!ok) {
      setStatus('Restauración cancelada. No se ha modificado ningún dato.');
      return;
    }
    const restored = await repo.save(incoming.corpus, snapshot.revision);
    snapshot = restored;
    const hasText = syncVerificationEditor(restored.corpus, controls.sample);
    controls.file.value = '';
    controls.confirm.checked = false;
    setStatus(hasText
      ? 'Copia restaurada: el campo editable y «Última prueba guardada» muestran ahora el texto recuperado. Revisión ' + restored.revision + '.'
      : 'Copia restaurada correctamente, pero el archivo no contiene ningún texto de comprobación. Por eso el campo editable está vacío.');
  });
}

controls.reload.addEventListener('click', () => { void execute(reload); });
controls.save.addEventListener('click', () => { void saveVerificationText(); });
controls.export.addEventListener('click', () => { void exportBackup(); });
controls.restore.addEventListener('click', () => { void restoreBackup(); });

lock(true);
void (async () => {
  try {
    snapshot = await repo.load();
    syncVerificationEditor(snapshot.corpus, controls.sample, { keepExampleIfMissing: true });
    setStatus('Almacenamiento listo. El campo muestra el texto guardado, si lo hay; los datos permanecen en este dispositivo.');
  } catch (error) {
    setStatus('No se pudo abrir IndexedDB: ' + (error instanceof Error ? error.message : String(error)), true);
  } finally {
    lock(false);
    refresh();
  }
})();

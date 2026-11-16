const CACHE_NAME = "cuaderno-textos-001cb20bc6b72420";
const FILES = ["./core/academic-bank.js","./core/academic-engine.js","./core/academic-morph-selection.js","./core/academic-teacher-adapter.js","./core/academic-teacher-bank.js","./core/archive.js","./core/backup.js","./core/edition-factory.js","./core/edition-inline-formatting.js","./core/edition-model.js","./core/edition-operations.js","./core/edition-validation.js","./core/editor-operations.js","./core/errors.js","./core/library.js","./core/model.js","./core/validation.js","./core/vocabulary-suggestions.js","./data/teacher-academic-snapshot.js","./export/notebook-documents.js","./export/zip-store.js","./index.html","./library/catalog.json","./library/works/latinlibrary.eutropius.json","./library/works/phi0448.phi001.perseus-lat2.json","./library/works/phi0448.phi002.perseus-lat3.json","./library/works/phi0588.abo001.perseus-lat2.json","./library/works/phi0588.abo002.perseus-lat2.json","./library/works/phi0588.abo003.perseus-lat2.json","./library/works/phi0588.abo004.perseus-lat2.json","./library/works/phi0588.abo005.perseus-lat2.json","./library/works/phi0588.abo006.perseus-lat2.json","./library/works/phi0588.abo007.perseus-lat2.json","./library/works/phi0588.abo008.perseus-lat2.json","./library/works/phi0588.abo009.perseus-lat2.json","./library/works/phi0588.abo010.perseus-lat2.json","./library/works/phi0588.abo011.perseus-lat2.json","./library/works/phi0588.abo012.perseus-lat2.json","./library/works/phi0588.abo013.perseus-lat2.json","./library/works/phi0588.abo014.perseus-lat2.json","./library/works/phi0588.abo015.perseus-lat2.json","./library/works/phi0588.abo016.perseus-lat2.json","./library/works/phi0588.abo017.perseus-lat2.json","./library/works/phi0588.abo018.perseus-lat2.json","./library/works/phi0588.abo019.perseus-lat2.json","./library/works/phi0588.abo020.perseus-lat2.json","./library/works/phi0588.abo021.perseus-lat2.json","./library/works/phi0588.abo022.perseus-lat2.json","./library/works/phi0588.abo023.perseus-lat2.json","./library/works/phi0588.abo024.perseus-lat2.json","./library/works/phi0588.abo025.perseus-lat2.json","./main.js","./ports/corpus-repository.js","./storage/indexeddb-corpus-repository.js","./storage/workspace-backup.js","./storage/workspace-migration.js","./storage/workspace-repository.js","./styles.css","./ui/academic-controls.js","./ui/edition-app.js","./ui/library-app.js","./ui/reader-selection.js","./ui/verification-editor.js"];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(FILES);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('cuaderno-textos-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const found = await cache.match(event.request, { ignoreSearch: true });
    if (found) return found;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
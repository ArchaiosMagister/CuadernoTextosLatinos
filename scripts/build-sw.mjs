import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function list(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.posix.join(dir, item.name);
    if (item.isDirectory()) result.push(...await list(file));
    else if (!file.endsWith('service-worker.js')) result.push('./' + file.slice('dist/'.length));
  }
  return result;
}

const paths = (await list('dist')).sort();
if (!paths.some(p => p.includes('library/catalog.json'))
  || !paths.some(p => p.includes('library/works/'))) {
  throw new Error('No se puede preparar el acceso offline: la biblioteca está incompleta.');
}
// Fingerprint del contenido real, no solo de la lista de rutas.
const hash = createHash('sha256');
for (const filename of paths) {
  hash.update(filename);
  hash.update(await readFile('dist/' + filename.slice(2)));
}
const version = hash.digest('hex').slice(0, 16);
const source = [
  'const CACHE_NAME = ' + JSON.stringify('cuaderno-textos-' + version) + ';',
  'const FILES = ' + JSON.stringify(paths) + ';',
  String.raw`
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
});`
].join('\n');
await writeFile('dist/service-worker.js', source);
console.log('SW offline: ' + paths.length + ' archivos en caché, ' + paths.filter(p=>p.startsWith('./library/works/')).length + ' obras.');

/* Adapter for the browser build of Examinator2's Collatinus engine. */
const cacheName = 'cuaderno-collatinus-analysis-v1';
const engineVersion = '__COLLATINUS_VERSION__';
const capacity = 8;

let ready;
async function engine() {
  if (!ready) {
    self.window = self;
    importScripts('datos.js', 'incluidos.js', 'shim.js', 'motor.js');
    ready = self.api.call('warm').catch(error => {
      ready = undefined;
      throw error;
    });
  }
  await ready;
  return self.api;
}

async function analyze(args) {
  let cache, key;
  try {
    const data = new TextEncoder().encode(JSON.stringify(args.text));
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    key = new URL('./analysis-' + engineVersion + '-' + hash, self.location.href).href;
    cache = await caches.open(cacheName);
    const hit = await cache.match(key);
    if (hit) {
      const result = await hit.json();
      if (Array.isArray(result)) return result;
    }
  } catch {
    // Sin almacenamiento disponible se usa el motor directamente.
  }
  const result = await (await engine()).call('analyze', args);
  if (cache && key && Array.isArray(result)) {
    try {
      const json = JSON.stringify(result);
      if (json.length > 2_000_000) return result;
      await cache.put(key, new Response(json, {
        headers: { 'Content-Type': 'application/json' },
      }));
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - capacity)).map(entry => cache.delete(entry)));
    } catch {
      // El resultado sigue disponible para esta sesión.
    }
  }
  return result;
}

self.addEventListener('message', async ({ data: { id, method, args } }) => {
  try {
    const result = method === 'analyze'
      ? await analyze(args)
      : await (await engine()).call(method, args);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
});

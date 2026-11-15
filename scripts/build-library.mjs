/**
 * Genera una biblioteca estática sin depender de ningún servicio en ejecución.
 * Todas las descargas se realizan EN LA COMPILACIÓN, no al abrir la web.
 *
 * César y Eutropio: misma fuente incorporada en Examinator2 del docente.
 * Nepote: textos TEI de Perseus (Halm/Fleckeisen, 1886).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DOMParser } from '@xmldom/xmldom';

const EXAMINATOR_COMMIT = '4ca31b4b2852f6b3ac0dc28c3f6ff3f2ad15d4a8';
const PERSEUS_COMMIT = '192fef80a2fd785a389e6584ca2315fd1f80a94e';
const RAW_EXAMINATOR = 'https://raw.githubusercontent.com/ArchaiosMagister/examinator2/' + EXAMINATOR_COMMIT + '/';
const RAW_PERSEUS = 'https://raw.githubusercontent.com/PerseusDL/canonical-latinLit/' + PERSEUS_COMMIT + '/';
const REPO_SOURCE = 'https://github.com/ArchaiosMagister/examinator2/blob/' + EXAMINATOR_COMMIT + '/FUENTES.md';

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error('No se pudo descargar la fuente editorial (' + response.status + '): ' + url);
  return response.text();
}
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const idOf = (urn) => urn.replace(/[^a-zA-Z0-9._-]/g, '_');

async function examinadorIncludes() {
  const source = await download(RAW_EXAMINATOR + 'js/incluidos.js');
  const context = { EXDATA: {}, window: {} };
  context.window.EXDATA = context.EXDATA;
  vm.runInNewContext(source, context, { timeout: 12000, filename: 'Examinator2-incluidos.js' });
  // Eutropio se conserva en datos.js; César se encuentra en incluidos.js.
  // Se consulta exactamente el mismo corpus fijado en la revisión del autor.
  const originalData = await download(RAW_EXAMINATOR + 'js/datos.js');
  vm.runInNewContext(originalData, context, { timeout: 20000, filename: 'Examinator2-datos.js' });
  const files = Object.entries(context.EXDATA).filter(([key]) => key.startsWith('/app/data/incluidos/') && key.endsWith('.json'));
  const selected = [];
  for (const [path, contents] of files) {
    const data = JSON.parse(contents);
    if (!/(césar|caesar|eutropio|eutropius)/i.test(data.author)) continue;
    if (!Array.isArray(data.lines) || data.lines.length === 0) {
      throw new Error('Faltan las líneas de ' + path);
    }
    selected.push({
      urn: data.urn,
      author: /eutrop/i.test(data.author) ? 'Eutropio' : 'Julio César',
      title: data.title,
      latin: data.latin,
      genre: data.genre || 'Historia',
      levels: data.levels || [],
      lines: data.lines.filter((line) => line.t && line.c).map((line) => ({
        c: String(line.c), t: clean(line.t), k: line.k || 'p',
      })),
      source: data.source || REPO_SOURCE,
      license: data.license || 'Texto incorporado en Examinator2; fuente original citada en FUENTES.md',
      editorial: data.desc || '',
      provenance: 'Examinator2',
    });
  }
  if (!selected.some((work) => work.author === 'Julio César')
    || !selected.some((work) => work.author === 'Eutropio')) {
    throw new Error('Los tres autores no están cubiertos: faltan obras de César o Eutropio en Examinator2.');
  }
  return selected;
}

const latinLives = [
  'Milcíades', 'Temístocles', 'Arístides', 'Pausanias', 'Cimón',
  'Lisandro', 'Alcibíades', 'Trasíbulo', 'Conón', 'Dión',
  'Ifícrates', 'Cabrias', 'Timoteo', 'Datames', 'Epaminondas',
  'Pelópidas', 'Agesilao', 'Éumenes', 'Foción', 'Timoleón',
  'De los reyes', 'Amílcar', 'Aníbal', 'Catón', 'Ático',
];

function parseLife(xml, number) {
  const errors = [];
  const dom = new DOMParser({ onError: (level, msg) => errors.push(level + ': ' + msg) }).parseFromString(xml, 'application/xml');
  if (errors.some((error) => error.startsWith('fatalError') || error.startsWith('error'))) {
    throw new Error('XML de Nepote inválido: ' + errors.join('; '));
  }
  const name = clean(dom.getElementsByTagName('title').item(0)?.textContent) || latinLives[number - 1];
  const all = [...Array.from({ length: dom.getElementsByTagName('div').length }, (_, i) => dom.getElementsByTagName('div').item(i))];
  const chapters = all.filter((node) => node?.getAttribute('subtype') === 'chapter');
  if (!chapters.length) throw new Error('La obra de Nepote '+number+' carece de capítulos.');
  const lines = [];
  for (const chapter of chapters) {
    const n = chapter.getAttribute('n') || String(lines.length + 1);
    const segs = chapter.getElementsByTagName('seg');
    if (segs.length) {
      for (let i = 0; i < segs.length; i++) {
        const seg = segs.item(i);
        const t = clean(seg.textContent);
        if (t) lines.push({ c: n + '.' + (seg.getAttribute('n') || String(i + 1)), t, k: 'p' });
      }
    } else {
      const t = clean(chapter.textContent);
      if (t) lines.push({ c: n, t, k: 'p' });
    }
  }
  if (!lines.length) throw new Error('La obra de Nepote '+number+' no contiene texto válido.');
  const code = 'abo' + String(number).padStart(3, '0');
  return {
    urn: 'phi0588.' + code + '.perseus-lat2',
    author: 'Cornelio Nepote',
    title: latinLives[number - 1] || name,
    latin: name,
    genre: 'Biografía',
    levels: ['chapter', 'section'],
    lines,
    source: RAW_PERSEUS + 'data/phi0588/' + code + '/phi0588.' + code + '.perseus-lat2.xml',
    license: 'https://creativecommons.org/licenses/by-sa/4.0/',
    editorial: 'Cornelius Nepos, Vitae; Albert Fleckeisen / Karl Halm, Teubner, Leipzig, 1886; Perseus Digital Library.',
    provenance: 'Perseus TEI',
  };
}

async function nepote() {
  const queue = Array.from({ length: 25 }, (_, i) => i + 1);
  const texts = [];
  const worker = async () => {
    while (queue.length) {
      const n = queue.shift();
      if (!n) break;
      const code = 'abo' + String(n).padStart(3, '0');
      const url = RAW_PERSEUS + 'data/phi0588/' + code + '/phi0588.' + code + '.perseus-lat2.xml';
      const xml = await download(url);
      texts.push(parseLife(xml, n));
    }
  };
  await Promise.all([worker(),worker(),worker(),worker()]);
  return texts.sort((a,b) => a.urn.localeCompare(b.urn));
}

const works = [...await examinadorIncludes(), ...await nepote()];
if (new Set(works.map((w) => w.urn)).size !== works.length) throw new Error('Obras duplicadas en la biblioteca.');
if (!['Julio César','Eutropio','Cornelio Nepote'].every((author) => works.some((w) => w.author === author))) {
  throw new Error('No están incorporados los tres autores obligatorios.');
}
if (works.some((w) => w.lines.length < 3 || w.lines.some((line) => !line.c || !line.t))) {
  throw new Error('Hay obras incompletas o con referencias vacías.');
}

await mkdir('dist/library/works', { recursive: true });
const catalogue = works.map(({ lines, ...work }) => {
  const file = 'works/' + idOf(work.urn) + '.json';
  return {
    urn: work.urn, author: work.author, title: work.title, latin: work.latin,
    genre: work.genre, levels: work.levels, source: work.source,
    license: work.license, editorial: work.editorial, provenance: work.provenance,
    count: lines.length, file,
  };
});
for (const work of works) {
  const filename = 'dist/library/works/' + idOf(work.urn) + '.json';
  await writeFile(filename, JSON.stringify(work));
}
await writeFile('dist/library/catalog.json', JSON.stringify({ version: 1, works: catalogue }));
console.log('Biblioteca offline: ' + works.length + ' obras, ' + works.reduce((n,w)=>n+w.lines.length,0) + ' pasajes: '
  + [...new Set(works.map(w=>w.author))].join(', '));

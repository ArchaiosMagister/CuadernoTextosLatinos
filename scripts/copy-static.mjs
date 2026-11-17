import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('src/ui/styles.css', 'dist/styles.css');

// Nueva ruta: la estructura, estilos y biblioteca son los ORIGINALES de
// Examinator2. El único cambio al HTML es conectar las acciones al cuaderno.
const original=await readFile('reference/examinator2/index.html','utf8');
const start=original.indexOf('<script src="js/datos.js"></script>');
const end=original.indexOf('</body>',start);
if(start<0||end<0||!original.includes('<span class="brand">Examinator</span>'))
  throw new Error('La estructura original de Examinator2 ha cambiado; revisar antes de compilar.');
let html=original.slice(0,start)
  +'<script src="./js/util.js"></script>\n'
  +'<script type="module" src="../ui/examinator-notebook-app.js"></script>\n'
  +original.slice(end);
html=html.replace('<title>Examinator</title>','<title>Examinator · Cuaderno de textos latinos</title>')
  .replace('<link rel="icon" href="icon.png">','<link rel="icon" href="../examinator2-original/icon.png">')
  .replace('<link rel="stylesheet" href="styles.css">',
    '<link rel="stylesheet" href="../styles.css">\n'
    +'<link rel="stylesheet" href="styles.css">\n'
    +'<link rel="stylesheet" href="bridge.css">')
  .replace('Empezar un examen nuevo','Crear un cuaderno nuevo')
  .replace('Abrir un examen guardado','Abrir un cuaderno guardado')
  .replace('Guardar este examen para seguir editándolo otro día',
    'Guardar el cuaderno y sus preguntas')
  .replace('Listas de modificación preverbial, evolución fonética, prefijos y latinismos',
    'Buscar e incorporar textos propios')
  .replace('>Listas</button>','>Textos</button>');
await mkdir('dist/examinator-cuadernos/js',{recursive:true});
await writeFile('dist/examinator-cuadernos/index.html',html);
await copyFile('reference/examinator2/styles.css','dist/examinator-cuadernos/styles.css');
await copyFile('reference/examinator2/js/util.js','dist/examinator-cuadernos/js/util.js');
await copyFile('reference/examinator2/js/library.js','dist/examinator-cuadernos/js/library.js');
// Collatinus de Examinator2 se carga solo al necesitar lematización.
// El módulo de referencia NO se modifica; una copia del shim utiliza una
// base y claves propias para que el motor original no toque datos de Examinator2.
await mkdir('dist/examinator-cuadernos/collatinus',{recursive:true});
await copyFile('reference/examinator2/js/motor.js',
  'dist/examinator-cuadernos/collatinus/motor.js');
const originalShim=await readFile('reference/examinator2/js/shim.js','utf8');
if(!originalShim.includes("indexedDB.open('examinator', 1)")||
   !originalShim.includes("const LS = 'examinator.fs:'"))
  throw new Error('El almacenamiento Collatinus original cambió: revisar el adaptador.');
await writeFile('dist/examinator-cuadernos/collatinus/shim.js',originalShim
  .replace("indexedDB.open('examinator', 1)",
    "indexedDB.open('cuaderno-collatinus-examinator-v1', 1)")
  .replace("const LS = 'examinator.fs:'",
    "const LS = 'cuaderno-collatinus-examinator-v1.fs:'"));

await copyFile('reference/examinator2/FUENTES.md','dist/examinator-cuadernos/FUENTES.md');
await copyFile('src/ui/examinator-notebook-bridge.css','dist/examinator-cuadernos/bridge.css');
// Se reutiliza la Gentium Book Plus empaquetada en la ruta original: no se
// duplican los archivos binarios ni se altera el CSS de Examinator2.
await writeFile('dist/examinator-cuadernos/fonts.css',
  '@import url("../examinator2-original/fonts.css");\n');

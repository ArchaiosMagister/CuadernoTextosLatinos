# PR #9 · Integración selectiva y trazable de bancos académicos reales

**Estado:** adaptador académico preparado en la rama de revisión. No se fusiona ni publica sin autorización y no ejecuta modificaciones automáticas sobre trabajos existentes. **Curso:** Latín II (cuaderno de textos); no se importan bancos de Griego I ni se presupone una programación de unidades para Latín II.

## Fuentes cotejadas

El snapshot offline `src/data/teacher-academic-snapshot.ts` deriva exclusivamente de cinco JSON de `ArchaiosMagister/GeneradorExamenes`, rama `main` consultada el 15/11/2026:

| Bloque | Fuente y estado de origen | Elementos importados | Candidatos habilitados | Pendientes |
|---|---|---:|---:|---:|
| Modificación preverbial | `data/modificacion-preverbial-docente.json`; lista docente de compuestos *atestiguados*; cuatro bases homónimas declaradas ambiguas | 882 derivados de 120 fichas | 857 | 25 |
| Evolución fonética | `data/fonetica/banco_examenes.json`; **655** `APTO_PROPUESTO`, el README declara expresamente que no son una certificación lexicográfica | 655 étimos | **0** | **655** |
| Prefijos | `data/prefijos-docente.json`; 285 glosas «orientativo; requiere validación semántica caso por caso», una revisión explícita (antifaz) | 286 voces | **1** | **285** |
| Latinismos | `data/latinismos-docente.json`; repertorio docente numerado de 87 términos con definiciones abreviadas | 87 términos | **87** | 0 |
| Morfología | `data/lemmas/verified-overrides.json`, **solo** `singleForms` latinos con forma, lema, etiquetas y referencia explícitos | 55 lecturas individualizadas (47 superficies distintas) | **55** | 0 |

**Total:** 1965 registros importados, de los que **1000** quedan habilitados (857 preverbiales + 87 latinismos + 1 prefijo revisado + 55 análisis individualizados) y **965** permanecen en revisión (25 preverbiales + 655 fonéticos + 285 prefijos). Los registros pendientes **no** se ofrecen en regeneración.

### Niveles de prueba: no confundirlos

- `verified` en un **latinismo** indica que su expresión figura en la lista docente cerrada. No indica una nueva comprobación externa del sentido ni autoriza producir solucionarios automáticamente.
- `verified` en una **relación preverbial** indica que el compuesto aparece en la fila docente de derivados atestiguados de una base **no declarada ambigua**. No certifica ni reconstruye su enunciado completo, todas sus acepciones o flexiones. Las bases ambiguas **sero** y **volo** se conservan pero no se proponen sin desambiguación docente; las diferentes entradas conservan sus IDs fuente.
- `needs-review` en **fonética** significa que `APTO_PROPUESTO` no se ha elevado a validación filológica definitiva, **aunque el registro lleve URL y normas N01–N20**. Nunca se infiere una cadena fonética sin prueba. Quedan sus étimos, resultados propuestos, etiquetas de transmisión y normas disponibles para cotejo.
- `needs-review` en **prefijos** indica que su valor semántico está expresamente advertido como orientativo. La entrada singular **antifaz** incluye un ajuste docente específico que distingue ante-/anti- espacial de anti- oposición. El adaptador no inventa significados nuevos.
- `verified` en **morfología** solo afecta a **esa forma con esas etiquetas**; la fuente `verified-overrides.json` advierte que la ficha no verifica todo un paradigma. `dux` (nom./voc. sg.) y `duces` (nom./ac./voc. pl.) son ejemplos de lecturas distintas: el motor las muestra como alternativas y exige decisión docente.

**Examinator2 se ha utilizado como referente de interfaz y flujo de análisis** (`js/propose.js`, `js/motor.js`, `js/lists.js`), no como acreditación filológica: su análisis contextual de Collatinus puede desambiguar heurísticamente, pero no constituye evidencia individual de una opción de examen. No se han copiado bancos compactados `datos.js` ni se promueven sus sugerencias por defecto.

## Alcance del adaptador

- `src/core/academic-teacher-adapter.ts`: tipos de las cinco fuentes congeladas, verificación estructural, procedencia por fichero y fila, clasificador conservador, informe consultable de reglas, sentido propuesto y fuente. No modifica el contenido.
- `src/data/teacher-academic-snapshot.ts`: selección de **campos fuente**, sin respuestas inferidas ni cambios de grafía, junto a los **SHA de blob Git** de cada archivo. Se genera desde los JSON cotejados; toda futura actualización requiere nueva revisión explícita y pruebas, no sincronización silenciosa.
- `src/core/academic-teacher-bank.ts`: función de construcción offline que alimenta `VerifiedAcademicBankV1` de la PR #9. Se mantiene independiente de la UI y de IndexedDB.
- `src/core/academic-teacher-adapter.test.ts`: pruebas de inventario, fuentes, separaciones de categoría, preservación de homonimia, registros pendientes y propuesta del motor sobre candidatos reales.

**Trazabilidad:** `EvidenceV1.provider` contiene el repositorio y el fichero; `EvidenceV1.recordId` identifica fila y elemento; `EvidenceV1.bankRevision` fija los cinco SHAs de la importación; `decisionId` identifica la política de aprobación de origen. `teacherAuditRecord` permite recuperar la glosa o resultado docente sin incorporarlo a la hoja del alumnado ni generar respuestas.

## Restricciones curriculares y casos reales del modelo

El PDF docente propone `instruxit` y `successerunt` como formas de partida, y `fabam`, `sermonem`, `stelam` y `transgressionem` para fonética. **No se reescribe el PDF ni se corrigen esas grafías silenciosamente.** En el banco general, `fabam` aparece como `EVF-0104`, pero `stelam`, `sermonem` y `transgressionem` no aparecen como entradas idénticas. Hay una ficha distinta `stellam` (`EVF-0613`), que no debe sustituirse por `stelam` sin revisión docente. Además, el banco las marca `APTO_PROPUESTO`: no se habilitan automáticamente como fonética verificada.

El motor preverbial está ligado a lemas **de fila docente** (p. ej. `struo`, `cedo`), no puede inferir que una forma conjugada como `instruxit` deba mapearse automáticamente a la base `struo` sin un análisis del compuesto acreditado. Esa vinculación contextual queda **pendiente**, igual que la ampliación de morfología mediante otras fuentes contrastadas. No se permite recortar prefijos gráficamente para inventar derivados.

## Criterios antes de dar por usable todo el generador

1. Recorrer y cotejar **individualmente** las fichas fonéticas candidatas prioritarias, con decisión docente o fuente verificable que documente étimo, resultado y normas; activar solo las aprobadas en una PR posterior.
2. Revisar los 285 análisis semánticos de prefijos (por prioridad curricular), preservando variantes y valores contextuales; no elevar en bloque.
3. Desambiguar los homógrafos preverbiales `sero` y `volo` mediante el enunciado completo, manteniendo ambos IDs.
4. Resolver la lematización contextual de formas textuales con evidencia, sin seleccionar por semejanza de cadenas.
5. Comprobar **en el iPad** los menús y el visualizador cuando existan; esta PR solo prepara los bancos.

No hay motor de respuestas ni glosas automáticas en los documentos finales. Si el conjunto de candidatos elegibles de una subpregunta es insuficiente, el motor rechaza la regeneración sin tocar la edición ni el historial.

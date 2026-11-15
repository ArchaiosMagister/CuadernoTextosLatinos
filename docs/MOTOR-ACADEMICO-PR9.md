# PR técnica #9 — Motor académico de propuestas y regeneración

**Estado:** implementación de dominio y pruebas, aislada de la interfaz y de la importación de bancos reales. No ejecuta propuestas en el arranque ni toca cuadernos existentes.

## Objetivo

Interconectar el contrato editorial de la PR #7 con el CAS/historial de la PR #8 para preparar y confirmar **propuestas documentadas**, sin regeneración cruzada. Los menús de Examinator2 inspiran la selección y la vista previa de GeneradorExamenes servirá de interfaz en una fase posterior; ninguna nueva UI se publica aquí.

## Frontera filológica y proveedor

- `VerifiedAcademicBankV1` recibe registros con ID estable, tipo (`morphology`, `preverb`, `phonetics`, `prefix`, `latinism`), curso `latin-ii`, valor explícito, evidencia `{provider,recordId,bankRevision,decisionId}`, revisión y un manifiesto con origen y responsable de verificación.
- **La marca `verified` es una declaración de la fuente, NO una validación filológica realizada por este módulo.** Los adaptadores reales de Examinator2 / GeneradorExamenes deberán importar solamente datos con evidencia individual auditada. Las pruebas usan **fixtures sintéticas**, jamás publicables como contenido académico.
- Los registros `needs-review` y `rejected` permanecen reconocibles para auditoría, pero no se proponen. Una falta de formas verificadas detiene la regeneración, sin inventar contenido ni cambiar la puntuación.
- Morfología exige coincidencia exacta de **forma y subrayado del token concreto**, lema y análisis verificados. Si hay más de una lectura distinta de la misma forma, se señala `ambiguous` y se requiere elección del docente; no se aplica una preferencia ciega.
- Modificación preverbial exige **forma de partida por casilla**. No deduce prefijos o derivaciones a partir de grafías ni inventa relaciones. Evolución fonética, prefijos y latinismos solo utilizan fichas ya aportadas por el banco.
- El catálogo no está poblado por defecto. No se anuncia todavía el generador como operativo para el profesor: primero hace falta un adaptador y una auditoría filológica/curricular reales.

## Contrato de preparación/confirmación

`AcademicQuestionEngineV1` ofrece `previewSlot`, `prepareSlot`, `previewMorph`, `prepareMorph`, `prepareSubquestion`, `prepareChoiceQuestion` y `commit`. La preparación es **pura**, devuelve un plan con IDs de candidatos del banco, referencia de edición y revisión esperada, y copia exacta del estado inicial para detectar una edición restablecida a la misma revisión.

La confirmación vuelve a comprobar la procedencia, tipo de apartado y forma de partida de **cada candidatura** y ejecuta la operación dentro del callback síncrono de `WorkspaceRepository.commitEdition`. El repositorio confirma **nuevo documento + único evento de historial + revisión global** en una sola transacción IndexedDB; un candidato ausente, un conflicto CAS, un bloqueo o una desincronización aborta la operación completa.

### Alcances

- **Una palabra:** conserva ID, posición, resto del apartado, todas las demás preguntas y apariciones.
- **Un subapartado:** conserva IDs de casillas existentes; admite cambiar explícitamente la cantidad con IDs nuevos suministrados y candidatos verificados, sin crear contenidos al editar un contador. Bloqueos manuales se conservan salvo confirmación explícita.
- **Pregunta completa:** exclusivamente la pregunta de elección, sus apartados activos; conserva enunciado, puntuación y apartados desactivados, y no toca preguntas 1–3. La generación automática de traducción y sintaxis no está autorizada.
- **Morfología:** modifica análisis y lema del token subrayado ya enlazado, no desplaza ni crea una marca. Las ambigüedades exigen decisión explícita.

El motor no ofrece un botón que pueda regenerar otras preguntas como efecto secundario de cambiar el número de palabras, el zoom o la navegación.

## Alcance y límites de la PR

Incluye banco académico tipado, filtrado estricto por estado, trazabilidad, preparación de planes, confirmación CAS e historial, motor offline determinista y pruebas de regresión. **No incluye** importadores de bancos de Examinator2/GeneradorExamenes, estadísticas curriculares, asignación de soluciones, nuevas pantallas, Word/PDF, análisis automático de cualquier palabra o etiquetado gramatical automático. Los conectores de bancos son el siguiente bloque dentro de la fase del motor, después de que se contrasten las fuentes reales.

## Pruebas obligatorias

- Corpus histórico y base editorial intactos en ausencia de confirmación.
- Candidatos sin evidencia, ajenos al curso, de otro tipo, en revisión o rechazados nunca alimentan preguntas.
- Misma palabra, otra subpregunta, otra pregunta o otra aparición: sustitución aislada y verificable.
- Bloqueo manual, errores de candidatos, faltantes, ambigüedad, homógrafos, cambios de banco y conflictos de revisión: aborto sin perder datos.
- Regeneración de pregunta completa con puntuación de **8 puntos** e historial de una sola operación.
- `npm run check` y WebKit E2E, incluida una prueba nueva de regeneración persistida y deshacer tras recargar Safari/WebKit; hasta entonces no fusionar ni publicar.

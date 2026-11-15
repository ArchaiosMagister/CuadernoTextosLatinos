# PR #10 · revisión de interfaz, vocabulario y exportación

Fecha de evaluación: 15-11-2026. Rama: \`feat/interfaz-editorial-primera-iteracion\`.
Estado: desarrollo aislado, sin fusión ni despliegue en \`main\`.

## 1. Referente docente realmente inspeccionado

\`texto ejemplo formato.pdf\`: página única A4 creada con Pages, encabezado centrado
con título y autor/obra/referencia, dos reglas finas, texto latino en cursiva,
subrayados por **ocurrencia**, recuadro de vocabulario, cuatro preguntas y pie
\`1 | 1\`. Puntuación 4 + 1 + 1 + 2 = **8 puntos**. El PDF original contiene un lapsus:
"dos de estas **tres** preguntas" con cuatro subapartados a–d. La aplicación conserva
la decisión docente aprobada: "**cuatro**" cuando hay cuatro apartados activos;
recalcula el cardinal si se desactiva alguno.

La equivalencia métrica entre Pages, Word y PDF **no se presume**: puede cambiar
la sustitución de Palatino, los cortes de página, las métricas del sistema operativo
o la impresora. En cualquier caso se conservan los datos del agregado editorial.

## 2. Interfaz auditada

- En escritorio/iPad apaisado: configuración y hoja A4 simultáneas.
- En iPad vertical: pestañas separadas Configurar/Vista previa; ninguna pestaña
  regenera preguntas, vocabulario ni palabras.
- Vista con papel blanco incluso con modo oscuro; controles mantenidos en alto contraste.
- Cuaderno completo y navegación por ocurrencia conservan IDs independientes.
- El rótulo de pregunta 4 y su puntuación se representan con un **único helper**
  para vista A4 y Word; así los dos medios no divergen.
- El panel muestra cambios guardados/pendientes, advertencias antes de exportar,
  historial/deshacer y copias de seguridad JSON v2.
- No se toca el banco de fase 2 ni se desactiva su navegación.

## 3. Vocabulario: candidato ≠ significado verificado

\`suggestVocabulary\` extrae **formas Unicode** del texto, agrupa repeticiones,
evita duplicados ya presentes y consulta únicamente análisis morfológicos
individuales que figuran como elegibles en el snapshot docente offline.
Si una forma tiene un único lema respaldado se propone ese lema; si no, se
marca como ambigua o pendiente. La aplicación **no** atribuye automáticamente
traducción, género, enunciado ni paradigma a una mera forma no verificada.

Todos los términos se revisan antes de añadirse, con casillas de inclusión,
enunciado y significado editables. Una propuesta sin significado queda
"necesita revisión" y la vista Word/PDF lo señala explícitamente.
Los términos previamente guardados, sus IDs, la procedencia y las decisiones
manuales permanecen intactos. Los cambios confirmados pasan por la misma
persistencia transaccional del cuaderno.

**No equivale todavía a una lematización lexical universal.** Integrar bancos
completos con acepciones y enunciados exigirá una integración filológica separada.

## 4. Word

\`createNotebookDocx\` genera un **archivo .docx OOXML real** sin CDN ni
paquetes externos en ejecución: contenedor ZIP UTF-8, \`document.xml\`, estilos,
tablas y relaciones. Conserva A4, márgenes elegidos, fuente/tamaño, párrafos,
interlineado, cabeceras, cursivas, subrayados válidos, vocabulario, preguntas
y subapartados. Incluye campos Word \`PAGE\` y \`NUMPAGES\` para páginas físicas,
no el número de texto del cuaderno.

Se generan en orden todas las apariciones del cuaderno; cada aparición nueva
comienza en página nueva. Los saltos automáticos dentro de cada texto se dejan
al procesador de textos para evitar recortes.

Si no se cumplen los criterios de preparación (8 puntos, palabras morfológicas,
vocabulario pendiente, etc.), se presentan advertencias antes de permitir la
exportación **deliberada** de un borrador; nunca se sobreescriben los datos.

## 5. PDF

En navegadores Safari/WebKit, el botón \`PDF / Imprimir\` prepara la hoja A4
semántica (HTML imprimible, no captura de pantalla) y abre el diálogo nativo.
Desde Safari iPad se elige "Guardar como PDF" mediante las opciones de impresión
del sistema. No se necesita conexión a ningún servidor.

Este procedimiento no produce **una descarga .pdf silenciosa**; depende del
diálogo de impresión del navegador. En textos largos, los saltos físicos y
pies de página requieren contraste visual con un PDF real de Safari antes de
declarar equivalencia exacta con Pages.

## 6. Pruebas de regresión

- Unitarias: modelos, edición, CAS, migración y backup, banco docente, motor
  académico, propuestas de vocabulario, generador ZIP y validación XML DOCX.
- WebKit: navegación, almacenamiento, morfología por ocurrencia, regeneración
  aislada, selección nativa A4, aprobación/cancelación de vocabulario,
  descarga DOCX y aviso de borrador, impresión A4 y responsive iPad.
- Auditoría del contenido: pregunta 4 = 2 de 4 y 2 puntos, no 3; no convertir
  8 a 10; no añadir solucionarios.

## 7. Pendientes que requieren verificación final

- Contraste visual de un .docx real abierto en Word y Pages y del PDF real
  generado desde Safari iPad, especialmente textos multipágina.
- Paginación de impresión nativa: el PDF puede distribuir una aparición en
  varias hojas; el pie de la vista por texto no debe interpretarse como
  \`PAGE | NUMPAGES\` físico. Word sí utiliza esos campos reales.
- No hay descarga directa .pdf embebida. El botón usa "Imprimir/Guardar PDF".
- Banco de vocabulario universal, etiquetado automático e integración IA siguen
  fuera de esta PR.

La PR no se fusionará ni desplegará hasta autorización.

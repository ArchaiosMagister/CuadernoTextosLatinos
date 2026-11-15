# Persistencia y recuperación (fase 1)

## IndexedDB

La implementación `IndexedDbCorpusRepository` utiliza la base `cuaderno-textos-latinos`, versión de IndexedDB 1 y el almacén `corpus`. Cada versión lógica del corpus es un registro único `current`, con `revision` y `corpus`.

Las escrituras se realizan en una transacción `readwrite`: se lee el registro, se valida la revisión esperada, y únicamente entonces se sustituye el corpus. La transacción se revierte si se produce un error. Un fallo de almacenamiento **no borra el corpus anterior**, y el control de revisión protege contra dos pestañas que guarden sobre la misma versión.

El modelo docente conserva `schemaVersion: 1`. No se inventa ni aplica una migración desde versiones anteriores porque no existía persistencia en la fase 0. Las versiones de archivo desconocidas se rechazan explícitamente. Cuando cambie el esquema se añadirán migraciones con sus pruebas y una estrategia de copia previa.

## Copias externas

La copia JSON tiene los siguientes campos:

- `format: "cuaderno-textos-latinos"`
- `backupVersion: 1`
- `exportedAt: UTC ISO 8601`
- `sha256: digest hexadecimal de SHA-256`
- `corpus: CorpusV1`

La huella se calcula sobre la serialización canónica del corpus después de validar sus relaciones. Se impone un máximo de 32 MiB para esta primera versión, que se revisará según los corpus reales. El hash **no prueba autenticidad ni evita ataques** deliberados.

Importar exige escoger un archivo, marcar expresamente el reemplazo y aceptar una segunda confirmación. El archivo se verifica antes de iniciar la transacción. No se conserva automáticamente una segunda copia de la revisión sustituida: **descarga antes una copia de los datos actuales**. No hay fusión automática de dos copias.

## Riesgos contemplados

- Caída o error de escritura: transacción atómica y rechazo; versión anterior intacta.
- Errores de referencia: se valida antes de guardar y también después de leer.
- Dos pestañas: bloqueo optimista por número de revisión, no reemplazo silencioso.
- Archivo corrupto: rechazo por formato, esquema o huella.
- Cambios de versión: rechazo explícito de versiones incompatibles.
- Navegación privada, borrado de datos de Safari, baja cuota o retirada del sitio: **no se garantizan datos persistentes** sin archivo externo.
- Duplicación entre dispositivos: no existe sincronización en esta fase.

## Comprobación manual en iPad

1. Abre la web publicada en Safari (en HTTPS, no desde un archivo local).
2. Pulsa **Guardar texto de prueba** y comprueba que Textos = 1 y Revisión = 1.
3. Recarga la página; comprueba el texto con macrones y pulsa **Releer datos guardados**.
4. Cambia el texto, vuelve a guardarlo y verifica que aumenta la revisión.
5. Pulsa **Exportar copia JSON** y revisa que aparece un archivo en Descargas/Archivos.
6. Cambia el texto otra vez. Selecciona la copia descargada, marca la confirmación y pulsa **Verificar y restaurar**.
7. Comprueba que reaparece el texto original y que la revisión aumenta.
8. Prueba importar un JSON ajeno o modificado y verifica que la app lo rechaza sin sustituir datos.

La UI no es una aplicación docente funcional. La página de comprobación puede retirarse cuando se incorpore el editor definitivo.

# Arquitectura técnica — fase 1

## Módulos

- `src/core/model.ts`: modelo de datos académico versionado.
- `src/core/validation.ts`: validación de relaciones e invariantes.
- `src/core/archive.ts`: versión y pasarela de migraciones explícitas.
- `src/core/backup.ts`: exportación y lectura de copias JSON verificadas mediante SHA-256.
- `src/ports/corpus-repository.ts`: contrato con revisiones y escritura optimista.
- `src/storage/indexeddb-corpus-repository.ts`: adaptador IndexedDB transaccional.
- `src/main.ts` y `src/ui`: comprobador temporal accesible.
- `src/**/*.test.ts`: pruebas de modelo, copias e IndexedDB con `fake-indexeddb`.
- `.github/workflows/ci.yml`: control de calidad sobre PR.
- `.github/workflows/deploy-pages.yml`: publicación en Pages desde `main`, después de pasar las pruebas.

## Contratos y límites

Los identificadores permanecen estables. Las etiquetas personalizadas y del catálogo son independientes; el complemento agente y la pasiva pueden etiquetarse por separado. Los textos se ordenan explícitamente en cada cuaderno.

El repositorio administra **un corpus por origen de navegador**, sin sincronización. El adaptador almacena el corpus completo en una transacción, con validación de integridad y revisión compare-and-swap. La aplicación nunca elimina la base de datos ante errores.

Las copias externas son esenciales: IndexedDB es almacenamiento local sujeto a límites y limpieza del navegador. No hay autenticación, cuentas, transferencias de textos ni servidor de datos.

## Decisiones posteriores

- Editor de textos y catálogo gramatical docente.
- Optimización del almacenamiento e índices para corpus mayores.
- Migraciones de esquema v2+ con cobertura de compatibilidad.
- Sistema PWA, funcionamiento offline y pruebas en Safari instalado.
- Sincronización opcional si más adelante se decide (no definida ahora).
- Generación de documentos y posible IA futura (fuera de alcance).

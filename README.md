# Cuaderno de textos latinos

**Fase 2 — banco, lector y editor de textos.**

Webapp independiente para seleccionar pasajes de autores latinos, conservar textos propios y preparar cuadernos con varios textos. El selector se inspira directamente en la **biblioteca de [Examinator2](https://github.com/ArchaiosMagister/examinator2)** del docente: listado lateral, búsqueda por autor u obra, lector con citas, navegación por referencia y selección de pasajes.

## Biblioteca incluida sin conexión

La compilación distribuye en archivos estáticos **dos obras de Julio César, el Breviarium de Eutropio y veinticinco vidas de Cornelio Nepote**. Se parte de los textos que el docente ya había integrado en Examinator2 (César y Eutropio) y de la edición TEI de Perseus (Nepote). Se conservan la referencia editorial y la procedencia.

Para usarla sin conexión hay que abrir la web **una primera vez con internet**, esperar la indicación «Biblioteca preparada sin conexión» y mantener los datos del sitio. El Service Worker guarda la aplicación y todas las obras. **Safari puede eliminar caché o datos locales**: exporta copias JSON de tus textos personales y cuadernos.

Se podrá ampliar el catálogo de otros autores mediante consulta online en otra fase. No se usa una API de IA.

## Qué funciona

- Buscar por autor u obra desde la columna lateral.
- Filtrar autores y abrir una obra en el lector.
- Ir a un pasaje por referencia (p. ej. 1.1, 1.1.2).
- Tocar el inicio y el final de una selección en el iPad, conservando la cita.
- Incorporar un fragmento en «Mis textos».
- Crear, editar, guardar, buscar y eliminar textos propios.
- Crear y renombrar cuadernos, añadir y quitar textos, ordenar su contenido.
- Persistencia IndexedDB versionada y transaccional, con protección de conflictos.
- Copias JSON verificables con SHA-256 y restauración con vista previa.
- Comprobaciones unitarias y pruebas de navegador WebKit.

**No implementado todavía:** etiquetado gramatical, generación Word/PDF, preguntas, sincronización entre dispositivos ni edición colaborativa.

## Compilar y probar

Requisitos: Node.js 22 o superior, conexión a internet **en la compilación**.

1. `npm install`
2. `npm run check` (pruebas y compilación).
3. `npx playwright install --with-deps webkit` si se desean ejecutar E2E localmente.
4. `npm run test:e2e`

La compilación extrae obras de revisiones fijadas en `scripts/build-library.mjs` y genera `dist/library/`, además de la caché precargable `dist/service-worker.js`. GitHub Pages publica exclusivamente `dist/` después de pasar las pruebas.

## Documentación

- [Procedencia y condiciones de uso](docs/FUENTES-CORPUS.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Persistencia y copias](docs/PERSISTENCIA.md)
- [Contrato del corpus v1](docs/ESQUEMA-v1.md)

Los documentos privados y los datos creados en el editor **no se envían a GitHub ni a servidores**; permanecen en el navegador. Las fuentes del catálogo ya son públicas.

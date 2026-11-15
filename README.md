# Cuaderno de textos latinos

Proyecto en fase **0 — infraestructura técnica**. Todavía no hay editor, etiquetado interactivo, creación de cuadernos, generación de documentos, PWA ni integración con inteligencia artificial.

## Objetivo

Preparar una aplicación independiente para organizar textos latinos y, posteriormente, elaborar cuadernos didácticos con preguntas y etiquetas gramaticales. El código presente es sólo la base de partida, no una aplicación lista para clase.

## Requisitos y comprobaciones

- Node.js 22 o posterior.
- `npm install` para instalar las dependencias de desarrollo fijadas.
- `npm run check` para comprobar los tipos, los invariantes del modelo y la compilación.
- `npm run build` para generar `dist/`, una página estática de presentación.
- El archivo `dist/index.html` puede servirse desde un servidor estático local; no hay publicación automática.

**No** se guardan datos todavía. La interfaz muestra sólo una pantalla informativa.

## Documentación

- [Arquitectura y decisiones pendientes](docs/ARQUITECTURA.md)
- [Esquema del corpus v1](docs/ESQUEMA-v1.md)

## Estado de la seguridad

Hay validación de los datos y comprobaciones de integridad. No se han implementado autenticación, sincronización, conectividad remota ni almacenamiento persistente. Antes de incorporar datos docentes reales se deberá elegir un adaptador seguro y preparar importación, exportación y recuperación de copias.

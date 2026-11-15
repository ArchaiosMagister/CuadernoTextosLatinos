# Cuaderno de textos latinos

**Fase 1 — almacenamiento local y recuperación.**

Esta aplicación es todavía un **comprobador técnico**, no el editor definitivo de cuadernos. El objetivo de esta versión es verificar la persistencia en el navegador, la creación de copias de seguridad y su recuperación segura.

## Ejecutar comprobaciones

Requisitos: Node.js 22 o posterior.

- `npm install` — instalar dependencias de desarrollo.
- `npm run check` — validar tipos, pruebas automatizadas y compilación.
- `npm run build` — generar `dist/`.
- Publicar `dist/` como contenido estático sobre HTTPS para probar almacenamiento y descarga.

## Funcionalidad estrictamente de fase 1

- Persistencia **local** de un corpus completo mediante IndexedDB (una escritura transaccional).
- Control de revisiones para impedir la sobrescritura silenciosa desde varias pestañas.
- Validación del corpus al leer y guardar, preservando referencias y macrones.
- Copias JSON portables con versión explícita, fecha UTC y huella SHA-256.
- Restauración previa validación y confirmación consciente del reemplazo.
- Página sencilla para guardar un texto de prueba, releerlo y probar copias.

**No incluye** editor de textos completo, banco curricular, generación de cuadernos, exportación Word/PDF, cuentas, sincronización, PWA ni API de IA.

## Avisos sobre los datos

- Los datos pertenecen al **origen del sitio** en este navegador y dispositivo. Los datos en Safari, otro navegador y una web instalada no deben suponerse sincronizados ni siempre compartidos.
- IndexedDB no garantiza una copia perpetua: el navegador puede eliminar datos del sitio. **Exporta copias JSON periódicamente y consérvalas fuera del navegador.**
- Restaurar una copia sustituye el corpus local. Exporta primero la versión actual.
- El hash SHA-256 detecta modificaciones accidentales, **no autentica** a quien generó el archivo.
- Versiones futuras o desconocidas se rechazan antes de guardar: nunca se borra automáticamente la base.
- No se transfieren textos a un servidor: GitHub Pages sirve solamente los archivos estáticos.

## Documentación

- [Arquitectura y decisiones](docs/ARQUITECTURA.md)
- [Esquema de corpus v1](docs/ESQUEMA-v1.md)
- [Persistencia, riesgos y comprobación manual](docs/PERSISTENCIA.md)

# Arquitectura técnica (fase 0)

Esta fase define **contratos**, no herramientas docentes todavía.

## Responsabilidades

- `src/core/model.ts`: tipos de datos persistidos y versión de esquema.
- `src/core/validation.ts`: validación exhaustiva, integridad referencial y ciclos de etiquetas.
- `src/core/archive.ts`: serialización y punto único de futuras migraciones. No modifica datos guardados.
- `src/ports/corpus-repository.ts`: interfaz que deberá implementar el almacenamiento.
- `src/main.ts` y `src/ui`: cascarón de interfaz, sin gestión de textos.
- `src/core/*.test.ts`: pruebas automatizadas de los contratos.
- `scripts`: construcción de una página estática. No se configura despliegue automático.

## Decisiones de ingeniería

1. **Local-first a evaluar, no implementado**: no se presupone servidor, cuentas, sincronización ni Supabase. El adaptador real se decidirá antes de guardar documentos.
2. **Identificadores estables**: las relaciones se expresan por ID. Renombrar una etiqueta no debe implicar cambiar su ID.
3. **Vocabulario gramatical abierto**: las etiquetas de catálogo y las personalizadas son registros; una etiqueta puede tener padre, pero no se confunden el complemento agente y la voz pasiva.
4. **Orden explícito**: los textos se ordenan en cada cuaderno mediante `textIds`, sin alterar su texto original.
5. **Cambios de esquema explícitos**: cualquier versión desconocida se rechaza y se informa de ella. No se hace nunca una migración destructiva implícita.
6. **Entrada no confiable**: todos los archivos importados deben validarse; la interfaz utilizará `textContent` en vez de interpretar contenido como HTML.
7. **Separación de responsabilidades**: las decisiones sobre Word/PDF, gramática, editor y automatización quedan fuera de esta fase.

## Decisiones posteriores pendientes

- Adaptador transaccional real (por ejemplo IndexedDB) y copias de seguridad de usuario.
- Estructura del catálogo gramatical completo y semántica curricular de las etiquetas.
- Definición de campos y plantillas de preguntas, vocabulario y edición de documentos.
- Estrategia de PWA y funcionamiento sin conexión.
- Gestión de búsquedas, índices y rendimiento con corpus grandes.
- Autenticación sólo si se decide añadir compartición o sincronización.

## Criterio para incorporar funcionalidades

Una función nueva deberá usar el modelo, validar en el límite de entrada, probar casos de error y preservar la compatibilidad con archivos existentes. La rama principal no debe recibir cambios sin las comprobaciones automatizadas.

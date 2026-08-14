# Auditoría de estabilidad OAVIX

Este cambio aplica únicamente correcciones puntuales encontradas durante la auditoría de estabilidad y seguridad, sin reestructurar los módulos funcionales existentes.

- Protege el cierre de sesión cuando existen cambios todavía no respaldados en Google Drive.
- Añade recuperación de estado para mutaciones de Combustibles si el almacenamiento local falla.
- Corrige el texto de categoría en el detalle del calendario.
- Evita sumar monedas distintas como si fueran equivalentes en el resumen de inversión.
- Valida enlaces de fotografías antes de previsualizarlos.
- Explica antes del acceso con Google que OAVIX usa `drive.appdata`, no acceso general a los archivos personales.
- Actualiza la caché PWA para incluir las nuevas guardas.

No cambia el alcance OAuth, el motor de merge, la estructura de datos, el formato del respaldo ni la actualización oficial de precios SEN.

# Arquitectura de OAVIX

OAVIX se está organizando por funciones para que cada cambio tenga un alcance claro y no afecte áreas que ya funcionan.

## Estructura actual

| Ruta | Responsabilidad |
| --- | --- |
| `index.html` | Cargador mínimo de la aplicación. No contiene lógica de negocio. |
| `src/app.js` | Carga las vistas y arranca OAVIX cuando todas están disponibles. |
| `src/app-shell/` | Navegación y encabezado compartidos. |
| `src/features/dashboard/` | Vista del panel principal. |
| `src/features/maintenance/` | Vista y ventanas de mantenimiento. |
| `src/features/calendar/` | Vista del calendario. |
| `src/features/alerts/` | Vista y ventanas de alertas. |
| `src/features/fuel/` | Vista de gasolina. |
| `src/features/archive/` | Vista del archivo. |
| `src/ui/` | Tema y notificaciones visuales compartidas. |
| `src/styles/` | Estilos generales. |
| `src/core/` | Estado, almacenamiento, utilidades y arranque compartidos. |
| `src/features/*/controller.js` | Lógica propia de cada función. |
| `src/ui/*/controller.js` | Lógica de navegación, tema y avisos visuales. |
| `oavix-sync.js` | Sincronización y autenticación de Google. |
| `oavix-fuel-module.js` | Datos y cálculos actuales de combustible. |
| `tests/` | Pruebas que protegen navegación, almacenamiento, sincronización y despliegue. |

## Regla de mantenimiento

- Un cambio visual de una pestaña se realiza en su carpeta dentro de `src/features/`.
- `index.html` solo vincula las partes de la aplicación.
- La lógica compartida debe quedar en módulos de núcleo; la lógica propia de una función debe quedar junto a esa función.
- Cada reorganización se integra en una etapa pequeña, con pruebas automatizadas y validación de la versión publicada.

## Próximas etapas

1. Aislar autenticación, sincronización remota y almacenamiento local detrás de interfaces claras.
2. Añadir pruebas específicas para cada controlador.
3. Mantener cada cambio futuro dentro de la carpeta de la función afectada.

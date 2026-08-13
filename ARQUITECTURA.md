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
| `src/features/fuel/` | Vista, interacción, vehículos y cálculos de Combustibles. |
| `src/features/archive/` | Vista del archivo. |
| `src/ui/` | Tema y notificaciones visuales compartidas. |
| `src/styles/` | Estilos generales. |
| `src/core/` | Estado, almacenamiento, utilidades y arranque compartidos. |
| `src/features/*/controller.js` | Lógica propia de cada función. |
| `src/ui/*/controller.js` | Lógica de navegación, tema y avisos visuales. |
| `src/services/sync/context.js` | Configuración y estado temporal de la sesión remota. |
| `src/services/sync/merge-engine.js` | Combinación por registro, fechas por campo y marcas de borrado. |
| `src/services/sync/account-storage.js` | Datos locales separados por cuenta. |
| `src/services/sync/google-auth.js` | Inicio y cierre de sesión con Google. |
| `src/services/sync/drive-client.js` | Comunicación de bajo nivel con Google Drive. |
| `src/services/sync/synchronizer.js` | Flujo Drive-first: descargar, combinar y después guardar. |
| `src/services/sync/ui.js` | Interfaz de sesión, botón de nube e instalación PWA. |
| `src/services/sync/bootstrap.js` | Vinculación pública y eventos de sincronización. |
| `src/features/fuel/module.js` | Modelo autónomo de Combustibles: vehículos, cargas, unidades, consumo y precios SEN. |
| `data/sen-prices.json` | Última copia nacional validada del tablero oficial de la SEN. |
| `scripts/update-sen-prices.mjs` | Actualización automática y validación preventiva de precios oficiales. |
| `tests/` | Pruebas que protegen navegación, almacenamiento, sincronización y despliegue. |

## Regla de mantenimiento

- Un cambio visual de una pestaña se realiza en su carpeta dentro de `src/features/`.
- `index.html` solo vincula las partes de la aplicación.
- La lógica compartida debe quedar en módulos de núcleo; la lógica propia de una función debe quedar junto a esa función.
- Cada reorganización se integra en una etapa pequeña, con pruebas automatizadas y validación de la versión publicada.

## Regla de sincronización

- Google Drive se consulta antes de cada subida; un dispositivo vacío no reemplaza una cuenta con información.
- Mantenimiento, cargas y vehículos se combinan registro por registro. Los registros distintos se conservan y, si el mismo registro cambió en dos equipos, se usa su modificación más reciente.
- Los precios SEN no se suben al Drive personal: son una copia pública común, renovada automáticamente, y nunca sustituyen la última tabla válida con una respuesta vacía.
- Los borrados guardan una marca interna para que un equipo atrasado no vuelva a crear información eliminada.
- La copia local conserva cambios sin conexión y los envía al abrir, volver a la aplicación, recuperar Internet o usar el botón de nube.
- Cada correo de Google mantiene una copia local independiente y utiliza su propio archivo privado de datos de aplicación en Drive.

## Próximas etapas

1. Añadir pruebas específicas cuando una función reciba una capacidad nueva.
2. Mantener cada cambio futuro dentro de la carpeta de la función afectada.
3. Actualizar esta guía cuando cambie una responsabilidad compartida.

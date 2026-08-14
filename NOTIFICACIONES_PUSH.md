# Notificaciones push de OAVIX (sin facturación automática)

OAVIX conserva la alarma local y añade Web Push para avisar con la aplicación cerrada o el teléfono bloqueado. GitHub Pages aloja la aplicación y un Cloudflare Worker del plan **Workers Free** guarda y envía los avisos. Firebase no se utiliza para este servicio.

## Garantía de costo elegida

- Mantener Firebase en el plan Spark y sin cuenta de facturación vinculada.
- Crear el Worker dentro del plan Workers Free; no contratar Workers Paid.
- Si OAVIX alcanza una cuota gratuita, las solicitudes se rechazan hasta que la cuota se reinicia. La aplicación no cambia automáticamente a un plan de pago.
- El Worker limita cada ejecución a 25 recordatorios y 5 dispositivos por cuenta para evitar consumo accidental.

## Componentes

- `src/services/push/controller.js`: crea la suscripción del dispositivo y sincroniza los recordatorios.
- `sw.js`: muestra el aviso en segundo plano y abre Alertas al tocarlo.
- `cloudflare/push-worker/src/index.js`: verifica la cuenta de Google, guarda los datos en D1 y envía avisos vencidos.
- `cloudflare/push-worker/schema.sql`: estructura privada de la base D1.
- `oavix-push-config.js`: contiene únicamente el endpoint y la clave VAPID pública.

## Activación única en Cloudflare

No se debe introducir ninguna tarjeta ni seleccionar Workers Paid durante estos pasos.

1. Crear o abrir una cuenta gratuita en Cloudflare y entrar en **Workers & Pages**.
2. Desde `cloudflare/push-worker`, instalar dependencias e iniciar sesión:

   ```sh
   npm install
   npx wrangler login
   ```

3. Crear la base gratuita D1 y copiar su `database_id` en `wrangler.jsonc`:

   ```sh
   npx wrangler d1 create oavix-push
   npx wrangler d1 execute oavix-push --remote --file=schema.sql
   ```

4. Generar una sola vez las claves VAPID:

   ```sh
   npx web-push generate-vapid-keys
   ```

5. Sustituir `VAPID_SUBJECT` en `wrangler.jsonc` por un correo con formato `mailto:correo@dominio.com`. Guardar las claves como secretos; Wrangler pedirá cada valor sin escribirlo en Git:

   ```sh
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```

6. Comprobar y desplegar el Worker:

   ```sh
   npm run check
   npm run deploy
   ```

7. Editar `oavix-push-config.js` con la URL mostrada por Wrangler y la misma clave pública:

   ```js
   window.OAVIX_PUSH_CONFIG = Object.freeze({
     enabled: true,
     endpoint: 'https://oavix-push.USUARIO.workers.dev',
     publicVapidKey: 'CLAVE_VAPID_PUBLICA'
   });
   ```

La clave privada nunca debe colocarse en GitHub, `wrangler.jsonc`, `oavix-push-config.js` ni el navegador.

## Uso en el teléfono

- Android: abrir OAVIX en Chrome, permitir notificaciones y preferiblemente instalar la PWA.
- iPhone/iPad: usar iOS 16.4 o posterior, agregar OAVIX a la pantalla de inicio y activar las notificaciones desde la PWA.
- Tocar una vez **Notificaciones y alarmas** dentro del engranaje para registrar cada dispositivo.
- El aviso depende de la conexión a Internet y de que el sistema operativo no haya revocado el permiso.

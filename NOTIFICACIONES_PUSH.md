# Notificaciones push de OAVIX

OAVIX conserva la alarma local y añade Web Push para avisar con la aplicación cerrada. GitHub Pages aloja el cliente; Firebase ejecuta el endpoint seguro y el programador.

## Componentes

- `src/services/push/controller.js`: crea la suscripción del dispositivo y sincroniza recordatorios.
- `sw.js`: muestra el aviso en segundo plano y abre la pestaña de Alertas al tocarlo.
- `firebase/functions/index.js`: verifica la cuenta mediante el token de Google Drive, guarda datos en Firestore y envía avisos vencidos.
- `oavix-push-config.js`: contiene únicamente valores públicos.

## Configuración única

1. Crear un proyecto Firebase y habilitar Firestore en modo producción.
   Las funciones programadas y Secret Manager requieren que el proyecto permita facturación, aunque el uso pequeño normalmente permanezca dentro de las cuotas sin costo.
2. Instalar Firebase CLI y autenticar la cuenta:

   ```sh
   npm install -g firebase-tools
   firebase login
   ```

3. Copiar `.firebaserc.example` como `.firebaserc` y colocar el ID real del proyecto.
4. Instalar las dependencias del backend:

   ```sh
   cd firebase/functions
   npm install
   ```

5. Generar claves VAPID una sola vez:

   ```sh
   npx web-push generate-vapid-keys
   ```

6. Guardar la clave privada como secreto y configurar los parámetros públicos:

   ```sh
   firebase functions:secrets:set VAPID_PRIVATE_KEY
   ```

   Al desplegar, Firebase solicitará `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` y `OAVIX_ALLOWED_ORIGIN`. Para producción:

   - `VAPID_SUBJECT`: un correo con formato `mailto:correo@dominio.com`.
   - `OAVIX_ALLOWED_ORIGIN`: `https://hnalvaradohn.github.io`.

7. Desplegar Firestore y las funciones:

   ```sh
   firebase deploy --only firestore,functions
   ```

8. Editar `oavix-push-config.js`:

   ```js
   window.OAVIX_PUSH_CONFIG = Object.freeze({
     enabled: true,
     endpoint: 'https://us-central1-PROYECTO.cloudfunctions.net/syncPushState',
     publicVapidKey: 'CLAVE_VAPID_PUBLICA'
   });
   ```

## Uso en el teléfono

- Android: abrir OAVIX en Chrome, permitir notificaciones y, preferiblemente, instalar la PWA.
- iPhone/iPad: iOS 16.4 o posterior; agregar OAVIX a la pantalla de inicio y activar notificaciones desde la PWA instalada.
- Después de conectar Firebase, tocar una vez `Notificaciones y alarmas` en el engranaje para registrar cada dispositivo.

La clave VAPID privada nunca debe colocarse en GitHub, `oavix-push-config.js` ni el navegador.

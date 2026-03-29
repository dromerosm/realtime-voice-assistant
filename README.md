# Realtime Voice Assistant

POC ligero para un asistente de voz en tiempo real con `gpt-realtime-1.5`.

## Stack

- `Node 24`
- `TypeScript`
- `Vite`
- `WebRTC` directo navegador -> OpenAI Realtime API
- `SQLite` local con `node:sqlite` para memoria persistente ligera
- `Docker` para local y producción

## Qué hace

- Sirve una webapp estática con transcript visible.
- Puede exigir una pantalla de login previa con cookie de sesión `HttpOnly`.
- Expone `POST /api/realtime/token` para emitir `client_secrets` efímeros.
- Extrae memoria persistente ligera en segundo plano con `gpt-5-mini`.
- Lanza búsquedas web solo cuando el modelo Realtime lo pide, usando un sidecar de `Responses API` con `gpt-5-nano`.
- Carga esa memoria en nuevas sesiones como contexto inicial mediante un mensaje oculto de usuario, no como instrucciones del sistema.
- Expone `POST /api/memory/ingest` y `POST /api/memory/reset`.
- No usa relay propio para audio ni infraestructura externa adicional.
- Añade rate limiting, TTL corto del token efímero y soporte opcional para Cloudflare Turnstile.

## Configuración

La configuración queda separada en dos sitios:

- secretos y credenciales en `.env`
- parámetros operativos no sensibles en [app.config.json](./app.config.json)

### `.env`

Deja aquí solo secretos:

- `OPENAI_API_KEY`
- `APP_LOGIN_PASSWORD_HASH`
- `APP_SESSION_SECRET`
- `MEMORY_ADMIN_TOKEN`
- `ADMIN_SESSION_SECRET`
- `TURNSTILE_SECRET_KEY`

Opcionalmente puedes seguir guardando aquí credenciales de infraestructura o tooling, por ejemplo:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `GITHUB_TOKEN`

El ejemplo mínimo está en [.env.example](./.env.example).

### `app.config.json`

Deja aquí todo lo no sensible:

- puerto y host internos
- modelo, voz e instrucciones de Realtime
- rate limits y TTLs
- orígenes permitidos
- confianza en proxy
- flags de login, memoria y web search
- ruta SQLite
- `TURNSTILE_SITE_KEY`

## Probar en local

```bash
docker compose up --build
```

Abre `http://localhost:3001`.
Si quieres otro puerto externo, define `APP_PORT`.
Si cambias `APP_PORT`, ajusta también `realtime.allowedOrigins` en [app.config.json](./app.config.json).

La memoria persistente se guarda en un volumen Docker llamado `memory-data`.
Si defines `MEMORY_ADMIN_TOKEN`, aparecerá un botón `Admin` en la UI para abrir o cerrar una sesión admin y habilitar `Reset memory`.
Si activas `webSearch.enabled`, el asistente podrá verificar información reciente con una tool propia y una búsqueda sidecar rápida con caché local.

## Proxy y cabeceras

Por defecto la app no confía en `X-Forwarded-For` ni en `X-Forwarded-Proto`. Esto evita que el rate limiting y el flag `Secure` de la cookie dependan de cabeceras falsificables si alguien llega directo al origen.

Solo actívalo si el contenedor está expuesto exclusivamente detrás de un proxy de confianza:

- `proxy.trustHeaders=true`
- `proxy.ipHeader="cf-connecting-ip"` si entras por Cloudflare
- `proxy.ipHeader="x-forwarded-for"` solo si Traefik o tu proxy sanea esa cabecera y el origen no está expuesto públicamente

Si publicas la IP del servidor directamente además del proxy, vuelve a `proxy.trustHeaders=false`.

## Login de acceso a la app

Si vas a publicarla en Hetzner/Cloudflare, activa el acceso previo de aplicación:

- `appLogin.enabled=true` en [app.config.json](./app.config.json)
- `APP_LOGIN_PASSWORD_HASH` con formato `scrypt$<saltBase64>$<derivedKeyBase64>`
- `APP_SESSION_SECRET` con un secreto distinto para firmar la cookie de sesión

Ejemplo rápido para generar el hash:

```bash
node -e 'const { randomBytes, scryptSync } = require("node:crypto"); const password = process.argv[1]; const salt = randomBytes(16); const hash = scryptSync(password, salt, 64); console.log(`scrypt$${salt.toString("base64")}$${hash.toString("base64")}`);' "cambia-esta-password"
```

El login de la app:

- bloquea la UI hasta que exista sesión válida
- protege `POST /api/realtime/token`, memoria, tools y sesión admin
- usa cookie `HttpOnly`, `SameSite=Strict` y añade `Secure` automáticamente cuando llega por HTTPS o `x-forwarded-proto=https`
- aplica rate limiting independiente a los intentos de acceso

## Hardening incluido

- La API key de OpenAI nunca sale del servidor.
- El acceso general a la app puede quedar detrás de una contraseña con hash `scrypt`.
- Los `client_secrets` efímeros tienen TTL corto.
- El endpoint de token aplica rate limiting por IP.
- Los errores upstream no se devuelven completos al cliente.
- Se validan orígenes permitidos según `realtime.allowedOrigins`.
- La app envía `Content-Security-Policy` para reducir impacto de XSS y carga de terceros no esperados.
- Si configuras Cloudflare Turnstile, la emisión del token requiere verificación humana.
- El borrado de memoria persistente exige `MEMORY_ADMIN_TOKEN`.
- La UI usa una cookie `HttpOnly` de sesión admin para habilitar el borrado desde el navegador.
- El extractor de memoria usa política conservadora y descarta datos sensibles o de baja confianza.
- La memoria persistente se inyecta en Realtime como `conversation.item.create` con rol `user`, evitando mezclar contenido derivado del usuario con `instructions`.
- La búsqueda web no entra en el camino crítico de voz: Realtime solo decide cuándo usarla y el backend la resuelve aparte con `gpt-5-nano` y caché.

## Build local sin Docker

```bash
npm install
npm run build
npm start
```

## Despliegue en Hetzner

La app está preparada para empaquetarse como una única imagen. Para desplegarla detrás de Traefik con la skill disponible:

Antes de publicar, revisa también [PRE-DEPLOY.md](./PRE-DEPLOY.md).

1. Construye y publica una imagen accesible desde Hetzner.
2. Usa la skill `cloudflare-hetzner-subdomain` desde la raíz del repo con:

```bash
bash \
  .agents/skills/cloudflare-hetzner-subdomain/scripts/provision_subdomain.sh \
  --subdomain realtime-assistant \
  --image <tu-imagen-publicada> \
  --internal-port 3000 \
  --service-name realtime-assistant
```

La skill se encarga del DNS y de los labels de Traefik en el host remoto.

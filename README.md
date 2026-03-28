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
- Expone `POST /api/realtime/token` para emitir `client_secrets` efímeros.
- Extrae memoria persistente ligera en segundo plano con `gpt-5-mini`.
- Carga esa memoria en nuevas sesiones como contexto inicial mediante un mensaje oculto de usuario, no como instrucciones del sistema.
- Expone `POST /api/memory/ingest` y `POST /api/memory/reset`.
- No usa relay propio para audio ni infraestructura externa adicional.
- Añade rate limiting, TTL corto del token efímero y soporte opcional para Cloudflare Turnstile.

## Variables de entorno

Parte de las variables ya existen en tu `.env`. Añade o ajusta las de la app según `.env.example`.

Variables mínimas:

- `OPENAI_API_KEY`
- `APP_PORT` opcional, por defecto `3001`

Variables opcionales:

- `OPENAI_REALTIME_MODEL`
- `OPENAI_REALTIME_VOICE`
- `OPENAI_REALTIME_TRANSCRIPTION_MODEL`
- `OPENAI_REALTIME_INSTRUCTIONS`
- `OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS`
- `OPENAI_REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS`
- `OPENAI_REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS`
- `OPENAI_REALTIME_ALLOWED_ORIGINS`
- `OPENAI_MEMORY_ENABLED`
- `OPENAI_MEMORY_MODEL`
- `MEMORY_DB_PATH`
- `MEMORY_ADMIN_TOKEN`
- `ADMIN_SESSION_TTL_SECONDS`
- `ADMIN_SESSION_SECRET`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

## Probar en local

```bash
docker compose up --build
```

Abre `http://localhost:3001`.
Si quieres otro puerto externo, define `APP_PORT`.
Si cambias `APP_PORT`, ajusta también `OPENAI_REALTIME_ALLOWED_ORIGINS`.

La memoria persistente se guarda en un volumen Docker llamado `memory-data`.
Si defines `MEMORY_ADMIN_TOKEN`, aparecerá un botón `Admin` en la UI para abrir o cerrar una sesión admin y habilitar `Reset memory`.

## Hardening incluido

- La API key de OpenAI nunca sale del servidor.
- Los `client_secrets` efímeros tienen TTL corto.
- El endpoint de token aplica rate limiting por IP.
- Los errores upstream no se devuelven completos al cliente.
- Se validan orígenes permitidos si defines `OPENAI_REALTIME_ALLOWED_ORIGINS`.
- Si configuras Cloudflare Turnstile, la emisión del token requiere verificación humana.
- El borrado de memoria persistente exige `MEMORY_ADMIN_TOKEN`.
- La UI usa una cookie `HttpOnly` de sesión admin para habilitar el borrado desde el navegador.
- El extractor de memoria usa política conservadora y descarta datos sensibles o de baja confianza.
- La memoria persistente se inyecta en Realtime como `conversation.item.create` con rol `user`, evitando mezclar contenido derivado del usuario con `instructions`.

## Build local sin Docker

```bash
npm install
npm run build
MEMORY_DB_PATH=./data/memory.sqlite npm start
```

## Despliegue en Hetzner

La app está preparada para empaquetarse como una única imagen. Para desplegarla detrás de Traefik con la skill disponible:

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

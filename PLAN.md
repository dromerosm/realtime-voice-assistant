# Webapp Realtime Docker-First Con `gpt-realtime-1.5` Y `Node 24`

## Resumen

- Construir la app como **un único servicio Node 24 en TypeScript** que sirve:
  - el **frontend estático** de la webapp
  - un **endpoint backend mínimo** para emitir `client_secrets`
- Usar **WebRTC directo navegador -> OpenAI Realtime API** para minimizar delay.
- Usar **Docker también en local** desde el día 1, con la **misma imagen base** que irá a Hetzner.
- Mantener **memoria solo de la sesión actual** usando la `Conversation` del Realtime API; sin BD en v1.
- Desplegar en Hetzner detrás de Traefik con la skill `cloudflare-hetzner-subdomain`.

## Implementación

- **Stack**
  - Runtime: `Node 24`
  - Lenguaje: `TypeScript`
  - Frontend: `Vite` + DOM/WebRTC nativo, sin React/Next
  - Backend HTTP: servidor mínimo en Node; evitar framework pesado
  - Contenerización: `Dockerfile` multi-stage sobre `node:24-alpine`
  - Orquestación local/prod: `docker compose`

- **Arquitectura de app**
  - Un único proceso Node sirve la SPA compilada y expone `GET /api/realtime/token`.
  - El navegador:
    - pide token efímero al backend
    - abre `RTCPeerConnection`
    - manda SDP a OpenAI
    - captura micrófono con `getUserMedia`
    - reproduce audio remoto del modelo en un `<audio autoplay>`
    - usa `data channel` `oai-events` para eventos y transcript
  - El backend no hace relay del audio.

- **Configuración Realtime**
  - Modelo: `gpt-realtime-1.5`
  - Tipo de sesión: `realtime`
  - VAD server-side habilitado
  - Voz por defecto fija en v1
  - Truncation configurada para contener coste sin romper memoria de sesión
  - Transcript visible en UI para depuración y comprobación de memoria

- **Estructura mínima**
  - `Dockerfile`
  - `docker-compose.yml`
  - `package.json`
  - `src/server/*`
  - `src/client/*`
  - `.env.example`
  - `README.md`
  - `PLAN.md`

## APIs / Interfaces

- `GET /api/realtime/token`
  - Usa `OPENAI_API_KEY` en servidor.
  - Llama a `POST /v1/realtime/client_secrets`.
  - Devuelve al cliente el `client_secret` efímero sin exponer la API key real.

- **UI v1**
  - Botón `Connect`
  - Botón `Hang up`
  - Estado actual: `idle`, `connecting`, `listening`, `speaking`, `error`
  - Transcript incremental en pantalla
  - Sin auth, sin historial persistente, sin selector avanzado de dispositivos en v1

## Docker Y Despliegue

- **Local**
  - `docker compose up --build`
  - Publicar el servicio en `http://localhost:<puerto>`
  - Montar `.env` local con `OPENAI_API_KEY`
  - Probar micrófono desde navegador local

- **Producción en Hetzner**
  - Reutilizar la misma imagen y el mismo comando de arranque
  - Ajustar solo variables de entorno y labels Traefik
  - Exponer el contenedor por hostname usando la skill `cloudflare-hetzner-subdomain`
  - Sin Traefik local; Traefik solo en Hetzner

## Test Plan

- El contenedor local arranca y sirve frontend + API en un solo servicio.
- `GET /api/realtime/token` devuelve token efímero válido.
- La app negocia WebRTC correctamente con OpenAI.
- El micrófono entra al modelo y el audio del modelo se reproduce en la página.
- El transcript refleja los turnos y permite verificar que el modelo recuerda datos previos dentro de la misma sesión.
- Al recargar la página, la memoria desaparece por diseño.
- La misma imagen funciona en Hetzner detrás de Traefik sin cambios de código.

## Supuestos Y Defaults

- Alcance inicial: **POC de un usuario**.
- Memoria: **solo durante la sesión actual**.
- Local y producción comparten **misma imagen Docker**.
- No se añade base de datos en v1.
- Si luego quieres memoria persistente entre sesiones, la siguiente ampliación correcta es **SQLite en el mismo contenedor** antes de introducir más infraestructura.

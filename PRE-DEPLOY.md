# Pre-Deploy

Checklist y notas de seguridad antes de desplegar esta app en Hetzner/Cloudflare.

## Estado actual

La app ya incluye:

- login previo de aplicación con cookie de sesión `HttpOnly`
- sesión admin separada para acciones sensibles
- rate limiting en login y en emisión de tokens efímeros
- validación de `Origin` para endpoints sensibles
- soporte opcional para Cloudflare Turnstile
- `Content-Security-Policy`
- cookies con `SameSite=Strict`
- flag `Secure` automático cuando la request llega como HTTPS a través de proxy confiable

## Dónde va cada cosa

### `.env`

Solo secretos:

- `OPENAI_API_KEY`
- `APP_LOGIN_PASSWORD_HASH`
- `APP_SESSION_SECRET`
- `MEMORY_ADMIN_TOKEN`
- `ADMIN_SESSION_SECRET`
- `TURNSTILE_SECRET_KEY`

Opcionalmente también credenciales de infra o tooling:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `GITHUB_TOKEN`

### `app.config.json`

Todo lo no sensible:

- `server`
- `realtime`
- `proxy`
- `appLogin`
- `memory`
- `admin`
- `webSearch`
- `turnstile.siteKey`

## Hallazgos del mini pentest

### Corregido

1. Se podía esquivar el rate limiting falsificando `X-Forwarded-For`.

- Antes, el backend aceptaba `X-Forwarded-For` por defecto como IP cliente.
- Impacto: un atacante podía rotar esa cabecera y evitar el bloqueo de intentos.
- Estado actual: corregido.
- Ahora solo se aceptan cabeceras de proxy si activas explícitamente:
  - `proxy.trustHeaders=true`
  - `proxy.ipHeader="<cabecera>"`

2. Faltaba `Content-Security-Policy`.

- Impacto: cualquier XSS futura tendría más alcance.
- Estado actual: corregido.
- La app ya envía CSP restrictiva para scripts, conexiones y frames.

### Verificado

- Sin sesión, `/api/realtime/token` devuelve `401`.
- Sin sesión, `/api/memory` devuelve `401`.
- `POST /api/auth/session` devuelve `401` con contraseña inválida.
- `POST /api/auth/session` devuelve `403` si el `Origin` no está permitido.
- `POST /api/memory/reset` devuelve `403` con `Origin` ajeno.
- El reset de memoria exige sesión de app y sesión admin válidas.
- La cookie de app sale con `HttpOnly; SameSite=Strict`.
- La cookie añade `Secure` cuando la request entra como HTTPS vía proxy confiable.

## Variables obligatorias para producción

Configura al menos:

- `OPENAI_API_KEY`
- `realtime.allowedOrigins=["https://<tu-dominio>"]` en `app.config.json`
- `appLogin.enabled=true` en `app.config.json`
- `APP_LOGIN_PASSWORD_HASH=scrypt$<saltBase64>$<derivedKeyBase64>`
- `APP_SESSION_SECRET=<secreto-largo-y-distinto-del-hash>`
- `MEMORY_ADMIN_TOKEN=<token-admin-largo>`
- `ADMIN_SESSION_SECRET=<secreto-largo-y-distinto>`

Si usas Cloudflare/Traefik:

- `proxy.trustHeaders=true`
- `proxy.ipHeader="cf-connecting-ip"`

Si expones la IP del origen directamente o no estás seguro de sanear cabeceras:

- `proxy.trustHeaders=false`

Opcionales recomendables:

- `turnstile.siteKey`
- `TURNSTILE_SECRET_KEY`
- `realtime.clientSecretTtlSeconds=120` o menos si quieres ser más agresivo
- `realtime.tokenRateLimitWindowMs`
- `realtime.tokenRateLimitMaxRequests`
- `appLogin.rateLimitWindowMs`
- `appLogin.rateLimitMaxAttempts`

## Generar el hash de contraseña

Ejemplo:

```bash
node -e 'const { randomBytes, scryptSync } = require("node:crypto"); const password = process.argv[1]; const salt = randomBytes(16); const hash = scryptSync(password, salt, 64); console.log(`scrypt$${salt.toString("base64")}$${hash.toString("base64")}`);' "cambia-esta-password"
```

## Configuración recomendada detrás de Cloudflare

- Publica solo el dominio detrás de Cloudflare.
- No expongas el origen de Hetzner directamente a Internet si puedes evitarlo.
- Usa `proxy.trustHeaders=true`.
- Usa `proxy.ipHeader="cf-connecting-ip"`.
- Mantén `realtime.allowedOrigins` limitado a tu dominio final.
- Si activas Turnstile, verifica que el sitio y el secreto corresponden al dominio final.

## Configuración recomendada detrás de Traefik

- Asegúrate de que Traefik reenvía HTTPS al backend con `X-Forwarded-Proto=https`.
- Si Cloudflare está delante de Traefik, prioriza `cf-connecting-ip` como IP cliente.
- No aceptes `x-forwarded-for` salvo que controles totalmente el acceso al origen y sanees la cabecera.

## Checklist antes de desplegar

- `npm run typecheck`
- `npm run build`
- Probar login correcto y login incorrecto
- Confirmar `401` en `/api/realtime/token` sin sesión
- Confirmar `403` con `Origin` no permitido en `/api/auth/session`
- Confirmar presencia de `Content-Security-Policy` en la respuesta HTML
- Confirmar que la cookie de sesión sale con `Secure` en el dominio HTTPS final
- Confirmar que `appLogin.enabled=true` en producción
- Confirmar que `APP_SESSION_SECRET` y `ADMIN_SESSION_SECRET` no reutilizan otros secretos
- Confirmar que el origen de Hetzner no queda expuesto directamente si activas confianza en proxy

## Pruebas rápidas útiles

Sin sesión:

```bash
curl -i -X POST https://<tu-dominio>/api/realtime/token \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Debe devolver `401`.

Login con `Origin` incorrecto:

```bash
curl -i -X POST https://<tu-dominio>/api/auth/session \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  -d '{"password":"test"}'
```

Debe devolver `403`.

Ver cabeceras del HTML:

```bash
curl -I https://<tu-dominio>/
```

Debe incluir al menos:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Riesgos residuales

- Si activas confianza en proxy y el origen sigue expuesto públicamente, vuelves a abrir la puerta a cabeceras falsificadas.
- La CSP actual es razonable para esta app, pero cualquier cambio en recursos externos debe revisarse antes de desplegar.
- Turnstile mejora el abuso automatizado, pero no sustituye el login ni el rate limiting.
- Si la API key de OpenAI o los secretos de sesión se filtran en el host, el endurecimiento HTTP deja de ser suficiente.

## Decisión de despliegue

No desplegar hasta cumplir:

- login de app activado
- secretos de sesión definidos
- orígenes permitidos ajustados en `app.config.json` al dominio final
- estrategia de proxy clara
- verificación manual de cookies `Secure` en HTTPS

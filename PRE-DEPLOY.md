# Pre-Deploy

Checklist and security notes before deploying this app on Hetzner and Cloudflare.

## Current State

The app already includes:

- app-level login with an `HttpOnly` session cookie
- a separate admin session for sensitive actions
- rate limiting for login attempts and ephemeral token issuance
- `Origin` validation on sensitive endpoints
- optional Cloudflare Turnstile support
- `Content-Security-Policy`
- cookies with `SameSite=Strict`
- automatic `Secure` cookies when the request arrives as HTTPS through a trusted proxy

## Where Each Setting Belongs

### `.env`

Secrets only:

- `OPENAI_API_KEY`
- `APP_LOGIN_PASSWORD_HASH`
- `APP_SESSION_SECRET`
- `MEMORY_ADMIN_TOKEN`
- `ADMIN_SESSION_SECRET`
- `TURNSTILE_SECRET_KEY`

Optional infrastructure or tooling credentials:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `GITHUB_TOKEN`

If the repo is public, keep those infrastructure credentials outside the project instead of in a local `.env` inside the tree.

### `app.config.json`

All non-sensitive settings:

- `server`
- `realtime`
- `proxy`
- `appLogin`
- `memory`
- `admin`
- `webSearch`
- `turnstile.siteKey`

## Findings From The Mini Pentest

### Fixed

1. Rate limiting could be bypassed by spoofing `X-Forwarded-For`.

- Previously, the backend accepted `X-Forwarded-For` as the client IP by default.
- Impact: an attacker could rotate that header and bypass request throttling.
- Current state: fixed.
- Proxy headers are now accepted only if you explicitly enable:
  - `proxy.trustHeaders=true`
  - `proxy.ipHeader="<header>"`

2. `Content-Security-Policy` was missing.

- Impact: any future XSS would have had a wider blast radius.
- Current state: fixed.
- The app now sends a restrictive CSP for scripts, connections, and frames.

### Verified

- Without a session, `/api/realtime/token` returns `401`.
- Without a session, `/api/memory` returns `401`.
- `POST /api/auth/session` returns `401` with an invalid password.
- `POST /api/auth/session` returns `403` if the `Origin` is not allowed.
- `POST /api/memory/reset` returns `403` with a foreign `Origin`.
- Memory reset requires both a valid app session and a valid admin session.
- The app cookie is sent with `HttpOnly; SameSite=Strict`.
- The cookie adds `Secure` when the request arrives as HTTPS through a trusted proxy.

## Required Production Variables

Configure at least:

- `OPENAI_API_KEY`
- `realtime.allowedOrigins=["https://<your-domain>"]` in `app.config.json`
- `appLogin.enabled=true` in `app.config.json`
- `APP_LOGIN_PASSWORD_HASH=scrypt$<saltBase64>$<derivedKeyBase64>`
- `APP_SESSION_SECRET=<long-secret-distinct-from-the-password-hash>`
- `MEMORY_ADMIN_TOKEN=<long-admin-token>`
- `ADMIN_SESSION_SECRET=<separate-long-secret>`

If you use Cloudflare and Traefik:

- `proxy.trustHeaders=true`
- `proxy.ipHeader="cf-connecting-ip"`

If you expose the origin IP directly or are not sure that headers are sanitized:

- `proxy.trustHeaders=false`

Recommended optional settings:

- `turnstile.siteKey`
- `TURNSTILE_SECRET_KEY`
- `realtime.clientSecretTtlSeconds=120` or less if you want a more aggressive TTL
- `realtime.tokenRateLimitWindowMs`
- `realtime.tokenRateLimitMaxRequests`
- `appLogin.rateLimitWindowMs`
- `appLogin.rateLimitMaxAttempts`

## Generate The Password Hash

Example:

```bash
node -e 'const { randomBytes, scryptSync } = require("node:crypto"); const password = process.argv[1]; const salt = randomBytes(16); const hash = scryptSync(password, salt, 64); console.log(`scrypt$${salt.toString("base64")}$${hash.toString("base64")}`);' "change-this-password"
```

## Recommended Setup Behind Cloudflare

- Publish only the final domain behind Cloudflare.
- Do not expose the Hetzner origin directly to the Internet if you can avoid it.
- Use `proxy.trustHeaders=true`.
- Use `proxy.ipHeader="cf-connecting-ip"`.
- Keep `realtime.allowedOrigins` restricted to the final domain.
- If you enable Turnstile, make sure the site key and secret match the final domain.

## Recommended Setup Behind Traefik

- Make sure Traefik forwards HTTPS to the backend with `X-Forwarded-Proto=https`.
- If Cloudflare sits in front of Traefik, prefer `cf-connecting-ip` as the client IP header.
- Do not accept `x-forwarded-for` unless you fully control origin access and sanitize that header.

## Checklist Before Deployment

- `npm run typecheck`
- `npm run build`
- Test successful and failed login flows
- Confirm `401` from `/api/realtime/token` without a session
- Confirm `403` from `/api/auth/session` with a disallowed `Origin`
- Confirm `Content-Security-Policy` is present on the HTML response
- Confirm the session cookie is marked `Secure` on the final HTTPS domain
- Confirm `appLogin.enabled=true` in production
- Confirm `APP_SESSION_SECRET` and `ADMIN_SESSION_SECRET` do not reuse other secrets
- Confirm the Hetzner origin is not directly exposed if proxy trust is enabled

## Useful Quick Checks

Without a session:

```bash
curl -i -X POST https://<your-domain>/api/realtime/token \
  -H 'Content-Type: application/json' \
  -d '{}'
```

It should return `401`.

Login with an invalid `Origin`:

```bash
curl -i -X POST https://<your-domain>/api/auth/session \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  -d '{"password":"test"}'
```

It should return `403`.

Inspect HTML headers:

```bash
curl -I https://<your-domain>/
```

It should include at least:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Residual Risks

- If you enable proxy trust while the origin stays publicly exposed, spoofed headers become a risk again.
- The current CSP is reasonable for this app, but any change that adds external resources should be reviewed before deployment.
- Turnstile helps with automated abuse, but it does not replace login or rate limiting.
- If the OpenAI API key or the session secrets leak on the host, HTTP-layer hardening is no longer enough.

## Deployment Decision

Do not deploy until all of the following are true:

- app login is enabled
- session secrets are defined
- allowed origins in `app.config.json` match the final domain
- proxy strategy is clear
- `Secure` cookies have been manually verified under HTTPS

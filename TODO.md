# TODO

## Seguridad

- Hacer obligatorio Cloudflare Turnstile en producción y documentar el alta del widget en Cloudflare.
- Sustituir el rate limiting en memoria por uno distribuido, por ejemplo Redis, para soportar múltiples réplicas.
- Añadir autenticación real de usuarios o access-gate si la app no va a ser totalmente pública.
- Restringir `/api/realtime/token` por dominio final de producción y separar claramente entornos local/staging/prod.
- Añadir métricas y alertas de abuso: ratio de mint de tokens, 429, errores upstream y consumo de OpenAI.
- Incorporar logs estructurados con redacción de datos sensibles.
- Valorar WAF/reglas de Cloudflare específicas para el endpoint de token.
- Añadir rotación de secretos y gestión desde un secret manager en producción.
- Ejecutar el contenedor como usuario no root y revisar opciones adicionales de endurecimiento del runtime.
- Añadir pruebas de integración para rate limit, validación de origen y flujo Turnstile.
- Separar la memoria persistente por identidad de usuario; ahora es global para todo el POC.
- Añadir un segundo filtro server-side para bloquear almacenamiento de PII sensible aunque el extractor se equivoque.
- Añadir expiración, revisión y borrado granular de memorias persistentes en lugar de solo reset total.
- Registrar auditoría mínima del endpoint de reset sin guardar secretos ni transcripts completos.

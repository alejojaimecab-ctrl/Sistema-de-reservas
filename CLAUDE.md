# Revisión después de cada cambio

Usá solo una por tipo de cambio; no sumes otras revisiones que se pisen con estas.

- **Cambios en React o TypeScript** (`src/**/*.tsx`, `src/**/*.ts`): al terminar, corré `/ecc:react-review`. Ya incluye a `typescript-reviewer`, así que no corras `/ecc:code-review` aparte.
- **Si el cambio toca login, contraseñas, verificación en dos pasos, pagos, datos de clientes o Edge Functions**: sumá el agente `ecc:security-reviewer`.
- **Si el cambio toca SQL, migraciones o políticas RLS** (`supabase/`): sumá el agente `ecc:database-reviewer`.
- Saltealas si el cambio es solo de textos, estilos (CSS) o comentarios.
- Si la revisión marca algo CRITICAL o HIGH, avisame antes de seguir.

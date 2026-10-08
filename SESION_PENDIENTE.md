# Dónde quedamos (sesión 2026-10-07/08)

## Hecho y commiteado
- Migraciones aplicadas en Supabase remoto: 007 (slots duración/timezone),
  008 (recordatorios email: `reminder_sent_at`, pg_cron + pg_net, job
  `send-reminders` cada 5 min), 009 (grants a service_role), 010 (tabla
  `app_config` para el secreto del cron, reemplaza ALTER DATABASE SET).
- Edge Function `send-reminders` desplegada y probada OK (responde
  `{"procesadas":0,...}`; auth por header `x-reminder-secret`).
- Secrets en Supabase: RESEND_API_KEY, REMINDER_SECRET, REMINDER_FROM.
  Los valores reales están en `.env.local` (ignorado por git).
- El usuario ya corrió en el SQL Editor el INSERT de `app_config` con el
  secreto y "dio todo bien" (cron autenticado).
- Commits: 2aee30f (feature), b45eebf (fix app_config).

## Pendiente inmediato (retomar acá)
1. **Hacer la reserva de prueba end-to-end** con email alejojaimecab@gmail.com
   en el negocio slug `peluqueria`, turno a ~1 hora, y verificar que llegue
   el recordatorio por email.
   - Se intentó por navegador pero Computer Use no tiene navegadores
     disponibles en esta máquina (`cua.getState()` → vacío). Alternativa:
     reservar directo vía RPC `book_public` (mismo camino que usa la app) o
     pedirle al usuario que reserve desde http://localhost:5175/.
   - Ojo: con `onboarding@resend.dev` solo llega mail al email de la cuenta
     de Resend (alejojaimecab@gmail.com).
2. Verificar en la base que la reserva quedó con `reminder_sent_at` seteado.
3. Opcional: agregar `supabase/.temp/` al `.gitignore` (quedó commiteado por
   error, inofensivo) y decidir qué hacer con `.claude/` (sin trackear).

## Después
- Dominio propio en Resend para mandar a cualquier cliente (hoy solo al
  email verificado). Atado a la decisión pendiente de dominio/nombre.
- Decisiones abiertas del PRODUCT.md: precios/plan, dominio y nombre
  definitivos.
- Dev server: `npx vite --port 5175` (prefijo aprobado).
- Supabase CLI ya vinculado (project ref lhmpmzxvpkqlfnwvwglu); el token de
  acceso se pasa por `SUPABASE_ACCESS_TOKEN` en cada comando (no persistido).

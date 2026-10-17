# Dónde quedamos (actualizado 2026-10-17, noche)

## Hecho y commiteado (camino al lanzamiento)
- **Etapa 1** · Ruta pública por slug (`/:slug`), 404 amable, slugs reservados, botón copiar enlace.
- **Etapa 2** · Multi-profesional (migración 014): cada profesional es un `resources` con su propia
  disponibilidad y agenda; sección "Equipo" en el panel; selector "¿Con quién?" en la reserva
  (pública y manual). 014 también **restauró el rate limit de `book_public`**, que las
  migraciones 011/012 habían pisado. 016 arregló los permisos de `resources`.
- **Etapa 3** · Cancelación (migración 015): enlace privado `/cancelar/<token>` para el cliente,
  cancelar desde el panel para el dueño, anticipación mínima configurable por negocio
  (`businesses.cancel_min_hours`, 0 = sin límite).
- **Etapa 4** · Mails (migración 017 + Edge Function `send-reminders` v7): confirmación al cliente
  con enlace de cancelar, aviso al dueño de reserva nueva y de cancelación del cliente, aviso al
  cliente si el negocio cancela, recordatorio 1 h antes. HTML escapado; remitente
  "<Negocio> vía RESER"; reply-to al dueño/cliente. Los dispara un trigger vía pg_net.
- **Etapa 5** · Legal y datos del negocio: Términos (`/terminos`) y Privacidad (`/privacidad`) con consentimiento
  en el alta y al reservar; teléfono, dirección y logo del negocio en la página pública, la Configuración
  y los mails (migración 020, bucket `business-logos`); landing sin prueba social inventada;
  limpieza diaria del log antiabuso (`book_rate_log`). Antes: autoguardado en Equipo, días libres,
  "no vino", recuperar contraseña, servicios por profesional (migraciones 018–019).
- Migraciones 011–020 están aplicadas en Supabase, pero el historial del CLI solo llega a la 010
  (011–013 se corrieron a mano; 014–017 con el MCP). Los archivos del repo son la fuente de verdad.

## Pendiente antes de lanzar
1. **Dominio** (sin comprar): verificar en Resend (registros SPF/DKIM en el DNS) y cambiar el secret
   `REMINDER_FROM` a `RESER <reservas@tudominio.com>`. Hoy con `onboarding@resend.dev` solo
   llegan mails a alejojaimecab@gmail.com.
2. **Secret `APP_URL`** (`supabase secrets set APP_URL=https://tudominio.com`): sin definir, los
   enlaces de cancelar de los mails apuntan a `http://localhost:5175`.
3. **Hosting**: Cloudflare Pages o Vercel, con reescritura de rutas a `index.html` (hace falta
   para `/:slug` y `/cancelar/:token`).
4. **Legal**: completar los datos marcados "COMPLETAR" en `src/lib/legal.ts` (titular, CUIT, domicilio,
   email, hosting) y hacer revisar los textos con un/a abogado/a. Ver si hace falta inscribir la base
   de datos en el Registro Nacional de Bases de Datos (AAIP). Falta una forma de que el dueño elimine
   su cuenta solo (hoy se pide por mail).
5. Supabase Auth → URL Configuration: agregar `http://localhost:5175` y la URL de producción como
   redirect permitido (necesario para recuperar contraseña y confirmación de email).
6. Planes y cobro (se decide al final): `subscriptions`, límites validados en la base,
   Mercado Pago.

## Notas
- Dev server: `npx vite --port 5175` (también en `.claude/launch.json`).
- Supabase CLI vinculado (project ref lhmpmzxvpkqlfnwvwglu); el token se pasa por
  `SUPABASE_ACCESS_TOKEN` en cada comando (no persistido).
- La Edge Function se despliega también con el MCP de Supabase (`deploy_edge_function`).

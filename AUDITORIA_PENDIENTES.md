# Auditoría de pendientes (2026-10-17)

Revisión de solo lectura: no se cambió código. Fuentes: escáner de botones/enlaces sin acción, lectura de cada
sección, consultas a la base y los avisos de seguridad/rendimiento de Supabase.

## Resuelto / decidido (2026-10-17)
- **Servicios**: ya no se borran las reservas al eliminar un servicio. Ahora se **desactiva/reactiva** (oculto para los
  clientes, reservas conservadas) y la base (migración 025) impide eliminar uno que tenga reservas.
- **Campana de notificaciones**: **quitada** (lo único que avisaría es "llegó un turno nuevo", y eso ya se ve en el Resumen).
- **Teléfono del cliente y email opcional**: **descartado por ahora**: todo el sistema funciona por mail. Queda como
  limitación conocida que la reserva manual del dueño pide el email del cliente.

- **Reservas** (punto 4): la sección ahora muestra **todas** las reservas con búsqueda (cliente, email, servicio,
  profesional; sin importar tildes ni mayúsculas), filtros (próximas/pasadas/todas, estado, profesional, servicio),
  paginación ("Ver más") y acciones (Atendida / No vino / Deshacer / Cancelar). Los avisos de confirmación ya no usan el
  cuadro nativo del navegador (algunos navegadores lo descartan y el botón parecía no hacer nada): se reemplazó por
  `ConfirmDialog` en cancelar turno, eliminar servicio y habilitar días libres.

- **ErrorBoundary** (punto 5): si una pantalla falla ya no queda en blanco. Hay un aviso de pantalla completa para
  toda la app ("Recargar página" / "Ir al inicio"; con texto propio cuando hay una versión nueva publicada) y uno por
  sección dentro del panel (las demás secciones y el menú siguen funcionando; se recupera al cambiar de sección).
  Los errores quedan en la consola del navegador: falta un servicio de monitoreo (ej. Sentry).
- **SEO básico** (punto 5): título y descripción por página (en la página de cada negocio, con su nombre); las pantallas
  privadas (panel, login, cancelar turno, nueva contraseña) y los negocios inexistentes llevan `noindex`; favicon,
  ícono de iOS y de 192/512 px; imagen para compartir (`public/brand/og-image.png`); `robots.txt`; aviso si el navegador
  no tiene JavaScript. Al compilar con `VITE_SITE_URL` se agregan además `canonical`, `og:url`, `og:image` absoluta y
  `sitemap.xml` (ver `vite.config.js`).
  **Para el lanzamiento:** definir `VITE_SITE_URL` (ej. `https://reser.com.ar`) en el hosting apenas haya dominio.
  Sigue pendiente que el enlace de cada negocio muestre su nombre/imagen al compartirlo por WhatsApp (requiere
  prerender o una función en el borde, porque esos buscadores no ejecutan JavaScript).

- **Cuentas para los profesionales** (2026-10-18, migración 029): el dueño invita a cada profesional desde
  Equipo → "Acceso al panel" con un enlace (`/unirme/<token>`, vence a los 7 días; se puede copiar o mandar por
  WhatsApp). El profesional crea su cuenta (o entra con la que tiene) y queda vinculado a su agenda. Puede: ver su
  agenda y sus reservas con el nombre y el email de sus clientes, marcar atendido / no vino, cancelar sus turnos,
  cargar reservas a mano solo en su agenda, editar sus horarios y ver los servicios con sus precios. No puede: ver
  estadísticas (Resumen), ni a los demás profesionales, ni tocar servicios, equipo, días libres (los ve, no los cambia)
  ni configuración. El permiso lo aplica la base (RLS + funciones), no solo la pantalla. El dueño puede quitar el
  acceso en cualquier momento; la agenda y las reservas del profesional no se tocan.
  **Pendiente / a decidir:** cuántas cuentas de profesional incluye cada plan; si al dueño le llega un mail cuando un
  profesional cancela un turno (hoy no, solo al cliente); cambiar de contraseña o email desde adentro (igual que el dueño).
- **Eliminar profesionales** (2026-10-18, migración 030): botón "Eliminar profesional" en Equipo. Si nunca tuvo
  reservas se borra del todo; si tiene historial se archiva (`resources.deleted_at`): desaparece del equipo, de la
  página de reservas y del panel, y sus reservas pasadas siguen en el historial con su nombre. No deja eliminar al
  último profesional activo ni a uno con turnos confirmados a futuro (hay que cancelarlos antes). "Desactivar" sigue
  existiendo para pausas temporales.
- **Enlace de equipo** (2026-10-18, migración 031): en Equipo → "Sumar un profesional" el dueño crea un solo enlace
  (vence a los 7 días, sirve para varias personas, se puede regenerar o anular). Cada persona que se une crea su cuenta
  y aparece sola en la lista con el nombre de su cuenta, marcada "sin servicios": el dueño elige qué ofrece y, hasta
  entonces, no aparece en la página de reservas. Sus horarios los carga desde "Mis horarios". Desde la migración 032
  la cuenta nueva queda vinculada sola apenas confirma el email (el token viaja en los metadatos de la cuenta), aunque
  confirme desde otro dispositivo; las cuentas que ya existían aceptan con "Unirme al equipo". La invitación por perfil
  (para vincular a alguien que ya estaba cargado, como uno con historial) sigue en "Acceso al panel".
- **Campos con reglas** (`src/lib/fieldRules.ts`): nombres de personas solo con letras; teléfonos y WhatsApp solo
  números (con + opcional); duración y precio solo números; emails sin espacios; el enlace del negocio en minúsculas
  con guiones; nombres de negocio y servicios con letras, números y signos comunes ("Corte + barba"). El profesional
  creado sin nombre ("Principal") se muestra como "Sin nombre" con el campo vacío para completar.
- **Copiar enlaces**: algunos navegadores bloquean el portapapeles y descartan `window.prompt` sin avisar (el botón
  parecía no hacer nada). `src/lib/clipboard.ts` prueba también el método clásico y, si igual falla, deja el enlace
  de invitación seleccionado con un aviso para copiarlo a mano.

## 1. Botones sin función
Solo se encontraron dos (de más de 100):
- **Campana "Notificaciones"** (`OwnerDashboard.tsx`, encabezado del panel): no hace nada. Además tiene un
  **punto verde fijo** que simula que hay novedades (indicador falso).
- "Escribir por WhatsApp" desactivado en la reserva pública: es **intencional** (falta el número del profesional).

## 2. Riesgo alto (pueden perder datos o romper el lanzamiento)
1. **Eliminar un servicio borra todas sus reservas.** El botón "Eliminar" hace un `delete` real y la base tiene
   `reservations.service_id ... ON DELETE CASCADE`. Hay que pasarlo a desactivar (`is_active = false`) + confirmación.
2. **Mails de Supabase Auth** (confirmar cuenta, recuperar contraseña): hay que configurar SMTP propio (Resend),
   plantillas en español y las URLs de redirección permitidas. (No verificado: no tengo acceso a esa configuración.)
3. **No hay ErrorBoundary:** si un componente falla, la pantalla queda en blanco.
4. Pendientes ya conocidos: dominio + Resend + `APP_URL`, hosting, textos legales con "COMPLETAR" y revisión de abogado.

## 3. Funciones incompletas o ausentes
- El **teléfono del cliente nunca se pide** al reservar (la base y los mails lo soportan; queda vacío).
- **Reservas**: solo muestra las próximas 10 (igual que el Resumen); sin historial, búsqueda, filtros ni paginación.
- **No hay lista de clientes** (historial, notas); solo la métrica "clientes este mes".
- **Reserva manual del dueño**: exige email (mal para reservas por teléfono o en persona), usa las mismas reglas de
  anticipación que el público (no se puede cargar "ahora") y no lista servicios por WhatsApp.
- **Cuenta**: no se puede cambiar contraseña/email desde adentro, ni eliminar la cuenta, ni exportar datos
  (la política de privacidad dice que se pide por mail).
- **Login** sin enlace a "Crear mi negocio" (solo se llega desde la landing).
- **Un solo negocio por cuenta** (el sistema toma el primero).
- **Cambiar el enlace (slug) rompe** los enlaces ya compartidos (sin aviso ni redirección).
- **Servicios**: sin activar/desactivar, sin orden, sin descripción.
- **Mails**: el dueño no puede apagar avisos; textos no editables; recordatorio fijo a 1 h; si Resend falla en una
  confirmación no se reintenta; no hay registro visible de envíos.
- **Agenda**: sin vista/filtro por profesional; sin exportar/imprimir.
- **Zona horaria y moneda fijas** (Argentina / ARS), sin opción.
- **Landing**: sin sección de precios, preguntas frecuentes ni contacto; "Empezar gratis" sin plan definido.

## 4. SEO y compartir
- Título genérico en todas las páginas (también en la de cada negocio); sin favicon, imagen para vista previa,
  `robots.txt` ni `sitemap`. Al ser una SPA, el enlace de un negocio compartido por WhatsApp no mostrará su nombre
  (requiere prerender o una función en el borde).

## 5. Calidad y operación
- Sin tests automáticos, sin CI, sin monitoreo de errores (ej. Sentry), backups sin verificar.
- Código muerto: estilos de componentes ya eliminados (`insight-card`, `activity-card`, `activity-event`,
  `proof-avatars`, `success-orbit`), import `Ellipsis` sin uso.

## 6. Avisos de Supabase (limpiados el 2026-10-18, migraciones 027 y 028)
Resuelto: se quitó el acceso por API a las funciones de disparador, se fijó el `search_path` de
`stamp_reservation_cancelled`, `btree_gist` y `pg_net` salieron del esquema `public`, las 9 políticas RLS usan
`(select auth.uid())` y se agregaron los 4 índices de claves foráneas que faltaban. Se probó con los roles reales
(dueño y visitante anónimo): reservas públicas, reservas del dueño, cancelaciones, disparadores y envío de mails siguen
funcionando.

Lo que queda, y **es intencional o no se puede resolver desde el código**:
- 4 vistas `public_*` "SECURITY DEFINER" (nivel ERROR del linter): dan a los visitantes solo las columnas públicas sin
  abrirles las tablas. Documentado con `comment on view`. Cambiarlas obligaría a reemplazarlas por funciones.
- 4 funciones ejecutables por visitantes (`book_public`, `public_slots`, `get_reservation_by_token`,
  `cancel_reservation_by_token`) y 2 más por usuarios con sesión (`create_owner_reservation`,
  `cancel_reservation_owner`): son la API de la app y validan todo adentro.
- `app_config` y `book_rate_log` con RLS y sin políticas: a propósito (solo las toca el servidor).
- **Protección contra contraseñas filtradas desactivada**: se activa en el panel de Supabase (Authentication → Sign In /
  Providers → Password security); en general requiere plan Pro. No se puede hacer por código.
- "Índices sin uso" (informativo): normal con tan poco tráfico; no se borran.

## Prioridad sugerida
1. Servicios: desactivar en vez de borrar. 2. Campana: quitarla o implementarla de verdad.
3. Pedir teléfono al cliente + email opcional en la reserva manual. 4. Reservas con historial/búsqueda.
5. ErrorBoundary + SEO básico. 6. SMTP de Auth. 7. Limpieza de avisos de Supabase.

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

## 6. Avisos de Supabase
Seguridad:
- 4 vistas `public_*` marcadas "SECURITY DEFINER" (nivel ERROR del linter): son **intencionales** (permiten leer
  solo las columnas públicas sin dar acceso a las tablas); documentar o migrar.
- 12 funciones (triggers) ejecutables por `anon` y 14 por `authenticated` vía RPC: no son invocables en la práctica
  (son triggers), pero conviene `revoke execute`.
- `stamp_reservation_cancelled` sin `search_path` fijo.
- Extensiones `btree_gist` y `pg_net` en el esquema `public`.
- Protección contra contraseñas filtradas desactivada (Auth; suele requerir plan Pro).
Rendimiento (irrelevante hoy, importa con volumen):
- 9 políticas RLS evalúan `auth.uid()` por fila (usar `(select auth.uid())`), 5 claves foráneas sin índice, 2 índices sin uso.

## Prioridad sugerida
1. Servicios: desactivar en vez de borrar. 2. Campana: quitarla o implementarla de verdad.
3. Pedir teléfono al cliente + email opcional en la reserva manual. 4. Reservas con historial/búsqueda.
5. ErrorBoundary + SEO básico. 6. SMTP de Auth. 7. Limpieza de avisos de Supabase.

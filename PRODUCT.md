# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dueños de negocios que viven de turnos: peluquerías, barberías, consultorios, estudios. Hoy coordinan su agenda por WhatsApp (mensajes, cruces, olvidos) y quieren ordenarla sin volverse técnicos. Usuario secundario: los clientes finales, que reservan desde un enlace público sin crear cuenta.

## Product Purpose

RESER organiza los turnos de un negocio, confirma a los clientes y le devuelve al dueño el control de su agenda. Éxito: el negocio comparte su enlace de reserva y deja de coordinar horarios a mano; los clientes reservan solos en horarios realmente disponibles.

## Positioning

Simplicidad radical: configuración en minutos, cero curva de aprendizaje, pensado para quien no es técnico. Frente a Calendly/Turnos.app/WhatsApp, la promesa no es más funciones sino menos fricción.

## Operating Context

Producto en español rioplatense ("Hacelo rendir", "Configurá"): el mercado objetivo es Argentina/LatAm. Flujos reales ya implementados: landing de captación, onboarding de negocio (nombre, servicios, disponibilidad por día/hora), dashboard del dueño con reservas y estadísticas, y experiencia de reserva pública con slots calculados. Backend en Supabase (auth + Postgres con RLS, RPC `book_public`, vistas públicas); trabajo en curso por fases de seguridad (Fases 1–6 hechas, Fase 7 `006_rate_limit.sql` escrita y pendiente de correr).

## Capabilities and Constraints

- Alta de negocio con servicios (nombre, duración, precio) y disponibilidad semanal por hora.
- Reserva pública vía RPC sin cuenta de cliente; el anon no lee `clients` ni `reservations` directamente (RLS).
- Dashboard del dueño: reservas, estados (confirmed/cancelled/completed), estadísticas del día/mes.
- Prevención de solapamientos y rate limiting en base de datos (migraciones por fases).
- Stack: React 19 + Vite + TypeScript, Supabase, lucide-react, motion. Sin router: navegación por estado de vista en `App.tsx`.
- Decisiones abiertas: recordatorios/notificaciones reales (la landing los promete; el envío aún no está implementado), precios/plan comercial, dominio y nombre definitivos.

## Brand Commitments

Nombre: RESER. Voz en español rioplatense, cercana y directa, orientada a "negocios reales" que valoran su tiempo.

## Evidence on Hand

Copy real de la landing en `src/App.tsx` (hero, features, trust strip). Datos de demostración en `src/data/demo.ts`. Esquema y migraciones reales en `supabase/`. No hay testimonios, clientes, cifras ni logos de terceros: no fabricarlos en superficies futuras.

## Product Principles

1. La simplicidad es el producto: cada decisión se juzga por cuánta fricción quita al dueño no técnico.
2. La agenda manda: mostrar solo horarios realmente disponibles, nunca prometer un turno que puede cruzarse.
3. Hablar como el usuario: español rioplatense, lenguaje de negocio real, nada de jerga SaaS.
4. Lo público es mínimo: el cliente reserva con lo indispensable; los datos del negocio no se exponen de más.

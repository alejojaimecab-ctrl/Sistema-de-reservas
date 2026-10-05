---
target: BookingExperience (reserva pública)
total_score: 23
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\Noxie-PC\\Sistema-de-reservas\\src\\components\\BookingExperience.tsx"
target_fingerprint: "sha256:05ef89f14f081c7ab0094b1dd311f4adbe90cb5fa9ca83a6746ebb19fd2bf51a"
target_path: "C:\\Users\\Noxie-PC\\Sistema-de-reservas\\src\\components\\BookingExperience.tsx"
timestamp: 2026-10-04T19-11-17Z
slug: src-components-bookingexperience-tsx
---
# Critique — src/components/BookingExperience.tsx

⚠️ DEGRADED: single-context (sub-agentes de Assessment A devolvieron output vacío en 2 intentos; review inline. Assessment B en sub-agente: detector limpio, 0 hallazgos.)

## Design Health Score: 23/32 (72%) — Good (piso de banda). n/a: heurísticas 7 y 10.

| # | Heurística | Score | Issue |
|---|---|---|---|
| 1 | Visibilidad | 3 | Loadings de texto plano, salto de layout |
| 2 | Mundo real | 3 | "GMT-3" hardcodeado y potencialmente incorrecto |
| 3 | Control | 2 | Stepper no clickeable, sin des-selección, sin semana siguiente |
| 4 | Consistencia | 3 | Íconos de servicio genéricos cíclicos |
| 5 | Prevención | 2 | Slots ignoran duración; email sin validar ni marcar opcional |
| 6 | Reconocimiento | 4 | Precio/duración visibles desde paso 1 |
| 7 | Flexibilidad | n/a | Superficie transaccional |
| 8 | Estética | 4 | Voz Única respetada |
| 9 | Errores | 2 | error.message crudo del RPC al cliente |
| 10 | Ayuda | n/a | Flujo simple |

## Especificidad
Marco RESER presente (órbita, stepper mono, Voz Única); cuerpo del flujo intercambiable con cualquier app de turnos. Detector: limpio. Browser: solo se pudo verificar el empty state (no hay negocio publicado en Supabase).

## Issues
- [P0] public_slots ignora duración del servicio + bug de timezone (p_date + interval en UTC, UI etiqueta GMT-3). Fix: p_service_id en public_slots, tz del negocio, excluir slots que excedan el cierre. → /impeccable harden
- [P1] Datos personales antes de ver disponibilidad; email sin "opcional". → /impeccable shape
- [P1] Errores crudos del RPC al cliente. → /impeccable clarify
- [P2] Callejón de 5 días, sin semana siguiente. → /impeccable shape
- [P2] Loadings sin skeleton, salto de layout. → /impeccable polish

## Personas
- Casey: intro antes que la tarjeta en mobile; refresh pierde todo.
- Jordan: "GMT-3", email sin explicación, errores técnicos.
- Riley: slot que excede cierre; cambiar servicio no revalida horario; doble-submit OK.

## Menores
Íconos cíclicos genéricos; stepper no clickeable; CTA final callejón; fullDayLabel sin mes.

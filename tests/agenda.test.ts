// La Agenda pide solo las fechas que le faltan y, por tiempo real, suma o saca la reserva que cambió sin repetirla.
// Correr con: pnpm test (Node 22.6+ ejecuta TypeScript directo)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyReservationChange, mergeReservations, missingRanges } from '../src/lib/agenda.ts'
import type { Reservation } from '../src/lib/db.ts'

const day = (n: number) => new Date(2026, 9, n)
const turno = (id: string, n: number, status: Reservation['status'] = 'confirmed'): Reservation => ({
  id, starts_at: day(n).toISOString(), status, clients: null, services: null, resources: null,
})

test('fechas que faltan cargar', () => {
  const loaded = { from: day(10), to: day(20) }
  assert.deepEqual(missingRanges(loaded, { from: day(12), to: day(18) }), [])
  assert.deepEqual(missingRanges(loaded, { from: day(5), to: day(15) }), [{ from: day(5), to: day(10) }])
  assert.deepEqual(missingRanges(loaded, { from: day(15), to: day(25) }), [{ from: day(20), to: day(25) }])
  assert.deepEqual(missingRanges(loaded, { from: day(1), to: day(30) }), [{ from: day(1), to: day(10) }, { from: day(20), to: day(30) }])
  // Un salto lejos también trae el hueco del medio: el tramo cargado no queda partido
  assert.deepEqual(missingRanges(loaded, { from: day(25), to: day(28) }), [{ from: day(20), to: day(28) }])
})

test('sumar turnos sin repetir, ordenados por hora', () => {
  const merged = mergeReservations([turno('a', 12), turno('b', 14)], [turno('b', 11, 'completed'), turno('c', 13)])
  assert.deepEqual(merged.map(r => [r.id, r.status]), [['b', 'completed'], ['a', 'confirmed'], ['c', 'confirmed']])
})

test('reserva que cambió por tiempo real', () => {
  const list = [turno('a', 12), turno('b', 14)]
  assert.deepEqual(applyReservationChange(list, 'c', turno('c', 13)).map(r => r.id), ['a', 'c', 'b'])
  assert.deepEqual(applyReservationChange(list, 'a', turno('a', 12, 'cancelled')).map(r => r.id), ['b'])
  assert.deepEqual(applyReservationChange(list, 'b', null).map(r => r.id), ['a'])
})

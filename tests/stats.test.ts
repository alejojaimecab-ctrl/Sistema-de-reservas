// Las ganancias de Estadísticas: solo suman los turnos atendidos, "Desde" cuenta su precio mínimo y "A consultar" no suma.
// Correr con: pnpm test (Node 22.6+ ejecuta TypeScript directo)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { periodTotals } from '../src/lib/stats.ts'
import type { StatsReservation } from '../src/lib/db.ts'

const turno = (status: StatsReservation['status'], price: number, price_mode: 'fixed' | 'from' | 'ask', extra: Partial<StatsReservation> = {}): StatsReservation => ({
  id: crypto.randomUUID(), starts_at: '2026-10-01T13:00:00Z', ends_at: null, created_at: null, status, cancelled_by: null, source: 'public',
  client_id: crypto.randomUUID(), service_id: null, resource_id: null, services: { name: 'Corte', price, price_mode }, resources: null, ...extra,
})

test('ganancias del período', () => {
  const totals = periodTotals([
    turno('completed', 20000, 'fixed'),
    turno('completed', 15000, 'from'),
    turno('completed', 30000, 'ask'),
    turno('no_show', 20000, 'fixed'),
    turno('cancelled', 20000, 'fixed', { cancelled_by: 'client' }),
  ], Date.parse('2026-10-21T00:00:00Z'))

  assert.equal(totals.revenue, 35000)
  assert.equal(totals.revenueFromCount, 1)
  assert.equal(totals.revenueAskCount, 1)
  assert.equal(totals.attended, 3)
  assert.equal(totals.attendanceRate, 75)
  assert.equal(totals.averageTicket, 11667)
  assert.equal(totals.cancelledByClient, 1)
})

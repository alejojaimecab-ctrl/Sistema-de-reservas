// Las ganancias de Estadísticas: solo suman los turnos atendidos, "Desde" cuenta su precio mínimo y "A consultar" no suma.
// Correr con: pnpm test (Node 22.6+ ejecuta TypeScript directo)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeClients, periodTotals } from '../src/lib/stats.ts'
import type { ClientAggregate, StatsReservation } from '../src/lib/db.ts'

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

// Clientes: la base manda una fila por cliente (client_stats) y de ahí sale cada cuánto vuelve y quién está en riesgo
test('clientes a partir del resumen por cliente', () => {
  const now = Date.parse('2026-10-21T12:00:00Z')
  const cliente = (client_id: string, extra: Partial<ClientAggregate>): ClientAggregate => ({
    client_id, name: client_id, email: null, first_visit: '2026-06-01T12:00:00Z', visits: 0, first_completed: null,
    last_completed: null, revenue: 0, no_shows: 0, has_upcoming: false, ...extra,
  })
  const overview = computeClients([
    // 4 visitas del 1/6 al 31/7: vuelve cada 20 días y hace 82 que no viene → en riesgo
    cliente('ana', { visits: 4, first_completed: '2026-06-01T12:00:00Z', last_completed: '2026-07-31T12:00:00Z', revenue: 80000 }),
    // Mismo ritmo pero ya tiene turno reservado → no está en riesgo
    cliente('beto', { visits: 3, first_completed: '2026-06-01T12:00:00Z', last_completed: '2026-07-01T12:00:00Z', has_upcoming: true }),
    cliente('caro', { visits: 1, first_completed: '2026-10-10T12:00:00Z', last_completed: '2026-10-10T12:00:00Z', no_shows: 2 }),
  ], now)

  assert.deepEqual(overview.atRisk.map(c => [c.id, c.everyDays, c.daysSince]), [['ana', 20, 82]])
  assert.equal(overview.typicalReturnDays, 18) // mediana de 20 y 15 días, redondeada
  assert.equal(overview.returnRate, 67)
  assert.deepEqual(overview.best.map(c => c.id), ['ana', 'beto', 'caro'])
  assert.deepEqual(overview.frequentNoShows.map(c => c.id), ['caro'])
})

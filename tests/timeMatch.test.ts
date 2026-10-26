// Teclear en el selector de hora salta a la opción que empieza así. Correr con: pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchTime } from '../src/lib/timeMatch.ts'

const options = Array.from({ length: 48 }, (_, slot) => ({
  value: slot,
  label: `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`,
}))

test('salta a la hora escrita, con o sin el cero de adelante', () => {
  assert.equal(matchTime(options, '18'), 36) // 18:00
  assert.equal(matchTime(options, '10'), 20) // 10:00, no 01:00
  assert.equal(matchTime(options, '9'), 18) // 09:00
  assert.equal(matchTime(options, '09'), 18)
  assert.equal(matchTime(options, '930'), 19) // 09:30
  assert.equal(matchTime(options, '1'), 20) // 10:00: la primera que empieza con 1 tal cual
  assert.equal(matchTime(options, '99'), undefined)
})

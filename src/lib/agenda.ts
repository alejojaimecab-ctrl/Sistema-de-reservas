import type { Reservation } from './db'

// La Agenda tiene cargado un tramo de fechas [from, to). Al moverse a otras semanas solo se piden los pedazos que faltan,
// pegados al tramo cargado, así este sigue siendo uno solo.
export type DateRange = { from: Date; to: Date }

export function missingRanges(loaded: DateRange, wanted: DateRange): DateRange[] {
  const missing: DateRange[] = []
  if (wanted.from < loaded.from) missing.push({ from: wanted.from, to: loaded.from })
  if (wanted.to > loaded.to) missing.push({ from: loaded.to, to: wanted.to })
  return missing
}

// Suma turnos a la lista sin repetirlos: los que llegan reemplazan a los que ya estaban
export function mergeReservations<T extends Reservation>(current: T[], incoming: T[]): T[] {
  const ids = new Set(incoming.map(reservation => reservation.id))
  return [...current.filter(reservation => !ids.has(reservation.id)), ...incoming]
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
}

// Llegó por tiempo real la reserva que cambió: entra o se actualiza, y sale si se canceló o ya no se ve (null)
export function applyReservationChange(current: Reservation[], id: string, reservation: Reservation | null): Reservation[] {
  return reservation && reservation.status !== 'cancelled'
    ? mergeReservations(current, [reservation])
    : current.filter(item => item.id !== id)
}

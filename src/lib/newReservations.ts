import { useEffect, useState } from 'react'
import type { Reservation } from './db'

// Reservas "nuevas": las que hizo un cliente desde el enlace después de la última visita al panel
// (o mientras está abierto). Las que carga el dueño a mano no cuentan como nuevas.
// La última visita se guarda en este dispositivo; la de esta visita queda fija en la pestaña,
// así recargar no borra los puntitos y lo que entra mientras el panel está abierto también se marca.
const LAST_VISIT_KEY = (businessId: string) => `reser-ultima-visita:${businessId}`
const VISIT_SINCE_KEY = (businessId: string) => `reser-visita-desde:${businessId}`

export function useNewSince(businessId: string | null): number | null {
  const [since, setSince] = useState<number | null>(null)
  useEffect(() => {
    if (!businessId) return
    try {
      const kept = sessionStorage.getItem(VISIT_SINCE_KEY(businessId))
      if (kept) { setSince(Number(kept)); return }
      const previous = Number(localStorage.getItem(LAST_VISIT_KEY(businessId)) || 0)
      const now = Date.now()
      // Primera vez en este dispositivo: cuentan como nuevas las que llegaron en las últimas 24 horas
      const visitSince = previous || now - 24 * 60 * 60 * 1000
      sessionStorage.setItem(VISIT_SINCE_KEY(businessId), String(visitSince))
      localStorage.setItem(LAST_VISIT_KEY(businessId), String(now))
      setSince(visitSince)
    } catch {
      // Sin almacenamiento (modo privado estricto): no se marca nada como nuevo
      setSince(null)
    }
  }, [businessId])
  return since
}

export function isNewReservation(reservation: Reservation, since: number | null): boolean {
  if (since === null || reservation.source !== 'public' || !reservation.created_at) return false
  return new Date(reservation.created_at).getTime() > since
}

import { useReducedMotion } from 'motion/react'

// Las animaciones grandes respetan "reducir movimiento" del sistema operativo. Para mostrar el producto
// en equipos que lo tienen activado (o para quien prefiere verlas igual), se puede forzar abriendo
// cualquier página con ?animaciones=on (queda guardado en ese navegador) y volver atrás con ?animaciones=off.
const KEY = 'reser-animaciones'

function animationsForced(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('animaciones')
    if (param === 'on') window.localStorage.setItem(KEY, 'on')
    if (param === 'off') window.localStorage.removeItem(KEY)
    return window.localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

// true = hay que evitar el movimiento (el sistema lo pide y nadie forzó las animaciones)
export function useReduceMotion(): boolean {
  const system = useReducedMotion()
  return Boolean(system) && !animationsForced()
}

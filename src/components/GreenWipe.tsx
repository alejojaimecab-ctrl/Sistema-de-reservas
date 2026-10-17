import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useReduceMotion } from '../lib/motion'

// Transición de "reserva confirmada" estilo transferencia de Mercado Pago:
//  1. 'cover'  — el verde nace en el botón y se expande hasta llenar toda la pantalla.
//  2. 'reveal' — ya con la pantalla de éxito debajo, el verde se recoge hacia el tilde.
// Con "reducir movimiento" no hay expansión ni recogida: el verde solo aparece y se desvanece.

const EASE = [0.65, 0, 0.35, 1] as const
const R_BIG = () => Math.hypot(window.innerWidth, window.innerHeight)

export function GreenWipe({ phase, x, y, onDone }: {
  phase: 'cover' | 'reveal'
  x: number
  y: number
  onDone: () => void
}) {
  const reduce = useReduceMotion()
  // En 'reveal' el verde se recoge hacia donde quedó el tilde (se mide una vez montada la pantalla)
  const [badge, setBadge] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (phase !== 'reveal') return
    const rect = document.querySelector('.success-badge')?.getBoundingClientRect()
    setBadge(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 3 })
  }, [phase])

  if (phase === 'cover') {
    return <motion.div
      className="green-wipe green-wipe--cover"
      aria-hidden="true"
      initial={reduce ? { opacity: 0 } : { clipPath: `circle(0px at ${x}px ${y}px)` }}
      animate={reduce ? { opacity: 1 } : { clipPath: `circle(${R_BIG()}px at ${x}px ${y}px)` }}
      transition={{ duration: reduce ? 0.45 : 0.85, ease: EASE }}
      onAnimationComplete={onDone}
    />
  }

  const cx = badge?.x ?? window.innerWidth / 2
  const cy = badge?.y ?? window.innerHeight / 3
  return <motion.div
    className="green-wipe"
    aria-hidden="true"
    initial={reduce ? { opacity: 1 } : { clipPath: `circle(${R_BIG()}px at ${x}px ${y}px)` }}
    animate={badge ? (reduce ? { opacity: 0 } : { clipPath: `circle(0px at ${cx}px ${cy}px)` }) : undefined}
    transition={{ duration: reduce ? 0.6 : 0.95, delay: 0.1, ease: EASE }}
    onAnimationComplete={() => { if (badge) onDone() }}
  />
}

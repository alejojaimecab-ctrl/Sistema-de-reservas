import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useReduceMotion } from '../lib/motion'

// Transición de "reserva confirmada" estilo transferencia de Mercado Pago, acotada a la tarjeta
// (se dibuja dentro del contenedor que la contiene, que tiene que ser position: relative y overflow: hidden):
//  1. 'cover'  — el verde nace en (x, y), el botón, y se expande hasta llenar la tarjeta del formulario.
//  2. 'reveal' — ya en la tarjeta de confirmación, el verde se recoge hacia el tilde.
// Con "reducir movimiento" no hay expansión ni recogida: el verde solo aparece y se desvanece.

const EASE = [0.65, 0, 0.35, 1] as const

type Geo = { w: number; h: number; x: number; y: number }

export function GreenWipe({ phase, x = 0, y = 0, onDone }: {
  phase: 'cover' | 'reveal'
  x?: number // origen dentro de la tarjeta (solo 'cover')
  y?: number
  onDone: () => void
}) {
  const reduce = useReduceMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<Geo | null>(null)

  // Se mide el contenedor antes de pintar: el tamaño define hasta dónde crece el círculo, y en
  // 'reveal' el centro del tilde define hacia dónde se recoge.
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    if (phase === 'cover') {
      setGeo({ w, h, x, y })
      return
    }
    const badge = parent.querySelector<HTMLElement>('.success-badge')
    setGeo({
      w, h,
      x: badge ? badge.offsetLeft + badge.offsetWidth / 2 : w / 2,
      y: badge ? badge.offsetTop + badge.offsetHeight / 2 : h / 3,
    })
  }, [phase, x, y])

  // Hasta medir, un velo sin animar (invisible al cubrir; opaco al revelar, así no hay parpadeo)
  if (!geo) {
    return <div ref={ref} className={`green-wipe${phase === 'cover' ? ' green-wipe--cover' : ''}`} style={{ opacity: phase === 'cover' ? 0 : 1 }} aria-hidden="true" />
  }

  const radius = Math.hypot(geo.w, geo.h)

  if (phase === 'cover') {
    return <motion.div
      ref={ref}
      className="green-wipe green-wipe--cover"
      aria-hidden="true"
      initial={reduce ? { opacity: 0 } : { clipPath: `circle(0px at ${geo.x}px ${geo.y}px)` }}
      animate={reduce ? { opacity: 1 } : { clipPath: `circle(${radius}px at ${geo.x}px ${geo.y}px)` }}
      transition={{ duration: reduce ? 0.45 : 0.8, ease: EASE }}
      onAnimationComplete={onDone}
    />
  }

  return <motion.div
    ref={ref}
    className="green-wipe"
    aria-hidden="true"
    initial={reduce ? { opacity: 1 } : { clipPath: `circle(${radius}px at ${geo.w / 2}px ${geo.h / 2}px)` }}
    animate={reduce ? { opacity: 0 } : { clipPath: `circle(0px at ${geo.x}px ${geo.y}px)` }}
    transition={{ duration: reduce ? 0.6 : 0.95, delay: 0.1, ease: EASE }}
    onAnimationComplete={onDone}
  />
}

import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'

// Confirmación de reserva: el disco aparece con resorte, un anillo se dibuja alrededor, el tilde se
// traza, salen dos ondas y una ráfaga de partículas. Verde de "acierto" + celeste de marca.
// Con "reducir movimiento" se muestra directamente el estado final, sin animar.

const SIZE = 132
const C = SIZE / 2
const EASE = [0.22, 1, 0.36, 1] as const

// Partículas fijas (sin azar) para que la animación sea igual en cada reserva
const PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 + (i % 2 ? 0.12 : 0)
  const distance = i % 2 ? 62 : 88
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    size: i % 3 === 0 ? 8 : 5,
    color: ['#6ce6bb', '#7be5ff', '#e8f1f7'][i % 3],
    delay: 0.55 + (i % 4) * 0.035,
  }
})

export function SuccessCheck() {
  const reduce = useReducedMotion()
  const gradientId = useId()
  const ringId = useId()

  return <div className="success-badge" aria-hidden="true">
    {!reduce && <motion.span
      className="halo"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: [0, 0.8, 0.5, 0.8], scale: [0.6, 1.05, 1, 1.08] }}
      transition={{ duration: 3.6, times: [0, 0.25, 0.6, 1], delay: 0.2, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
    />}

    {!reduce && [0, 1].map(i => <motion.span
      key={i}
      className="ripple"
      initial={{ scale: 1, opacity: 0 }}
      animate={{ scale: 2.3, opacity: [0, 0.55, 0] }}
      transition={{ duration: 1.5, delay: 0.5 + i * 0.28, ease: 'easeOut' }}
    />)}

    {!reduce && PARTICLES.map((p, i) => <motion.span
      key={i}
      className="particle"
      style={{ width: p.size, height: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2, background: p.color }}
      initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
      animate={{ x: p.x, y: p.y, scale: [0, 1.15, 0.3], opacity: [1, 1, 0] }}
      transition={{ duration: 1, delay: p.delay, ease: EASE }}
    />)}

    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="presentation">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9ff3d6" />
          <stop offset="100%" stopColor="#2fbf94" />
        </linearGradient>
        <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7be5ff" />
          <stop offset="100%" stopColor="#6ce6bb" />
        </linearGradient>
      </defs>

      {/* Anillo que se dibuja (arranca arriba) */}
      <g transform={`rotate(-90 ${C} ${C})`}>
        <motion.circle
          cx={C} cy={C} r={58} fill="none" stroke={`url(#${ringId})`} strokeWidth={3} strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
        />
      </g>

      {/* Disco */}
      <motion.circle
        cx={C} cy={C} r={44} fill={`url(#${gradientId})`}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        initial={reduce ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      />

      {/* Tilde: su caja está centrada exactamente en el centro del disco */}
      <motion.path
        d={`M${C - 20} ${C + 1} L${C - 6} ${C + 15} L${C + 20} ${C - 14}`}
        fill="none" stroke="#06241b" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' }}
      />
    </svg>
  </div>
}

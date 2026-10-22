import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { Brand } from './Brand'
import { preloadCaptcha } from '../lib/captcha'

// Ingreso, alta y código del mail: una tarjeta partida en dos. A la izquierda una historia dibujada con líneas
// (los mensajes de WhatsApp que se tachan, el cliente que reserva desde el enlace, la agenda que se llena sola y el
// turno confirmado); a la derecha el formulario.
// stage: hasta qué paso se ve la reserva (1 a 4); 'loop' la repite sola.
export type StoryStage = 1 | 2 | 3 | 4 | 'loop'

export function AuthShell({ stage, onBack, backLabel, children }: {
  stage: StoryStage
  onBack: () => void
  backLabel: string
  children: ReactNode
}) {
  useEffect(preloadCaptcha, [])
  return <main className="auth">
    <header className="auth-top"><Brand /><button type="button" className="text-button" onClick={onBack}>{backLabel}</button></header>
    <div className="auth-card">
      <BookingStory stage={stage} />
      <section className="auth-main">{children}</section>
    </div>
  </main>
}

const EASE = [0.65, 0, 0.35, 1] as const
const LINE = 'rgb(255 255 255 / .32)'
const SOFT = 'rgb(255 255 255 / .55)'
const draw = (delay = 0, duration = 0.9) => ({ initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { pathLength: { duration, delay, ease: EASE }, opacity: { duration: 0.2, delay } } })
const appear = (delay = 0) => ({ initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay, ease: EASE } })
const LEAVE = { opacity: 0, transition: { duration: 0.35 } }

// Lo que cuenta cada escena, abajo del dibujo
const LINES = [
  'Sin idas y vueltas por WhatsApp.',
  'Tus clientes eligen el horario desde tu enlace.',
  'La agenda se llena sola.',
  'Turno confirmado y recordatorio 1 h antes.',
]

function BookingStory({ stage }: { stage: StoryStage }) {
  // En 'loop' pasa de escena sola; en el alta, cada paso muestra la suya (1 → chat, 4 → confirmado)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (stage !== 'loop') return
    const timer = window.setTimeout(() => setTick(current => (current + 1) % 4), tick === 3 ? 3400 : 2900)
    return () => window.clearTimeout(timer)
  }, [stage, tick])
  const scene = stage === 'loop' ? tick : stage - 1

  // Animación pedida por el dueño: corre aunque el sistema tenga "reducir movimiento" (se dibuja y aparece, no salta)
  return <MotionConfig reducedMotion="never">
    <aside className="auth-story" aria-hidden="true">
      <motion.span className="auth-aurora auth-aurora--a" animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.15, .95, 1] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.span className="auth-aurora auth-aurora--b" animate={{ x: [0, -50, 30, 0], y: [0, 20, -25, 0], scale: [1, .9, 1.1, 1] }} transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }} />

      <div className="auth-scene">
        <svg viewBox="0 0 400 360" role="presentation">
          <defs>
            <linearGradient id="auth-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6e4a6" /><stop offset="1" stopColor="#c8933a" /></linearGradient>
          </defs>
          <AnimatePresence mode="wait">
            {scene === 0 && <ChatScene key="chat" />}
            {scene === 1 && <PhoneScene key="phone" />}
            {scene === 2 && <AgendaScene key="agenda" />}
            {scene === 3 && <DoneScene key="done" />}
          </AnimatePresence>
        </svg>
        <AnimatePresence mode="wait">
          <motion.p key={scene} className="auth-scene-text" {...appear(0.2)} exit={{ opacity: 0, y: -6, transition: { duration: 0.25 } }}>{LINES[scene]}</motion.p>
        </AnimatePresence>
      </div>

      <div className="auth-story-caption">
        <p className="eyebrow">Tu agenda, sola</p>
        <h2>Tus clientes reservan a cualquier hora. Vos solo atendés.</h2>
      </div>
    </aside>
  </MotionConfig>
}

// 1 · Los mensajes de siempre para sacar un turno: la conversación tiembla como un error y se pone en rojo
const ERROR_AT = 1.9
const ERROR_RED = 'rgb(229 115 127 / .85)'
function ChatScene() {
  const bubbles = [
    { x: 40, y: 50, w: 200, text: '¿Tenés turno mañana?' },
    { x: 150, y: 110, w: 210, text: 'Mañana no, ¿el jueves?', out: true },
    { x: 40, y: 170, w: 150, text: '¿A qué hora?' },
  ]
  return <motion.g exit={LEAVE}>
    <motion.g animate={{ x: [0, -12, 12, -9, 9, -5, 5, 0], opacity: [1, 1, 1, 1, 1, 1, 1, 0.5] }} transition={{ duration: 0.6, delay: ERROR_AT, ease: 'easeInOut' }}>
      {bubbles.map((bubble, index) => <g key={bubble.text}>
        <motion.rect x={bubble.x} y={bubble.y} width={bubble.w} height={42} rx={21} fill={bubble.out ? 'rgb(255 255 255 / .06)' : 'none'} stroke={LINE} strokeWidth={1.5} {...draw(index * 0.45, 0.6)} />
        {/* El mismo contorno en rojo, que aparece en el momento del error (animar el color rompía el dibujo del contorno) */}
        <motion.rect x={bubble.x} y={bubble.y} width={bubble.w} height={42} rx={21} fill="none" stroke={ERROR_RED} strokeWidth={1.5}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: ERROR_AT }} />
        <motion.text x={bubble.x + 20} y={bubble.y + 26} className="auth-svg-text" {...appear(index * 0.45 + 0.35)}>{bubble.text}</motion.text>
      </g>)}
      {/* "escribiendo…", hasta que la conversación falla */}
      {[0, 1, 2].map(dot => <motion.circle key={dot} cx={64 + dot * 16} cy={246} r={4} fill={SOFT}
        initial={{ opacity: 0 }} animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }} transition={{ duration: 0.9, delay: 1.4 + dot * 0.15, repeat: 1 }} />)}
    </motion.g>
  </motion.g>
}

// 2 · El celular con tu enlace: el cliente elige el día y el horario
function PhoneScene() {
  const days = ['L', 'M', 'M', 'J', 'V']
  const slots = ['09:00', '10:30', '12:00']
  return <motion.g exit={LEAVE}>
    <motion.rect x={120} y={14} width={160} height={330} rx={28} fill="none" stroke={SOFT} strokeWidth={1.5} {...draw(0, 1)} />
    <motion.line x1={178} y1={34} x2={222} y2={34} stroke={LINE} strokeWidth={4} strokeLinecap="round" {...draw(0.6, 0.3)} />
    <motion.text x={200} y={74} textAnchor="middle" className="auth-svg-text auth-svg-text--small" {...appear(0.7)}>reser.app/tu-negocio</motion.text>
    {days.map((day, index) => {
      const cx = 142 + index * 29
      const picked = index === 3
      return <g key={index}>
        <motion.circle cx={cx} cy={118} r={12} fill={picked ? 'url(#auth-gold)' : 'none'} stroke={picked ? 'none' : LINE} strokeWidth={1.2}
          initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: picked ? 1.3 : 0.8 + index * 0.08 }} />
        <motion.text x={cx} y={122} textAnchor="middle" className={`auth-svg-text auth-svg-text--small${picked ? ' is-dark' : ''}`} {...appear(0.85 + index * 0.08)}>{day}</motion.text>
      </g>
    })}
    {slots.map((slot, index) => {
      const picked = index === 1
      return <g key={slot}>
        <motion.rect x={140} y={160 + index * 46} width={120} height={34} rx={17} fill={picked ? 'url(#auth-gold)' : 'none'} stroke={picked ? 'none' : LINE} strokeWidth={1.2}
          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: picked ? 1.9 : 1.4 + index * 0.1 }} />
        <motion.text x={200} y={182 + index * 46} textAnchor="middle" className={`auth-svg-text${picked ? ' is-dark' : ''}`} {...appear(1.5 + index * 0.1)}>{slot}</motion.text>
      </g>
    })}
    {/* El dedo que toca el horario */}
    <motion.circle cx={236} cy={223} r={14} fill="none" stroke="#f6e4a6" strokeWidth={1.5}
      initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: [0, 1, 0], scale: [0.4, 1.4, 1.8] }} transition={{ duration: 0.8, delay: 1.85 }} />
  </motion.g>
}

// 3 · El turno viaja a la agenda de la semana y los demás caen solos
function AgendaScene() {
  const cols = [0, 1, 2, 3, 4]
  const rows = [0, 1, 2, 3, 4]
  const blocks = [{ col: 3, row: 1, delay: 1.2 }, { col: 0, row: 3, delay: 1.7 }, { col: 1, row: 0, delay: 2.0 }, { col: 4, row: 2, delay: 2.3 }]
  const x0 = 150, y0 = 60, cw = 46, rh = 52
  return <motion.g exit={LEAVE}>
    {/* El celular chico, a un costado, con el horario elegido */}
    <motion.rect x={22} y={110} width={84} height={160} rx={16} fill="none" stroke={LINE} strokeWidth={1.3} {...draw(0, 0.6)} />
    <motion.rect x={36} y={178} width={56} height={22} rx={11} fill="url(#auth-gold)" {...appear(0.4)} />
    {/* La grilla de la semana */}
    {cols.map(col => <motion.text key={col} x={x0 + col * cw + cw / 2} y={44} textAnchor="middle" className="auth-svg-text auth-svg-text--small" {...appear(0.3 + col * 0.05)}>{['Lun', 'Mar', 'Mié', 'Jue', 'Vie'][col]}</motion.text>)}
    {rows.concat(5).map(row => <motion.line key={row} x1={x0} y1={y0 + row * rh} x2={x0 + cw * 5} y2={y0 + row * rh} stroke={LINE} strokeWidth={1} {...draw(0.2 + row * 0.06, 0.5)} />)}
    {/* El punto de luz que lleva el turno del celular a la agenda */}
    <motion.circle r={6} fill="#f6e4a6" className="auth-spark-dot"
      initial={{ cx: 92, cy: 189, opacity: 0 }} animate={{ cx: [92, 220, x0 + 3 * cw + cw / 2], cy: [189, 70, y0 + rh + rh / 2], opacity: [0, 1, 1, 0] }} transition={{ duration: 1, delay: 0.5, ease: EASE }} />
    {blocks.map(block => <motion.rect key={`${block.col}-${block.row}`} x={x0 + block.col * cw + 4} width={cw - 8} height={rh - 10} rx={9}
      fill={block.col === 3 ? 'url(#auth-gold)' : 'rgb(255 255 255 / .16)'} stroke={block.col === 3 ? 'none' : SOFT} strokeWidth={1}
      initial={{ y: y0 + block.row * rh - 40, opacity: 0 }} animate={{ y: y0 + block.row * rh + 5, opacity: 1 }} transition={{ duration: 0.55, delay: block.delay, ease: [0.34, 1.4, 0.64, 1] }} />)}
  </motion.g>
}

// 4 · El tilde dorado y el recordatorio
function DoneScene() {
  return <motion.g exit={LEAVE}>
    <motion.circle cx={200} cy={150} r={82} fill="none" stroke={LINE} strokeWidth={1.5} {...draw(0, 0.8)} />
    <motion.circle cx={200} cy={150} r={96} fill="none" stroke="url(#auth-gold)" strokeWidth={2.5} strokeLinecap="round" transform="rotate(-90 200 150)" {...draw(0.3, 1.1)} />
    <motion.path d="M162 152 L190 180 L242 124" fill="none" stroke="url(#auth-gold)" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" className="auth-check" {...draw(0.9, 0.6)} />
    <motion.text x={200} y={286} textAnchor="middle" className="auth-svg-text auth-svg-text--big" {...appear(1.3)}>Jue 23 · 10:30</motion.text>
    {/* La campanita del recordatorio */}
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1, rotate: [0, -14, 12, -8, 0] }} style={{ originX: '50%', originY: '0%' }} transition={{ opacity: { delay: 1.7 }, rotate: { duration: 0.9, delay: 1.9 } }}>
      <path d="M296 62 a14 14 0 0 1 28 0 v14 l6 8 h-40 l6 -8 z M304 90 a6 6 0 0 0 12 0" fill="none" stroke="#f6e4a6" strokeWidth={1.8} strokeLinejoin="round" />
    </motion.g>
  </motion.g>
}

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

// Gráficos de Estadísticas en SVG propio (sin librerías). Una sola serie por gráfico, en blanco sobre negro:
// líneas de 2px, puntas redondeadas, grilla tenue y el detalle al pasar el dedo o el mouse.
// Las animaciones (números que cuentan, líneas que se dibujan, anillos que se llenan) andan siempre, también con
// "reducir movimiento": el dueño lo pidió así, y son cambios cortos en el lugar, sin desplazar la pantalla.

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))

// Un número que sube desde 0 hasta su valor apenas aparece (con su propio reloj, no depende de CSS)
export function useCountUp(target: number, { duration = 1100, delay = 0 } = {}) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let frame = 0
    let start: number | null = null
    const tick = (now: number) => {
      if (start === null) start = now + delay
      const t = Math.max(0, (now - start) / duration)
      setValue(target * easeOutExpo(t))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, delay])
  return value
}

export function CountUp({ value, format, delay = 0, duration }: { value: number; format: (n: number) => string; delay?: number; duration?: number }) {
  const current = useCountUp(value, { delay, duration })
  // El lector de pantalla lee el valor final, no cada paso
  return <><span aria-hidden="true">{format(current)}</span><span className="sr-only">{format(value)}</span></>
}

const delayStyle = (ms: number) => ({ '--draw-delay': `${ms}ms` } as CSSProperties)

// ── Mini línea (dentro de una cifra) ──────────────────────────────────────
export function Sparkline({ values, delay = 0, label }: { values: number[]; delay?: number; label: string }) {
  const gradientId = useId()
  const points = values.length > 1 ? values : [0, ...values, 0]
  const max = Math.max(1, ...points)
  const coords = points.map((value, index) => [(index / (points.length - 1)) * 100, 30 - (value / max) * 26] as const)
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  return <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={label} style={delayStyle(delay)}>
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".22" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <path className="spark-area" d={`${line} L100,32 L0,32 Z`} fill={`url(#${gradientId})`} />
    <path className="spark-line" d={line} pathLength={1} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>
}

// ── Barritas (dentro de una cifra) ────────────────────────────────────────
export function MiniBars({ values, delay = 0, label }: { values: number[]; delay?: number; label: string }) {
  const shown = values.slice(-14)
  const max = Math.max(1, ...shown)
  const width = 100 / Math.max(1, shown.length)
  return <svg className="minibars" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={label}>
    {shown.map((value, index) => {
      const height = Math.max(2, (value / max) * 30)
      return <rect key={index} x={index * width + width * 0.18} y={32 - height} width={width * 0.64} height={height} rx={1.5}
        className={value === max && value > 0 ? 'is-top' : undefined}
        style={{ '--draw-delay': `${delay + index * 35}ms` } as CSSProperties} />
    })}
  </svg>
}

// ── Anillo de porcentaje ──────────────────────────────────────────────────
export function Ring({ percent, delay = 0, label }: { percent: number | null; delay?: number; label: string }) {
  const value = Math.max(0, Math.min(100, percent ?? 0))
  return <svg className="ring" viewBox="0 0 40 40" role="img" aria-label={label} style={{ ...delayStyle(delay), '--ring-value': String(value) } as CSSProperties}>
    <circle className="ring-track" cx="20" cy="20" r="16" fill="none" strokeWidth="4" />
    {percent !== null && <circle className="ring-value" cx="20" cy="20" r="16" fill="none" strokeWidth="4" strokeLinecap="round" pathLength={100} transform="rotate(-90 20 20)" />}
  </svg>
}

// ── Medidor semicircular (meta del mes) ───────────────────────────────────
export function Gauge({ percent, expected, delay = 0, children }: { percent: number; expected: number | null; delay?: number; children?: React.ReactNode }) {
  const value = Math.max(0, Math.min(100, percent))
  // Punto sobre el arco para la marca de "dónde deberías estar hoy"
  const marker = expected === null ? null : (() => {
    const angle = Math.PI * (1 - Math.max(0, Math.min(100, expected)) / 100)
    return { x: 100 + Math.cos(angle) * 80, y: 100 - Math.sin(angle) * 80 }
  })()
  return <div className="gauge" style={{ ...delayStyle(delay), '--gauge-value': String(value) } as CSSProperties}>
    <svg viewBox="0 0 200 110" aria-hidden="true">
      <path className="gauge-track" d="M20,100 A80,80 0 0 1 180,100" fill="none" strokeWidth="14" strokeLinecap="round" />
      <path className="gauge-value" d="M20,100 A80,80 0 0 1 180,100" fill="none" strokeWidth="14" strokeLinecap="round" pathLength={100} />
      {marker && <circle className="gauge-marker" cx={marker.x} cy={marker.y} r="4" />}
    </svg>
    <div className="gauge-center">{children}</div>
  </div>
}

// ── Línea grande con detalle al pasar el dedo ─────────────────────────────
export type TrendPoint = { key: string; label: string; detail: string; value: number }

const HEIGHT = 220
const PAD = { top: 16, right: 12, bottom: 28, left: 52 }

function niceMax(value: number) {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find(candidate => candidate * power >= value) ?? 10
  return step * power
}

export function TrendChart({ points, format, formatAxis, ariaLabel }: { points: TrendPoint[]; format: (n: number) => string; formatAxis: (n: number) => string; ariaLabel: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)
  const gradientId = useId()

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const max = niceMax(Math.max(0, ...points.map(point => point.value)))
  const innerWidth = width - PAD.left - PAD.right
  const innerHeight = HEIGHT - PAD.top - PAD.bottom
  const x = (index: number) => PAD.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth)
  const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  const area = points.length > 0 ? `${line} L${x(points.length - 1).toFixed(1)},${PAD.top + innerHeight} L${x(0).toFixed(1)},${PAD.top + innerHeight} Z` : ''
  const ticks = [0, max / 2, max]
  // Etiquetas del eje: como mucho 6, repartidas
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  const topIndex = useMemo(() => points.reduce((best, point, index) => point.value > (points[best]?.value ?? -1) ? index : best, 0), [points])

  function pick(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))))
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') { event.preventDefault(); setActive(current => Math.min(points.length - 1, (current ?? -1) + 1)) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); setActive(current => Math.max(0, (current ?? points.length) - 1)) }
    else if (event.key === 'Escape') setActive(null)
  }

  const shown = active ?? null
  return <div className="trend" ref={wrapRef}>
    <div className="trend-plot" tabIndex={0} role="img" aria-label={ariaLabel} onKeyDown={onKey} onBlur={() => setActive(null)}>
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".18" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
        {ticks.map(tick => <g key={tick} className="trend-grid">
          <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
          <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{formatAxis(tick)}</text>
        </g>)}
        {points.map((point, index) => index % labelEvery === 0 || index === points.length - 1
          ? <text key={point.key} className="trend-xlabel" x={x(index)} y={HEIGHT - 8} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{point.label}</text>
          : null)}
        <path className="trend-area" d={area} fill={`url(#${gradientId})`} />
        <path className="trend-line" d={line} pathLength={1} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.length > 0 && points[topIndex].value > 0 && shown === null && <circle className="trend-top" cx={x(topIndex)} cy={y(points[topIndex].value)} r={4} />}
        {shown !== null && points[shown] && <g className="trend-cursor">
          <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={PAD.top + innerHeight} />
          <circle cx={x(shown)} cy={y(points[shown].value)} r={5} />
        </g>}
        <rect className="trend-hit" x={PAD.left} y={PAD.top} width={innerWidth} height={innerHeight + PAD.bottom}
          onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)} />
      </svg>
      {shown !== null && points[shown] && <div className="trend-tip" style={{ left: Math.min(width - 150, Math.max(0, x(shown) - 70)) }}>
        <small>{points[shown].detail}</small>
        <strong>{format(points[shown].value)}</strong>
      </div>}
    </div>
    {/* Los mismos datos como tabla, para lectores de pantalla. Va dentro de un div: una tabla no achica su ancho
        con width 1px y empujaba la página de costado en el celular */}
    <div className="sr-only">
      <table>
        <caption>{ariaLabel}</caption>
        <tbody>{points.map(point => <tr key={point.key}><th scope="row">{point.detail}</th><td>{format(point.value)}</td></tr>)}</tbody>
      </table>
    </div>
  </div>
}

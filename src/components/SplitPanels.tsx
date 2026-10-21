import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// Dos paneles en el mismo lugar: uno abierto y el otro plegado en una solapa que asoma por detrás, a un costado.
// Al tocar la solapa, ese panel entero sale de atrás de la solapa y se desliza como un cajón sobre el abierto,
// que se hunde un poco hasta quedar tapado; después la solapa del otro aparece del lado contrario.
// Los dos quedan montados para no recargar sus datos. En el celular la solapa es una barra arriba.
export type SplitPanel = { key: string; label: string; icon: LucideIcon; content: ReactNode }

const TAB = 46 // ancho visible de la solapa

export function SplitPanels({ panels, open, onOpen }: { panels: SplitPanel[]; open: string; onOpen: (key: string) => void }) {
  const [leaving, setLeaving] = useState<string | null>(null) // el que queda debajo mientras el nuevo lo tapa
  const [revealing, setRevealing] = useState<string | null>(null)
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const stageRef = useRef<HTMLDivElement>(null)
  const tabRef = useRef<HTMLButtonElement>(null)
  const switchedRef = useRef(false) // la solapa solo entra animada después de un cambio, no al abrir la pantalla
  // El que se ve: cambia apenas se toca la solapa, sin esperar a que el panel confirme la sección (puede tardar)
  const shown = revealing ?? open
  const openIndex = panels.findIndex(panel => panel.key === shown)
  const tabSide = openIndex === 0 ? 'right' : 'left'
  const closed = panels.find(panel => panel.key !== shown)

  function pick(key: string) {
    if (revealing) return
    setLeaving(open)
    setRevealing(key)
    switchedRef.current = true
    onOpen(key)
  }

  // Antes de pintar, para que no se vea un cuadro con todo ya cambiado de lugar
  useLayoutEffect(() => {
    if (!revealing || !leaving) return
    const pane = paneRefs.current[revealing]
    const old = paneRefs.current[leaving]
    const stage = stageRef.current
    if (!pane || !old || !stage) return
    const fromRight = panels.findIndex(panel => panel.key === revealing) === panels.length - 1
    const phone = window.matchMedia('(max-width: 800px)').matches
    // Animaciones nativas del navegador: al cancelarlas no dejan nada pegado en el estilo (la de motion dejaba
    // el panel de atrás oscurecido y, al volver a abrirlo, seguía oscuro)
    const timing: KeyframeAnimationOptions = { duration: 850, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' }
    const animations = [
      // El panel nuevo entra entero desde donde estaba su solapa
      pane.animate([{ transform: `translateX(${fromRight ? 100 : -100}%)` }, { transform: 'translateX(0)' }], timing),
      // El de atrás se hunde: un poco más chico y más oscuro
      old.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.35, transform: 'scale(0.97)' }], timing),
    ]
    if (!phone) animations.push(stage.animate(fromRight
      ? [{ marginLeft: '0px', marginRight: `${TAB}px` }, { marginLeft: `${TAB}px`, marginRight: '0px' }]
      : [{ marginLeft: `${TAB}px`, marginRight: '0px' }, { marginLeft: '0px', marginRight: `${TAB}px` }], timing))
    let done = false
    void Promise.all(animations.map(animation => animation.finished)).then(() => {
      done = true
      animations.forEach(animation => animation.cancel())
      setLeaving(null)
      setRevealing(null)
    }, () => undefined)
    return () => { if (!done) animations.forEach(animation => animation.cancel()) }
  }, [revealing])

  // Cuando el cajón termina, la solapa del otro panel sale de atrás de la tarjeta hacia su costado, de a poco
  // (animación nativa: la de CSS la apaga "reducir movimiento" y aparecía de golpe)
  const tabKey = revealing ? null : closed?.key
  useLayoutEffect(() => {
    const tab = tabRef.current
    if (!tabKey || !tab || !switchedRef.current) return
    const phone = window.matchMedia('(max-width: 800px)').matches
    const from = phone ? 'translateY(-10px)' : `translateX(${tabSide === 'right' ? -36 : 36}px)`
    const entrance = tab.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }],
      { duration: 600, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' })
    return () => entrance.cancel()
  }, [tabKey])

  const Icon = closed?.icon
  return <div className={`split split--tab-${tabSide}${revealing ? ' is-switching' : ''}`} style={{ '--tab': `${TAB}px` } as CSSProperties}>
    {closed && Icon && !revealing && <button ref={tabRef} key={closed.key} type="button" className="split-tab" title={closed.label} aria-label={`Abrir ${closed.label}`} aria-expanded={false} onClick={() => pick(closed.key)}>
      {/* En la compu solo el ícono (el nombre en vertical se leía de costado); el nombre queda para el mouse,
          el lector de pantalla y la barra del celular */}
      <span className="split-tab-label"><Icon size={20} aria-hidden="true" /><span>{closed.label}</span></span>
    </button>}
    <div ref={stageRef} className="split-stage">
      {panels.map(({ key, content }) => <div
        key={key}
        ref={element => { paneRefs.current[key] = element }}
        className={`split-pane${key === shown ? ' is-open' : ''}${key === leaving ? ' is-leaving' : ''}`}
        aria-hidden={key !== shown}
        inert={key !== shown}
      >{content}</div>)}
    </div>
  </div>
}

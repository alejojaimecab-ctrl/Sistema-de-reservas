import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { matchTime } from '../lib/timeMatch'

// Desplegable de horas con el estilo de RESER (el <select> nativo abre una lista cuadrada del sistema).
// La lista va en un portal con posición fija: así los paneles con overflow no la cortan. Teclado: flechas,
// Inicio/Fin, Enter o espacio para elegir y Esc para cerrar.
export function TimeSelect({ value, options, onChange, label }: {
  value: number
  options: { value: number; label: string }[]
  onChange: (value: number) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(value)
  const [place, setPlace] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const id = useId()
  // Lo que se va tecleando ("1", "18"…): salta a la hora que empieza así, como un <select> nativo
  const typed = useRef({ text: '', at: 0 })
  const current = options.find(option => option.value === value)

  function measure() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    // Abre para arriba si abajo no entra la lista entera
    const up = window.innerHeight - rect.bottom < LIST_HEIGHT + 12 && rect.top > window.innerHeight - rect.bottom
    setPlace({ left: rect.left, top: up ? rect.top - 6 : rect.bottom + 6, width: Math.max(rect.width, 84), up })
  }

  useLayoutEffect(() => {
    if (!open) return
    measure()
    setActive(value)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Con la lista abierta: se acomoda al hacer scroll y se cierra al tocar afuera
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!listRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    document.addEventListener('pointerdown', close)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      document.removeEventListener('pointerdown', close)
    }
  }, [open])

  // La opción marcada queda a la vista (al abrir, centrada)
  useEffect(() => {
    if (!open || !place) return
    listRef.current?.querySelector<HTMLElement>(`[data-value="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, place, active])
  useEffect(() => {
    if (!open || !place) return
    const list = listRef.current
    const selected = list?.querySelector<HTMLElement>(`[data-value="${value}"]`)
    if (list && selected) list.scrollTop = selected.offsetTop - list.clientHeight / 2 + selected.offsetHeight / 2
  }, [open, place === null]) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(next: number) {
    if (next !== value) onChange(next)
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (/^\d$/.test(event.key)) {
      event.preventDefault()
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 900 ? typed.current.text : '') + event.key, at: now }
      const match = matchTime(options, typed.current.text)
      if (match === undefined) return
      if (open) setActive(match)
      else if (match !== value) onChange(match)
      return
    }
    const index = options.findIndex(option => option.value === active)
    const move = (to: number) => { event.preventDefault(); setActive(options[Math.max(0, Math.min(options.length - 1, to))].value) }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpen(true) }
      return
    }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(options.length - 1)
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active) }
    else if (event.key === 'Escape' || event.key === 'Tab') setOpen(false)
  }

  return <>
    <button
      ref={buttonRef}
      type="button"
      className={`time-select${open ? ' is-open' : ''}`}
      aria-label={`${label}: ${current?.label ?? ''}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      aria-activedescendant={open ? `${id}-${active}` : undefined}
      onClick={() => setOpen(current => !current)}
      onKeyDown={onKeyDown}
    >
      <span>{current?.label}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && place && createPortal(
      <div
        ref={listRef}
        id={id}
        role="listbox"
        aria-label={label}
        className={`time-select-list${place.up ? ' is-up' : ''}`}
        style={{ left: place.left, top: place.top, width: place.width }}
      >
        {options.map(option => <div
          key={option.value}
          id={`${id}-${option.value}`}
          data-value={option.value}
          role="option"
          aria-selected={option.value === value}
          className={`time-select-option${option.value === active ? ' is-active' : ''}`}
          onPointerEnter={() => setActive(option.value)}
          onClick={() => choose(option.value)}
        >
          {option.label}
        </div>)}
      </div>,
      document.body,
    )}
  </>
}

const LIST_HEIGHT = 248

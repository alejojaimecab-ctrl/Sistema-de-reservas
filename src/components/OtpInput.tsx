import { useEffect, useRef } from 'react'

// Casillas del código del mail: un dígito por casilla, salta sola a la siguiente, borra hacia atrás
// y acepta pegar el código entero. Completo, avisa con onComplete.
// status: 'checking' los dígitos saltan en ola mientras se verifica, 'ok' se ponen verdes con un golpe,
// 'error' tiemblan en rojo (el mismo temblor que el chat del login).
export type OtpStatus = 'checking' | 'ok' | 'error'

export function OtpInput({ length, value, onChange, onComplete, disabled, status }: {
  length: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  status?: OtpStatus
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const groupRef = useRef<HTMLDivElement>(null)
  // Con WAAPI y no con CSS: así corre aunque el sistema tenga "reducir movimiento" (lo pidió el dueño)
  useEffect(() => {
    const inputs = refs.current.filter((input): input is HTMLInputElement => Boolean(input))
    let running: Animation[] = []
    if (status === 'checking') running = inputs.map((input, index) => input.animate(
      [{ transform: 'none' }, { transform: 'translateY(-8px) scale(1.06)', offset: .35 }, { transform: 'translateY(2px)', offset: .7 }, { transform: 'none' }],
      { duration: 640, delay: index * 80, iterations: Infinity, easing: 'ease-in-out' }))
    if (status === 'ok') running = inputs.map((input, index) => input.animate(
      [{ transform: 'none' }, { transform: 'scale(1.14)', offset: .45 }, { transform: 'none' }],
      { duration: 420, delay: index * 60, easing: 'cubic-bezier(.16,1,.3,1)' }))
    if (status === 'error' && groupRef.current) running = [groupRef.current.animate(
      [0, -12, 12, -9, 9, -5, 5, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 520, easing: 'ease-out' })]
    return () => running.forEach(animation => animation.cancel())
  }, [status])
  const focus = (index: number) => refs.current[Math.max(0, Math.min(length - 1, index))]?.focus()

  function update(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, length)
    onChange(clean)
    if (clean.length === length) onComplete?.(clean)
    return clean
  }

  return <div ref={groupRef} className={`otp${status ? ` is-${status === 'error' ? 'invalid' : status}` : ''}`} role="group" aria-label={`Código de ${length} dígitos`}>
    {Array.from({ length }, (_, index) => <input
      key={index}
      ref={element => { refs.current[index] = element }}
      className={value[index] ? 'is-filled' : ''}
      inputMode="numeric"
      autoComplete={index === 0 ? 'one-time-code' : 'off'}
      maxLength={length}
      aria-label={`Dígito ${index + 1}`}
      disabled={disabled}
      value={value[index] ?? ''}
      onFocus={event => event.target.select()}
      onChange={event => {
        const typed = event.target.value.replace(/\D/g, '')
        if (!typed) return
        // Pegado o autocompletado del código entero en una casilla
        if (typed.length > 1) { const clean = update(value.slice(0, index) + typed); focus(clean.length); return }
        update(value.slice(0, index) + typed + value.slice(index + 1))
        focus(index + 1)
      }}
      onKeyDown={event => {
        if (event.key === 'Backspace') {
          event.preventDefault()
          if (value[index]) update(value.slice(0, index) + value.slice(index + 1))
          else if (index > 0) { update(value.slice(0, index - 1) + value.slice(index)); focus(index - 1) }
        }
        if (event.key === 'ArrowLeft') focus(index - 1)
        if (event.key === 'ArrowRight') focus(index + 1)
      }}
      onPaste={event => {
        event.preventDefault()
        const clean = update(event.clipboardData.getData('text'))
        focus(clean.length)
      }}
    />)}
  </div>
}

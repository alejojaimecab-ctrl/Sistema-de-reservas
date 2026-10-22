import { useRef } from 'react'

// Casillas del código del mail: un dígito por casilla, salta sola a la siguiente, borra hacia atrás
// y acepta pegar el código entero. Completo, avisa con onComplete.
export function OtpInput({ length, value, onChange, onComplete, disabled, invalid }: {
  length: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const focus = (index: number) => refs.current[Math.max(0, Math.min(length - 1, index))]?.focus()

  function update(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, length)
    onChange(clean)
    if (clean.length === length) onComplete?.(clean)
    return clean
  }

  return <div className={`otp${invalid ? ' is-invalid' : ''}`} role="group" aria-label={`Código de ${length} dígitos`}>
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

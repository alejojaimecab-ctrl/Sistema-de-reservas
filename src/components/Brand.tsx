import { GO_HOME_EVENT } from '../lib/routes'

type BrandProps = { compact?: boolean; inverse?: boolean }

// El logo siempre lleva a la portada. La app no tiene router: avisa con un evento y App cambia de pantalla.
// Con Ctrl/Cmd o la rueda del mouse se abre en otra pestaña, como cualquier enlace.
export function Brand({ compact = false, inverse = false }: BrandProps) {
  return (
    <a
      href="/"
      className={`brand ${inverse ? 'brand--inverse' : ''}`}
      aria-label="RESER, ir al inicio"
      onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        window.dispatchEvent(new Event(GO_HOME_EVENT))
      }}
    >
      <img src="/brand/Reser-logo.png" alt="" height={compact ? 40 : 60} style={{ marginTop: 8 }} />
    </a>
  );
}

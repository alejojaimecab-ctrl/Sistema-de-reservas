import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  // Tercera opción, entre Volver y la principal (por ejemplo, "Salir sin guardar")
  altLabel?: string
}

// 'confirm' es el botón principal, 'alt' la tercera opción y 'cancel' Volver, Escape o tocar afuera
export type ConfirmChoice = 'confirm' | 'alt' | 'cancel'

type Pending = ConfirmOptions & { resolve: (choice: ConfirmChoice) => void }

// Reemplaza a window.confirm: algunos navegadores embebidos descartan los cuadros nativos sin mostrarlos
// (el botón "no hace nada"), y además no se pueden adaptar al diseño ni al idioma.
// Uso: const { confirm, dialog } = useConfirm() → if (!await confirm({ title })) return → renderizar {dialog}
// Con tres salidas: const choice = await choose({ title, altLabel }) → 'confirm' | 'alt' | 'cancel'
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  pendingRef.current = pending

  const choose = useCallback((options: ConfirmOptions) => new Promise<ConfirmChoice>(resolve => {
    pendingRef.current?.resolve('cancel')
    setPending({ ...options, resolve })
  }), [])
  const confirm = useCallback(async (options: ConfirmOptions) => (await choose(options)) === 'confirm', [choose])

  const close = useCallback((choice: ConfirmChoice) => {
    pendingRef.current?.resolve(choice)
    setPending(null)
  }, [])

  // Si la pantalla se cierra con una pregunta abierta, la promesa no queda colgada
  useEffect(() => () => { pendingRef.current?.resolve('cancel') }, [])

  const dialog = pending ? <ConfirmDialog options={pending} onClose={close} /> : null
  return { confirm, choose, dialog: dialog as ReactNode }
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (choice: ConfirmChoice) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Al cerrar, el foco vuelve al botón que abrió la pregunta
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // El foco arranca en la opción segura: Enter nunca confirma algo destructivo por accidente
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose('cancel'); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      // Tab y Shift+Tab giran entre los botones del diálogo: el foco no se escapa a la página de atrás
      const buttons = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      if (buttons.length === 0) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      const inside = dialogRef.current.contains(document.activeElement)
      if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [onClose])

  // En el body: un antecesor con transform/animación rompería el position: fixed y el fondo no cubriría la pantalla
  return createPortal(<div className="confirm-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose('cancel') }}>
    <div ref={dialogRef} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={options.message ? 'confirm-message' : undefined}>
      <h2 id="confirm-title">{options.title}</h2>
      {options.message && <p id="confirm-message">{options.message}</p>}
      <div className="confirm-actions">
        <button type="button" ref={cancelRef} className="button button--secondary button--small" onClick={() => onClose('cancel')}>{options.cancelLabel ?? 'Volver'}</button>
        {options.altLabel && <button type="button" className="button button--secondary button--small" onClick={() => onClose('alt')}>{options.altLabel}</button>}
        <button type="button" className={`button button--small ${options.danger ? 'button--danger' : 'button--primary'}`} onClick={() => onClose('confirm')}>{options.confirmLabel ?? 'Confirmar'}</button>
      </div>
    </div>
  </div>, document.body)
}

// Copia texto al portapapeles. Algunos navegadores (y los paneles embebidos) bloquean navigator.clipboard
// y descartan window.prompt sin avisar, así que se prueba también el método clásico con un campo oculto.
// Devuelve false si no se pudo: quien llama le muestra el texto a la persona para que lo copie a mano.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* sigue con el método clásico */ }

  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  area.style.pointerEvents = 'none'
  document.body.appendChild(area)
  area.select()
  let copied = false
  try { copied = document.execCommand('copy') } catch { copied = false }
  area.remove()
  return copied
}

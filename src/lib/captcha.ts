// CAPTCHA con Cloudflare Turnstile para ingresar, crear la cuenta y recuperar la contraseña.
// Es invisible: solo muestra un desafío si Cloudflare desconfía. Supabase valida el token con la clave secreta
// (Authentication → Attack Protection). Sin VITE_TURNSTILE_SITE_KEY no se pide nada (desarrollo, o hasta activarlo).
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

let loading: Promise<Turnstile> | null = null
function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile)
    script.onerror = () => { loading = null; reject(new Error('captcha_unavailable')) }
    document.head.append(script)
  })
  return loading
}

// Se llama al abrir las pantallas de cuenta: el script ya está listo cuando la persona toca el botón
export function preloadCaptcha() {
  if (SITE_KEY) void loadTurnstile().catch(() => undefined)
}

// Un token nuevo por intento (cada uno sirve una sola vez). undefined si el CAPTCHA no está configurado.
export async function captchaToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined
  const turnstile = await loadTurnstile()
  return new Promise((resolve, reject) => {
    const box = document.createElement('div')
    box.className = 'captcha-box'
    document.body.append(box)
    let widgetId = ''
    const done = () => { if (widgetId) turnstile.remove(widgetId); box.remove() }
    widgetId = turnstile.render(box, {
      sitekey: SITE_KEY,
      appearance: 'interaction-only',
      language: 'es',
      callback: (token: string) => { done(); resolve(token) },
      'error-callback': () => { done(); reject(new Error('captcha_failed')) },
      'timeout-callback': () => { done(); reject(new Error('captcha_failed')) },
    })
  })
}

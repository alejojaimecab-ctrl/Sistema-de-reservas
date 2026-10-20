// Errores de Supabase / Postgres / red traducidos al castellano del producto.
// Los mensajes que las funciones de la base ya devuelven en castellano (RAISE EXCEPTION '...') pasan tal cual;
// lo técnico en inglés se reemplaza por algo que la dueña entienda y sepa qué hacer.

type RawError = { message: string; code?: string }

export const SLUG_TAKEN = 'Ese enlace ya está en uso. Elegí otro.'

const NETWORK = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out/i
// Palabras que delatan un mensaje técnico en inglés (los nuestros de la base están en castellano)
const ENGLISH = /\b(the|violates|duplicate|permission|denied|column|relation|invalid|failed|unexpected|not found|null value|constraint|policy|syntax|exceeded|payload|unauthorized|forbidden|could not|unable|database|schema|query|querying|internal|server|connection|refused|missing|required|must|cannot|does not|already|unknown|function)\b/i

export function friendlyError(error: RawError | string): string {
  const message = typeof error === 'string' ? error : error.message
  const code = typeof error === 'string' ? undefined : error.code
  if (NETWORK.test(message)) return 'No pudimos conectarnos. Revisá tu internet y probá de nuevo.'
  if (code === '23505' || /duplicate key/i.test(message)) return /slug/i.test(message) ? SLUG_TAKEN : 'Eso ya está cargado: revisá que no esté repetido.'
  if (code === '23503' || /foreign key/i.test(message)) return 'No se puede borrar porque tiene reservas u otros datos asociados.'
  if (code === '42501' || /row-level security|permission denied/i.test(message)) return 'No tenés permiso para hacer esto. Si cambiaste de cuenta hace poco, recargá la página.'
  if (code === 'PGRST301' || /jwt expired|invalid jwt/i.test(message)) return 'Tu sesión venció. Volvé a iniciar sesión.'
  if (code === '23514' || /check constraint/i.test(message)) return 'Algún dato no es válido. Revisalo y probá de nuevo.'
  if (code === '22001' || /value too long/i.test(message)) return 'Algún texto es demasiado largo. Acortalo y probá de nuevo.'
  if (/payload too large|exceeded the maximum allowed size|entity too large/i.test(message)) return 'El archivo es demasiado pesado.'
  if (/rate limit|too many requests/i.test(message)) return 'Hiciste demasiados intentos seguidos. Esperá unos minutos y volvé a probar.'
  if (ENGLISH.test(message)) {
    console.warn('Error de la base sin traducir:', message)
    return 'Algo salió mal. Probá de nuevo en unos segundos; si sigue pasando, recargá la página.'
  }
  return message
}

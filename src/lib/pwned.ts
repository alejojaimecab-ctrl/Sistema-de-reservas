// ¿La contraseña apareció en filtraciones? Usa la lista pública de HaveIBeenPwned por k-anonimato: se manda solo el
// principio (5 caracteres) del SHA-1, nunca la contraseña. Supabase hace lo mismo del lado del servidor, pero solo
// desde el plan Pro; esto cubre hasta entonces.
// Si el servicio no responde, deja pasar: una caída de terceros no puede impedir crear la cuenta.
export async function isPasswordLeaked(password: string): Promise<boolean> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
    const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } })
    if (!response.ok) return false
    const suffix = hash.slice(5)
    return (await response.text()).split('\n').some(line => {
      const [candidate, count] = line.trim().split(':')
      return candidate === suffix && Number(count) > 0
    })
  } catch {
    return false
  }
}

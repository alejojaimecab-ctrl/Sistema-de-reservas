// Teclear una hora en el selector (TimeSelect): busca la primera opción que empieza con lo escrito.
// "18" → 18:00, "10" → 10:00, "9" o "09" → 09:00, "930" → 09:30. Primero se busca tal cual y solo si no hay,
// sin el cero de adelante (si no, "10" encontraba 01:00 por "100").
export function matchTime(options: { value: number; label: string }[], text: string): number | undefined {
  const digits = (label: string) => label.replace(':', '')
  return (options.find(option => digits(option.label).startsWith(text))
    ?? options.find(option => digits(option.label).replace(/^0/, '').startsWith(text)))?.value
}

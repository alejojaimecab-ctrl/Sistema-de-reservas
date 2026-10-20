// Dirección del local en tres partes: calle y número, localidad o barrio, y provincia.
// Se guarda en businesses.address como un solo texto que se lee bien en la página de reservas
// ("Av. Corrientes 1234, Palermo, Ciudad de Buenos Aires"); la provincia sale de esta lista, y eso permite volver a separarla.
export const PROVINCES = [
  'Ciudad de Buenos Aires', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos',
  'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
]

export type AddressParts = { street: string; city: string; province: string }

export function splitAddress(address: string | null | undefined): AddressParts {
  const text = (address ?? '').trim()
  const parts = text.split(',').map(part => part.trim())
  const province = parts[parts.length - 1]
  if (parts.length >= 3 && PROVINCES.includes(province)) {
    return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], province }
  }
  // Dirección cargada antes como texto libre: queda toda en "Calle y número" para completarla
  return { street: text, city: '', province: '' }
}

export function joinAddress({ street, city, province }: AddressParts): string {
  return [street.trim(), city.trim(), province].filter(Boolean).join(', ')
}

// null si está bien; si no, qué falta. Las tres partes juntas o ninguna: con una sola Google adivina mal
export function addressProblem({ street, city, province }: AddressParts): string | null {
  const filled = [street.trim(), city.trim(), province].filter(Boolean).length
  if (filled === 0 || filled === 3) return null
  return 'Para que el mapa encuentre tu local completá calle y número, localidad y provincia (o dejá los tres vacíos).'
}

// Para Google (mapa y calendario): la dirección con el país, así no la confunde con una calle de otro lugar
export function addressForMaps(address: string): string {
  const text = address.trim()
  return /argentina$/i.test(text) ? text : `${text}, Argentina`
}

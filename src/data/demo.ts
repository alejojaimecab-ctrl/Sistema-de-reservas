export type Service = {
  id: string
  name: string
  duration: number
  price: number
}

export const demoServices: Service[] = [
  { id: 'corte', name: 'Servicio A', duration: 30, price: 8500 },
  { id: 'barba', name: 'Servicio B', duration: 60, price: 14000 },
  { id: 'premium', name: 'Servicio C', duration: 75, price: 19000 },
]

export type PriceMode = 'fixed' | 'from' | 'ask'

// Cómo se muestra el precio de un servicio: fijo, "Desde $X" o "A consultar"
export const priceLabel = (price: number, mode: PriceMode) =>
  mode === 'ask' ? 'A consultar' : mode === 'from' ? `Desde ${formatPrice(price)}` : formatPrice(price)

export const formatPrice = (price: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(price)

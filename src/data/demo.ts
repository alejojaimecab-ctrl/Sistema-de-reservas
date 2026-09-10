import type { LucideIcon } from 'lucide-react'
import { Brush, Scissors, Sparkles } from 'lucide-react'

export type Service = {
  id: string
  name: string
  duration: number
  price: number
  icon: LucideIcon
}

export const demoServices: Service[] = [
  { id: 'corte', name: 'Servicio A', duration: 30, price: 8500, icon: Scissors },
  { id: 'barba', name: 'Servicio B', duration: 60, price: 14000, icon: Brush },
  { id: 'premium', name: 'Servicio C', duration: 75, price: 19000, icon: Sparkles },
]

export const formatPrice = (price: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(price)

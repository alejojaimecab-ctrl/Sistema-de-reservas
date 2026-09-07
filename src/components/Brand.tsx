import { CalendarClock } from 'lucide-react'

type BrandProps = { compact?: boolean; inverse?: boolean }

export function Brand({ compact = false, inverse = false }: BrandProps) {
  return (
    <div className={`brand ${inverse ? 'brand--inverse' : ''}`} aria-label="RESER, sistema de reservas">
      <span className="brand__mark" aria-hidden="true"><CalendarClock size={compact ? 20 : 24} strokeWidth={2.1} /></span>
      <span className="brand__copy"><strong>RESER</strong>{!compact && <small>Sistema de reservas</small>}</span>
    </div>
  )
}

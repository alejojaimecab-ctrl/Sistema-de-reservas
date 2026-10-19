import { motion } from 'motion/react'

// Fondo del botón activo de un selector segmentado o del menú: al cambiar de opción se desliza hasta la nueva
// (motion layoutId). `group` tiene que ser único por selector (useId). Con "reducir movimiento" salta sin deslizarse.
export function SegmentIndicator({ group }: { group: string }) {
  return <motion.span
    layoutId={group}
    className="segment-indicator"
    aria-hidden="true"
    transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.8 }}
  />
}

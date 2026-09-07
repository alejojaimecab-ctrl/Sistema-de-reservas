import type { ReactNode } from 'react'
import { motion } from 'motion/react'

type RevealProps = { children: ReactNode; delay?: number; className?: string }

export function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >{children}</motion.div>
  )
}

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'

// Anima el alto cuando cambia el contenido (por ejemplo, al pasar de un paso a otro) en vez de saltar de golpe.
// El margen negativo con el mismo relleno deja lugar a los anillos de foco y sombras de lo de adentro.
export function AutoHeight({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')

  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize?.[0]?.blockSize ?? inner.offsetHeight))
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return <motion.div
    style={{ overflow: 'hidden', margin: -8 }}
    initial={false}
    animate={{ height }}
    transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
  >
    <div ref={innerRef} style={{ padding: 8 }}>{children}</div>
  </motion.div>
}

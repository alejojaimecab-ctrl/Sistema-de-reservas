import { Fragment, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Brand } from './Brand'
import { LEGAL, LEGAL_DOCS, type LegalDocId } from '../lib/legal'

// Los datos del titular que todavía no se cargaron ("COMPLETAR: ...") se resaltan.
function withPlaceholders(text: string) {
  return text.split(/(COMPLETAR: [^.,;()]+)/g).map((part, index) =>
    part.startsWith('COMPLETAR: ')
      ? <mark key={index} className="legal-placeholder">{part}</mark>
      : <Fragment key={index}>{part}</Fragment>)
}

export function LegalPage({ doc, onBack, onOpen }: {
  doc: LegalDocId
  onBack: () => void
  onOpen: (doc: LegalDocId) => void
}) {
  const content = LEGAL_DOCS[doc]
  const other: LegalDocId = doc === 'terminos' ? 'privacidad' : 'terminos'

  useEffect(() => {
    document.title = `${content.title} · RESER`
    window.scrollTo(0, 0)
    return () => { document.title = 'RESER — Sistema de reservas' }
  }, [content.title])

  return <main className="legal-page">
    <header className="legal-header">
      <Brand />
      <button className="text-button" onClick={onBack}><ChevronLeft size={16} /> Volver</button>
    </header>
    <article className="legal-card">
      <p className="eyebrow">Legal</p>
      <h1>{content.title}</h1>
      <p className="legal-meta">Última actualización: {LEGAL.actualizado}</p>
      <p className="legal-intro">{content.intro}</p>
      {content.sections.map(section => <section key={section.title}>
        <h2>{section.title}</h2>
        {section.body.map((block, index) => Array.isArray(block)
          ? <ul key={index}>{block.map(item => <li key={item}>{withPlaceholders(item)}</li>)}</ul>
          : <p key={index}>{withPlaceholders(block)}</p>)}
      </section>)}
      <p className="legal-switch">
        Ver también: <button className="text-button" onClick={() => onOpen(other)}>{LEGAL_DOCS[other].title}</button>
      </p>
    </article>
  </main>
}

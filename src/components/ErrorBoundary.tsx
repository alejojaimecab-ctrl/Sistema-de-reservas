import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  // page: pantalla completa (toda la app). section: un recuadro dentro del panel, el resto sigue funcionando.
  variant?: 'page' | 'section'
  // Cuando cambia, el error se descarta y se vuelve a intentar (ej.: al cambiar de sección del panel)
  resetKey?: string
}
type State = { error: Error | null }

// Pasa justo después de publicar una versión nueva: el navegador pide un archivo de la versión vieja que ya no existe.
const isLoadError = (error: Error) =>
  /dynamically imported module|Importing a module script failed|Loading chunk/i.test(`${error.name} ${error.message}`)

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Sin servicio de monitoreo todavía: queda en la consola del navegador
    console.error('RESER: error de pantalla', error, info.componentStack)
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const outdated = isLoadError(error)
    const title = outdated ? 'Hay una versión nueva de RESER' : 'Algo salió mal'
    const text = outdated
      ? 'Recargá la página para seguir con la versión más reciente.'
      : 'Tuvimos un problema inesperado. Tus reservas y datos guardados no se pierden: probá recargar la página.'

    if (this.props.variant === 'section') {
      return <section className="agenda-card error-section" role="alert">
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="error-actions">
          <button type="button" className="button button--primary button--small" onClick={() => window.location.reload()}>Recargar página</button>
          {!outdated && <button type="button" className="button button--secondary button--small" onClick={() => this.setState({ error: null })}>Reintentar</button>}
        </div>
      </section>
    }

    return <main className="error-screen" role="alert">
      <div className="error-card">
        <img src="/brand/Reser-logo.png" alt="RESER" height={44} />
        <h1>{title}</h1>
        <p>{text}</p>
        <div className="error-actions">
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>Recargar página</button>
          <button type="button" className="button button--secondary" onClick={() => window.location.assign('/')}>Ir al inicio</button>
        </div>
      </div>
    </main>
  }
}

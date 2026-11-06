import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logAppError } from '../../errorLogger'

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    void logAppError(error, {
      source: 'React',
      action: 'render',
      phase: 'error-boundary',
      component: 'AppErrorBoundary',
      payload: { componentStack: errorInfo.componentStack }
    })
  }

  render() {
    if (this.state.hasError) {
      return <div className="state-screen"><strong>Ocorreu um erro inesperado.</strong><p>Tente recarregar a tela. O erro foi registrado para análise.</p></div>
    }
    return this.props.children
  }
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '@betinhos/ui'
import { installErrorLogger } from '@betinhos/ui/error-logger'
import '@betinhos/ui/styles.css'
import './styles.css'
import { App } from './App'

// Erros de front vão para new_appmotoristaslog (fora do Dynamics, em modo mock, não grava nada).
installErrorLogger({
  appName: 'Escala FDS',
  appVersion: `v${__APP_VERSION__}`,
  builtAt: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(__BUILD_DATE__)).replace(',', ''),
  getScreen: () => 'Escala',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)

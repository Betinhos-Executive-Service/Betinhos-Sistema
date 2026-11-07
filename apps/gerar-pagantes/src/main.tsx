import '@betinhos-executive-service/ui/styles.css'
import { BuildBadge } from '@betinhos-executive-service/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installGlobalErrorLogging } from './errorLogger'
import { App } from './ui/App'
import { AppErrorBoundary } from './ui/components/AppErrorBoundary'
import './ui/styles.css'

installGlobalErrorLogging()
createRoot(document.getElementById('root')!).render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary><BuildBadge version={__APP_VERSION__} isoDate={__APP_BUILD_ISO__} /></StrictMode>)

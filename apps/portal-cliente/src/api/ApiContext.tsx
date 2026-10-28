import { createContext, useContext, type ReactNode } from 'react'
import type { PortalApi } from './PortalApi'

const ApiContext = createContext<PortalApi | null>(null)

export function ApiProvider({ api, children }: { api: PortalApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export function useApi(): PortalApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi fora do ApiProvider')
  return api
}

import { useShellHeader } from '@betinhos/ui'
import type { Host } from '../../host'

/** Placeholder: a Task 12 do plano troca por a tela de conferência dos descontos em folha. */
export function RhDescontosPage(_props: { host: Host }) {
  useShellHeader({ title: 'Descontos em folha' })
  return <div className="rh-descontos"><h2>Descontos em folha</h2></div>
}

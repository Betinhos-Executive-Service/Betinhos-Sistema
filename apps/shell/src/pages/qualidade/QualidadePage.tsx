import { useShellHeader } from '@betinhos/ui'
import type { Host } from '../../host'
import App from './App.jsx'

/**
 * Gestão de Qualidade (antes WebResource `new_gestao_erros_operacionais.html`, repo `tela-qualidade`):
 * a tela original trazida como está — visão geral, ocorrências, agenda de ações, relatórios e
 * configurações dos choices. O cliente Dataverse dela usa o `Xrm` que o shell publica em
 * `window.Xrm` (host.ts); no `pnpm dev` cai no mock persistente da própria tela.
 */
export function QualidadePage(_props: { host: Host }) {
  useShellHeader({ title: 'Gestão de Qualidade' })
  return <div className="qualidade-root"><App embedded /></div>
}

import type { Host } from '../../host'
import { PlannerApp } from './PlannerApp'
import './planner.css'
import './quote-flow.css'

/**
 * Rota `#/planner`: o Planner inteiro (porte do Tela Planner) dentro do shell.
 * O modo (Dataverse ou mock) vem do `Xrm` que o shell expõe na janela, como no WebResource antigo.
 */
export function PlannerPage(_props: { host?: Host }) {
  return (
    <div className="planner-page">
      <PlannerApp />
    </div>
  )
}

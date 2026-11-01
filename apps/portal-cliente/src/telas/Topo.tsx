import { Button, SegmentedControl } from '@betinhos/ui'
import { LogOut } from 'lucide-react'
import { MODULO_LABEL } from '../domain/pedidos'
import type { Modulo, Sessao } from '../domain/types'

type Props = { sessao: Sessao; onSair: () => void; ativo: Modulo; onModulo: (m: Modulo) => void }

/** Cabeçalho fixo: marca, troca de módulo (só quando o cliente tem mais de um) e saída. */
export function Topo({ sessao, onSair, ativo, onModulo }: Props) {
  return (
    <header className="pc-topo">
      <div className="pc-topo__inicio">
        <p className="pc-marca">Betinhos Executive Service</p>
        {sessao.modulos.length > 1 && (
          <SegmentedControl<Modulo>
            className="pc-topo__modulos"
            value={ativo}
            onChange={onModulo}
            options={sessao.modulos.map((m) => ({ value: m, label: MODULO_LABEL[m] }))}
            aria-label="Área do portal"
          />
        )}
      </div>
      <div className="pc-topo__usuario">
        <span className="pc-topo__nome">{sessao.nome} · {sessao.cliente}</span>
        <Button variant="ghost" size="compact" onClick={onSair} icon={<LogOut size={16} aria-hidden />}>Sair</Button>
      </div>
    </header>
  )
}

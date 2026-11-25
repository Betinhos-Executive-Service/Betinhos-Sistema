import { Button, SegmentedControl } from '@betinhos/ui'
import { LogOut } from 'lucide-react'
import { ABA_LABEL, type AbaPortal } from '../domain/pedidos'
import type { Sessao } from '../domain/types'
import { Parceria } from './Parceria'

type Props = { sessao: Sessao; onSair: () => void; abas: AbaPortal[]; ativo: AbaPortal; onAba: (a: AbaPortal) => void }

/** Cabeçalho fixo: marca, troca de módulo (só quando o cliente tem mais de um) e saída. */
export function Topo({ sessao, onSair, abas, ativo, onAba }: Props) {
  return (
    <header className="pc-topo">
      <div className="pc-topo__inicio">
        <Parceria parceira={sessao.marca ?? null} tamanho="topo" />
        {abas.length > 1 && (
          <SegmentedControl<AbaPortal>
            className="pc-topo__modulos"
            value={ativo}
            onChange={onAba}
            options={abas.map((a) => ({ value: a, label: ABA_LABEL[a] }))}
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

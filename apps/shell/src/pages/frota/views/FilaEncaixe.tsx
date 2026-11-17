// apps/shell/src/pages/frota/views/FilaEncaixe.tsx
import { CheckCircle2, ChevronRight, Plus, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import { Button, EmptyState, StatusBadge as Badge, Surface } from '@betinhos/ui'
import { GRAU, label } from '../data/schema'
import type { Manutencao } from '../data/types'
import { diasEsperando, filaEncaixe } from '../domain/fila'

const TOM_GRAU: Record<number, 'danger' | 'warning' | 'info' | 'neutral'> = { 4: 'danger', 3: 'warning', 2: 'info', 1: 'neutral' }
/** Barra lateral da linha (a mesma das Pendências): vermelha no Urgente, âmbar no Alta. */
const URGENCIA: Record<number, 'atrasado' | 'hoje'> = { 4: 'atrasado', 3: 'hoje' }
const espera = (dias: number) => (dias === 0 ? 'Pedida hoje' : `Há ${dias} ${dias === 1 ? 'dia' : 'dias'}`)

type Props = { manutencoes: Manutencao[]; hoje: string; onOpen: (id: string) => void; onNovo: () => void }

/** Fila "A encaixar" do gestor de frota: Solicitadas, da mais urgente e mais antiga para a menos. */
export function FilaEncaixe({ manutencoes, hoje, onOpen, onNovo }: Props) {
  const fila = useMemo(() => filaEncaixe(manutencoes), [manutencoes])
  const novo = <div className="frota-cluster"><Button icon={<Plus size={16} />} onClick={onNovo}>Nova manutenção</Button></div>
  if (!fila.length) {
    return (
      <div className="frota-pend">
        {novo}
        <EmptyState align="start" icon={<CheckCircle2 size={36} />} title="Nenhuma manutenção esperando encaixe">Os pedidos do App e do escritório aparecem aqui, do mais urgente para o mais antigo.</EmptyState>
      </div>
    )
  }
  return (
    <div className="frota-pend">
      {novo}
      <Surface flush aria-label="Manutenções a encaixar" className="frota-pend__grupo">
        <header className="frota-pend__head">
          <h2>A encaixar</h2>
          <Badge tone="neutral">{fila.length}</Badge>
          <p>Solicitadas, do grau mais alto para o mais baixo e, no mesmo grau, da mais antiga para a mais nova. Encaixe num dia ou numa semana; quem programa motorista e horário é a operação, na Geral.</p>
        </header>
        <ul>
          {fila.map((m) => (
            <li key={m.id}>
              <button type="button" className="frota-pend__item" data-urgencia={URGENCIA[m.grau ?? 0]} onClick={() => onOpen(m.id)}>
                <span className="frota-pend__icone" aria-hidden><Wrench size={16} /></span>
                <span className="frota-pend__texto">
                  <strong>{m.descricao || 'Sem descrição'}</strong>
                  <span>{[m.veiculo?.label, m.solicitante?.label].filter(Boolean).join(' · ') || 'Sem veículo informado'}</span>
                </span>
                <Badge tone={TOM_GRAU[m.grau ?? 0] ?? 'neutral'}>{label(GRAU, m.grau, 'Sem grau')}</Badge>
                <span className="frota-muted frota-nowrap">{espera(diasEsperando(m, hoje))}</span>
                <ChevronRight size={16} className="frota-pend__seta" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  )
}

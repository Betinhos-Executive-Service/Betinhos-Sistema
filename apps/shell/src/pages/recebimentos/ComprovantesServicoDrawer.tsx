import { Drawer, Sheet } from '@betinhos/ui'
import { DollarSign } from 'lucide-react'
import { ComprovantesRecebimento } from './ComprovantesRecebimento'
import type { RecebimentosSource } from './source'

export type ServicoAberto = { id: string; nome: string }

/** Indicador da lista do Geral: cifrão com a contagem; sem comprovante (ou falha na contagem) não aparece. */
export function IndicadorRecebimentos({ quantidade, onClick }: { quantidade: number | undefined; onClick: () => void }) {
  if (!quantidade) return null
  const rotulo = quantidade === 1 ? '1 comprovante de recebimento' : `${quantidade} comprovantes de recebimento`
  return (
    <button type="button" className="gr-recebimentos" aria-label={rotulo} title={rotulo} onClick={onClick}>
      <DollarSign size={13} strokeWidth={2.25} aria-hidden="true" />{quantidade}
    </button>
  )
}

/** Comprovantes de um serviço, aberto pelo indicador (na tabela o serviço abre no Formulário Geral, sem ficha). */
export function ComprovantesServicoDrawer({ servico, source, mobile, onClose }: { servico: ServicoAberto | null; source: RecebimentosSource; mobile: boolean; onClose: () => void }) {
  const Painel = mobile ? Sheet : Drawer
  return (
    <Painel open={servico != null} onClose={onClose} eyebrow="Comprovantes de recebimento" title={servico ? `Serviço ${servico.nome}` : ''}>
      {servico ? <ComprovantesRecebimento source={source} reservaIds={[servico.id]} /> : null}
    </Painel>
  )
}

import { useEffect, useState } from 'react'
import { Alert, Drawer, Sheet } from '@betinhos/ui'
import { DollarSign } from 'lucide-react'
import { BrandLoader } from '../../app/BrandLoader'
import { formatMoney } from '../pagantes/domain/messages'
import '../pagantes/pagantes.css'
import { Item } from '../despesas/components/Ficha'
import { ComprovantesRecebimento } from './ComprovantesRecebimento'
import type { FinanceiroServico } from './domain'
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

type EstadoFinanceiro = { dados: FinanceiroServico } | { erro: string } | null

function useFinanceiro(source: RecebimentosSource, reservaId: string) {
  const [estado, setEstado] = useState<EstadoFinanceiro>(null)
  useEffect(() => {
    let vivo = true
    setEstado(null)
    source.financeiro(reservaId).then(
      (dados) => { if (vivo) setEstado({ dados }) },
      (erro) => { if (vivo) setEstado({ erro: erro instanceof Error ? erro.message : String(erro) }) },
    )
    return () => { vivo = false }
  }, [source, reservaId])
  return estado
}

const simNao = (v: boolean | null) => (v == null ? '' : v ? 'Sim' : 'Não')

/** Valor a receber, Receber e forma de pagamento: o que o financeiro confere junto com os comprovantes (só leitura). */
function Financeiro({ source, reservaId }: { source: RecebimentosSource; reservaId: string }) {
  const estado = useFinanceiro(source, reservaId)
  return (
    <section className="pg-ficha__block" aria-label="Financeiro">
      <header className="pg-ficha__block-head"><h3>Financeiro</h3></header>
      {estado == null ? <BrandLoader variant="inline" size="sm" label="Carregando financeiro" text="Carregando…" />
        : 'erro' in estado ? <Alert tone="danger" title="Não foi possível carregar o financeiro">{estado.erro}</Alert>
        : (
          <dl className="pg-ficha__grid">
            <Item label="Valor a receber">{formatMoney(estado.dados.valorAReceber)}</Item>
            <Item label="Receber">{simNao(estado.dados.receber)}</Item>
            <Item label="Forma de pagamento">{estado.dados.formaPagamento}</Item>
          </dl>
        )}
    </section>
  )
}

/** Comprovantes de um serviço, aberto pelo indicador (na tabela o serviço abre no Formulário Geral, sem ficha). */
export function ComprovantesServicoDrawer({ servico, source, mobile, onClose }: { servico: ServicoAberto | null; source: RecebimentosSource; mobile: boolean; onClose: () => void }) {
  const Painel = mobile ? Sheet : Drawer
  return (
    <Painel open={servico != null} onClose={onClose} eyebrow="Comprovantes de recebimento" title={servico ? `Serviço ${servico.nome}` : ''}>
      {servico ? (
        <div className="pg-ficha">
          <Financeiro source={source} reservaId={servico.id} />
          <section className="pg-ficha__block" aria-label="Comprovantes">
            <header className="pg-ficha__block-head"><h3>Comprovantes</h3></header>
            <ComprovantesRecebimento source={source} reservaIds={[servico.id]} />
          </section>
        </div>
      ) : null}
    </Painel>
  )
}

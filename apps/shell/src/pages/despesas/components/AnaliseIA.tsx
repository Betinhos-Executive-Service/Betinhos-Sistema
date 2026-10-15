import { useId, type ReactNode } from 'react'
import { Alert, StatusBadge } from '@betinhos/ui'
import { Sparkles } from 'lucide-react'
import { formatDateTime, formatMoney } from '../../pagantes/domain/messages'
import { IA_DECISAO_LABEL, IA_STATUS, decisaoTone, diferencaValor, formatDataLida, type AnaliseIA as Analise } from '../domain/ia'

const STATUS_LABEL: Record<number, string> = {
  [IA_STATUS.pendente]: 'Pendente', [IA_STATUS.processando]: 'Processando', [IA_STATUS.concluida]: 'Concluída', [IA_STATUS.erro]: 'Erro',
}
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })

function Item({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pg-ficha__item"><dt>{label}</dt><dd>{children || '—'}</dd></div>
}

/** Badge da decisão da IA (Validar / Precisa corrigir), com ícone além da cor (DS §3.6). */
export function DecisaoIABadge({ decisao }: { decisao: number | null }) {
  if (decisao == null) return null
  return <StatusBadge tone={decisaoTone(decisao)} icon={<Sparkles size={12} />}>{IA_DECISAO_LABEL[decisao] ?? 'Sem decisão'}</StatusBadge>
}

/** Seção "Análise da IA" da ficha: somente leitura, colunas `cr40f_ia*`. */
export function AnaliseIA({ ia, valor }: { ia: Analise; valor: number | null }) {
  const titleId = useId()
  const status = ia.status != null ? STATUS_LABEL[ia.status] : undefined
  return (
    <section className="pg-ficha__block" aria-labelledby={titleId}>
      <header className="pg-ficha__block-head"><h3 id={titleId}>Análise da IA</h3>{status ? <span className="pg-muted">{status}</span> : null}</header>
      <Conteudo ia={ia} valor={valor} />
    </section>
  )
}

function Conteudo({ ia, valor }: { ia: Analise; valor: number | null }) {
  if (ia.status === IA_STATUS.processando) return <p className="pg-muted">Processando: a IA está lendo o comprovante.</p>
  if (ia.status === IA_STATUS.erro) {
    return <Alert tone="warning" title="Erro na análise">{ia.motivos.length ? ia.motivos.join(' ') : 'A análise falhou sem motivo registrado.'}</Alert>
  }
  if (ia.status !== IA_STATUS.concluida) return <p className="pg-muted">Ainda não analisada</p>
  const diff = diferencaValor(valor, ia.valorLido)
  return (
    <div className="dp-ia">
      <dl className="pg-ficha__grid">
        <Item label="Decisão"><DecisaoIABadge decisao={ia.decisao} /></Item>
        <Item label="Confiança">{ia.confianca != null ? <span className="pg-num">{pct.format(ia.confianca)}</span> : ''}</Item>
      </dl>
      {ia.motivos.length ? <ul className="dp-ia__motivos" aria-label="Motivos da IA">{ia.motivos.map((m, i) => <li key={i}>{m}</li>)}</ul> : null}
      <h4 className="dp-ia__sub">Lido no comprovante</h4>
      <dl className="pg-ficha__grid">
        <Item label="Valor">{ia.valorLido != null ? (
          <span className="dp-ia__valor">
            <span className="pg-num">{formatMoney(ia.valorLido)}</span>
            {diff != null ? <span className="dp-ia__diff">{`${formatMoney(Math.abs(diff))} ${diff > 0 ? 'acima' : 'abaixo'} do lançado`}</span> : null}
          </span>
        ) : ''}</Item>
        <Item label="Data">{ia.dataLida ? <span className="pg-num">{formatDataLida(ia.dataLida)}</span> : ''}</Item>
        <Item label="Estabelecimento">{ia.estabelecimentoLido}</Item>
        <Item label="CNPJ"><span className="pg-num">{ia.cnpjLido}</span></Item>
      </dl>
      {ia.analisadaEm || ia.modelo ? (
        <p className="dp-ia__meta">{[ia.analisadaEm ? `Analisada em ${formatDateTime(ia.analisadaEm)}` : '', ia.modelo].filter(Boolean).join(' · ')}</p>
      ) : null}
    </div>
  )
}

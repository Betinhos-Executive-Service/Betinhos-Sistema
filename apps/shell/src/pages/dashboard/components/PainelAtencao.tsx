import { useId } from 'react'
import { Surface } from '@betinhos/ui'
import { ChevronRight, CircleCheck } from 'lucide-react'
import type { AlertaItem } from '../domain/types'
import { painelAtencao, type AlertaPainel } from '../domain/alertas'

type Abrir = Partial<Record<string, (el: HTMLElement) => void>>
type Gravidade = 'danger' | 'warn'

const ROTULO: Record<Gravidade, string> = { danger: 'Crítico', warn: 'Atenção' }

/** Linha do painel: ponto da cor da gravidade, rótulo e categoria, número, apoio e chevron; vira botão quando há drill-down. */
function Linha({ item, gravidade, onOpen }: { item: AlertaPainel; gravidade: Gravidade; onOpen?: (el: HTMLElement) => void }) {
  const conteudo = <>
    <span className={`dash-atencao__ponto dash-atencao__ponto--${gravidade}`} aria-hidden="true" />
    <span className="dash-atencao__nome">{item.rotulo}<span className="dash-atencao__categoria"> · {item.categoria}</span></span>
    <strong className="dash-atencao__numero">{item.valor}</strong>
    <span className="dash-atencao__apoio">{item.status}</span>
    <ChevronRight className="dash-atencao__seta" size={14} aria-hidden="true" />
  </>
  return (
    <li>
      {onOpen
        ? <button type="button" data-origem={item.id} className="dash-atencao__linha dash-atencao__linha--aberta" onClick={(e) => onOpen(e.currentTarget)}>{conteudo}</button>
        : <div className="dash-atencao__linha">{conteudo}</div>}
    </li>
  )
}

function Coluna({ gravidade, itens, abrir }: { gravidade: Gravidade; itens: AlertaPainel[]; abrir: Abrir }) {
  if (!itens.length) return null
  return (
    <div className="dash-atencao__coluna">
      <h3 className={`dash-atencao__grupo dash-atencao__grupo--${gravidade}`}><span className={`dash-atencao__ponto dash-atencao__ponto--${gravidade}`} aria-hidden="true" />{ROTULO[gravidade]}</h3>
      <ul className="dash-atencao__lista">
        {itens.map((a) => <Linha key={a.id} item={a} gravidade={gravidade} onOpen={a.valor !== '0' ? abrir[a.id] : undefined} />)}
      </ul>
    </div>
  )
}

const rotulos = (itens: AlertaItem[]) => itens.map((a) => a.rotulo).join(', ')

/**
 * Painel único "Precisa de atenção · N": alertas de operação e de qualidade dos dados em duas colunas por gravidade.
 * `abrir`: drill-down por id do alerta (só com número diferente de zero). Tom ok vai para a linha final "Em dia"; s/dado, para "Sem dado".
 */
export function PainelAtencao({ operacao, qualidade, abrir = {} }: { operacao: AlertaItem[]; qualidade: AlertaItem[]; abrir?: Abrir }) {
  const id = useId()
  const { criticos, atencao, emDia, semDado } = painelAtencao(operacao, qualidade)
  const total = criticos.length + atencao.length
  return (
    <Surface className="dash-card dash-atencao" aria-labelledby={id}>
      <header className="dash-atencao__cabeca">
        <h2 className="dash-card__titulo" id={id}>Precisa de atenção · {total}</h2>
        <span className="dash-atencao__ordem">ordenado por gravidade</span>
      </header>
      {total ? (
        <div className="dash-atencao__colunas">
          <Coluna gravidade="danger" itens={criticos} abrir={abrir} />
          <Coluna gravidade="warn" itens={atencao} abrir={abrir} />
        </div>
      ) : <p className="dash-atencao__vazio">Nada pede atenção neste período.</p>}
      {emDia.length || semDado.length ? (
        <p className="dash-atencao__rodape">
          {emDia.length ? <span className="dash-atencao__ok"><CircleCheck size={14} aria-hidden="true" /> <strong>Em dia:</strong> {rotulos(emDia)}</span> : null}
          {semDado.length ? <span><strong>Sem dado:</strong> {rotulos(semDado)}</span> : null}
        </p>
      ) : null}
    </Surface>
  )
}

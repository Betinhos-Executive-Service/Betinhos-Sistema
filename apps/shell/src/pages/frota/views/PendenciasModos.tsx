import { Car, ChevronRight, User } from 'lucide-react'
import { StatusBadge } from '@betinhos/ui'
import { PENDENCIA_LABEL, type Pendencia } from '../domain/pendencias'
import { Badge, CURTO, ordenar, urgencia, type Urgencia } from './pendenciasComum'

type Props = { itens: Pendencia[]; abrir: (item: Pendencia) => void }

const NIVEIS: { id: Urgencia | 'sem'; titulo: string; vazio: string; tom: 'danger' | 'warning' | 'info' | 'neutral' }[] = [
  { id: 'atrasado', titulo: 'Atrasadas', vazio: 'Nada atrasado', tom: 'danger' },
  { id: 'hoje', titulo: 'Vencem hoje', vazio: 'Nada vence hoje', tom: 'warning' },
  { id: 'breve', titulo: 'Próximas', vazio: 'Nada nos próximos dias', tom: 'info' },
  { id: 'sem', titulo: 'Sem prazo', vazio: 'Tudo com prazo', tom: 'neutral' },
]
const nivelDe = (item: Pendencia) => urgencia(item) ?? 'sem'
const chave = (item: Pendencia) => `${item.kind}-${item.id}`

function Tipo({ item }: { item: Pendencia }) {
  return <span className="frota-pend__tipo" title={PENDENCIA_LABEL[item.tipo]}>{CURTO[item.tipo]}</span>
}


/** Lista: uma tabela só, mais urgente primeiro. No celular cada linha vira um cartão. */
export function PendenciasLista({ itens, abrir }: Props) {
  if (!itens.length) return <p className="fpm-vazio">Nenhuma pendência neste filtro.</p>
  return (
    <div className="fpm-lista">
      <div className="fpm-lista__cab" aria-hidden>
        <span>Prazo</span>
        <span>Pendência</span>
        <span>Veículo</span>
        <span>Responsável</span>
        <span />
      </div>
      <ul aria-label="Pendências da frota">
      {itens.map((item) => (
        <li key={chave(item)}>
        <button type="button" className="fpm-linha" data-urgencia={urgencia(item) ?? undefined} onClick={() => abrir(item)}>
          <span className="fpm-linha__prazo"><Badge item={item} />{urgencia(item) ? null : <span className="fpm-sem">Sem prazo</span>}</span>
          <span className="fpm-linha__pend">
            <strong>{item.titulo}</strong>
            <span className="fpm-linha__sub"><Tipo item={item} />{item.detalhe ? <span className="fpm-linha__detalhe">{item.detalhe}</span> : null}</span>
          </span>
          <span className="fpm-linha__veiculo">{item.veiculo?.label ?? <span className="fpm-sem">Sem veículo</span>}</span>
          <span className="fpm-linha__pessoa">{item.pessoa?.label ?? <span className="fpm-sem">—</span>}</span>
          <ChevronRight size={16} className="fpm-linha__seta" aria-hidden />
        </button>
        </li>
      ))}
      </ul>
      <p className="fpm-lista__rodape">{itens.length} {itens.length === 1 ? 'pendência' : 'pendências'}</p>
    </div>
  )
}

/** Quadro: colunas por prazo; a cor da borda do cartão repete a da coluna. */
export function PendenciasQuadro({ itens, abrir }: Props) {
  return (
    <div className="fpm-quadro">
      {NIVEIS.map((n) => {
        const lista = ordenar(itens.filter((i) => nivelDe(i) === n.id))
        return (
          <section key={n.id} className="fpm-coluna" data-nivel={n.id} data-vazia={lista.length ? undefined : ''} aria-label={n.titulo}>
            <header><h2>{n.titulo}</h2><StatusBadge tone={lista.length ? n.tom : 'neutral'}>{lista.length}</StatusBadge></header>
            {lista.length ? lista.map((item) => (
              <button key={chave(item)} type="button" className="fpm-card" data-urgencia={urgencia(item) ?? undefined} onClick={() => abrir(item)}>
                <span className="fpm-card__topo"><Tipo item={item} /></span>
                <strong>{item.titulo}</strong>
                {item.detalhe ? <span className="fpm-card__detalhe">{item.detalhe}</span> : null}
                <span className="fpm-card__meta">
                  <span><Car size={12} aria-hidden />{item.veiculo?.label ?? 'Sem veículo'}</span>
                  {item.pessoa ? <span><User size={12} aria-hidden />{item.pessoa.label}</span> : null}
                </span>
                {urgencia(item) ? <span className="fpm-card__prazo"><Badge item={item} /></span> : null}
              </button>
            )) : <p className="fpm-coluna__vazia">{n.vazio}</p>}
          </section>
        )
      })}
    </div>
  )
}

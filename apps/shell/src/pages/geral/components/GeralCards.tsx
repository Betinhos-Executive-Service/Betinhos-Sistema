import type { MouseEvent, ReactNode } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Button, Checkbox, StatusBadge } from '@betinhos/ui'
import { Wrench } from 'lucide-react'
import { ChoiceBadge } from './ChoiceBadge'
import { formatCell } from '../domain/format'
import { rowKey } from '../domain/layout'
import type { LinhaManutencao } from '../domain/manutencao'
import { ID_ATTRIBUTE, type AttributeMap, type Column } from '../domain/types'
import { BrandLoader } from '../../../app/BrandLoader'
import { ManutencaoResumo, ManutencaoRotulo, rotuloAbrirManutencao } from './ManutencaoResumo'
import { CardServico, SeparadorDia, type DadosCard } from './CardServico'
import { Fragment } from 'react'

type Props = {
  rows: Row[]
  /** Colunas visíveis da visão: o card só mostra o que a visão tem. */
  columns: Column[]
  attributes: AttributeMap | null
  loading: boolean
  selected: Set<string>
  onToggle: (id: string) => void
  /** Abre o serviço no Formulário Geral. */
  onOpen: (id: string) => void
  /** Slot logo depois do botão do ID da linha. */
  besideId?: (id: string, name: string) => ReactNode
  /** Abre a sheet de edição dos campos. */
  onEdit: (id: string) => void
  /** Clique direito no card: menu de contexto com as ações da seleção (DS §10.9.3). */
  onCardContextMenu?: (id: string, event: MouseEvent<HTMLElement>) => void
  /** Depois da lista: o sentinela e o rodapé de estado da rolagem infinita. */
  footer?: ReactNode
  /** Desktop: cards em grade responsiva. */
  grid?: boolean
  /** Linhas de manutenção (manutenções v2): card próprio, que abre a gaveta da manutenção; `ler` devolve `null` para serviço. */
  manutencao?: { ler: (row: Row) => LinhaManutencao | null; abrir: (m: LinhaManutencao) => void }
  /** Primeiro nome dos passageiros de cada serviço (tabela serviços por passageiro); `undefined` enquanto carrega. */
  paxPorServico?: Map<string, string[]>
  /** Ação rápida do card sem motorista: abre só a escolha do motorista. */
  onAtribuir?: (id: string) => void
}

const STATUS = 'cr40f_status'
const DATA = 'cr40f_dataehorriodesada'

/** Lista de serviços no celular: um card por linha com o essencial e o botão que abre a edição por campo. */
export function GeralCards({ rows, columns, attributes, loading, selected, onToggle, onOpen, besideId, onEdit, onCardContextMenu, footer, grid = false, manutencao, paxPorServico, onAtribuir }: Props) {
  const find = (attribute: string) => columns.find((c) => !c.alias && c.attribute === attribute)
  const has = {
    status: find(STATUS), data: find(DATA), cliente: find('cr40f_cliente'), motorista: find('cr40f_motorista'), trajeto: find('cr40f_trajeto'),
  }
  const valueOf = (row: Row, column: Column | undefined) => (column ? formatCell('readonly', row, rowKey(column, attributes?.get(column.key))) : '—')

  const diaDaLinha = (row: Row) => {
    const coluna = has.data ? rowKey(has.data, attributes?.get(has.data.key)) : DATA
    return (formatCell('datetime', row, coluna) || '').split(' ')[0] || null
  }

  if (loading && rows.length === 0) return <BrandLoader variant="inline" label="Carregando serviços" text="Carregando serviços…" />

  return (
    <>
      <ul className={grid ? 'gr-cards gr-cards--grid' : 'gr-cards'} aria-label="Serviços">
        {rows.map((row, indice) => {
          const id = String(row[ID_ATTRIBUTE])
          const m = manutencao?.ler(row) ?? null
          // Celular: card com trilho da hora, trajeto e passageiros em destaque e separador por dia.
          if (!grid) {
            const motoristaKey = has.motorista && attributes ? rowKey(has.motorista, attributes.get(has.motorista.key)) : null
            const d: DadosCard = m && manutencao
              ? {
                id, manutencao: true, codigo: m.veiculo, abrirRotulo: rotuloAbrirManutencao(m), abrir: () => manutencao.abrir(m),
                status: <StatusBadge tone={m.statusTom}>{m.statusRotulo}</StatusBadge>,
                quando: formatCell('datetime', row, DATA) || null, titulo: m.descricao, cliente: null,
                motorista: row._cr40f_motorista_value == null ? null : formatCell('readonly', row, '_cr40f_motorista_value'),
                meta: [m.grau, m.janelaRotulo].filter(Boolean).join(' · ') || null,
                alertas: [...(m.atrasada ? [{ texto: 'Atrasada', tom: 'perigo' as const }] : []), ...(m.foraDaJanela ? [{ texto: 'Fora da janela', tom: 'aviso' as const }] : [])],
                programar: { rotulo: /^program/i.test(m.statusRotulo) ? 'Reprogramar' : 'Programar', onClick: () => onEdit(id) }, pax: null,
              }
              : {
                id, manutencao: false, codigo: formatCell('readonly', row, 'cr40f_id'), abrirRotulo: `Abrir serviço ${formatCell('readonly', row, 'cr40f_id')} no Formulário Geral`, abrir: () => onOpen(id),
                status: has.status && typeof row[STATUS] === 'number' ? <ChoiceBadge column={has.status} info={attributes?.get(has.status.key)} raw={row[STATUS] as number} text={formatCell('readonly', row, STATUS)} /> : null,
                quando: has.data ? formatCell('datetime', row, rowKey(has.data, attributes?.get(has.data.key))) || null : null,
                titulo: has.trajeto ? valueOf(row, has.trajeto) : null, cliente: has.cliente ? valueOf(row, has.cliente) : null,
                motorista: motoristaKey == null ? undefined : row[motoristaKey] == null ? null : formatCell('readonly', row, motoristaKey),
                meta: null, alertas: [],
                pax: paxPorServico ? paxPorServico.get(id) ?? [] : null,
                extra: besideId?.(id, formatCell('readonly', row, 'cr40f_id')),
              }
            // Separador quando o dia muda (a lista já vem ordenada pela visão).
            const dia = d.quando?.split(' ')[0] ?? null
            const anterior = indice > 0 ? diaDaLinha(rows[indice - 1]) : null
            const total = dia ? rows.filter((r) => diaDaLinha(r) === dia).length : 0
            if (d.motorista === null && !d.manutencao && onAtribuir) d.atribuir = () => onAtribuir(id)
            return (
              <Fragment key={id}>
                {dia && dia !== anterior ? <SeparadorDia dia={dia} total={total} /> : null}
                <CardServico d={d} selecionado={selected.has(id)} onToggle={() => onToggle(id)} onContextMenu={onCardContextMenu ? (event) => onCardContextMenu(id, event) : undefined} />
              </Fragment>
            )
          }
          if (m && manutencao) {
            return (
              <li key={id} className={selected.has(id) ? 'gr-card gr-card--manutencao is-selected' : 'gr-card gr-card--manutencao'} onClick={(event: MouseEvent<HTMLLIElement>) => { if (!(event.target as HTMLElement).closest('button, input, a, label')) onToggle(id) }} onContextMenu={onCardContextMenu ? (event) => onCardContextMenu(id, event) : undefined}>
                <div className="gr-card__head">
                  <span className="gr-card__check">
                    <Checkbox label={<span className="gr-sr">Selecionar manutenção {m.veiculo}</span>} checked={selected.has(id)} onChange={() => onToggle(id)} />
                  </span>
                  <button type="button" className="gr-open gr-manut__abrir" aria-label={rotuloAbrirManutencao(m)} title={m.descricao} onClick={() => manutencao.abrir(m)}><Wrench size={14} aria-hidden="true" /><ManutencaoRotulo m={m} /></button>
                </div>
                <p className="gr-card__line"><strong>{formatCell('datetime', row, DATA)}</strong></p>
                <ManutencaoResumo m={m} quebra />
                <p className="gr-card__line">
                  {row._cr40f_motorista_value == null ? <StatusBadge tone="warning">Sem motorista</StatusBadge> : <>Motorista: <strong>{formatCell('readonly', row, '_cr40f_motorista_value')}</strong></>}
                </p>
                <Button variant="secondary" size="touch" fullWidth onClick={() => onEdit(id)}>Programar</Button>
              </li>
            )
          }
          const name = formatCell('readonly', row, 'cr40f_id')
          const statusRaw = has.status ? row[STATUS] : null
          const data = has.data ? formatCell('datetime', row, rowKey(has.data, attributes?.get(has.data.key))) : null
          // Só decide "sem motorista" com a metadata carregada: antes dela o lookup nem tem chave conhecida.
          const motoristaKey = has.motorista && attributes ? rowKey(has.motorista, attributes.get(has.motorista.key)) : null
          return (
            <li key={id} className={selected.has(id) ? 'gr-card is-selected' : 'gr-card'} onClick={(event: MouseEvent<HTMLLIElement>) => { if (!(event.target as HTMLElement).closest('button, input, a, label')) onToggle(id) }} onContextMenu={onCardContextMenu ? (event) => onCardContextMenu(id, event) : undefined}>
              <div className="gr-card__head">
                <span className="gr-card__check">
                  <Checkbox label={<span className="gr-sr">Selecionar serviço {name}</span>} checked={selected.has(id)} onChange={() => onToggle(id)} />
                </span>
                <button type="button" className="gr-open" aria-label={`Abrir serviço ${name} no Formulário Geral`} onClick={() => onOpen(id)}>{name}</button>
                {besideId?.(id, name)}
                {has.status && typeof statusRaw === 'number' ? <ChoiceBadge column={has.status} info={attributes?.get(has.status.key)} raw={statusRaw} text={formatCell('readonly', row, STATUS)} /> : null}
              </div>
              {data != null ? <p className="gr-card__line"><strong>{data}</strong></p> : null}
              {has.cliente ? <p className="gr-card__line">{valueOf(row, has.cliente)}</p> : null}
              {motoristaKey != null ? (
                <p className="gr-card__line">
                  {row[motoristaKey] == null ? <StatusBadge tone="warning">Sem motorista</StatusBadge> : <>Motorista: <strong>{formatCell('readonly', row, motoristaKey)}</strong></>}
                </p>
              ) : null}
              {has.trajeto ? <p className="gr-card__line gr-card__route">{valueOf(row, has.trajeto)}</p> : null}
              <Button variant="secondary" size="touch" fullWidth onClick={() => onEdit(id)}>Editar campos</Button>
            </li>
          )
        })}
      </ul>
      {footer}
    </>
  )
}

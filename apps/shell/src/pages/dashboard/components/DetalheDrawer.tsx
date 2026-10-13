import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'
import { Drawer, StatusBadge, Table, type TableColumn } from '@betinhos/ui'
import { ExternalLink } from 'lucide-react'
import { linkRegistro, type Detalhe, type Entidade, type LinhaCnhDetalhe, type LinhaMultaDetalhe, type LinhaServicoDetalhe } from '../domain/detalhes'
import { brl, int } from '../domain/format'
import { useQueryId } from '../../../nav/queryState'
import { useMedia } from '../../operacional/useMedia'
import { forte, resto, dataBR } from './abas/MoMaMuComum'
import { Vazio } from './Estados'
import { MEDIA_MOBILE, juntar, useTopCelular } from './Linhas'

/* Drill-down: um único Drawer (DS §10.12, wide) na página; KPIs, alertas e linhas o abrem com a lista já calculada no domínio. */

type Contexto = { abrir: (id: string) => void; clientUrl: string | null }
const DetalheContexto = createContext<Contexto | null>(null)

/** Abre o drill-down pelo id (`cnh`, `cp-pendente`, `motorista:<key>`…); null fora do `DetalheProvider` (o gatilho não aparece). */
export const useDetalhe = () => useContext(DetalheContexto)?.abrir ?? null

/**
 * O drill-down aberto vive na URL (`detalhe=<id>`) e a lista é refeita a partir dos dados da página (`resolver`), então recarregar
 * ou compartilhar o link reabre a mesma lista. Ao fechar, a última lista segue desenhada até o fim da animação do Drawer.
 * `clientUrl` só no modo Dataverse (links "Abrir no Dataverse").
 */
export function DetalheProvider({ clientUrl, resolver, children }: { clientUrl: string | null; resolver: (id: string) => Detalhe | null; children: ReactNode }) {
  const [id, setId] = useQueryId('detalhe')
  const atual = id ? resolver(id) : null
  const ultimo = useRef<Detalhe | null>(null)
  if (atual) ultimo.current = atual
  const detalhe = atual ?? ultimo.current
  const abrir = useCallback((proximo: string) => setId(proximo), [setId])
  const fechar = useCallback(() => setId(null), [setId])
  const valor = useMemo(() => ({ abrir, clientUrl }), [abrir, clientUrl])
  return (
    <DetalheContexto.Provider value={valor}>
      {children}
      {detalhe ? <DetalheDrawer detalhe={detalhe} aberto={atual != null} onFechar={fechar} clientUrl={clientUrl} /> : null}
    </DetalheContexto.Provider>
  )
}

/** Link do registro: ícone com nome acessível; sem link (exemplo, histórico CSV), nada. */
function Abrir({ href, nome }: { href: string | null; nome: string }) {
  if (!href) return null
  return (
    <a className="dash-detalhe__abrir" href={href} target="_blank" rel="noreferrer" title="Abrir no Dataverse">
      <ExternalLink size={16} aria-hidden="true" /><span className="dash-sr">Abrir no Dataverse: {nome}</span>
    </a>
  )
}

const plural = (n: number, um: string, varios: string) => `${int(n)} ${n === 1 ? um : varios}`

/** Drawer do drill-down: título, descrição da regra, resumo (quantidade e total) e a lista; fecha por X, Esc e fundo. */
export function DetalheDrawer({ detalhe, aberto, onFechar, clientUrl }: { detalhe: Detalhe; aberto: boolean; onFechar: () => void; clientUrl: string | null }) {
  return (
    <Drawer open={aberto} onClose={onFechar} title={detalhe.titulo} eyebrow="Detalhe do indicador" size="wide">
      <div className="dash-detalhe">
        <p className="dash-detalhe__descricao">{detalhe.descricao}</p>
        <Lista key={detalhe.titulo} detalhe={detalhe} clientUrl={clientUrl} />
      </div>
    </Drawer>
  )
}

function Lista({ detalhe, clientUrl }: { detalhe: Detalhe; clientUrl: string | null }) {
  const mobile = useMedia(MEDIA_MOBILE)
  // Celular: as 10 primeiras e "Ver todos (N)" (o resumo acima sempre conta a lista inteira).
  const top = useTopCelular<{ id: string }>(detalhe.linhas, mobile, 'detalhe')
  const rows = <R,>() => top.linhas as unknown as R[]
  const link = (entidade: Entidade, id: string) => linkRegistro(clientUrl, entidade, id)
  const linkCol = <R extends { id: string },>(entidade: Entidade, nome: (r: R) => string): TableColumn<R> =>
    ({ key: 'abrir', header: <span className="dash-sr">Abrir no Dataverse</span>, width: '44px', align: 'end', cell: (r) => <Abrir href={link(entidade, r.id)} nome={nome(r)} /> })
  const comLink = clientUrl != null

  if (detalhe.tipo === 'servicos') {
    const total = detalhe.linhas.reduce((s, l) => s + l.valor, 0)
    const codigo = (l: LinhaServicoDetalhe) => l.codigo || '—'
    const colunas: TableColumn<LinhaServicoDetalhe>[] = mobile
      ? [
        { key: 'd', header: 'Data', cell: (l) => juntar(dataBR(l.dia), codigo(l)) },
        resto('Serviço', (l) => juntar(l.cliente, l.motorista, brl(l.valor), ...(detalhe.comOp ? [`OP ${l.op || '—'}`] : []))),
      ]
      : [
        { key: 'd', header: 'Data', width: 'minmax(84px, .7fr)', cell: (l) => forte(dataBR(l.dia)) },
        { key: 'c', header: 'Código', width: 'minmax(84px, .8fr)', cell: codigo },
        ...(detalhe.comOp ? [{ key: 'op', header: 'OP', width: 'minmax(84px, .8fr)', cell: (l: LinhaServicoDetalhe) => l.op || '—' }] : []),
        { key: 'cl', header: 'Cliente', width: 'minmax(0, 1.2fr)', cell: (l) => l.cliente },
        { key: 'm', header: 'Motorista', width: 'minmax(0, 1fr)', cell: (l) => l.motorista },
        { key: 'v', header: 'Valor', align: 'end', width: 'minmax(88px, .8fr)', cell: (l) => forte(brl(l.valor)) },
      ]
    if (comLink) colunas.push(linkCol<LinhaServicoDetalhe>('reserva', (l) => `serviço ${codigo(l)} de ${dataBR(l.dia)}`))
    return <>
      <p className="dash-detalhe__resumo">{plural(detalhe.linhas.length, 'serviço', 'serviços')} · {brl(total)}</p>
      <Table columns={colunas} rows={rows<LinhaServicoDetalhe>()} rowKey={(l) => l.id} empty={<Vazio titulo="Nenhum serviço nesta lista" />} />
      {top.botao}
    </>
  }

  if (detalhe.tipo === 'cnh') {
    const selo = (l: LinhaCnhDetalhe) => (l.dias < 0
      ? <StatusBadge tone="danger" dot>{`Vencida há ${plural(-l.dias, 'dia', 'dias')}`}</StatusBadge>
      : <StatusBadge tone="warning" dot>{l.dias === 0 ? 'Vence hoje' : `Vence em ${plural(l.dias, 'dia', 'dias')}`}</StatusBadge>)
    const colunas: TableColumn<LinhaCnhDetalhe>[] = mobile
      ? [{ key: 'm', header: 'Motorista', cell: (l) => l.motorista }, resto('Validade', (l) => <span className="dash-detalhe__celula">{`Validade ${dataBR(l.validade)}`}{selo(l)}</span>)]
      : [
        { key: 'm', header: 'Motorista', width: 'minmax(0, 1.4fr)', cell: (l) => forte(l.motorista) },
        { key: 'v', header: 'Validade', width: 'minmax(96px, .8fr)', cell: (l) => dataBR(l.validade) },
        { key: 's', header: 'Situação', width: 'minmax(150px, 1fr)', cell: selo },
      ]
    if (comLink) colunas.push(linkCol<LinhaCnhDetalhe>('funcionario', (l) => l.motorista))
    return <>
      <p className="dash-detalhe__resumo">{plural(detalhe.linhas.length, 'motorista', 'motoristas')}</p>
      <Table columns={colunas} rows={rows<LinhaCnhDetalhe>()} rowKey={(l) => `${l.id}-${l.validade}`} empty={<Vazio titulo="Nenhuma CNH em atenção" />} />
      {top.botao}
    </>
  }

  const colunas: TableColumn<LinhaMultaDetalhe>[] = mobile
    ? [{ key: 'd', header: 'Data', cell: (l) => dataBR(l.dia) }, resto('Multa', (l) => juntar(l.motorista, l.infracao))]
    : [
      { key: 'd', header: 'Data', width: 'minmax(84px, .6fr)', cell: (l) => forte(dataBR(l.dia)) },
      { key: 'm', header: 'Motorista', width: 'minmax(0, 1fr)', cell: (l) => l.motorista },
      { key: 'i', header: 'Infração', width: 'minmax(0, 2fr)', cell: (l) => l.infracao },
    ]
  if (comLink) colunas.push(linkCol<LinhaMultaDetalhe>('multa', (l) => `multa de ${dataBR(l.dia)}`))
  return <>
    <p className="dash-detalhe__resumo">{plural(detalhe.linhas.length, 'multa', 'multas')}</p>
    <Table columns={colunas} rows={rows<LinhaMultaDetalhe>()} rowKey={(l) => l.id || `${l.dia}-${l.motorista}-${l.infracao}`} empty={<Vazio titulo="Nenhuma multa pendente no período" />} />
    {top.botao}
  </>
}

import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Button, Dialog, EmptyState, PageHeader, PageToolbar, SearchBox, SegmentedControl, Select, StatusBadge, Table, useToast, type TableColumn,
} from '@betinhos/ui'
import { CarFront, Download, FileText, Plus, RefreshCw } from 'lucide-react'
import { mensagemDoErro } from '../api/PortalApi'
import { useApi } from '../api/ApiContext'
import { exportarPedidos } from '../excel/exportar'
import { situacaoDoPedido } from '../domain/pedidos'
import type { Pedido } from '../domain/types'
import { agruparPorDia, daAbaPedidos, filtrarPedidos, SITUACOES, type AbaPedidos, type Situacao } from './meusFiltros'
import { PedidoDetalhe } from './PedidoDetalhe'
import './MeusServicos.css'

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

/**
 * A linha inteira abre o detalhe (é um botão), então nada clicável dentro dela: voucher e cancelar ficam no painel.
 * No mobile a coluna Trajeto some e o trajeto aparece embaixo do horário.
 */
const COLUNAS: TableColumn<Pedido>[] = [
  {
    key: 'saida', header: 'Saída', width: 'minmax(104px, 0.6fr)',
    cell: (p) => (
      <span className="pc-ped__quando">
        <span className="pc-ped__hora">{p.saida ? fmtHora.format(new Date(p.saida)) : '—'}</span>
        <span className="pc-ped__codigo">{p.numero || 'Sem código'}</span>
        <span className="pc-ped__trajeto-mobile">{p.origem} → {p.destino}</span>
      </span>
    ),
  },
  {
    key: 'trajeto', header: 'Trajeto', width: 'minmax(240px, 1.8fr)', hideBelow: 'mobile',
    cell: (p) => (
      <span className="pc-ped__trajeto">
        <span className="pc-ped__ponto"><span className="pc-ped__pino" aria-hidden /> <span className="pc-ped__local">{p.origem}</span></span>
        <span className="pc-ped__ponto pc-ped__ponto--destino"><span className="pc-ped__pino" aria-hidden /> <span className="pc-ped__local">{p.destino}</span></span>
      </span>
    ),
  },
  { key: 'passageiros', header: 'Passageiros', width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: (p) => p.passageiros.join(', ') },
  {
    key: 'status', header: 'Situação', width: 'minmax(170px, 1fr)',
    cell: (p) => {
      const info = situacaoDoPedido(p)
      const quem = [p.motorista, p.placa].filter(Boolean).join(' · ') || p.veiculo
      return (
        <span className="pc-situacao">
          <StatusBadge tone={info.tom} dot>{info.rotulo}</StatusBadge>
          {quem && <span className="pc-meus__veiculo"><CarFront size={12} aria-hidden /> {quem}</span>}
          {p.voucherUrl && <span className="pc-meus__voucher"><FileText size={12} aria-hidden /> Voucher disponível</span>}
        </span>
      )
    },
  },
]

export function MeusServicos({ onPedir, onRepetir }: { onPedir?: () => void; onRepetir?: (p: Pedido) => void }) {
  const api = useApi()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carga, setCarga] = useState<'carregando' | 'erro' | 'ok'>('carregando')
  const [aba, setAba] = useState<AbaPedidos>('proximos')
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<Situacao | null>(null)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<Pedido | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const toast = useToast()

  const carregar = useCallback(async () => {
    setCarga('carregando')
    try {
      setPedidos(await api.meusServicos())
      setCarga('ok')
    } catch {
      setCarga('erro')
    }
  }, [api])

  useEffect(() => { void carregar() }, [carregar])

  async function confirmarCancelamento() {
    if (!cancelando) return
    setEnviando(true)
    try {
      const atualizado = await api.cancelarPedido(cancelando.id)
      setPedidos((lista) => lista.map((p) => (p.id === atualizado.id ? atualizado : p)))
      toast({ tone: 'success', message: atualizado.numero ? `Pedido ${atualizado.numero} cancelado.` : 'Pedido cancelado.' })
    } catch (e) {
      toast({ tone: 'danger', message: mensagemDoErro(e, 'Não foi possível cancelar agora. Tente de novo.') })
      void carregar()
    } finally {
      setEnviando(false)
      setCancelando(null)
    }
  }

  const agoraMs = Date.now()
  const proximos = daAbaPedidos(pedidos, 'proximos', agoraMs)
  const daAba = aba === 'proximos' ? proximos : daAbaPedidos(pedidos, 'todos', agoraMs)
  const linhas = filtrarPedidos(daAba, { busca, situacao })
  const dias = agruparPorDia(linhas, agoraMs)
  const filtrando = busca.trim() !== '' || situacao !== null
  const aberto = pedidos.find((p) => p.id === abertoId) ?? null
  const pedirBotao = onPedir && <Button onClick={onPedir} icon={<Plus size={16} aria-hidden />}>Pedir serviço</Button>

  async function exportar() {
    setExportando(true)
    try {
      await exportarPedidos(linhas, `meus-servicos-${aba}.xlsx`)
    } catch {
      toast({ tone: 'danger', message: 'Não foi possível gerar o Excel. Tente de novo.' })
    } finally {
      setExportando(false)
    }
  }

  const vazio = filtrando ? (
    <EmptyState icon={<CarFront size={36} aria-hidden />} title="Nenhum pedido com esses filtros." action={<Button variant="secondary" onClick={() => { setBusca(''); setSituacao(null) }}>Limpar filtros</Button>}>
      Mude a busca ou a situação para ver outros pedidos.
    </EmptyState>
  ) : (
    <EmptyState icon={<CarFront size={36} aria-hidden />} title={pedidos.length && aba === 'proximos' ? 'Nenhum serviço pela frente.' : 'Nenhum pedido ainda.'} action={pedirBotao}>
      Os pedidos que você fizer por aqui aparecem nesta lista.
    </EmptyState>
  )

  return (
    <main className="pc-conteudo">
      <PageHeader
        title="Meus serviços"
        description="Pedidos feitos com o seu e-mail. Quando a Betinhos programa o motorista, a situação muda e o voucher aparece aqui."
        actions={<>
          <Button variant="secondary" onClick={() => void carregar()} loading={carga === 'carregando'} icon={<RefreshCw size={16} aria-hidden />}>Atualizar</Button>
          {pedirBotao}
        </>}
      />

      <SegmentedControl<AbaPedidos>
        className="pc-abas"
        value={aba}
        onChange={setAba}
        options={[{ value: 'proximos', label: `Próximos · ${proximos.length}` }, { value: 'todos', label: `Todos · ${pedidos.length}` }]}
        aria-label="Quais pedidos mostrar"
      />

      <PageToolbar
        variant="filters"
        label="Filtros"
        start={<>
          <SearchBox value={busca} onChange={setBusca} placeholder="Buscar passageiro, local ou código" aria-label="Buscar pedidos" className="pc-busca" />
          <Select value={situacao} onChange={(v) => setSituacao(v as Situacao | null)} options={SITUACOES} placeholder="Todas as situações" clearable aria-label="Situação" className="pc-filtro" />
        </>}
        end={<Button variant="secondary" onClick={() => void exportar()} loading={exportando} disabled={!linhas.length} icon={<Download size={16} aria-hidden />}>Exportar Excel</Button>}
      />

      {carga === 'erro' ? (
        <Alert tone="danger" action={<Button variant="secondary" size="compact" onClick={() => void carregar()}>Tentar de novo</Button>}>
          Não foi possível carregar seus pedidos. Verifique a conexão e tente de novo.
        </Alert>
      ) : carga === 'carregando' || !dias.length ? (
        <Table columns={COLUNAS} rows={[]} rowKey={(p) => p.id} loading={carga === 'carregando'} empty={vazio} />
      ) : (
        <div className="pc-ped__dias">
          {dias.map((g) => (
            <section key={g.dia} className="pc-ped__dia" aria-labelledby={`pc-dia-${g.dia}`}>
              <h2 id={`pc-dia-${g.dia}`} className="pc-ped__titulo-dia">
                {g.titulo} <span className="pc-ped__contagem">{g.pedidos.length === 1 ? '1 serviço' : `${g.pedidos.length} serviços`}</span>
              </h2>
              <Table columns={COLUNAS} rows={g.pedidos} rowKey={(p) => p.id} onRowClick={(p) => setAbertoId(p.id)} aria-label={`Serviços de ${g.titulo}`} />
            </section>
          ))}
        </div>
      )}

      {aberto && <PedidoDetalhe key={aberto.id} pedido={aberto} onFechar={() => setAbertoId(null)} onCancelar={setCancelando} onRepetir={onRepetir} />}

      <Dialog
        open={cancelando !== null}
        onClose={() => { if (!enviando) setCancelando(null) }}
        title={cancelando?.numero ? `Cancelar o pedido ${cancelando.numero}?` : 'Cancelar este pedido?'}
        actions={<>
          <Button variant="secondary" onClick={() => setCancelando(null)} disabled={enviando}>Manter pedido</Button>
          <Button variant="danger" onClick={() => void confirmarCancelamento()} loading={enviando}>Cancelar pedido</Button>
        </>}
      >
        A Betinhos não vai programar este serviço. Para pedir de novo, faça um novo pedido.
      </Dialog>
    </main>
  )
}

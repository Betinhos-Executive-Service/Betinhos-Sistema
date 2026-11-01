import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, EmptyState, PageHeader, SegmentedControl, StatusBadge, Table, type TableColumn } from '@betinhos/ui'
import { CarFront, FileText, Plus, RefreshCw } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { statusPedidoInfo } from '../domain/pedidos'
import type { Pedido } from '../domain/types'
import { colunasTrajeto, ResumoServico } from './colunas'
import './MeusServicos.css'

type Aba = 'proximos' | 'todos'
const ENCERRADO = new Set(['concluido', 'cancelado'])

/** Próximos: saída daqui para a frente e ainda não encerrado, do mais perto para o mais longe; Todos: do mais recente para o mais antigo. */
export function daAbaPedidos(pedidos: Pedido[], aba: Aba, agoraMs: number): Pedido[] {
  const lista = aba === 'todos' ? pedidos : pedidos.filter((p) => Date.parse(p.saida) >= agoraMs && !ENCERRADO.has(p.status))
  const ms = (p: Pedido) => Date.parse(p.saida) || 0
  return [...lista].sort((a, b) => (aba === 'todos' ? ms(b) - ms(a) : ms(a) - ms(b)))
}

const colunas: TableColumn<Pedido>[] = [
  {
    key: 'servico', header: 'Serviço', width: 'minmax(190px, 1.1fr)',
    cell: (p) => <span className="pc-servico pc-meus__servico"><ResumoServico numero={p.numero || 'Aguardando número'} saida={p.saida} origem={p.origem} destino={p.destino} /></span>,
  },
  ...colunasTrajeto<Pedido>(),
  {
    key: 'status', header: 'Situação', width: 'minmax(200px, 1.2fr)',
    cell: (p) => {
      const info = statusPedidoInfo(p.status)
      return (
        <span className="pc-situacao">
          <StatusBadge tone={info.tom} dot>{info.rotulo}</StatusBadge>
          {p.veiculo && <span className="pc-meus__veiculo"><CarFront size={12} aria-hidden /> {p.veiculo}</span>}
          {p.voucherUrl && <a className="pc-meus__voucher" href={p.voucherUrl} target="_blank" rel="noopener noreferrer"><FileText size={12} aria-hidden /> Voucher</a>}
        </span>
      )
    },
  },
]

export function MeusServicos({ onPedir }: { onPedir?: () => void }) {
  const api = useApi()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carga, setCarga] = useState<'carregando' | 'erro' | 'ok'>('carregando')
  const [aba, setAba] = useState<Aba>('proximos')

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

  const agoraMs = Date.now()
  const proximos = daAbaPedidos(pedidos, 'proximos', agoraMs)
  const linhas = aba === 'proximos' ? proximos : daAbaPedidos(pedidos, 'todos', agoraMs)
  const pedirBotao = onPedir && <Button onClick={onPedir} icon={<Plus size={16} aria-hidden />}>Pedir serviço</Button>

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

      <SegmentedControl<Aba>
        className="pc-abas"
        value={aba}
        onChange={setAba}
        options={[{ value: 'proximos', label: `Próximos · ${proximos.length}` }, { value: 'todos', label: `Todos · ${pedidos.length}` }]}
        aria-label="Quais pedidos mostrar"
      />

      {carga === 'erro' ? (
        <Alert tone="danger" action={<Button variant="secondary" size="compact" onClick={() => void carregar()}>Tentar de novo</Button>}>
          Não foi possível carregar seus pedidos. Verifique a conexão e tente de novo.
        </Alert>
      ) : (
        <Table
          columns={colunas}
          rows={linhas}
          rowKey={(p) => p.id}
          loading={carga === 'carregando'}
          empty={
            <EmptyState icon={<CarFront size={36} aria-hidden />} title={pedidos.length && aba === 'proximos' ? 'Nenhum serviço pela frente.' : 'Nenhum pedido ainda.'} action={pedirBotao}>
              Os pedidos que você fizer por aqui aparecem nesta lista.
            </EmptyState>
          }
          footer={<span className="pc-rodape">Pedidos: {linhas.length}</span>}
        />
      )}
    </main>
  )
}

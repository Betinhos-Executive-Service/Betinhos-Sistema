import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Dialog, Drawer, EmptyState, Field, PageHeader, Sheet, Stack, Table, Textarea, useMediaQuery, useToast, type TableColumn } from '@betinhos/ui'
import { Check, ClipboardCheck, RefreshCw, X } from 'lucide-react'
import { mensagemDoErro } from '../api/PortalApi'
import { useApi } from '../api/ApiContext'
import { dataHora } from '../domain/formato'
import { MOTIVO_RECUSA_MAX, MOTIVO_RECUSA_MIN } from '../domain/pedidos'
import type { PedidoParaAprovar } from '../domain/types'
import './Detalhe.css'
import './MeusServicos.css'

const COLUNAS: TableColumn<PedidoParaAprovar>[] = [
  { key: 'saida', header: 'Saída', width: 'minmax(150px, 0.8fr)', cell: (p) => <span className="pc-ped__quando"><span className="pc-ped__hora">{dataHora(p.saida)}</span><span className="pc-ped__codigo">{p.numero || 'Sem código'}</span></span> },
  { key: 'trajeto', header: 'Trajeto', width: 'minmax(240px, 1.8fr)', hideBelow: 'mobile', cell: (p) => `${p.origem} → ${p.destino}` },
  { key: 'passageiros', header: 'Passageiros', width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: (p) => p.passageiros.join(', ') },
  { key: 'solicitante', header: 'Pedido por', width: 'minmax(140px, 1fr)', cell: (p) => p.solicitante },
]

/** Aba do aprovador: pedidos do cliente esperando decisão. Aprovar libera o pedido para a Betinhos; recusar cancela com o motivo. */
export function ParaAprovar() {
  const api = useApi()
  const toast = useToast()
  const mobile = useMediaQuery('(max-width: 820px)')
  const [lista, setLista] = useState<PedidoParaAprovar[]>([])
  const [carga, setCarga] = useState<'carregando' | 'erro' | 'ok'>('carregando')
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [descartar, setDescartar] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    setCarga('carregando')
    try {
      setLista(await api.aprovacoes())
      setCarga('ok')
    } catch {
      setCarga('erro')
    }
  }, [api])
  useEffect(() => { void carregar() }, [carregar])

  const aberto = lista.find((p) => p.id === abertoId) ?? null
  const Painel = mobile ? Sheet : Drawer

  function fecharRecusa() {
    setRecusando(false)
    setDescartar(false)
    setMotivo('')
  }
  function pedirFechamentoDaRecusa() {
    if (enviando) return
    if (motivo.trim()) setDescartar(true)
    else fecharRecusa()
  }

  async function decidir(p: PedidoParaAprovar, decisao: 'aprovar' | 'recusar') {
    setEnviando(true)
    try {
      await api.decidirAprovacao(p.id, decisao === 'aprovar' ? { decisao } : { decisao, motivo: motivo.trim() })
      setLista((l) => l.filter((x) => x.id !== p.id))
      toast({ tone: 'success', message: decisao === 'aprovar' ? `Pedido ${p.numero} aprovado. A Betinhos já foi avisada.` : `Pedido ${p.numero} recusado. O solicitante foi avisado.` })
      fecharRecusa()
      setAbertoId(null)
    } catch (e) {
      toast({ tone: 'danger', message: mensagemDoErro(e, 'Não foi possível registrar a decisão agora. Tente de novo.') })
      void carregar()
    } finally {
      setEnviando(false)
    }
  }

  const motivoCurto = motivo.trim().length < MOTIVO_RECUSA_MIN

  return (
    <main className="pc-conteudo">
      <PageHeader
        title="Para aprovar"
        description="Pedidos da sua empresa esperando a sua decisão. Depois de aprovado, o pedido segue para a Betinhos."
        actions={<Button variant="secondary" onClick={() => void carregar()} loading={carga === 'carregando'} icon={<RefreshCw size={16} aria-hidden />}>Atualizar</Button>}
      />

      {carga === 'erro' ? (
        <Alert tone="danger" action={<Button variant="secondary" size="compact" onClick={() => void carregar()}>Tentar de novo</Button>}>
          Não foi possível carregar os pedidos para aprovar. Verifique a conexão e tente de novo.
        </Alert>
      ) : (
        <Table
          columns={COLUNAS}
          rows={lista}
          rowKey={(p) => p.id}
          loading={carga === 'carregando'}
          onRowClick={(p) => setAbertoId(p.id)}
          aria-label="Pedidos para aprovar"
          empty={<EmptyState icon={<ClipboardCheck size={36} aria-hidden />} title="Nada para aprovar agora.">Quando alguém da sua empresa pedir um serviço, ele aparece aqui.</EmptyState>}
        />
      )}

      {aberto && (
        <Painel
          open
          onClose={() => { if (!enviando && !recusando) setAbertoId(null) }}
          title={aberto.numero || 'Pedido'}
          eyebrow={`Saída ${dataHora(aberto.saida)}`}
          footer={
            <div className="pc-det__acoes">
              <Button variant="secondary" onClick={() => setRecusando(true)} disabled={enviando} icon={<X size={16} aria-hidden />}>Recusar</Button>
              <Button onClick={() => void decidir(aberto, 'aprovar')} loading={enviando && !recusando} icon={<Check size={16} aria-hidden />}>Aprovar</Button>
            </div>
          }
        >
          <Stack gap="4">
            <dl className="pc-det__dados">
              <div className="pc-det__item pc-det__item--largo"><dt>Pedido por</dt><dd>{aberto.solicitante}</dd></div>
              <div className="pc-det__item pc-det__item--largo"><dt>Saída</dt><dd>{aberto.origem}</dd></div>
              <div className="pc-det__item pc-det__item--largo"><dt>Destino</dt><dd>{aberto.destino}</dd></div>
              <div className="pc-det__item pc-det__item--largo"><dt>Passageiros</dt><dd>{aberto.passageiros.join(', ') || 'Não informado'}</dd></div>
              {aberto.observacao && <div className="pc-det__item pc-det__item--largo"><dt>Observação</dt><dd>{aberto.observacao}</dd></div>}
            </dl>
          </Stack>
        </Painel>
      )}

      <Dialog
        open={recusando && aberto !== null}
        onClose={pedirFechamentoDaRecusa}
        title={aberto?.numero ? `Recusar o pedido ${aberto.numero}?` : 'Recusar este pedido?'}
        actions={<>
          <Button variant="secondary" onClick={pedirFechamentoDaRecusa} disabled={enviando}>Voltar</Button>
          <Button variant="danger" onClick={() => aberto && void decidir(aberto, 'recusar')} loading={enviando} disabled={motivoCurto}>Recusar pedido</Button>
        </>}
      >
        <Field label="Motivo da recusa" hint={`O solicitante recebe este texto por e-mail. Mínimo de ${MOTIVO_RECUSA_MIN} caracteres.`}>
          <Textarea aria-label="Motivo da recusa" rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={MOTIVO_RECUSA_MAX} disabled={enviando} />
        </Field>
      </Dialog>

      <Dialog
        open={descartar}
        onClose={() => setDescartar(false)}
        title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setDescartar(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={fecharRecusa}>Descartar</Button>
        </>}
      >
        O motivo digitado será perdido.
      </Dialog>
    </main>
  )
}

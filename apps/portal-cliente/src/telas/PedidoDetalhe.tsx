import { Button, Drawer, Sheet, Stack, StatusBadge, buttonClassName, useMediaQuery } from '@betinhos/ui'
import { FileText, X, Repeat } from 'lucide-react'
import { dataHora } from '../domain/formato'
import { podeCancelar, statusPedidoInfo } from '../domain/pedidos'
import type { Pedido, StatusPedido } from '../domain/types'
import './Detalhe.css'
import './MeusServicos.css'

type Passo = { titulo: string; detalhe?: string; estado: 'feito' | 'atual' | 'pendente' }

/** Quanto o pedido andou: 1 pedido feito, 2 motorista programado, 3 concluído. */
const ETAPA: Record<StatusPedido, number> = { solicitado: 1, em_analise: 1, confirmado: 1, programado: 2, em_execucao: 2, concluido: 3, cancelado: 1 }

/** Linha do tempo do pedido a partir da situação atual (o Dataverse não guarda o histórico para o portal). */
export function historico(p: Pedido): Passo[] {
  const feito: Passo = { titulo: 'Pedido feito', detalhe: p.criadoEm ? dataHora(p.criadoEm) : undefined, estado: 'feito' }
  if (p.status === 'cancelado') return [feito, { titulo: 'Cancelado', estado: 'atual' }]
  const etapa = ETAPA[p.status]
  const estado = (n: number): Passo['estado'] => (n < etapa ? 'feito' : n === etapa ? 'atual' : 'pendente')
  return [
    { ...feito, estado: estado(1) },
    { titulo: 'Motorista programado', detalhe: p.motorista ? [p.motorista, p.placa].filter(Boolean).join(' · ') : undefined, estado: estado(2) },
    { titulo: 'Concluído', estado: estado(3) },
  ]
}

const AVISO: Partial<Record<StatusPedido, string>> = {
  solicitado: 'A Betinhos recebeu o pedido e vai programar o motorista. Enquanto isso, você pode cancelar por aqui.',
  em_analise: 'A Betinhos está analisando o pedido.',
  confirmado: 'Pedido confirmado. O motorista aparece aqui quando for programado.',
}

type Props = { pedido: Pedido; onFechar: () => void; onCancelar: (p: Pedido) => void; onRepetir?: (p: Pedido) => void }

/** Detalhe do pedido: painel lateral no desktop, sheet no mobile. Só leitura; a única ação é cancelar em Solicitado. */
export function PedidoDetalhe({ pedido: p, onFechar, onCancelar, onRepetir }: Props) {
  const mobile = useMediaQuery('(max-width: 820px)')
  const info = statusPedidoInfo(p.status)
  const Painel = mobile ? Sheet : Drawer
  const cancelavel = podeCancelar(p.status) && !p.comoPassageiro
  const rodape = (p.voucherUrl || cancelavel || onRepetir) && (
    <div className="pc-det__acoes">
      {onRepetir && <Button variant="secondary" onClick={() => onRepetir(p)} icon={<Repeat size={16} aria-hidden />}>Repetir pedido</Button>}
      {cancelavel && <Button variant="secondary" onClick={() => onCancelar(p)} icon={<X size={16} aria-hidden />}>Cancelar pedido</Button>}
      {p.voucherUrl && (
        <a className={buttonClassName({ variant: 'primary' })} href={p.voucherUrl} target="_blank" rel="noopener noreferrer">
          <FileText size={16} aria-hidden /> Ver voucher (PDF)
        </a>
      )}
    </div>
  )

  return (
    <Painel open onClose={onFechar} title={p.numero || 'Pedido'} eyebrow={`Saída ${dataHora(p.saida)}`} footer={rodape || undefined}>
      <Stack gap="4">
        <div className="pc-ped__situacao">
          <StatusBadge tone={info.tom} dot>{info.rotulo}</StatusBadge>
          {AVISO[p.status] && <p className="pc-det__nota">{AVISO[p.status]}</p>}
        </div>

        <dl className="pc-det__dados">
          <div className="pc-det__item pc-det__item--largo"><dt>Saída</dt><dd>{p.origem}</dd></div>
          <div className="pc-det__item pc-det__item--largo"><dt>Destino</dt><dd>{p.destino}</dd></div>
          <div className="pc-det__item pc-det__item--largo"><dt>Passageiros</dt><dd>{p.passageiros.join(', ') || 'Não informado'}</dd></div>
          {p.motorista && <div className="pc-det__item"><dt>Motorista</dt><dd>{p.motorista}</dd></div>}
          {p.placa && <div className="pc-det__item"><dt>Placa</dt><dd>{p.placa}</dd></div>}
          {p.veiculo && <div className="pc-det__item"><dt>Veículo</dt><dd>{p.veiculo}</dd></div>}
          {p.observacao && <div className="pc-det__item pc-det__item--largo"><dt>Sua observação</dt><dd>{p.observacao}</dd></div>}
        </dl>

        <section className="pc-det__bloco" aria-labelledby="pc-ped-historico">
          <h3 id="pc-ped-historico" className="pc-det__subtitulo">Histórico</h3>
          <ol className="pc-ped__trilha">
            {historico(p).map((passo) => (
              <li key={passo.titulo} className={`pc-ped__passo pc-ped__passo--${passo.estado}${p.status === 'cancelado' && passo.estado === 'atual' ? ' pc-ped__passo--cancelado' : ''}`}>
                <span className="pc-ped__marca" aria-hidden />
                <span className="pc-ped__texto">
                  <span className="pc-ped__titulo">{passo.titulo}</span>
                  {passo.detalhe && <span className="pc-ped__detalhe">{passo.detalhe}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </Stack>
    </Painel>
  )
}

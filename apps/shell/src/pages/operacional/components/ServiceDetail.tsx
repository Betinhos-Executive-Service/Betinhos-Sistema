import type { ReactNode } from 'react'
import { ExternalLink, MessageCircle, Phone } from 'lucide-react'
import { Avatar, Button, Select, StatusBadge, buttonClassName } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import type { Motorista, PassageiroServico, Reserva } from '../domain/types'
import { motoristaOptions } from '../domain/driverOptions'
import { passengerList } from '../domain/passengers'
import { telHref, whatsappHref } from '../domain/phone'
import { serviceState, statusTone } from '../domain/serviceState'
import { formatHour } from '../domain/time'

function ContactLinks({ phone, name }: { phone: string; name: string }) {
  const tel = telHref(phone), wa = whatsappHref(phone)
  if (!tel) return <span className="op-detail__nophone">Sem telefone cadastrado</span>
  return (
    <span className="op-detail__contact">
      <a className={buttonClassName({ variant: 'secondary', size: 'compact' })} href={tel} aria-label={`Ligar para ${name}`}><Phone size={16} aria-hidden="true" />Ligar</a>
      <a className={buttonClassName({ variant: 'secondary', size: 'compact' })} href={wa!} target="_blank" rel="noopener" aria-label={`WhatsApp para ${name} (abre em nova aba)`}><MessageCircle size={16} aria-hidden="true" />WhatsApp</a>
    </span>
  )
}

const Info = ({ label, children }: { label: string; children: ReactNode }) =>
  children ? <div className="op-detail__info"><dt>{label}</dt><dd>{children}</dd></div> : null

type Props = {
  reserva: Reserva; filhos: PassageiroServico[]; motoristas: Motorista[]; reservas: Reserva[]; now: Date
  statusOptions: ChoiceOption[]; busy: boolean
  onStatus: (option: ChoiceOption) => void; onMotorista: (motorista: Motorista | null) => void; onOpenReserva: () => void
}

/** Resumo + ações no topo (cabe na metade do sheet); detalhe completo abaixo. */
export function ServiceDetail({ reserva, filhos, motoristas, reservas, now, statusOptions, busy, onStatus, onMotorista, onOpenReserva }: Props) {
  const state = serviceState(reserva, now)
  const options = motoristaOptions(reserva, motoristas, reservas, now)

  return (
    <div className="op-detail">
      <div className="op-detail__summary">
        <StatusBadge tone={statusTone(reserva.status)} dot>{reserva.status || 'Sem status'}</StatusBadge>
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        <span className="op-detail__meta">{reserva.tipoServico}{reserva.faturamento ? ` · ${reserva.faturamento}` : ''}</span>
      </div>
      <p className="op-detail__route"><strong>{reserva.saida ? formatHour(reserva.saida) : '--:--'}</strong> {reserva.trajeto || reserva.destino || 'Trajeto não informado'}</p>

      <div className="op-detail__controls">
        <label className="op-detail__control"><span>Status</span>
          <Select aria-label="Status do serviço" disabled={busy} options={statusOptions.map((o) => ({ value: String(o.value), label: o.label }))}
            value={reserva.statusValue == null ? null : String(reserva.statusValue)}
            onChange={(value) => { const option = statusOptions.find((o) => String(o.value) === value); if (option) onStatus(option) }} />
        </label>
        <label className="op-detail__control"><span>Motorista</span>
          <Select aria-label="Motorista do serviço" disabled={busy} searchable clearable placeholder="Sem motorista" options={options}
            value={reserva.motoristaId} onChange={(value) => {
              if (value === reserva.motoristaId) return
              const motorista = motoristas.find((m) => m.id === value)
              if (value !== null && !motorista) return // motorista atual fora da lista: não trocar nem remover
              onMotorista(motorista ?? null)
            }} />
        </label>
      </div>

      <dl className="op-detail__grid">
        <Info label="Motorista">{reserva.motorista ? <><Avatar name={reserva.motorista} size="sm" /> {reserva.motorista}</> : null}</Info>
        <Info label="Veículo">{reserva.veiculo || reserva.tipoVeiculo}</Info>
        <Info label="Cliente">{reserva.cliente}</Info>
        <Info label="Solicitante">{reserva.solicitante}</Info>
        <Info label="Endereço de saída">{reserva.enderecoSaida}</Info>
        <Info label="Destino">{reserva.destino}</Info>
        <Info label="Retorno previsto">{reserva.retorno ? formatHour(reserva.retorno) : ''}</Info>
      </dl>

      <section className="op-detail__pax" aria-label="Passageiros">
        <h3 className="op-section-title">Passageiros</h3>
        {passengerList(reserva, filhos).map((p) => (
          <div key={p.key} className="op-detail__paxrow">
            <Avatar name={p.nome || '?'} size="sm" />
            <div className="op-detail__paxinfo"><strong>{p.nome || 'Sem nome'}</strong>{p.endereco ? <span>{p.endereco}</span> : null}</div>
            <ContactLinks phone={p.telefone} name={p.nome} />
          </div>
        ))}
      </section>

      {reserva.obsOperacao ? <section><h3 className="op-section-title">Obs. de operação</h3><p className="op-detail__note">{reserva.obsOperacao}</p></section> : null}
      {reserva.obsInterna ? <section><h3 className="op-section-title">Observação interna</h3><p className="op-detail__note">{reserva.obsInterna}</p></section> : null}

      <Button variant="secondary" onClick={onOpenReserva}><ExternalLink size={16} aria-hidden="true" />Abrir reserva completa</Button>
    </div>
  )
}

/** Rodapé do sheet: contato com o motorista ao alcance do polegar. */
export function ServiceActions({ motorista }: { motorista: Motorista | undefined }) {
  return motorista ? <ContactLinks phone={motorista.celular} name={motorista.nome} /> : <span className="op-detail__nophone">Atribua um motorista para poder ligar</span>
}

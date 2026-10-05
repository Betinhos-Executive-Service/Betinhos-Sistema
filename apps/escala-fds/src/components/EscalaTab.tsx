import { useState } from 'react'
import { EmptyState, Input, SegmentedControl, Select } from '@betinhos/ui'
import { Users } from 'lucide-react'
import {
  MOTIVO_LABEL, STATUS_LABEL, addDays, formatDay, formatWeekday, recordKey,
  type Edicao, type Motivo, type Motorista, type Registro, type Status,
} from '../domain/escala'

type Props = {
  sabado: string
  motoristas: Motorista[]
  registros: Map<string, Registro>
  onChange: (changes: [string, Edicao][]) => void
}

const STATUS_ORDER: Status[] = ['trabalha', 'plantao', 'folga', 'indisponivel']
export const MOTIVO_OPTIONS = (Object.keys(MOTIVO_LABEL) as Motivo[]).map((value) => ({ value, label: MOTIVO_LABEL[value] }))

function resumo(motoristas: Motorista[], registros: Map<string, Registro>, data: string) {
  const counts = { trabalha: 0, plantao: 0, folga: 0, indisponivel: 0, vazio: 0 }
  for (const m of motoristas) counts[registros.get(recordKey(m.id, data))?.status ?? 'vazio']++
  return counts
}

export function EscalaTab({ sabado, motoristas, registros, onChange }: Props) {
  const [dia, setDia] = useState<'sab' | 'dom'>('sab')
  const data = dia === 'sab' ? sabado : addDays(sabado, 1)
  const counts = resumo(motoristas, registros, data)

  if (!motoristas.length) return <EmptyState icon={<Users size={32} />} title="Nenhum motorista ativo encontrado.">Confira a função dos funcionários no cadastro.</EmptyState>

  const dias = [sabado, addDays(sabado, 1)].map((key, i) => {
    const c = resumo(motoristas, registros, key)
    return { value: (i ? 'dom' : 'sab') as 'sab' | 'dom', label: <span className="escala__day">{formatWeekday(key)} {formatDay(key)}<small>{c.trabalha + c.plantao} escalados</small></span> }
  })

  return (
    <div className="escala__tab">
      <SegmentedControl aria-label="Dia do fim de semana" fullWidth value={dia} onChange={setDia} options={dias} />
      <p className="escala__summary" aria-live="polite">
        <strong>{counts.trabalha}</strong> trabalham · <strong>{counts.plantao}</strong> de plantão · <strong>{counts.indisponivel}</strong> indisponíveis
        {counts.vazio ? <> · <span className="escala__summary-muted">{counts.vazio} sem definição</span></> : null}
      </p>
      <ul className="escala__list">
        {motoristas.map((m) => {
          const key = recordKey(m.id, data)
          const r = registros.get(key)
          const set = (edit: Edicao) => onChange([[key, edit]])
          const indisponivel = r?.status === 'indisponivel'
          return (
            <li key={m.id} className={indisponivel ? 'escala__row is-unavailable' : 'escala__row'}>
              <div className="escala__row-main">
                <span className="escala__name">{m.nome}</span>
                <SegmentedControl<Status>
                  aria-label={`Situação de ${m.nome} em ${formatDay(data)}`}
                  size="compact"
                  value={(r?.status ?? '') as Status}
                  // Clicar no item ativo limpa o dia; ausência registrada precisa ser retirada antes de escalar.
                  onChange={(status) => set(status === r?.status ? null : { status, motivo: status === 'indisponivel' ? r?.motivo ?? 'pessoal' : null, observacao: r?.observacao ?? '' })}
                  options={STATUS_ORDER.map((value) => ({ value, label: STATUS_LABEL[value], disabled: indisponivel && (value === 'trabalha' || value === 'plantao') }))}
                />
              </div>
              {indisponivel ? (
                <div className="escala__row-extra">
                  <Select size="compact" aria-label={`Motivo de ${m.nome}`} searchable={false} clearable={false} options={MOTIVO_OPTIONS} value={r.motivo ?? 'pessoal'} onChange={(motivo) => set({ status: 'indisponivel', motivo: (motivo ?? 'pessoal') as Motivo, observacao: r.observacao })} />
                  <Input size="compact" aria-label={`Observação de ${m.nome}`} placeholder="Observação (opcional)" value={r.observacao} maxLength={2000} onChange={(event) => set({ status: 'indisponivel', motivo: r.motivo, observacao: event.target.value })} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

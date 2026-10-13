import { useState } from 'react'
import { CalendarPlus, Users } from 'lucide-react'
import { Button, EmptyState, SegmentedControl, StatusBadge } from '@betinhos/ui'
import { MOTIVO_LABEL, compromissosDoDia, diasUteis, formatDay, formatWeekday, type Compromisso, type View } from '../domain/escala'
import { CompromissoForm } from './CompromissoForm'

type Props = {
  hoje: string
  sabado: string
  view: View
  onAdd: (c: Compromisso) => void
}

const ausentes = (n: number) => (n === 0 ? 'Todos livres' : n === 1 ? '1 ausente' : `${n} ausentes`)

/** Segunda a sexta: só compromissos (ausências). Plantão, Trabalha e Folga ficam no sábado e domingo. */
export function SemanaTab({ hoje, sabado, view, onAdd }: Props) {
  const dias = diasUteis(sabado)
  const [escolhido, setData] = useState(() => (dias.includes(hoje) ? hoje : dias[0]))
  const data = dias.includes(escolhido) ? escolhido : dias[0]
  const [formPara, setFormPara] = useState<string | null>(null)
  const { motoristas, compromissos } = view

  if (!motoristas.length) return <EmptyState icon={<Users size={32} />} title="Nenhum motorista ativo encontrado.">Confira a função dos funcionários no cadastro.</EmptyState>

  const doMotorista = (id: string, key: string) => compromissosDoDia(compromissos.filter((x) => x.motoristaId === id), key)
  const contar = (key: string) => motoristas.filter((m) => doMotorista(m.id, key).length).length
  const total = contar(data)

  return (
    <div className="escala__tab">
      <SegmentedControl
        aria-label="Dia da semana"
        fullWidth
        value={data}
        onChange={(key) => { setData(key); setFormPara(null) }}
        options={dias.map((key) => ({ value: key, label: <span className="escala__day">{formatWeekday(key)} {formatDay(key)}<small>{ausentes(contar(key))}</small></span> }))}
      />
      <p className="escala__summary" aria-live="polite">
        {total ? <><span className="escala__summary-warn">{total} com compromisso</span> · <strong>{motoristas.length - total}</strong> livres</> : <>Nenhum compromisso neste dia.</>}
      </p>
      <ul className="escala__list">
        {motoristas.map((m) => {
          const doDia = doMotorista(m.id, data)
          return [
            <li key={m.id} className={doDia.some((x) => x.diaTodo) ? 'escala__row is-unavailable' : 'escala__row'}>
              <div className="escala__row-main">
                <span className="escala__name">
                  {m.nome}
                  {m.terceiro ? <StatusBadge tone="neutral">Terceiro</StatusBadge> : null}
                </span>
                <Button variant="ghost" size="compact" icon={<CalendarPlus size={14} />} aria-expanded={formPara === m.id} onClick={() => setFormPara(formPara === m.id ? null : m.id)}>Compromisso</Button>
              </div>
              {doDia.length ? (
                <div className="escala__row-extra">
                  {doDia.map(({ compromisso, texto }) => (
                    <span key={compromisso.id ?? compromisso.inicio} className="escala__commitment">
                      {texto} · {MOTIVO_LABEL[compromisso.motivo]}{compromisso.observacao ? ` · ${compromisso.observacao}` : ''}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>,
            formPara === m.id ? (
              <li key={`${m.id}-form`}>
                <CompromissoForm key={`${m.id}${data}`} hoje={hoje} motoristas={motoristas} inicial={{ motoristaId: m.id, data }} onCancel={() => setFormPara(null)} onAdd={(c) => { onAdd(c); setFormPara(null) }} />
              </li>
            ) : null,
          ]
        })}
      </ul>
    </div>
  )
}

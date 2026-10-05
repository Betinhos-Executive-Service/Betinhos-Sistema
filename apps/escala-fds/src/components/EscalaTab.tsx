import { useState } from 'react'
import { CalendarPlus, Users } from 'lucide-react'
import { Button, EmptyState, SegmentedControl, StatusBadge } from '@betinhos/ui'
import {
  MOTIVO_LABEL, SITUACAO_LABEL, addDays, compromissosDoDia, formatDay, formatWeekday, recordKey, situacaoDoDia,
  type Situacao, type View,
} from '../domain/escala'
import type { FormInicial } from './CompromissoForm'

type Props = {
  sabado: string
  view: View
  onExcecao: (key: string, situacao: Situacao | null) => void
  onNovoCompromisso: (inicial: FormInicial) => void
}

const ORDEM: Situacao[] = ['plantao', 'trabalha', 'folga']

export function EscalaTab({ sabado, view, onExcecao, onNovoCompromisso }: Props) {
  const [dia, setDia] = useState<'sab' | 'dom'>('sab')
  const data = dia === 'sab' ? sabado : addDays(sabado, 1)
  const { motoristas, excecoes, compromissos } = view

  if (!motoristas.length) return <EmptyState icon={<Users size={32} />} title="Nenhum motorista ativo encontrado.">Confira a função dos funcionários no cadastro.</EmptyState>

  const resumo = (key: string) => {
    const c = { plantao: 0, trabalha: 0, folga: 0, compromisso: 0 }
    for (const m of motoristas) {
      const s = situacaoDoDia(m, key, excecoes).situacao
      if (s) c[s]++
      if (compromissosDoDia(compromissos.filter((x) => x.motoristaId === m.id), key).length) c.compromisso++
    }
    return c
  }
  const dias = [sabado, addDays(sabado, 1)].map((key, i) => ({
    value: (i ? 'dom' : 'sab') as 'sab' | 'dom',
    label: <span className="escala__day">{formatWeekday(key)} {formatDay(key)}<small>{resumo(key).plantao} de plantão</small></span>,
  }))
  const c = resumo(data)

  return (
    <div className="escala__tab">
      <SegmentedControl aria-label="Dia do fim de semana" fullWidth value={dia} onChange={setDia} options={dias} />
      <p className="escala__summary" aria-live="polite">
        <strong>{c.plantao}</strong> de plantão · <strong>{c.trabalha}</strong> trabalham · <strong>{c.folga}</strong> de folga
        {c.compromisso ? <> · <span className="escala__summary-warn">{c.compromisso} com compromisso</span></> : null}
      </p>
      <ul className="escala__list">
        {motoristas.map((m) => {
          const key = recordKey(m.id, data)
          const atual = situacaoDoDia(m, data, excecoes)
          const padraoDia = dia === 'sab' ? m.padrao.sab : m.padrao.dom
          const doDia = compromissosDoDia(compromissos.filter((x) => x.motoristaId === m.id), data)
          // Escolher o valor do padrão (ou clicar de novo na exceção ativa) volta ao padrão.
          const escolher = (s: Situacao) => onExcecao(key, s === padraoDia || (atual.origem === 'excecao' && s === atual.situacao) ? null : s)
          return (
            <li key={m.id} className={doDia.some((x) => x.diaTodo) ? 'escala__row is-unavailable' : 'escala__row'}>
              <div className="escala__row-main">
                <span className="escala__name">
                  {m.nome}
                  {atual.origem === 'padrao' ? <StatusBadge tone="info">Padrão</StatusBadge> : null}
                  {atual.origem === 'excecao' && padraoDia ? <StatusBadge tone="warning">Exceção</StatusBadge> : null}
                </span>
                <SegmentedControl<Situacao>
                  aria-label={`Situação de ${m.nome} em ${formatDay(data)}`}
                  size="compact"
                  value={(atual.situacao ?? '') as Situacao}
                  onChange={escolher}
                  options={ORDEM.map((value) => ({ value, label: SITUACAO_LABEL[value] }))}
                />
              </div>
              <div className="escala__row-extra">
                {doDia.map(({ compromisso, texto }) => (
                  <span key={compromisso.id ?? compromisso.inicio} className="escala__commitment">
                    {texto} · {MOTIVO_LABEL[compromisso.motivo]}{compromisso.observacao ? ` · ${compromisso.observacao}` : ''}
                  </span>
                ))}
                <Button variant="ghost" size="compact" icon={<CalendarPlus size={14} />} onClick={() => onNovoCompromisso({ motoristaId: m.id, data })}>Compromisso</Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, StatusBadge } from '@betinhos/ui'
import {
  MOTIVO_LABEL, SITUACAO_LABEL, addDays, compromissosDoDia, formatDate, formatDay, formatWeekday, isWeekend, situacaoDoDia,
  type Compromisso, type Situacao, type View,
} from '../domain/escala'
import { CompromissoForm, type FormInicial } from './CompromissoForm'

type Props = {
  hoje: string
  view: View
  formInicial: FormInicial | null
  onFormClose: () => void
  onAdd: (c: Compromisso) => void
  onRemove: (c: Compromisso) => void
}

const SITUACOES: Situacao[] = ['plantao', 'trabalha', 'folga']

/** Linha do tempo por dia: escala dos fins de semana e compromissos de qualquer dia, a partir de hoje. */
export function AgendaTab({ hoje, view, formInicial, onFormClose, onAdd, onRemove }: Props) {
  const [dias, setDias] = useState(30)
  const [formAberto, setFormAberto] = useState(false)
  const { motoristas, excecoes, compromissos } = view
  const nomes = new Map(motoristas.map((m) => [m.id, m.nome]))
  const form = formInicial ?? (formAberto ? {} : null)
  const fecharForm = () => { setFormAberto(false); onFormClose() }

  const linhas = Array.from({ length: dias }, (_, i) => addDays(hoje, i)).map((data) => {
    const escala = isWeekend(data)
      ? SITUACOES.map((s) => ({ s, nomes: motoristas.filter((m) => situacaoDoDia(m, data, excecoes).situacao === s).map((m) => m.nome) })).filter((g) => g.nomes.length)
      : []
    return { data, escala, itens: compromissosDoDia(compromissos, data) }
  }).filter((l) => isWeekend(l.data) || l.itens.length)

  return (
    <div className="escala__tab">
      {form ? (
        <CompromissoForm key={`${form.motoristaId ?? ''}${form.data ?? ''}`} hoje={hoje} motoristas={motoristas} inicial={form} onCancel={fecharForm} onAdd={(c) => { onAdd(c); fecharForm() }} />
      ) : (
        <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setFormAberto(true)}>Novo compromisso</Button>
      )}

      <ol className="escala__timeline">
        {linhas.map(({ data, escala, itens }) => (
          <li key={data} className={isWeekend(data) ? 'escala__day-block is-weekend' : 'escala__day-block'}>
            <h3 className="escala__day-title">{formatWeekday(data)} {formatDay(data)}{data === hoje ? <StatusBadge tone="info">Hoje</StatusBadge> : null}</h3>
            {escala.map(({ s, nomes: lista }) => (
              <p key={s} className="escala__meta"><strong>{SITUACAO_LABEL[s]}:</strong> {lista.join(', ')}</p>
            ))}
            {isWeekend(data) && !escala.length ? <p className="escala__meta">Ninguém escalado ainda.</p> : null}
            {itens.map(({ compromisso: c, texto }) => (
              <div key={`${c.id ?? c.inicio}-${c.motoristaId}`} className="escala__agenda-item">
                <div className="escala__absence-main">
                  <span className="escala__name">{nomes.get(c.motoristaId) ?? 'Motorista inativo'}</span>
                  <span className="escala__meta">
                    {texto}{c.observacao ? ` · ${c.observacao}` : ''}
                    {c.registradoEm ? ` · registrado em ${formatDate(c.registradoEm)}` : ' · não salvo'}
                  </span>
                </div>
                <StatusBadge tone="warning">{MOTIVO_LABEL[c.motivo]}</StatusBadge>
                <Button variant="ghost" size="compact" aria-label={`Excluir compromisso de ${nomes.get(c.motoristaId) ?? ''}`} icon={<Trash2 size={16} />} onClick={() => onRemove(c)} />
              </div>
            ))}
          </li>
        ))}
      </ol>
      <Button variant="ghost" onClick={() => setDias((d) => d + 30)}>Mostrar mais 30 dias</Button>
    </div>
  )
}

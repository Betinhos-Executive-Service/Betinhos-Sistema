import { useState } from 'react'
import { CalendarCheck, Plus, Trash2 } from 'lucide-react'
import { Button, EmptyState, StatusBadge } from '@betinhos/ui'
import {
  MOTIVO_LABEL, addDays, compromissosDoDia, formatDate, formatDay, formatWeekday,
  type Compromisso, type View,
} from '../domain/escala'
import { CompromissoForm, type FormInicial } from './CompromissoForm'

type Props = {
  hoje: string
  sabado: string
  view: View
  formInicial: FormInicial | null
  onFormClose: () => void
  onAdd: (c: Compromisso) => void
  onRemove: (c: Compromisso) => void
}

const dia = (key: string) => { const w = formatWeekday(key); return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${formatDay(key)}` }

/** "Sáb 10/10 · até 12h", "Sáb 10/10 a Dom 18/10" ou, com horário, "Sáb 10/10 09:00 a Seg 12/10 18:00". */
function periodo(c: Compromisso) {
  const de = c.inicio.slice(0, 10)
  const ate = c.fim.slice(0, 10)
  if (de === ate) return `${dia(de)} · ${compromissosDoDia([c], de)[0]?.texto.replace('Indisponível ', '') ?? ''}`
  return c.diaInteiro ? `${dia(de)} a ${dia(ate)}` : `${dia(de)} ${c.inicio.slice(11, 16)} a ${dia(ate)} ${c.fim.slice(11, 16)}`
}

/** Compromissos a partir de hoje: primeiro os que tocam o fim de semana escolhido, depois os próximos. */
export function AgendaTab({ hoje, sabado, view, formInicial, onFormClose, onAdd, onRemove }: Props) {
  const [formAberto, setFormAberto] = useState(false)
  const [confirmando, setConfirmando] = useState<Compromisso | null>(null)
  const { motoristas, compromissos } = view
  const nomes = new Map(motoristas.map((m) => [m.id, m.nome]))
  const form = formInicial ?? (formAberto ? {} : null)
  const fecharForm = () => { setFormAberto(false); onFormClose() }
  const domingo = addDays(sabado, 1)

  const ativos = compromissos.filter((c) => c.fim.slice(0, 10) >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio))
  const noFds = (c: Compromisso) => c.inicio.slice(0, 10) <= domingo && c.fim.slice(0, 10) >= sabado
  const grupos = [
    { titulo: `Fim de semana ${formatDay(sabado)} e ${formatDay(domingo)}`, itens: ativos.filter(noFds) },
    { titulo: 'Próximos', itens: ativos.filter((c) => !noFds(c)) },
  ].filter((g) => g.itens.length)

  return (
    <div className="escala__tab">
      {form ? (
        <CompromissoForm key={`${form.motoristaId ?? ''}${form.data ?? ''}`} hoje={hoje} motoristas={motoristas} inicial={form} onCancel={fecharForm} onAdd={(c) => { onAdd(c); fecharForm() }} />
      ) : (
        <Button variant="secondary" fullWidth icon={<Plus size={16} />} onClick={() => setFormAberto(true)}>Novo compromisso</Button>
      )}

      {!grupos.length ? (
        <EmptyState icon={<CalendarCheck size={32} />} title="Nenhum compromisso a partir de hoje.">Registre férias, consultas ou compromissos pessoais para que apareçam na escala.</EmptyState>
      ) : grupos.map((g) => (
        <section key={g.titulo} className="escala__group" aria-label={g.titulo}>
          <h3 className="escala__group-title">{g.titulo}<span>{g.itens.length}</span></h3>
          <ul className="escala__items">
            {g.itens.map((c) => {
              const nome = nomes.get(c.motoristaId) ?? 'Motorista inativo'
              return (
                <li key={`${c.id ?? c.inicio}-${c.motoristaId}`} className="escala__item">
                  <div className="escala__item-main">
                    <span className="escala__name">{nome}<StatusBadge tone="warning">{MOTIVO_LABEL[c.motivo]}</StatusBadge></span>
                    <span className="escala__item-when">{periodo(c)}</span>
                    {c.observacao ? <span className="escala__meta">{c.observacao}</span> : null}
                    <span className="escala__meta">{c.registradoEm ? `Registrado em ${formatDate(c.registradoEm)}` : 'Salvando…'}</span>
                  </div>
                  {confirmando === c ? (
                    <div className="escala__item-confirm">
                      <Button variant="ghost" size="compact" onClick={() => setConfirmando(null)}>Cancelar</Button>
                      <Button variant="danger" size="compact" onClick={() => { setConfirmando(null); onRemove(c) }}>Excluir</Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="compact" aria-label={`Excluir compromisso de ${nome}`} icon={<Trash2 size={16} />} onClick={() => setConfirmando(c)} />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

import { useState } from 'react'
import { CalendarPlus, Users } from 'lucide-react'
import { Button, EmptyState } from '@betinhos/ui'
import {
  SITUACAO_LABEL, addDays, ausenciasDaSemana, chipAusencia, compromissosDoDia, situacaoDoDia, ultrapassaSemana,
  type Compromisso, type Situacao, type View,
} from '../domain/escala'
import { AusenciaForm } from './AusenciaForm'

type Props = {
  hoje: string
  segunda: string
  view: View
  onMarcar: (motoristaId: string, data: string, situacao: Situacao | null) => void
  onAddAusencias: (lista: Compromisso[]) => void
  onRemoveAusencia: (c: Compromisso) => void
}

const SITUACOES: Situacao[] = ['plantao', 'trabalha']

/** Uma linha por motorista: Plantão/Trabalha no sábado e domingo, ausências da semana em chips e o formulário de ausência. */
export function EscalaLista({ hoje, segunda, view, onMarcar, onAddAusencias, onRemoveAusencia }: Props) {
  const [formPara, setFormPara] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Compromisso | null>(null)
  const { motoristas, marcacoes, compromissos } = view
  const fds = [{ data: addDays(segunda, 5), curto: 'Sáb', longo: 'Sábado' }, { data: addDays(segunda, 6), curto: 'Dom', longo: 'Domingo' }]

  if (!motoristas.length) return <EmptyState icon={<Users size={32} />} title="Nenhum motorista ativo encontrado.">Confira a função dos funcionários no cadastro.</EmptyState>

  return (
    <ul className="escala__list">
      {motoristas.map((m) => {
        const doMotorista = compromissos.filter((c) => c.motoristaId === m.id)
        const ausencias = ausenciasDaSemana(doMotorista, segunda)
        const ausenteNoFds = fds.some(({ data }) => compromissosDoDia(doMotorista, data).some((x) => x.diaTodo))
        return (
          <li key={m.id} className={ausenteNoFds ? 'escala__row is-unavailable' : 'escala__row'}>
            <div className="escala__row-main">
              <span className="escala__name">{m.nome}</span>
              <Button variant="ghost" size="compact" icon={<CalendarPlus size={16} />} aria-expanded={formPara === m.id} onClick={() => setFormPara(formPara === m.id ? null : m.id)}>Ausência</Button>
            </div>
            <div className="escala__days">
              {fds.map(({ data, curto, longo }) => {
                const atual = situacaoDoDia(m.id, data, marcacoes)
                return (
                  <div key={data} className="escala__day-group" role="group" aria-label={`${longo} de ${m.nome}`}>
                    <span className="escala__day-label" aria-hidden="true">{curto}</span>
                    {SITUACOES.map((s) => (
                      <button key={s} type="button" className="escala__toggle" aria-pressed={atual === s} onClick={() => onMarcar(m.id, data, atual === s ? null : s)}>
                        {SITUACAO_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
            {ausencias.length ? (
              <ul className="escala__chips" aria-label={`Ausências de ${m.nome}`}>
                {ausencias.map((c) => (
                  <li key={c.id ?? `${c.inicio}-${c.fim}`}>
                    {excluindo === c ? (
                      <span className="escala__chip-confirm">
                        {ultrapassaSemana(c, segunda) ? 'Excluir o período inteiro?' : 'Excluir esta ausência?'}
                        <Button variant="ghost" size="compact" onClick={() => setExcluindo(null)}>Cancelar</Button>
                        <Button variant="danger" size="compact" onClick={() => { setExcluindo(null); onRemoveAusencia(c) }}>Excluir</Button>
                      </span>
                    ) : (
                      <button type="button" className="escala__chip" title={c.observacao || undefined} onClick={() => setExcluindo(c)}>
                        {chipAusencia(c, segunda)}{c.id ? '' : ' · salvando…'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {formPara === m.id ? (
              <AusenciaForm key={`${m.id}-${segunda}`} hoje={hoje} segunda={segunda} motoristaId={m.id} onCancel={() => setFormPara(null)} onAdd={(lista) => { onAddAusencias(lista); setFormPara(null) }} />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

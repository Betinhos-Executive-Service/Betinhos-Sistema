import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Alert, BuildBadge, Button, Skeleton, Tabs, useToast } from '@betinhos/ui'
import {
  addDays, aplicarPendencias, planSave, semPendencias, toKey, totalPendencias, weekendLabel, weekendOf,
  type Compromisso, type Dados, type Padrao, type Pendencias, type Situacao,
} from './domain/escala'
import { createSource, janelaPara, type Janela } from './data/source'
import { EscalaTab } from './components/EscalaTab'
import { AgendaTab } from './components/AgendaTab'
import { RodizioTab } from './components/RodizioTab'
import { PadroesTab } from './components/PadroesTab'
import type { FormInicial } from './components/CompromissoForm'

type Aba = 'escala' | 'agenda' | 'rodizio' | 'padroes'

const precisaRecarregar = (janela: Janela, sabado: string) => janelaPara(sabado).inicio !== janela.inicio || addDays(sabado, 7) > janela.fim

export function App() {
  const source = useMemo(createSource, [])
  const toast = useToast()
  const [sabado, setSabado] = useState(() => weekendOf(new Date()))
  const [janela, setJanela] = useState(() => janelaPara(weekendOf(new Date())))
  const [dados, setDados] = useState<Dados | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pend, setPend] = useState<Pendencias>(semPendencias)
  const [aba, setAba] = useState<Aba>('escala')
  const [formInicial, setFormInicial] = useState<FormInicial | null>(null)
  const total = totalPendencias(pend)

  const load = useCallback(async (target: Janela) => {
    setLoading(true)
    setError(null)
    try { setDados(await source.load(target)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }, [source])

  useEffect(() => { void load(janela) }, [load, janela])

  useEffect(() => {
    // O overlay do botão (cr40f_escalafds_commands.js) usa isto para pedir "Descartar alterações?" ao fechar.
    if (window.parent !== window) window.parent.postMessage({ type: 'escala-fds:dirty', dirty: total > 0 }, '*')
    if (!total) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [total])

  const irPara = (proximo: string) => {
    setSabado(proximo)
    if (precisaRecarregar(janela, proximo)) setJanela(janelaPara(proximo))
  }

  const view = useMemo(() => (dados ? aplicarPendencias(dados, pend) : null), [dados, pend])

  const update = (fn: (p: Pendencias) => void) => setPend((current) => {
    const next: Pendencias = { excecoes: new Map(current.excecoes), padroes: new Map(current.padroes), novos: [...current.novos], excluidos: new Set(current.excluidos) }
    fn(next)
    return next
  })
  const setExcecao = (key: string, situacao: Situacao | null) => update((p) => {
    const salva = dados?.excecoes.find((e) => `${e.motoristaId}|${e.data}` === key)
    if ((salva?.situacao ?? null) === situacao) p.excecoes.delete(key)
    else p.excecoes.set(key, situacao)
  })
  const setPadrao = (motoristaId: string, padrao: Padrao) => update((p) => {
    const salvo = dados?.motoristas.find((m) => m.id === motoristaId)?.padrao
    if (salvo && salvo.sab === padrao.sab && salvo.dom === padrao.dom) p.padroes.delete(motoristaId)
    else p.padroes.set(motoristaId, padrao)
  })
  const addCompromisso = (c: Compromisso) => update((p) => { p.novos.push(c) })
  const removeCompromisso = (c: Compromisso) => update((p) => {
    if (c.id) p.excluidos.add(c.id)
    else p.novos = p.novos.filter((n) => n !== c)
  })
  const novoCompromisso = (inicial: FormInicial) => { setFormInicial(inicial); setAba('agenda') }

  const salvar = async () => {
    if (!dados) return
    const ops = planSave(dados, pend)
    if (!ops.length) { setPend(semPendencias()); return }
    setSaving(true)
    try {
      await source.save(ops)
      setPend(semPendencias())
      toast({ tone: 'success', message: ops.length === 1 ? 'Escala atualizada.' : `Escala atualizada: ${ops.length} alterações.` })
      await load(janela)
    } catch (reason) {
      // As pendências continuam na tela; o que já foi gravado aparece ao recarregar.
      toast({ tone: 'danger', message: `Não foi possível salvar. ${reason instanceof Error ? reason.message : ''}`.trim() })
      await load(janela)
    } finally { setSaving(false) }
  }

  const hoje = toKey(new Date())

  return (
    <div className="escala">
      <header className="escala__head">
        <div className="escala__week">
          <Button variant="secondary" size="compact" aria-label="Fim de semana anterior" icon={<ChevronLeft size={16} />} onClick={() => irPara(addDays(sabado, -7))} />
          <div className="escala__week-label">
            <span className="escala__eyebrow">{sabado === weekendOf(new Date()) ? 'Este fim de semana' : 'Fim de semana'}</span>
            <strong>{weekendLabel(sabado)}</strong>
          </div>
          <Button variant="secondary" size="compact" aria-label="Próximo fim de semana" icon={<ChevronRight size={16} />} onClick={() => irPara(addDays(sabado, 7))} />
        </div>
        <Button variant="ghost" size="compact" icon={<RefreshCw size={16} />} onClick={() => void load(janela)} disabled={loading || saving}>Atualizar</Button>
      </header>

      <Tabs<Aba>
        aria-label="Seções da escala"
        value={aba}
        onChange={setAba}
        tabs={[
          { value: 'escala', label: 'Escala' },
          { value: 'agenda', label: 'Agenda' },
          { value: 'rodizio', label: 'Rodízio' },
          { value: 'padroes', label: 'Padrões' },
        ]}
      />

      <main className="escala__body" aria-busy={loading}>
        {error ? (
          <Alert tone="danger" title="Não foi possível carregar a escala." action={<Button size="compact" variant="secondary" onClick={() => void load(janela)}>Tentar de novo</Button>}>{error}</Alert>
        ) : !view ? (
          <div className="escala__skeleton">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={56} />)}</div>
        ) : aba === 'escala' ? (
          <EscalaTab sabado={sabado} view={view} onExcecao={setExcecao} onNovoCompromisso={novoCompromisso} />
        ) : aba === 'agenda' ? (
          <AgendaTab hoje={hoje} view={view} formInicial={formInicial} onFormClose={() => setFormInicial(null)} onAdd={addCompromisso} onRemove={removeCompromisso} />
        ) : aba === 'rodizio' ? (
          <RodizioTab sabado={sabado} view={view} />
        ) : (
          <PadroesTab view={view} onPadrao={setPadrao} />
        )}
      </main>

      {total > 0 ? (
        <footer className="escala__foot" role="status">
          <span>{total === 1 ? '1 alteração não salva' : `${total} alterações não salvas`}</span>
          <div className="escala__foot-actions">
            <Button variant="secondary" onClick={() => setPend(semPendencias())} disabled={saving}>Descartar</Button>
            <Button variant="primary" onClick={() => void salvar()} loading={saving}>Salvar escala</Button>
          </div>
        </footer>
      ) : null}

      {source.mock ? <p className="escala__mock">Dados de exemplo (fora do Dataverse)</p> : null}
      <BuildBadge version={__APP_VERSION__} isoDate={__BUILD_DATE__} />
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import { Alert, BuildBadge, Button, Skeleton, Tabs, useToast } from '@betinhos/ui'
import {
  addDays, aplicarPendencias, clonarPendencias, descontarSalvas, planSave, semPendencias, toKey, totalPendencias, weekendLabel, weekendOf,
  type Compromisso, type Dados, type Padrao, type Pendencias, type Situacao,
} from './domain/escala'
import { createSource, janelaPara, type Janela } from './data/source'
import { EscalaTab } from './components/EscalaTab'
import { AgendaTab } from './components/AgendaTab'
import { PadroesTab } from './components/PadroesTab'
import type { FormInicial } from './components/CompromissoForm'

type Aba = 'escala' | 'agenda' | 'padroes'

/** Espera após a última alteração antes de gravar, para juntar toques seguidos num lote só. */
const AUTOSAVE_MS = 700

const precisaRecarregar = (janela: Janela, sabado: string) => janelaPara(sabado).inicio !== janela.inicio || addDays(sabado, 7) > janela.fim
const horaAgora = () => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date())

export function App() {
  const source = useMemo(createSource, [])
  const toast = useToast()
  const [sabado, setSabado] = useState(() => weekendOf(new Date()))
  const [janela, setJanela] = useState(() => janelaPara(weekendOf(new Date())))
  const [dados, setDados] = useState<Dados | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [salvarErro, setSalvarErro] = useState(false)
  const [salvoEm, setSalvoEm] = useState<string | null>(null)
  const [pend, setPend] = useState<Pendencias>(semPendencias)
  const [aba, setAba] = useState<Aba>('escala')
  const [formInicial, setFormInicial] = useState<FormInicial | null>(null)
  const total = totalPendencias(pend)

  // O salvamento roda fora do ciclo de render: lê sempre o estado mais recente.
  const ref = useRef({ dados, pend, janela, saving })
  ref.current = { dados, pend, janela, saving: ref.current.saving }

  const load = useCallback(async (target: Janela) => {
    setLoading(true)
    setError(null)
    try { setDados(await source.load(target)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }, [source])

  useEffect(() => { void load(janela) }, [load, janela])

  const dirty = total > 0 || saving
  useEffect(() => {
    // O overlay do botão (cr40f_escalafds_commands.js) usa isto para pedir "Descartar alterações?" ao fechar.
    if (window.parent !== window) window.parent.postMessage({ type: 'escala-fds:dirty', dirty }, '*')
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const salvar = useCallback(async () => {
    const { dados: base, pend: lote, janela: alvo } = ref.current
    if (!base || ref.current.saving) return
    const ops = planSave(base, lote)
    if (!ops.length) { setPend((p) => descontarSalvas(p, lote, base)); return }
    ref.current.saving = true
    setSaving(true)
    let feitas = 0
    let falha: unknown = null
    try {
      // Uma operação por vez: na falha, só o que não foi gravado continua pendente.
      for (const op of ops) { await source.save([op]); feitas++ }
    } catch (reason) { falha = reason }
    try {
      // Recarrega para obter os IDs criados; alterações feitas durante a gravação continuam pendentes.
      const novos = await source.load(alvo)
      setDados(novos)
      setPend((p) => descontarSalvas(p, lote, base, falha ? ops.slice(0, feitas) : undefined))
    } catch (reason) {
      setPend((p) => descontarSalvas(p, lote, base, ops.slice(0, feitas)))
      setError(reason instanceof Error ? reason.message : String(reason))
    }
    if (falha) {
      setSalvarErro(true)
      toast({ tone: 'danger', message: `Não foi possível salvar. ${falha instanceof Error ? falha.message : ''}`.trim() })
    } else setSalvoEm(horaAgora())
    ref.current.saving = false
    setSaving(false)
  }, [source, toast])

  useEffect(() => {
    if (!total || saving || salvarErro) return
    const timer = setTimeout(() => void salvar(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [pend, total, saving, salvarErro, salvar])

  const irPara = (proximo: string) => {
    setSabado(proximo)
    if (precisaRecarregar(janela, proximo)) setJanela(janelaPara(proximo))
  }

  const view = useMemo(() => (dados ? aplicarPendencias(dados, pend) : null), [dados, pend])

  const update = (fn: (p: Pendencias) => void) => {
    setSalvarErro(false) // Nova alteração tenta gravar de novo, junto com o que falhou.
    setPend((current) => { const next = clonarPendencias(current); fn(next); return next })
  }
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
        <div className="escala__head-end">
          <span className={salvarErro ? 'escala__save is-error' : 'escala__save'} aria-live="polite">
            {salvarErro ? (
              <><CircleAlert size={14} aria-hidden="true" />Não salvo<Button variant="ghost" size="compact" onClick={() => setSalvarErro(false)}>Tentar de novo</Button></>
            ) : dirty ? (
              <><LoaderCircle size={14} className="escala__spin" aria-hidden="true" />Salvando…</>
            ) : salvoEm ? (
              <><Check size={14} aria-hidden="true" />Salvo às {salvoEm}</>
            ) : null}
          </span>
          <Button variant="ghost" size="compact" icon={<RefreshCw size={16} />} onClick={() => void load(janela)} disabled={loading || dirty}>Atualizar</Button>
        </div>
      </header>

      <Tabs<Aba>
        aria-label="Seções da escala"
        value={aba}
        onChange={setAba}
        tabs={[
          { value: 'escala', label: 'Escala' },
          { value: 'agenda', label: 'Agenda' },
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
          <AgendaTab hoje={hoje} sabado={sabado} view={view} formInicial={formInicial} onFormClose={() => setFormInicial(null)} onAdd={addCompromisso} onRemove={removeCompromisso} />
        ) : (
          <PadroesTab view={view} onPadrao={setPadrao} />
        )}
      </main>

      {source.mock ? <p className="escala__mock">Dados de exemplo (fora do Dataverse)</p> : null}
      <BuildBadge version={__APP_VERSION__} isoDate={__BUILD_DATE__} />
    </div>
  )
}

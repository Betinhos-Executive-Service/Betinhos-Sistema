import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Alert, BuildBadge, Button, Skeleton, Tabs, useToast } from '@betinhos/ui'
import { addDays, recordKey, mergeEdits, planSave, toKey, weekendLabel, weekendOf, type Edicao, type Registro } from './domain/escala'
import { createSource, janelaPara, type Dados, type Janela } from './data/source'
import { EscalaTab } from './components/EscalaTab'
import { AusenciasTab } from './components/AusenciasTab'
import { RodizioTab } from './components/RodizioTab'

type Aba = 'escala' | 'ausencias' | 'rodizio'

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
  const [edits, setEdits] = useState<Map<string, Edicao>>(new Map())
  const [aba, setAba] = useState<Aba>('escala')

  const load = useCallback(async (target: Janela) => {
    setLoading(true)
    setError(null)
    try { setDados(await source.load(target)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }, [source])

  useEffect(() => { void load(janela) }, [load, janela])

  // Fechar o painel nativo não pode ser interceptado; o navegador ao menos avisa sobre o que não foi salvo.
  useEffect(() => {
    if (!edits.size) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [edits.size])

  const irPara = (proximo: string) => {
    setSabado(proximo)
    if (precisaRecarregar(janela, proximo)) setJanela(janelaPara(proximo))
  }

  const registros = useMemo(() => mergeEdits(dados?.registros ?? [], edits), [dados, edits])
  const salvos = useMemo(() => new Map<string, Registro>((dados?.registros ?? []).map((r) => [recordKey(r.motoristaId, r.data), r])), [dados])
  const editar = useCallback((changes: [string, Edicao][]) => setEdits((current) => {
    const next = new Map(current)
    for (const [key, edit] of changes) {
      const saved = salvos.get(key)
      const igual = edit === null ? !saved : saved && saved.status === edit.status && saved.observacao === edit.observacao && (saved.motivo ?? null) === (edit.status === 'indisponivel' ? edit.motivo : null)
      if (igual) next.delete(key)
      else next.set(key, edit)
    }
    return next
  }), [salvos])

  const salvar = async () => {
    const ops = planSave(dados?.registros ?? [], edits)
    if (!ops.length) { setEdits(new Map()); return }
    setSaving(true)
    try {
      await source.save(ops)
      setEdits(new Map())
      toast({ tone: 'success', message: ops.length === 1 ? 'Escala atualizada.' : `Escala atualizada: ${ops.length} alterações.` })
      await load(janela)
    } catch (reason) {
      // A edição continua na tela; o que já foi gravado aparece ao recarregar.
      toast({ tone: 'danger', message: `Não foi possível salvar. ${reason instanceof Error ? reason.message : ''}`.trim() })
      await load(janela)
    } finally { setSaving(false) }
  }

  const hoje = toKey(new Date())
  const ausenciasFuturas = [...registros.values()].filter((r: Registro) => r.status === 'indisponivel' && r.data >= hoje).length

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
          { value: 'ausencias', label: 'Ausências', badge: ausenciasFuturas || undefined },
          { value: 'rodizio', label: 'Rodízio' },
        ]}
      />

      <main className="escala__body" aria-busy={loading}>
        {error ? (
          <Alert tone="danger" title="Não foi possível carregar a escala." action={<Button size="compact" variant="secondary" onClick={() => void load(janela)}>Tentar de novo</Button>}>{error}</Alert>
        ) : !dados ? (
          <div className="escala__skeleton">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={56} />)}</div>
        ) : aba === 'escala' ? (
          <EscalaTab sabado={sabado} motoristas={dados.motoristas} registros={registros} onChange={editar} />
        ) : aba === 'ausencias' ? (
          <AusenciasTab hoje={hoje} motoristas={dados.motoristas} registros={registros} onChange={editar} />
        ) : (
          <RodizioTab sabado={sabado} motoristas={dados.motoristas} registros={registros} />
        )}
      </main>

      {edits.size > 0 ? (
        <footer className="escala__foot" role="status">
          <span>{edits.size === 1 ? '1 alteração não salva' : `${edits.size} alterações não salvas`}</span>
          <div className="escala__foot-actions">
            <Button variant="secondary" onClick={() => setEdits(new Map())} disabled={saving}>Descartar</Button>
            <Button variant="primary" onClick={() => void salvar()} loading={saving}>Salvar escala</Button>
          </div>
        </footer>
      ) : null}

      {source.mock ? <p className="escala__mock">Dados de exemplo (fora do Dataverse)</p> : null}
      <BuildBadge version={__APP_VERSION__} isoDate={__BUILD_DATE__} />
    </div>
  )
}

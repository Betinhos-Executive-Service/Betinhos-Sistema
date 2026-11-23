import { useMemo, useState } from 'react'
import { Button, EmptyState, Field, SegmentedControl, Select, Textarea, useToast } from '@betinhos/ui'
import { Images, Pencil } from 'lucide-react'
import { formatDay } from '../../../app/format'
import type { Source } from '../data/source'
import { autorLabel } from '../domain/choices'
import { MAX_LENGTH } from '../domain/form'
import { galeriaDeProvas, type TipoProva } from '../domain/painel'
import { ordemDoCodigo } from '../domain/regras'
import type { Atualizacao, Etapa, Projeto } from '../domain/types'
import { AnexoAudio, AnexoMiniatura } from './AnexoMiniatura'
import type { Selecao } from './Lista'

const porCodigo = (a: Projeto, b: Projeto) => (ordemDoCodigo(a.codigo) ?? Infinity) - (ordemDoCodigo(b.codigo) ?? Infinity)
const TIPOS = [{ value: '', label: 'Todos' }, { value: 'print', label: 'Prints' }, { value: 'video', label: 'Vídeos' }, { value: 'audio', label: 'Áudios' }]
const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

type Dados = { projetos: Projeto[]; etapas: Etapa[]; atualizacoes: Atualizacao[]; source: Source }

/** Aba Provas: todas as provas (anexos das atualizações marcadas como prova), filtradas por projeto e tipo. */
export function AbaProvas({ projetos, etapas, atualizacoes, source, onSelect }: Dados & { onSelect: (s: Selecao) => void }) {
  const [projetoId, setProjetoId] = useState('todos')
  const [tipo, setTipo] = useState('')
  const itens = useMemo(() => galeriaDeProvas({ projetos, etapas, atualizacoes }, { projetoId: projetoId === 'todos' ? null : projetoId, tipo: (tipo || null) as TipoProva | null }), [projetos, etapas, atualizacoes, projetoId, tipo])
  const opcoes = useMemo(() => [{ value: 'todos', label: 'Todos os projetos' }, ...[...projetos].sort(porCodigo).map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nome}` }))], [projetos])
  return (
    <div className="pj-aba">
      <div className="pj-aba__filtros">
        <Field label="Projeto"><Select options={opcoes} value={projetoId} searchable={false} onChange={(v) => setProjetoId(v || 'todos')} /></Field>
        <SegmentedControl aria-label="Tipo de prova" value={tipo} onChange={setTipo} options={TIPOS} />
        <span className="pj-muted pj-num">{itens.length} {itens.length === 1 ? 'prova' : 'provas'}</span>
      </div>
      {itens.length ? (
        <ul className="pj-galeria" aria-label="Provas">
          {itens.map(({ anexo, atualizacao, etapa, projeto }) => (
            <li key={`${atualizacao.id}-${anexo.id}`} className="pj-galeria__item">
              {anexo.tipo.startsWith('audio/') ? <AnexoAudio anexo={anexo} source={source} /> : <AnexoMiniatura anexo={anexo} source={source} />}
              <button type="button" className="pj-galeria__etapa" onClick={() => (etapa ? onSelect({ tipo: 'etapa', id: etapa.id }) : projeto && onSelect({ tipo: 'projeto', id: projeto.id }))}>
                <span className="pj-cod">{etapa?.codigo ?? projeto?.codigo ?? ''}</span> {etapa?.nome ?? projeto?.nome ?? ''}
              </button>
              <span className="pj-muted pj-num">{formatDay(atualizacao.data)} · {autorLabel(atualizacao.autor)}</span>
            </li>
          ))}
        </ul>
      ) : <EmptyState align="start" icon={<Images size={36} />} title="Nenhuma prova com estes filtros">A prova é uma atualização marcada como prova, com print, vídeo ou áudio.</EmptyState>}
    </div>
  )
}

/** Aba Instruções: o "como usar" de cada projeto, editável ali mesmo (`cr40f_instrucoes`). */
export function AbaInstrucoes({ projetos, source, onSaved }: { projetos: Projeto[]; source: Source; onSaved: (p: Projeto) => void }) {
  const toast = useToast()
  const [editando, setEditando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const lista = useMemo(() => [...projetos].sort(porCodigo), [projetos])

  async function salvar(p: Projeto) {
    setSalvando(true)
    try {
      await source.updateProjeto(p.id, { cr40f_instrucoes: texto.trim() || null })
      onSaved({ ...p, instrucoes: texto.trim() })
      toast({ tone: 'success', message: `Instruções de ${p.codigo} salvas.` })
      setEditando(null)
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. O texto foi mantido. ${reasonText(reason)}` })
    } finally { setSalvando(false) }
  }

  return (
    <ul className="pj-aba pj-instrucoes" aria-label="Instruções por projeto">
      {lista.map((p) => (
        <li key={p.id} className="pj-instrucoes__item">
          <div className="pj-instrucoes__cab">
            <span><span className="pj-cod">{p.codigo}</span> <strong>{p.nome}</strong>{p.area ? <span className="pj-muted"> · {p.area}</span> : null}</span>
            {editando === p.id ? null : <Button variant="ghost" size="compact" icon={<Pencil size={14} />} disabled={editando != null} onClick={() => { setEditando(p.id); setTexto(p.instrucoes) }} aria-label={`Editar instruções de ${p.codigo}`}>Editar</Button>}
          </div>
          {editando === p.id ? (
            <div className="pj-nova">
              <Field label={`Como usar ${p.codigo}`}><Textarea rows={4} value={texto} maxLength={MAX_LENGTH.instrucoes} disabled={salvando} onChange={(ev) => setTexto(ev.target.value)} /></Field>
              <div className="pj-nova__acoes">
                <Button variant="secondary" disabled={salvando} onClick={() => setEditando(null)}>Cancelar</Button>
                <Button loading={salvando} onClick={() => void salvar(p)}>Salvar instruções</Button>
              </div>
            </div>
          ) : p.instrucoes.trim() ? <p className="pj-timeline__texto">{p.instrucoes}</p> : <p className="pj-muted">Sem instruções ainda.</p>}
        </li>
      ))}
    </ul>
  )
}

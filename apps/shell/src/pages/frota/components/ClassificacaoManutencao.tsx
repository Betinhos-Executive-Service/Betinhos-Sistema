import { Pencil, Sparkles } from 'lucide-react'
import { Alert, Button, Checkbox, Spinner, StatusBadge } from '@betinhos/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Classificacao, DataSource } from '../data/source'
import type { Manutencao } from '../data/types'
import { errorMessage } from '../data/xrm'
import { CATEGORIAS_MANUT, categoriasDe, ORIGEM, patchManual, patchReclassificar, SERVICOS_MANUT } from '../domain/manutencaoCatalogo'
import { useNotify } from './Toasts'

/** Intervalo e limite da espera pelo flow do JEV. */
export const POLL_MS = 1000
export const POLL_LIMITE_MS = 60000
/** Registro criado há menos que isso e ainda sem classificação: acompanha a IA sozinho. */
const RECENTE_MS = 5 * 60000

type Ia = 'parado' | 'enviando' | 'classificando' | 'sem-resposta'

function Origem({ item }: { item: Manutencao }) {
  if (item.origemClassificacao === ORIGEM.IA) return <StatusBadge tone="info" icon={<Sparkles size={12} />}>IA JEV{item.confiancaIa !== null ? ` · ${Math.round(item.confiancaIa * 100)}%` : ''}</StatusBadge>
  if (item.origemClassificacao === ORIGEM.MANUAL) return <StatusBadge tone="neutral">Corrigido à mão</StatusBadge>
  if (item.origemClassificacao === ORIGEM.REVISAR) return <StatusBadge tone="warning">Revisar</StatusBadge>
  return <StatusBadge tone="neutral">Aguardando IA</StatusBadge>
}

const nomes = (servicos: number[]) => SERVICOS_MANUT.filter((servico) => servicos.includes(servico.value)).map((servico) => servico.label).join(', ')

/** Serviços e categorias da manutenção: leitura, correção manual e classificação assíncrona pela IA (JEV). */
export function ClassificacaoManutencao({ source, item, onClassificado }: { source: DataSource; item: Manutencao; onClassificado: (classificacao: Classificacao) => void }) {
  const notify = useNotify()
  const [editando, setEditando] = useState(false)
  const [selecionados, setSelecionados] = useState<number[]>(item.servicos)
  const [salvando, setSalvando] = useState(false)
  const [ia, setIa] = useState<Ia>('parado')
  const vivo = useRef(true)
  const rodando = useRef(false)
  useEffect(() => {
    vivo.current = true
    return () => { vivo.current = false }
  }, [])
  const grupos = CATEGORIAS_MANUT.map((categoria) => ({ ...categoria, servicos: SERVICOS_MANUT.filter((servico) => servico.categoria === categoria.value) }))

  /** Consulta só a classificação até o flow gravar; a tela continua livre enquanto isso. */
  const avisar = useCallback((c: Classificacao) => {
    notify('success', c.origem === ORIGEM.REVISAR ? 'A IA não reconheceu o serviço. Revise e corrija à mão.' : `IA classificou: ${nomes(c.servicos)}.`)
  }, [notify])

  const acompanhar = useCallback(async (comAviso: boolean) => {
    if (rodando.current) return
    rodando.current = true
    setIa('classificando')
    try {
      const limite = Date.now() + POLL_LIMITE_MS
      while (vivo.current && Date.now() < limite) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        if (!vivo.current) return
        let atual
        try {
          atual = await source.classificacao(item.id)
        } catch {
          continue // falha pontual de rede: tenta na próxima volta
        }
        if (atual.origem === null) continue
        if (!vivo.current) return
        setIa('parado')
        if (comAviso) avisar(atual)
        onClassificado(atual)
        return
      }
      if (vivo.current) setIa('sem-resposta')
    } finally {
      rodando.current = false
    }
  }, [source, item.id, avisar, onClassificado])

  useEffect(() => {
    const recente = Date.now() - new Date(item.criadoEm).getTime() < RECENTE_MS
    if (item.origemClassificacao === null && recente) void acompanhar(false)
  }, [acompanhar, item.origemClassificacao, item.criadoEm])

  async function classificarComIa() {
    setIa('classificando')
    try {
      const resultado = await source.classificarAgora(item.id)
      if (!vivo.current) return
      setIa('parado')
      avisar(resultado)
      onClassificado(resultado)
      return
    } catch {
      // Flow síncrono indisponível: cai no caminho assíncrono (flow do Dataverse + acompanhamento).
    }
    if (!vivo.current) return
    setIa('enviando')
    try {
      await source.update('manutencao', item.id, patchReclassificar(item.descricao))
    } catch (reason) {
      notify('error', errorMessage(reason))
      setIa('parado')
      return
    }
    void acompanhar(true)
  }

  async function salvarCorrecao() {
    setSalvando(true)
    try {
      await source.update('manutencao', item.id, patchManual(selecionados))
    } catch (reason) {
      notify('error', errorMessage(reason))
      setSalvando(false)
      return
    }
    setSalvando(false)
    setEditando(false)
    notify('success', 'Classificação corrigida. A IA não vai sobrescrever.')
    onClassificado({ servicos: selecionados, categorias: categoriasDe(selecionados), origem: ORIGEM.MANUAL, confianca: null })
  }

  function alternar(value: number) {
    setSelecionados((atual) => (atual.includes(value) ? atual.filter((v) => v !== value) : [...atual, value]))
  }

  if (editando) {
    return (
      <div className="frota-classif">
        <div className="frota-classif__grade">
          {grupos.map((grupo) => (
            <fieldset key={grupo.value} className="frota-classif__cat">
              <legend>{grupo.label}</legend>
              {grupo.servicos.map((servico) => (
                <Checkbox key={servico.value} label={servico.label} checked={selecionados.includes(servico.value)} onChange={() => alternar(servico.value)} disabled={salvando} />
              ))}
            </fieldset>
          ))}
        </div>
        <div className="frota-cluster">
          <Button size="compact" loading={salvando} disabled={selecionados.length === 0} onClick={() => void salvarCorrecao()}>Salvar correção</Button>
          <Button size="compact" variant="secondary" disabled={salvando} onClick={() => { setSelecionados(item.servicos); setEditando(false) }}>Cancelar</Button>
        </div>
      </div>
    )
  }

  const ocupado = ia === 'enviando' || ia === 'classificando'
  const porCategoria = grupos
    .map((grupo) => ({ ...grupo, servicos: grupo.servicos.filter((servico) => item.servicos.includes(servico.value)) }))
    .filter((grupo) => grupo.servicos.length > 0)

  return (
    <div className="frota-classif" aria-busy={ocupado}>
      <div className="frota-cluster">
        {ocupado ? <StatusBadge tone="info" icon={<Spinner size={12} label="Classificando com IA" />}>Classificando com IA…</StatusBadge> : <Origem item={item} />}
      </div>
      <p className="frota-sr-only" role="status">{ocupado ? 'Classificando com IA' : ''}</p>
      {ocupado && <p className="frota-muted">Pode continuar usando a tela. O resultado aparece aqui em alguns segundos.</p>}
      {ia === 'sem-resposta' && <Alert tone="warning">A IA ainda não respondeu. Tente de novo em instantes ou corrija à mão.</Alert>}
      {porCategoria.length === 0 ? (!ocupado && <p className="frota-muted">Sem serviços classificados.</p>) : (
        <dl className="frota-detail" data-antigo={ocupado || undefined}>
          {porCategoria.map((grupo) => (<div key={grupo.value} className="frota-detail__row"><dt>{grupo.label}</dt><dd>{grupo.servicos.map((servico) => servico.label).join(', ')}</dd></div>))}
        </dl>
      )}
      <div className="frota-cluster">
        <Button size="compact" variant="secondary" icon={<Pencil size={14} />} disabled={ocupado} onClick={() => setEditando(true)}>Corrigir</Button>
        {(item.origemClassificacao !== ORIGEM.IA || ia === 'sem-resposta') && (
          <Button size="compact" variant="secondary" icon={<Sparkles size={14} />} disabled={ocupado} onClick={() => void classificarComIa()}>{ia === 'sem-resposta' ? 'Tentar de novo' : 'Classificar com IA'}</Button>
        )}
      </div>
    </div>
  )
}

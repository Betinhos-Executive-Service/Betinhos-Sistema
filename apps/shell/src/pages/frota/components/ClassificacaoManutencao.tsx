import { Pencil, Sparkles } from 'lucide-react'
import { Button, Checkbox, StatusBadge } from '@betinhos/ui'
import { useState } from 'react'
import type { Classificacao, DataSource } from '../data/source'
import type { Manutencao } from '../data/types'
import { errorMessage } from '../data/xrm'
import { CATEGORIAS_MANUT, categoriasDe, ORIGEM, patchManual, SERVICOS_MANUT } from '../domain/manutencaoCatalogo'
import { useNotify } from './Toasts'

function Origem({ item }: { item: Manutencao }) {
  // Registros antigos classificados pela IA (JEV, desligada em 10/11/2026) continuam identificados.
  if (item.origemClassificacao === ORIGEM.IA) return <StatusBadge tone="info" icon={<Sparkles size={12} />}>Classificado por IA{item.confiancaIa !== null ? ` · ${Math.round(item.confiancaIa * 100)}%` : ''}</StatusBadge>
  if (item.origemClassificacao === ORIGEM.MANUAL) return <StatusBadge tone="neutral">Corrigido à mão</StatusBadge>
  if (item.origemClassificacao === ORIGEM.REVISAR) return <StatusBadge tone="warning">Revisar</StatusBadge>
  return <StatusBadge tone="neutral">Sem classificação</StatusBadge>
}

/** Serviços e categorias da manutenção: leitura e classificação manual. */
export function ClassificacaoManutencao({ source, item, onClassificado }: { source: DataSource; item: Manutencao; onClassificado: (classificacao: Classificacao) => void }) {
  const notify = useNotify()
  const [editando, setEditando] = useState(false)
  const [selecionados, setSelecionados] = useState<number[]>(item.servicos)
  const [salvando, setSalvando] = useState(false)
  const grupos = CATEGORIAS_MANUT.map((categoria) => ({ ...categoria, servicos: SERVICOS_MANUT.filter((servico) => servico.categoria === categoria.value) }))

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
    notify('success', 'Classificação salva.')
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

  const porCategoria = grupos
    .map((grupo) => ({ ...grupo, servicos: grupo.servicos.filter((servico) => item.servicos.includes(servico.value)) }))
    .filter((grupo) => grupo.servicos.length > 0)

  return (
    <div className="frota-classif">
      <div className="frota-cluster"><Origem item={item} /></div>
      {porCategoria.length === 0 ? <p className="frota-muted">Sem serviços classificados.</p> : (
        <dl className="frota-detail">
          {porCategoria.map((grupo) => (<div key={grupo.value} className="frota-detail__row"><dt>{grupo.label}</dt><dd>{grupo.servicos.map((servico) => servico.label).join(', ')}</dd></div>))}
        </dl>
      )}
      <div className="frota-cluster">
        <Button size="compact" variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditando(true)}>{porCategoria.length === 0 ? 'Classificar' : 'Corrigir'}</Button>
      </div>
    </div>
  )
}

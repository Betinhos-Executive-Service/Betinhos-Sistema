import { StatCard, type StatCardProps } from '@betinhos/ui'
import type { DadosKpi } from './KpiExtras'
import { idDoCard, useAmpliavel, useDetalhe } from './DetalheProvider'

/**
 * `StatCard` dos KPIs das abas: o número abre o card ampliado (tabela dos números, comparativos, top 5 e "Ver na lista" pelo
 * recorte da aba). Os comparativos e apoios vêm de `extrasKpi` (`dados`); `onOpen` próprio (drill-down de registros) tem prioridade.
 */
export function KpiAba({ dados, onOpen, ...props }: StatCardProps & { dados?: DadosKpi }) {
  const abrirId = useDetalhe()
  const titulo = typeof props.label === 'string' ? props.label : ''
  const valor = typeof props.value === 'string' || typeof props.value === 'number' ? String(props.value) : null
  const apoio = dados?.apoio.filter((a) => a.rotulo) ?? []
  const frases = dados?.apoio.filter((a) => !a.rotulo).map((a) => a.texto) ?? []
  const generico = useAmpliavel(titulo, {
    titulo, periodo: '', unidade: 'indicador', valor, chips: dados?.chips ?? [], apoio: [], hint: frases.join(' · ') || undefined,
    tabelaDados: apoio.length ? { colunas: ['Item', 'Valor'], linhas: [[titulo, valor ?? 's/dado'], ...apoio.map((a) => [a.rotulo, a.texto])] } : undefined,
  })
  const abrir = onOpen ?? (abrirId && generico ? () => abrirId(generico) : undefined)
  const origem = onOpen ? {} : generico && abrirId ? { 'data-origem': idDoCard(titulo) } : {}
  return <StatCard {...props} {...origem} onOpen={abrir} />
}

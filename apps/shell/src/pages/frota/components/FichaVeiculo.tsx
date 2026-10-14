import { Check, Copy, ExternalLink, ImageUp } from 'lucide-react'
import { Alert, Button, Drawer, EmptyState, StatusBadge } from '@betinhos/ui'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQueryPeriodo } from '../../../nav/queryState'
import { formatBR } from '../data/dates'
import { NAO_INFORMADO } from '../data/format'
import { CATEGORIA, label, VEICULO, VEICULO_STATUS } from '../data/schema'
import type { DataSource, LoadResult } from '../data/source'
import type { FrotaData, Kind } from '../data/types'
import { errorMessage } from '../data/xrm'
import { ultimos12Meses } from '../domain/indicadores'
import { motoristaAtual, possesAbertas, rotuloMotoristaAtual } from '../domain/motoristaAtual'
import { buildTimeline } from '../domain/timeline'
import { buildPromptImagem, faltasPrompt } from '../domain/promptImagem'
import { CustoTotal } from './CustoTotal'
import { FotoVeiculo, invalidarFoto } from './FotoVeiculo'
import { Preventivas } from './Preventivas'
import { useNotify } from './Toasts'

const TABELAS_TIMELINE: { key: 'manutencoes' | 'multas' | 'colisoes' | 'posses'; nome: string }[] = [
  { key: 'manutencoes', nome: 'Manutenções' }, { key: 'multas', nome: 'Multas' }, { key: 'colisoes', nome: 'Colisões' }, { key: 'posses', nome: 'Posses' },
]

const TIPOS_FOTO = ['image/png', 'image/jpeg', 'image/webp']

export function FichaVeiculo({ source, id, data, errors, today, secao = null, onClose, onOpen, onReload }: { source: DataSource; id: string; errors: LoadResult['errors']; data: FrotaData; today: string; secao?: 'preventivas' | null; onClose: () => void; onOpen: (kind: Kind, id: string) => void; onReload: () => void }) {
  const notify = useNotify()
  const padrao = useMemo(() => ultimos12Meses(today), [today])
  const [periodo, setPeriodo] = useQueryPeriodo('fde', 'fate', padrao)
  const veiculo = data.veiculos.find((item) => item.id === id)
  const timeline = useMemo(() => buildTimeline(id, data), [id, data])
  const motorista = useMemo(() => (veiculo ? rotuloMotoristaAtual(motoristaAtual(veiculo, possesAbertas(data.posses))) : null), [veiculo, data.posses])

  const [copiado, setCopiado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const faltas = veiculo ? faltasPrompt(veiculo) : []

  async function copiarPrompt() {
    if (!veiculo) return
    if (faltas.length > 0) { notify('error', `Preencha ${faltas.join(', ')} no cadastro antes de copiar o prompt.`); return }
    try {
      await navigator.clipboard.writeText(buildPromptImagem(veiculo))
      setCopiado(true)
      notify('success', 'Prompt copiado. Cole na ferramenta de imagem junto com uma foto real do carro.')
      window.setTimeout(() => setCopiado(false), 2600)
    } catch {
      notify('error', 'Não foi possível copiar o prompt neste navegador.')
    }
  }

  async function enviarFoto(file: File | undefined) {
    if (!file) return
    setEnviando(true)
    try {
      await source.enviarFotoVeiculo(id, file)
      invalidarFoto(source, id)
      notify('success', 'Foto principal salva no SharePoint.')
    } catch (reason) {
      notify('error', errorMessage(reason))
    } finally {
      setEnviando(false)
      if (arquivo.current) arquivo.current.value = ''
    }
  }

  // Igual ao Auto Prime: com a ficha aberta, Ctrl+V de uma imagem já envia a foto principal.
  const enviarRef = useRef(enviarFoto)
  enviarRef.current = enviarFoto
  useEffect(() => {
    if (!veiculo) return
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === 'file' && TIPOS_FOTO.includes(item.type))
        .map((item) => item.getAsFile())
        .find((item): item is File => Boolean(item))
      if (!file) return
      event.preventDefault()
      if (!enviando) void enviarRef.current(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [veiculo, enviando])

  const [arrastando, setArrastando] = useState(false)
  const soltarFoto = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setArrastando(false)
    const file = Array.from(event.dataTransfer.files).find((item) => TIPOS_FOTO.includes(item.type))
    if (!file) { notify('error', 'Use uma imagem PNG, JPG ou WEBP.'); return }
    if (!enviando) void enviarFoto(file)
  }

  async function abrirCadastro() {
    try {
      await source.openForm('veiculo', id)
    } catch (reason) {
      notify('error', errorMessage(reason))
      return
    }
    onReload()
  }

  // Aberta a partir de uma pendência de preventiva, a ficha já mostra a seção.
  const temVeiculo = Boolean(veiculo)
  useEffect(() => {
    if (secao === 'preventivas' && temVeiculo) document.getElementById(`${id}-preventivas`)?.scrollIntoView?.({ block: 'start' })
  }, [secao, id, temVeiculo])

  const erro = (nome: string, mensagem: string) => <Alert key={nome} tone="danger">Não foi possível carregar {nome}: {mensagem}</Alert>

  return (
    <Drawer
      open
      size="wide"
      onClose={onClose}
      eyebrow="Veículo"
      title={veiculo ? veiculo.placa || 'Sem placa' : 'Veículo não encontrado'}
      footer={<>
        <span className="frota-muted">Cadastro completo no formulário do Dataverse.</span>
        <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => void abrirCadastro()} disabled={!veiculo}>Abrir cadastro</Button>
      </>}
    >
      {errors.veiculos ? erro('Veículos', errors.veiculos) : !veiculo ? <EmptyState compact align="start" title="Este veículo não está na lista carregada">Recarregue a tela.</EmptyState> : (
        <div className="frota-drawer">
          <div className="frota-drawer__status"><StatusBadge tone={veiculo.status === VEICULO.ATIVO ? 'success' : veiculo.status === null ? 'warning' : 'neutral'}>{label(VEICULO_STATUS, veiculo.status, 'Sem status')}</StatusBadge></div>
          <div
            className="frota-foto-drop"
            data-ativo={arrastando || undefined}
            onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); setArrastando(true) } }}
            onDragLeave={() => setArrastando(false)}
            onDrop={soltarFoto}
          >
            <FotoVeiculo source={source} id={id} size="hero" alt={`Foto do veículo ${veiculo.placa}`} />
            {(arrastando || enviando) && <span className="frota-foto-drop__aviso" role="status">{enviando ? 'Enviando foto…' : 'Solte para trocar a foto principal'}</span>}
          </div>
          <p className="frota-muted frota-foto-dica">Cole uma imagem (Ctrl+V) ou arraste para cá para trocar a foto principal.</p>
          <div className="frota-cluster">
            <Button variant="secondary" icon={copiado ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copiarPrompt()} disabled={faltas.length > 0} title={faltas.length > 0 ? `Falta: ${faltas.join(', ')}` : 'Copia o prompt para gerar a foto padronizada'}>
              {copiado ? 'Prompt copiado' : 'Copiar prompt da imagem'}
            </Button>
            <Button variant="secondary" icon={<ImageUp size={16} />} loading={enviando} onClick={() => arquivo.current?.click()}>
              {enviando ? 'Enviando…' : 'Enviar foto principal'}
            </Button>
            <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void enviarFoto(event.target.files?.[0])} />
          </div>
          {faltas.length > 0 && <p className="frota-muted">Para copiar o prompt, falta: {faltas.join(', ')}.</p>}
          <section className="frota-group" aria-labelledby={`${id}-dados`}>
            <h3 id={`${id}-dados`} className="frota-group__title">Dados</h3>
            <dl className="frota-detail">
              <dt>Marca e modelo</dt><dd>{[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || NAO_INFORMADO}</dd>
              <dt>Ano do modelo</dt><dd>{veiculo.anoModelo ?? NAO_INFORMADO}</dd>
              <dt>Cor</dt><dd>{veiculo.cor || NAO_INFORMADO}</dd>
              <dt>Categoria</dt><dd>{label(CATEGORIA, veiculo.categoria)}</dd>
              <dt>Motorista atual</dt><dd>{motorista || 'Sem motorista'}</dd>
            </dl>
          </section>
          <section className="frota-group" aria-labelledby={`${id}-custo`}>
            <h3 id={`${id}-custo`} className="frota-group__title">Custo total</h3>
            <CustoTotal data={data} errors={errors} veiculoId={id} periodo={periodo} onPeriodo={setPeriodo} />
          </section>
          <section className="frota-group" id={`${id}-preventivas`} aria-labelledby={`${id}-prev-titulo`}>
            <h3 id={`${id}-prev-titulo`} className="frota-group__title">Preventivas</h3>
            <Preventivas data={data} veiculoId={id} today={today} source={source} errors={errors} onOpen={onOpen} onReload={onReload} />
          </section>
          <section className="frota-group" aria-labelledby={`${id}-linha`}>
            <h3 id={`${id}-linha`} className="frota-group__title">Linha do tempo</h3>
            {TABELAS_TIMELINE.filter((tabela) => errors[tabela.key]).map((tabela) => erro(tabela.nome, errors[tabela.key]!))}
            {timeline.length === 0 ? (TABELAS_TIMELINE.some((tabela) => errors[tabela.key]) ? null : <p className="frota-muted">Sem registros para este veículo.</p>) : (
              <ol className="frota-timeline">
                {timeline.map((item) => (
                  <li key={`${item.kind}-${item.id}`} data-atual={(item.kind === 'posse' && item.status === 'Atual') || undefined}>
                    {item.kind === 'posse' ? <strong>{item.titulo}</strong> : <button type="button" className="frota-link" onClick={() => onOpen(item.kind as Kind, item.id)}>{item.titulo || NAO_INFORMADO}</button>}
                    <span className="frota-muted">{[formatBR(item.dia), item.status, item.detalhe].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Drawer>
  )
}

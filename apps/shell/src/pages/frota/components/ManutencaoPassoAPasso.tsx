import { ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, ChoiceGroup, Field, Input, Radio, Select } from '@betinhos/ui'
import { abrirGavetaRegistro } from '../../../app/registroAberto'
import { diaSP, formatBR } from '../data/dates'
import { brl, NAO_INFORMADO } from '../data/format'
import { GRAU, PAGAMENTO_MANUT, label } from '../data/schema'
import type { DataSource, OpcaoBusca } from '../data/source'
import type { DetalheManutencao } from '../data/types'
import { CATEGORIAS_MANUT } from '../domain/manutencaoCatalogo'
import { avaliar, chavePasso, ETAPAS, lerAgendar, lerProgramar, textoDespesa, textoSaida, valoresAgendarIniciais, type Extra, type Situacao, type ValoresAgendar } from '../domain/manutencaoEtapas'
import { rotuloJanela } from '../domain/janela'
import { desfechoDaAcao, executarAcaoManutencao } from '../domain/transitions'
import { JanelaCampos } from './JanelaCampos'
import { useOpcoesBusca } from './useOpcoesBusca'

export type AbrirExtra = (extra: Extra) => void
type Props = {
  source: DataSource
  m: DetalheManutencao
  hoje: string
  /** Gravou um passo: a gaveta recarrega e avisa a lista. */
  onFeito: (mensagem: string) => void
  /** StaleError: a gaveta recarrega e decide (como hoje). */
  onDesatualizada: () => void
  /** Item do "⋯": a gaveta abre o formulário da exceção (Reagendar, Reprovar, Cancelar, Concluir, Corrigir classificação). */
  onExtra: AbrirExtra
  /** Foco no 1º campo do passo ao montar. A gaveta desliga ao voltar de uma exceção (o foco volta ao "Mais ações"). */
  autoFoco?: boolean
}

/** Grau por rádio, do mais urgente ao mais leve (valores de GRAU). */
const GRAUS = [...GRAU].sort((a, b) => b.value - a.value)
const texto = (valor: string | number | null | undefined) => (valor === null || valor === undefined || valor === '' ? NAO_INFORMADO : String(valor))
const linksDe = (valor: string | null) => (valor ?? '').split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l))

/** Fotos e nota como links do OneDrive (abrem em outra aba); ver D10 do plano 2. */
export function Arquivos({ titulo, links }: { titulo: string; links: string[] }) {
  if (!links.length) return <p className="frota-muted">{titulo}: nenhum arquivo.</p>
  return (
    <p className="frota-cluster frota-fotos">
      <span className="frota-muted">{titulo}:</span>
      {links.map((link, i) => (
        <a key={`${link}-${i}`} className="frota-link" href={link} target="_blank" rel="noopener noreferrer" aria-label={`${titulo}, arquivo ${i + 1} (abre em outra aba)`}>
          Arquivo {i + 1}<ExternalLink size={12} aria-hidden />
        </a>
      ))}
    </p>
  )
}

/** Guia da gaveta da manutenção: barra de três etapas e um passo por vez. */
export function ManutencaoPassoAPasso({ source, m, hoje, onFeito, onDesatualizada, onExtra, autoFoco = true }: Props) {
  const situacao = useMemo(() => avaliar(m, hoje), [m, hoje])
  return (
    <div className="frota-guia">
      <Barra situacao={situacao} />
      {/* A chave remonta o passo quando os dados de partida mudam (ex.: reagendou e continua em Programar). */}
      <Passo key={chavePasso(m)} source={source} m={m} hoje={hoje} situacao={situacao} onFeito={onFeito} onDesatualizada={onDesatualizada} onExtra={onExtra} autoFoco={autoFoco} />
    </div>
  )
}

function Barra({ situacao }: { situacao: Situacao }) {
  const parada = situacao.etapa === 'reprovada' || situacao.etapa === 'cancelada'
  return (
    <ol className="frota-etapas" aria-label="Etapas">
      {ETAPAS.map((e, i) => {
        const feita = situacao.atual === null || i < situacao.atual
        const atual = situacao.atual === i
        const parou = parada && atual
        return (
          <li key={e.chave} className="frota-etapas__item" data-feita={feita ? '' : undefined} data-parada={parou ? '' : undefined} aria-current={atual && !parada ? 'step' : undefined}>
            <b aria-hidden="true">{feita ? '✓' : i + 1}</b><span>{e.rotulo}</span>
            {feita ? <span className="frota-sr-only">, concluída</span> : parou ? <span className="frota-sr-only">, parou aqui</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

type PassoProps = Omit<Props, 'onExtra'> & { situacao: Situacao; onExtra: AbrirExtra }

function Passo({ source, m, hoje, situacao, onFeito, onDesatualizada, onExtra, autoFoco }: PassoProps) {
  if (situacao.passo === 'Agendar') return <PassoAgendar source={source} m={m} hoje={hoje} onFeito={onFeito} onDesatualizada={onDesatualizada} autoFoco={autoFoco} />
  if (situacao.passo === 'Programar') return <PassoProgramar source={source} m={m} onFeito={onFeito} onDesatualizada={onDesatualizada} onExtra={onExtra} autoFoco={autoFoco} />
  if (situacao.passo === 'AguardarConclusao') {
    const p = m.programacao
    return (
      <section className="frota-guia__passo" aria-labelledby={`${m.id}-passo`}>
        <h3 id={`${m.id}-passo`}>Aguardando o motorista concluir no App</h3>
        {p?.motorista && p.saida
          ? <Alert tone="info">{p.motorista.label} leva o carro em {textoSaida(p.saida)}, paga e conclui pelo App com a nota.</Alert>
          : <Alert tone="info">O motorista leva o carro, paga e conclui pelo App com a nota.</Alert>}
      </section>
    )
  }
  if (situacao.etapa === 'realizada') return <Realizada m={m} />
  if (situacao.etapa === 'reprovada' || situacao.etapa === 'cancelada') return <Alert tone="info">{situacao.feitos.at(-1) ?? (situacao.etapa === 'reprovada' ? 'Reprovada' : 'Cancelada')}</Alert>
  return null
}

/** Grava pelo caminho de sempre (relê o status antes, StaleError vira recarga) e devolve a mensagem de falha, se houver. */
export function useGravar(onDesatualizada: () => void) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Trava síncrona: o 2º clique antes do render (o botão ainda não está em loading) não grava nem mostra falha.
  const emCurso = useRef(false)
  const gravar = useCallback(async (executar: () => Promise<unknown>, sucesso: () => void) => {
    if (emCurso.current) return
    emCurso.current = true
    setSalvando(true)
    setErro(null)
    const desfecho = await desfechoDaAcao(executar)
    emCurso.current = false
    setSalvando(false)
    if (desfecho.tipo === 'feito') sucesso()
    else if (desfecho.tipo === 'desatualizada') onDesatualizada()
    else setErro(desfecho.mensagem)
  }, [onDesatualizada])
  return { salvando, erro, gravar }
}

function PassoAgendar({ source, m, hoje, onFeito, onDesatualizada, autoFoco }: Pick<Props, 'source' | 'm' | 'hoje' | 'onFeito' | 'onDesatualizada' | 'autoFoco'>) {
  const [valores, setValores] = useState<ValoresAgendar>(() => valoresAgendarIniciais(m, hoje))
  const [tentou, setTentou] = useState(false)
  const { salvando, erro, gravar } = useGravar(onDesatualizada)
  const primeiro = useRef<HTMLDivElement>(null)
  useEffect(() => { if (autoFoco) primeiro.current?.querySelector<HTMLInputElement>('input')?.focus() }, [m.id, autoFoco])
  const leitura = lerAgendar(valores, hoje)
  const erros = tentou ? leitura.erros : {}

  function agendar() {
    setTentou(true)
    const pedido = leitura.pedido
    if (!pedido) return
    void gravar(
      () => executarAcaoManutencao(source, m, 'encaixar', () => source.agendarManutencao({ manutencaoId: m.id, ...pedido })),
      () => onFeito(`Manutenção agendada: ${rotuloJanela({ inicio: pedido.inicio, fim: pedido.fim })}.`),
    )
  }

  return (
    <section className="frota-guia__passo" aria-labelledby={`${m.id}-passo`}>
      <h3 id={`${m.id}-passo`}>Quando vai ser?</h3>
      <div ref={primeiro}>
        <ChoiceGroup label="Grau" inline error={erros.grau}>
          {GRAUS.map((g) => <Radio key={g.value} name={`${m.id}-grau`} label={g.label} disabled={salvando} checked={valores.grau === g.value} onChange={() => setValores((v) => ({ ...v, grau: g.value }))} />)}
        </ChoiceGroup>
      </div>
      <JanelaCampos valores={valores} erros={erros} hoje={hoje} disabled={salvando} onChange={(janela) => setValores((v) => ({ ...v, ...janela }))} />
      {erro && <Alert tone="danger" title="Não foi possível gravar">{erro}</Alert>}
      <div className="frota-cluster"><Button variant="primary" loading={salvando} onClick={agendar}>Agendar</Button></div>
    </section>
  )
}

function PassoProgramar({ source, m, onFeito, onDesatualizada, onExtra, autoFoco }: Pick<Props, 'source' | 'm' | 'onFeito' | 'onDesatualizada' | 'onExtra' | 'autoFoco'>) {
  const p = m.programacao
  const [motorista, setMotorista] = useState<OpcaoBusca | null>(p?.motorista ? { id: p.motorista.id, nome: p.motorista.label } : null)
  const [saida, setSaida] = useState(m.janelaInicio ? `${m.janelaInicio}T08:00` : '')
  const [tentou, setTentou] = useState(false)
  const { salvando, erro, gravar } = useGravar(onDesatualizada)
  const pessoas = useOpcoesBusca(useCallback((t: string) => source.buscarFuncionarios(t), [source]), motorista)
  const campo = useRef<HTMLDivElement>(null)
  useEffect(() => { if (autoFoco) campo.current?.querySelector<HTMLElement>('[role="combobox"], input')?.focus() }, [m.id, autoFoco])
  const leitura = lerProgramar({ motoristaId: motorista?.id ?? null, saida }, m)
  const erros = tentou ? leitura.erros : {}
  const janela = m.janelaInicio && m.janelaFim ? rotuloJanela({ inicio: m.janelaInicio, fim: m.janelaFim }) : null

  function programar() {
    setTentou(true)
    if (!p || !motorista || !leitura.saidaIso) return
    const saidaIso = leitura.saidaIso
    void gravar(
      () => executarAcaoManutencao(source, m, 'programar', () => source.programarManutencao({ manutencaoId: m.id, geralId: p.geralId, motoristaId: motorista.id, saida: saidaIso })),
      () => onFeito(`Manutenção programada: ${motorista.nome}, saída ${textoSaida(saidaIso)}.`),
    )
  }

  return (
    <section className="frota-guia__passo" aria-labelledby={`${m.id}-passo`}>
      <h3 id={`${m.id}-passo`}>Quem leva e quando sai?</h3>
      {p === undefined ? (
        <Alert tone="warning">Não foi possível ler a programação. Feche e abra a gaveta de novo.</Alert>
      ) : p === null ? (
        <>
          <Alert tone="warning">Esta manutenção não tem linha na Geral; reagende para criar.</Alert>
          <div className="frota-cluster"><Button variant="secondary" onClick={() => onExtra('reagendar')}>Reagendar</Button></div>
        </>
      ) : (
        <>
          <div className="frota-fields" ref={campo}>
            <Field label="Motorista" required error={erros.motorista} disabled={salvando}>
              <Select options={pessoas.opcoes} searchable clearable placeholder="Digite o nome" loading={pessoas.carregando} onSearchChange={pessoas.onSearch} value={motorista?.id ?? null}
                onChange={(v) => setMotorista(pessoas.lista.find((o) => o.id === v) ?? null)} />
            </Field>
            <Field label="Saída" required error={erros.saida} disabled={salvando}>
              <Input type="datetime-local" value={saida} onChange={(e: { target: { value: string } }) => setSaida(e.target.value)} />
            </Field>
          </div>
          {leitura.foraDaJanela && janela && <Alert tone="warning">A saída fica fora da janela ({janela}). Grava assim mesmo.</Alert>}
          {erro && <Alert tone="danger" title="Não foi possível gravar">{erro}</Alert>}
          <div className="frota-cluster"><Button variant="primary" loading={salvando} onClick={programar}>Programar</Button></div>
        </>
      )}
    </section>
  )
}

function Realizada({ m }: { m: DetalheManutencao }) {
  const servicos = m.categorias.map((c) => label(CATEGORIAS_MANUT, c)).join(', ')
  const d = m.despesa
  return (
    <section className="frota-guia__passo" aria-labelledby={`${m.id}-passo`}>
      <h3 id={`${m.id}-passo`}>Realizada</h3>
      <dl className="frota-detail">
        {[
          ['Serviços', texto(servicos)], ['Km', m.kmRealizado !== null ? `${m.kmRealizado.toLocaleString('pt-BR')} km` : NAO_INFORMADO],
          ['Data', formatBR(diaSP(m.dataManutencao)) || NAO_INFORMADO], ['Valor', brl(m.valor)], ['Pagamento', label(PAGAMENTO_MANUT, m.pagamento)],
          ['Estabelecimento', texto(m.estabelecimento)], ['Quem realizou', texto(m.realizadoPor?.label)],
        ].map(([nome, valor]) => (<div key={nome} className="frota-detail__row"><dt>{nome}</dt><dd>{valor}</dd></div>))}
        <div className="frota-detail__row">
          <dt>Despesa</dt>
          <dd>
            {d === undefined ? 'Não foi possível ler a despesa' : d === null ? 'Sem despesa ligada' : (
              <span className="frota-cluster">
                <span>{textoDespesa(d)}</span>
                <button type="button" className="frota-link" onClick={() => abrirGavetaRegistro('cr40f_despesaoperacional', d.id)}>abrir despesa</button>
              </span>
            )}
          </dd>
        </div>
      </dl>
      <Arquivos titulo="Nota fiscal" links={linksDe(m.linkNotaFiscal)} />
      <Arquivos titulo="Fotos da manutenção" links={m.fotosFinais} />
    </section>
  )
}

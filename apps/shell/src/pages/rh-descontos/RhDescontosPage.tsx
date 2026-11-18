import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, EmptyState, SegmentedControl, Surface, useShellHeader } from '@betinhos/ui'
import { Check, ChevronLeft, ChevronRight, Download, HandCoins, TriangleAlert } from 'lucide-react'
import type { Host } from '../../host'
import { baixarXlsx } from '../../lib/xlsx'
import { BrandLoader } from '../../app/BrandLoader'
import { horaSP, todaySP } from '../frota/data/dates'
import { createFrotaSource } from '../frota/data/hostSource'
import type { ParcelaFolha } from '../frota/data/types'
import { ApiError, errorMessage, mensagemDaAcao } from '../frota/data/xrm'
import { formatMoney } from '../geral/domain/format'
import { FaixaMeses } from './components/FaixaMeses'
import { FitaFechamento } from './components/FitaFechamento'
import { Holerite } from './components/Holerite'
import { LinhaDoTempo } from './components/LinhaDoTempo'
import { PassosFolha, type Passo } from './components/PassosFolha'
import { cadeias, mesDe, mesPorExtenso, nomeArquivo, planilhaDoMes, porColaborador, resumo, somaMes, totaisPorMes } from './domain/descontos'
import './rh-descontos.css'

const MESES_FAIXA = 7
type Vista = 'holerites' | 'tempo'
type Atrasadas = { quantidade: number; maisAntigo: string | null }

const abrirMulta = (id: string) => { window.location.hash = `#/frota-multas?registro=multa:${id}` }

/**
 * Descontos em folha (RH): conferir as parcelas de multa por colaborador e por mês, marcar o que foi lançado
 * na folha e enviar o Excel à contabilidade. A faixa e a janela carregada vão do mês da folha -2 ao +4.
 */
export function RhDescontosPage({ host }: { host: Host }) {
  useShellHeader({ title: 'Descontos em folha' })
  const { source, error } = useMemo(() => {
    try { return { source: createFrotaSource(host), error: null } } catch (reason) { return { source: null, error: errorMessage(reason) } }
  }, [host])
  const [mesAtual] = useState(() => todaySP().slice(0, 7))
  const [mes, setMes] = useState(mesAtual)
  const [inicio, setInicio] = useState(() => somaMes(mesAtual, -2))
  const [passo, setPasso] = useState<Passo>('conferir')
  const [vista, setVista] = useState<Vista>('holerites')
  const [dados, setDados] = useState<{ parcelas: ParcelaFolha[]; atrasadas: Atrasadas } | null>(null)
  const [falha, setFalha] = useState<unknown>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [ativoId, setAtivoId] = useState('')
  const [erros, setErros] = useState<Map<string, string>>(new Map())
  const [ocupado, setOcupado] = useState(false)
  const [retorno, setRetorno] = useState('')
  const [excel, setExcel] = useState<Record<string, string>>({})
  const token = useRef(0)

  const meses = useMemo(() => Array.from({ length: MESES_FAIXA }, (_, i) => somaMes(inicio, i)), [inicio])

  const carregar = useCallback(async () => {
    if (!source) return
    const mine = ++token.current
    try {
      const [parcelas, atrasadas] = await Promise.all([source.listarDescontosPeriodo(inicio, somaMes(inicio, MESES_FAIXA - 1)), source.previstasAntes(mesAtual)])
      if (mine === token.current) { setDados({ parcelas, atrasadas }); setFalha(null) }
    } catch (reason) {
      if (mine === token.current) setFalha(reason)
    }
  }, [source, inicio, mesAtual])
  useEffect(() => { void carregar() }, [carregar])

  const irParaMes = (m: string) => {
    setMes(m)
    setMarcados(new Set())
    setInicio((atual) => (m >= atual && m <= somaMes(atual, MESES_FAIXA - 1) ? atual : somaMes(m, -2)))
  }
  const deslocar = (n: number) => irParaMes(somaMes(mes, n))

  const todas = useMemo(() => dados?.parcelas ?? [], [dados])
  const doMes = useMemo(() => todas.filter((p) => mesDe(p) === mes), [todas, mes])
  const grupos = useMemo(() => porColaborador(doMes), [doMes])
  const gruposTodos = useMemo(() => porColaborador(todas), [todas])
  const totais = useMemo(() => totaisPorMes(todas, mesAtual), [todas, mesAtual])
  const correntes = useMemo(() => cadeias(todas), [todas])
  const totaisMeses = useMemo(() => new Map([...totais].map(([m, t]) => [m, t.lancado + t.aLancar + t.atrasada])), [totais])
  const r = resumo(doMes)
  const tm = totais.get(mes) ?? { lancado: 0, aLancar: 0, atrasada: 0 }
  const atrasadas = mes === mesAtual && dados && dados.atrasadas.quantidade > 0 ? dados.atrasadas : null

  const executar = async (ids: string[], acao: 'lancar' | 'desfazer') => {
    if (!source || !ids.length) return
    setOcupado(true)
    setRetorno('')
    setErros((prev) => { const n = new Map(prev); ids.forEach((id) => n.delete(id)); return n })
    const marcar = (lista: [string, string][]) => setErros((prev) => new Map([...prev, ...lista]))
    try {
      const resultado = await source.lancarDescontoFolha(ids, acao)
      marcar(resultado.parcelas.filter((x) => !x.ok).map((x) => [x.id, x.erro ?? 'Não foi possível concluir.']))
      const feitos = new Set(resultado.parcelas.filter((x) => x.ok).map((x) => x.id))
      const valor = todas.filter((p) => feitos.has(p.id)).reduce((t, p) => t + p.valor, 0)
      if (feitos.size) setRetorno(`${feitos.size} ${feitos.size === 1 ? 'parcela' : 'parcelas'} · ${formatMoney(valor)} ${acao === 'lancar' ? (feitos.size === 1 ? 'lançada' : 'lançadas') : (feitos.size === 1 ? 'voltou a prevista' : 'voltaram a previstas')}.`)
    } catch (reason) {
      const msg = mensagemDaAcao(reason, acao === 'lancar' ? 'Não foi possível lançar. Tente de novo.' : 'Não foi possível desfazer. Tente de novo.')
      marcar(ids.map((id) => [id, msg]))
    }
    setMarcados(new Set())
    await carregar()
    setOcupado(false)
  }
  const idsDos = (colaboradores: string[], status: ParcelaFolha['status']) => grupos.filter((g) => colaboradores.includes(g.id)).flatMap((g) => g.parcelas.filter((p) => p.status === status).map((p) => p.id))
  const alternarMarca = (id: string) => setMarcados((prev) => { const n = new Set(prev); if (!n.delete(id)) n.add(id); return n })

  const baixar = () => {
    baixarXlsx(nomeArquivo(mes), planilhaDoMes(doMes, mes))
    setExcel((prev) => ({ ...prev, [mes]: horaSP(new Date().toISOString()) }))
  }

  const concluidos: Passo[] = [...(doMes.length && r.previstas === 0 ? ['lancar' as const] : []), ...(excel[mes] ? ['enviar' as const] : [])]
  const semAcesso = falha instanceof ApiError && falha.status === 403
  const nomeMes = mesPorExtenso(mes)

  if (error) return <div className="page rh-descontos"><Alert tone="danger" title="Não foi possível abrir os descontos em folha">{error}. Abra o Sistema Betinhos pelo Dataverse.</Alert></div>

  let corpo
  if (falha && !dados) corpo = <Alert tone="danger" title={semAcesso ? 'Sem acesso' : 'Não foi possível carregar os descontos'} action={semAcesso ? undefined : <Button variant="secondary" size="compact" onClick={() => void carregar()}>Tentar de novo</Button>}>{semAcesso ? 'Você não tem acesso aos descontos em folha.' : errorMessage(falha)}</Alert>
  else if (!dados) corpo = <BrandLoader label="Carregando os descontos" variant="inline" size="md" />
  else if (!doMes.length) corpo = <EmptyState icon={<HandCoins size={36} />} title={`Nenhum desconto para ${nomeMes}.`}>Escolha outro mês na faixa acima.</EmptyState>
  else corpo = (
    <>
      <PassosFolha passo={passo} concluidos={concluidos} onChange={setPasso} />
      {passo === 'conferir' ? (
        <>
          <Surface className="rh-resumo">
            <div>
              <span className="rh-rotulo">Total do mês</span>
              <p className="rh-resumo__total">{formatMoney(r.total)}</p>
              <p className="rh-muted">{r.colaboradores} {r.colaboradores === 1 ? 'motorista' : 'motoristas'} · {doMes.length} {doMes.length === 1 ? 'parcela' : 'parcelas'}</p>
            </div>
            <div className="rh-resumo__progresso">
              <div className="rh-barra" role="img" aria-label={`Lançado ${formatMoney(tm.lancado)} de ${formatMoney(r.total)}`}>
                <span className="rh-barra__lancado" style={{ width: `${r.total ? (tm.lancado / r.total) * 100 : 0}%` }} />
              </div>
              <p className="rh-legenda"><span data-tipo="lancado">Lançado {formatMoney(tm.lancado)}</span><span data-tipo="alancar">A lançar {formatMoney(r.total - tm.lancado)}</span></p>
            </div>
            {atrasadas?.maisAntigo ? (
              <div className="rh-aviso">
                <TriangleAlert size={18} aria-hidden="true" />
                <span>{atrasadas.quantidade} {atrasadas.quantidade === 1 ? 'parcela de meses anteriores ainda prevista' : 'parcelas de meses anteriores ainda previstas'}</span>
                <Button variant="secondary" size="compact" onClick={() => irParaMes(atrasadas.maisAntigo!)}>{`Ver ${mesPorExtenso(atrasadas.maisAntigo)}`}</Button>
              </div>
            ) : null}
          </Surface>
          <SegmentedControl<Vista> aria-label="Modo de exibição" value={vista} onChange={setVista} options={[{ value: 'holerites', label: 'Holerites' }, { value: 'tempo', label: 'Linha do tempo' }]} />
          {vista === 'holerites'
            ? <div className="rh-holerites">{grupos.map((g) => <Holerite key={g.id} grupo={g} cadeias={correntes} erros={erros} onAbrirMulta={abrirMulta} />)}</div>
            : <LinhaDoTempo grupos={gruposTodos} meses={meses} mes={mes} mesAtual={mesAtual} totais={totaisMeses} onMes={irParaMes} onAbrirMulta={abrirMulta} />}
        </>
      ) : null}
      {passo === 'lancar' ? <p className="rh-retorno" role="status">{retorno}</p> : null}
      {passo === 'lancar' ? (
        <FitaFechamento grupos={grupos} todas={todas} mes={mes} mesAtual={mesAtual} marcados={marcados} ativoId={ativoId} erros={erros} ocupado={ocupado}
          onMarcar={alternarMarca} onAtivo={setAtivoId} onLancar={(c) => void executar(idsDos(c, 'prevista'), 'lancar')} onDesfazer={(c) => void executar(idsDos([c], 'descontada'), 'desfazer')} onAbrirMulta={abrirMulta} />
      ) : null}
      {passo === 'enviar' ? (
        <Surface className="rh-enviar">
          <h3>Enviar à contabilidade</h3>
          <p className="rh-resumo__total">{formatMoney(r.total)}</p>
          <p className="rh-muted">{r.colaboradores} {r.colaboradores === 1 ? 'motorista' : 'motoristas'} · {doMes.length} {doMes.length === 1 ? 'parcela' : 'parcelas'} · {r.lancadas} {r.lancadas === 1 ? 'lançada' : 'lançadas'}</p>
          {r.previstas ? <Alert tone="warning" title={`Ainda há ${r.previstas} ${r.previstas === 1 ? 'parcela' : 'parcelas'} a lançar`}>O Excel leva todas as parcelas do mês, inclusive as previstas.</Alert> : null}
          <div className="rh-enviar__acoes">
            <Button variant="primary" icon={<Download size={18} />} onClick={baixar}>Baixar Excel</Button>
            {excel[mes] ? <span className="rh-ok"><Check size={16} aria-hidden="true" /> Excel baixado às {excel[mes]}</span> : null}
          </div>
        </Surface>
      ) : null}
    </>
  )

  return (
    <div className="page rh-descontos">
      <header className="rh-topo">
        <div>
          <span className="rh-rotulo">RH · Descontos em folha</span>
          <h2>{`Folha de ${nomeMes}`}</h2>
        </div>
        <div className="rh-topo__nav">
          <Button variant="secondary" icon={<ChevronLeft size={18} />} aria-label="Mês anterior" onClick={() => deslocar(-1)} />
          <Button variant="secondary" icon={<ChevronRight size={18} />} aria-label="Próximo mês" onClick={() => deslocar(1)} />
          <Button variant="secondary" onClick={() => irParaMes(mesAtual)} disabled={mes === mesAtual}>Hoje</Button>
        </div>
      </header>
      <FaixaMeses meses={meses} mes={mes} totais={totais} onChange={irParaMes} />
      {corpo}
    </div>
  )
}

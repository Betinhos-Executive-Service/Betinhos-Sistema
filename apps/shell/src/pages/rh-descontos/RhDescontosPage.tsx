import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, EmptyState, StatusBadge, Surface, useShellHeader } from '@betinhos/ui'
import { Check, ChevronLeft, ChevronRight, Download, HandCoins, TriangleAlert, Undo2 } from 'lucide-react'
import type { Host } from '../../host'
import { baixarXlsx } from '../../lib/xlsx'
import { BrandLoader } from '../../app/BrandLoader'
import { horaSP, todaySP } from '../frota/data/dates'
import { createFrotaSource } from '../frota/data/hostSource'
import type { ParcelaFolha } from '../frota/data/types'
import { ApiError, errorMessage, mensagemDaAcao } from '../frota/data/xrm'
import { formatMoney } from '../geral/domain/format'
import { DetalheParcela } from './components/DetalheParcela'
import { cadeias, chaveOrigem, estadoParcela, mesDe, mesPorExtenso, motivoTexto, nomeArquivo, SEM_COLABORADOR, planilhaDoMes, porColaborador, situacaoTexto, somaMes, somaValores } from './domain/descontos'
import './rh-descontos.css'

/** Meses carregados antes e depois do escolhido, para a corrente de cada parcelamento no detalhe. */
const JANELA = 3
type Atrasadas = { quantidade: number; maisAntigo: string | null }
const VAZIO: ParcelaFolha[] = []
const RETORNO = {
  lancar: ['marcada como lançada', 'marcadas como lançadas'],
  desfazer: ['voltou para a lançar', 'voltaram para a lançar'],
} as const
const FALHA = { lancar: 'Não foi possível marcar como lançado. Tente de novo.', desfazer: 'Não foi possível desfazer. Tente de novo.' }

const abrirMulta = (id: string) => { window.location.hash = `#/frota-multas?registro=multa:${id}` }
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const alternado = (prev: Set<string>, id: string) => { const n = new Set(prev); if (!n.delete(id)) n.add(id); return n }
const contarMotoristas = (l: ParcelaFolha[]) => new Set(l.map((p) => p.colaborador?.id ?? '')).size

function Situacao({ p, mesAtual }: { p: ParcelaFolha; mesAtual: string }) {
  switch (estadoParcela(p, mesAtual)) {
    case 'lancada': return <StatusBadge tone="success" icon={<Check size={12} />}>{situacaoTexto(p)}</StatusBadge>
    case 'cancelada': return <StatusBadge>Cancelada</StatusBadge>
    case 'atrasada': return <StatusBadge tone="danger">Atrasada</StatusBadge>
    case 'futura': return <StatusBadge tone="warning">A lançar</StatusBadge>
  }
}

/**
 * Descontos em folha (RH): uma tabela com as parcelas de multa do mês. O RH lança cada valor no sistema da
 * folha, marca a linha como lançada e baixa o Excel para a contabilidade.
 */
export function RhDescontosPage({ host }: { host: Host }) {
  useShellHeader({ title: 'Descontos em folha' })
  const { source, error } = useMemo(() => {
    try { return { source: createFrotaSource(host), error: null } } catch (reason) { return { source: null, error: errorMessage(reason) } }
  }, [host])
  const [mesAtual] = useState(() => todaySP().slice(0, 7))
  const [mes, setMes] = useState(mesAtual)
  const [dados, setDados] = useState<{ parcelas: ParcelaFolha[]; atrasadas: Atrasadas; inicio: string; fim: string } | null>(null)
  const [falha, setFalha] = useState<unknown>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [erros, setErros] = useState<Map<string, string>>(new Map())
  const [ocupado, setOcupado] = useState(false)
  const [retorno, setRetorno] = useState('')
  const [excel, setExcel] = useState<Record<string, string>>({})
  const token = useRef(0)

  const carregar = useCallback(async () => {
    if (!source) return
    const mine = ++token.current
    const inicio = somaMes(mes, -JANELA), fim = somaMes(mes, JANELA)
    try {
      const [parcelas, atrasadas] = await Promise.all([source.listarDescontosPeriodo(inicio, fim), source.previstasAntes(mesAtual)])
      if (mine === token.current) { setDados({ parcelas, atrasadas, inicio, fim }); setFalha(null) }
    } catch (reason) {
      if (mine === token.current) setFalha(reason)
    }
  }, [source, mes, mesAtual])
  useEffect(() => { void carregar() }, [carregar])

  const irParaMes = (m: string) => {
    setMes(m)
    setSelecionados(new Set())
    setAbertos(new Set())
    setRetorno('')
  }

  // Dados de outra janela (ex.: salto para "Mês atual") não valem para o mês escolhido: mostra o carregando.
  const vigente = dados && mes >= dados.inicio && mes <= dados.fim ? dados : null
  const todas = vigente?.parcelas ?? VAZIO
  const correntes = useMemo(() => cadeias(todas), [todas])
  const linhas = useMemo(() => porColaborador(todas.filter((p) => mesDe(p) === mes)).flatMap((g) => g.parcelas), [todas, mes])
  const aLancar = linhas.filter((p) => p.status === 'prevista')
  const escolhidas = aLancar.filter((p) => selecionados.has(p.id))
  const todasMarcadas = aLancar.length > 0 && escolhidas.length === aLancar.length
  const atrasadas = mes === mesAtual && vigente?.atrasadas.quantidade ? vigente.atrasadas : null
  const maisAntigo = atrasadas?.maisAntigo

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
      const valor = somaValores(todas.filter((p) => feitos.has(p.id)))
      if (feitos.size) setRetorno(`${plural(feitos.size, 'parcela', 'parcelas')} · ${formatMoney(valor)} ${RETORNO[acao][feitos.size === 1 ? 0 : 1]}.`)
      // O Excel já baixado ficou desatualizado: a tarefa 2 volta a pedir o download.
      if (feitos.size) setExcel((prev) => { const n = { ...prev }; delete n[mes]; return n })
    } catch (reason) {
      const msg = mensagemDaAcao(reason, FALHA[acao])
      marcar(ids.map((id) => [id, msg]))
    }
    setSelecionados((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })
    await carregar()
    setOcupado(false)
  }

  const baixar = () => {
    baixarXlsx(nomeArquivo(mes), planilhaDoMes(linhas, mes))
    setExcel((prev) => ({ ...prev, [mes]: horaSP(new Date().toISOString()) }))
  }

  const semAcesso = falha instanceof ApiError && falha.status === 403
  const nomeMes = mesPorExtenso(mes)

  if (error) return <div className="page rh-descontos"><Alert tone="danger" title="Não foi possível abrir os descontos em folha">{error}. Abra o Sistema Betinhos pelo Dataverse.</Alert></div>

  let corpo
  if (falha && !vigente) corpo = <Alert tone="danger" title={semAcesso ? 'Sem acesso' : 'Não foi possível carregar os descontos'} action={semAcesso ? undefined : <Button variant="secondary" size="compact" onClick={() => void carregar()}>Tentar de novo</Button>}>{semAcesso ? 'Você não tem acesso aos descontos em folha.' : errorMessage(falha)}</Alert>
  else if (!vigente) corpo = <BrandLoader label="Carregando os descontos" variant="inline" size="md" />
  else if (!linhas.length) corpo = <EmptyState icon={<HandCoins size={36} />} title={`Nenhum desconto para ${nomeMes}.`}>Use as setas acima para ver outro mês.</EmptyState>
  else corpo = (
    <>
      <div className="rh-tarefas">
        <Surface className="rh-tarefa" data-feito={!aLancar.length || undefined}>
          <span className="rh-tarefa__num" aria-hidden="true">{aLancar.length ? '1' : <Check size={16} />}</span>
          <div className="rh-tarefa__texto">
            <h3>Lançar no sistema da folha</h3>
            {aLancar.length
              ? <p>Faltam <strong>{contarMotoristas(aLancar)} de {plural(contarMotoristas(linhas), 'motorista', 'motoristas')}</strong> · <strong className="rh-mono">{formatMoney(somaValores(aLancar))}</strong></p>
              : <p>Tudo lançado.</p>}
            <small>Lance o valor no sistema da folha e marque a linha como lançada abaixo.</small>
          </div>
        </Surface>
        <Surface className="rh-tarefa" data-feito={!!excel[mes] || undefined}>
          <span className="rh-tarefa__num" aria-hidden="true">{excel[mes] ? <Check size={16} /> : '2'}</span>
          <div className="rh-tarefa__texto">
            <h3>Enviar Excel à contabilidade</h3>
            <p>{excel[mes] ? `Excel baixado às ${excel[mes]}.` : `Planilha com ${plural(linhas.length, 'parcela', 'parcelas')} do mês.`}</p>
            {aLancar.length ? <small>O Excel sai com a situação de cada parcela, inclusive as que faltam lançar.</small> : null}
          </div>
          <Button variant={aLancar.length ? 'secondary' : 'primary'} icon={<Download size={18} />} onClick={baixar}>Baixar Excel</Button>
        </Surface>
      </div>

      <Surface className="rh-lista">
        <table className="rh-tabela" aria-label={`Descontos de ${nomeMes}`}>
          <thead>
            <tr>
              <th scope="col" className="rh-col-sel">
                <Checkbox label={<span className="rh-sr">Selecionar todas a lançar</span>} checked={todasMarcadas} disabled={!aLancar.length || ocupado}
                  onChange={() => setSelecionados(todasMarcadas ? new Set() : new Set(aLancar.map((p) => p.id)))} />
              </th>
              <th scope="col">Motorista</th>
              <th scope="col">Motivo</th>
              <th scope="col">Situação</th>
              <th scope="col" className="rh-col-valor">Descontar</th>
              <th scope="col"><span className="rh-sr">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p) => {
              const aberto = abertos.has(p.id)
              const nome = p.colaborador?.nome ?? SEM_COLABORADOR.nome
              const motivo = motivoTexto(p)
              return (
                <Fragment key={p.id}>
                  <tr className="rh-linha" data-aberto={aberto || undefined}>
                    <td className="rh-col-sel">
                      {p.status === 'prevista'
                        ? <Checkbox label={<span className="rh-sr">{`Selecionar ${nome}, ${motivo}`}</span>} checked={selecionados.has(p.id)} disabled={ocupado} onChange={() => setSelecionados((prev) => alternado(prev, p.id))} />
                        : null}
                    </td>
                    <td className="rh-col-nome">
                      <button type="button" className="rh-expandir" aria-expanded={aberto} aria-controls={aberto ? `rh-detalhe-${p.id}` : undefined} aria-label={`${nome}, ${motivo}`} onClick={() => setAbertos((prev) => alternado(prev, p.id))}>
                        <ChevronRight size={16} aria-hidden="true" />
                        <span>{nome}</span>
                      </button>
                    </td>
                    <td className="rh-col-motivo">
                      {motivo}
                      {erros.get(p.id) ? <p className="rh-erro" role="alert">{erros.get(p.id)}</p> : null}
                    </td>
                    <td className="rh-col-situacao"><Situacao p={p} mesAtual={mesAtual} /></td>
                    <td className="rh-col-valor rh-mono">{formatMoney(p.valor)}</td>
                    <td className="rh-col-acao">
                      {p.status === 'prevista' ? <Button variant="secondary" size="compact" disabled={ocupado} onClick={() => void executar([p.id], 'lancar')}>Marcar lançado</Button> : null}
                      {p.status === 'descontada' ? <Button variant="ghost" size="compact" icon={<Undo2 size={14} />} disabled={ocupado} onClick={() => void executar([p.id], 'desfazer')}>Desfazer</Button> : null}
                    </td>
                  </tr>
                  {aberto ? (
                    <tr className="rh-detalhe" id={`rh-detalhe-${p.id}`}>
                      <td colSpan={6}><DetalheParcela p={p} corrente={correntes.get(chaveOrigem(p)) ?? [p]} mes={mes} mesAtual={mesAtual} onAbrirMulta={abrirMulta} /></td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        <footer className="rh-rodape">
          <p className="rh-retorno" role="status">{retorno}</p>
          {escolhidas.length ? <span className="rh-rodape__sel">{`${plural(escolhidas.length, 'selecionada', 'selecionadas')} · ${formatMoney(somaValores(escolhidas))}`}</span> : null}
          <span className="rh-rodape__total">Total do mês <strong className="rh-mono">{formatMoney(somaValores(linhas))}</strong></span>
          {escolhidas.length ? (
            <Button variant="primary" disabled={ocupado} loading={ocupado} onClick={() => void executar(escolhidas.map((p) => p.id), 'lancar')}>
              {escolhidas.length === 1 ? 'Marcar a selecionada como lançada' : `Marcar as ${escolhidas.length} como lançadas`}
            </Button>
          ) : null}
        </footer>
      </Surface>
    </>
  )

  return (
    <div className="page rh-descontos">
      <header className="rh-topo">
        <div>
          <span className="rh-rotulo">RH · Descontos em folha</span>
          <h2>{`Descontos de ${nomeMes}`}</h2>
        </div>
        <nav className="rh-mes" aria-label="Mês da folha">
          <Button variant="secondary" icon={<ChevronLeft size={18} />} aria-label="Mês anterior" disabled={ocupado} onClick={() => irParaMes(somaMes(mes, -1))} />
          <span className="rh-mes__nome">{nomeMes}</span>
          <Button variant="secondary" icon={<ChevronRight size={18} />} aria-label="Próximo mês" disabled={ocupado} onClick={() => irParaMes(somaMes(mes, 1))} />
          {mes !== mesAtual ? <Button variant="ghost" disabled={ocupado} onClick={() => irParaMes(mesAtual)}>Mês atual</Button> : null}
        </nav>
      </header>
      {atrasadas && maisAntigo ? (
        <div className="rh-aviso" role="note">
          <TriangleAlert size={18} aria-hidden="true" />
          <span>{`${plural(atrasadas.quantidade, 'desconto', 'descontos')} de meses anteriores ainda não ${atrasadas.quantidade === 1 ? 'foi lançado' : 'foram lançados'}, desde ${mesPorExtenso(maisAntigo)}.`}</span>
          <Button variant="secondary" size="compact" onClick={() => irParaMes(maisAntigo)}>{`Ver ${mesPorExtenso(maisAntigo)}`}</Button>
        </div>
      ) : null}
      {corpo}
    </div>
  )
}

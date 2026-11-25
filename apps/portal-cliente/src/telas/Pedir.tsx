import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Alert, Button, Field, Input, PageHeader, Select, Textarea, useToast } from '@betinhos/ui'
import { ArrowDownUp, ArrowLeft, ArrowRight, Bus, CalendarDays, Car, Check, ClipboardCheck, FileText, Flag, Info, MapPin, Pencil, Route, RotateCcw, Send, ShieldCheck, TriangleAlert, UserPlus, Users, Van, X, type LucideIcon } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { ErroPortal } from '../api/PortalApi'
import {
  MAX_EMAIL, MAX_ENDERECO, MAX_NOME, MAX_PASSAGEIROS, MAX_TELEFONE, MAX_TEXTO, TIPOS_VEICULO,
  capacidadeVeiculo, erroPassageiro, errosPassageiros, normalizarPedido, rotuloVeiculo, validarPedido, type ErrosPedido,
} from '../domain/pedidos'
import { atalhosDeData, diaSemanaDataHora } from '../domain/formato'
import { deLocalSaoPaulo, paraLocalSaoPaulo } from '../domain/regras'
import type { NovoPedido, PassageiroPedido, Pedido } from '../domain/types'
import { EnderecoCampo } from './EnderecoCampo'
import './Pedir.css'

const GENERICO = 'Não foi possível enviar o pedido agora. Seus dados continuam aqui; tente de novo em instantes.'

/** Duplicado e erro de campo vindo do servidor têm texto próprio; o resto é o aviso genérico. */
function mensagemDoErro(err: unknown): string {
  if (!(err instanceof ErroPortal)) return GENERICO
  if (err.codigo === 'duplicado') return 'Este pedido já foi enviado há menos de um minuto. Confira em Meus serviços antes de pedir de novo.'
  return err.codigo === 'nao_permitido' && err.message !== err.codigo ? err.message : GENERICO
}

type Passo = 1 | 2 | 3
const PASSOS: { n: Passo; nome: string; icone: LucideIcon }[] = [
  { n: 1, nome: 'Quem viaja', icone: Users },
  { n: 2, nome: 'Trajeto e horário', icone: Route },
  { n: 3, nome: 'Conferir e enviar', icone: ClipboardCheck },
]
const ICONE_VEICULO: Record<string, LucideIcon> = { 202410001: Car, 202410002: ShieldCheck, 100000002: Bus, 202410003: Van, 202410004: ShieldCheck }

/** Cartão em edição: `indice` null = passageiro novo; `id` guarda o cadastrado cujo contato está sendo completado. */
type Rascunho = { indice: number | null; id?: string; nome: string; telefone: string; email: string }

const contatoDe = (p: PassageiroPedido) => [p.telefone, p.email].filter(Boolean).join(' · ')
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

type Props = { onPedido: () => void; modelo?: Pedido | null; onRepetirAnterior?: () => void }

export function Pedir({ onPedido, modelo, onRepetirAnterior }: Props) {
  const api = useApi()
  const toast = useToast()
  const [passo, setPasso] = useState<Passo>(1)
  const [passageiros, setPassageiros] = useState<PassageiroPedido[]>(() => (modelo?.pessoas ?? []).map((p) => ({ ...p })))
  const [origem, setOrigem] = useState(modelo?.origem ?? '')
  const [destino, setDestino] = useState(modelo?.destino ?? '')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  // Até o cliente escolher, o veículo acompanha o nº de passageiros: o primeiro tipo em que todos cabem.
  const [veiculoEscolhido, setVeiculo] = useState<string | undefined>(modelo?.tipoVeiculo ? String(modelo.tipoVeiculo) : undefined)
  const veiculo = veiculoEscolhido ?? String((TIPOS_VEICULO.find((t) => (capacidadeVeiculo(t.valor) ?? 0) >= passageiros.length) ?? TIPOS_VEICULO[0]).valor)
  const [observacao, setObservacao] = useState(modelo?.observacao ?? '')
  const [erros, setErros] = useState<ErrosPedido>({})
  const [errosPas, setErrosPas] = useState<(string | undefined)[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erroRascunho, setErroRascunho] = useState<string | undefined>()
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const corpo = useRef<HTMLDivElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const passoAnterior = useRef(passo)
  const nomeNovo = useRef<HTMLInputElement>(null)
  const celularNovo = useRef<HTMLInputElement>(null)
  const idRota = useId()
  // Cada inversão gira o botão meia volta e anima a troca dos endereços.
  const [giros, setGiros] = useState(0)
  const [trocando, setTrocando] = useState(false)
  useEffect(() => {
    if (!trocando) return
    const t = window.setTimeout(() => setTrocando(false), 400)
    return () => window.clearTimeout(t)
  }, [trocando, giros])

  // Troca de passo: topo da tela e foco no título (menos na primeira exibição, inclusive no duplo efeito do StrictMode).
  useEffect(() => {
    if (passoAnterior.current === passo) return
    passoAnterior.current = passo
    titulo.current?.scrollIntoView({ block: 'start' })
    titulo.current?.focus({ preventScroll: true })
  }, [passo])
  const cartaoAberto = rascunho !== null
  // Cadastrado (nome só leitura): o foco vai ao celular, que é o que falta completar.
  const nomeTravado = !!rascunho?.id
  useEffect(() => { if (cartaoAberto) (nomeTravado ? celularNovo : nomeNovo).current?.focus() }, [cartaoAberto, nomeTravado])

  // Busca remota de passageiros do cliente, com espera de 250 ms entre teclas.
  const [achados, setAchados] = useState<PassageiroPedido[]>([])
  const [buscando, setBuscando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const seq = useRef(0)
  function buscar(q: string) {
    clearTimeout(timer.current)
    const n = ++seq.current
    setBuscando(true)
    timer.current = setTimeout(() => {
      api.buscarPassageiros(q.trim()).then(
        (r) => { if (n === seq.current) { setAchados(r); setBuscando(false) } },
        () => { if (n === seq.current) { setAchados([]); setBuscando(false) } },
      )
    }, q.trim() ? 250 : 0)
  }
  useEffect(() => { buscar(''); return () => clearTimeout(timer.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Endereços já usados em pedidos anteriores, para sugerir.
  const [enderecos, setEnderecos] = useState<string[]>([])
  useEffect(() => {
    let vivo = true
    api.meusServicos().then((ps) => {
      if (!vivo) return
      const vistos = new Map<string, string>()
      for (const p of ps) for (const e of [p.origem, p.destino]) if (e && !vistos.has(e.toLowerCase())) vistos.set(e.toLowerCase(), e)
      setEnderecos([...vistos.values()].slice(0, 30))
    }, () => {})
    return () => { vivo = false }
  }, [api])

  const opcoes = useMemo(
    () => achados.filter((a) => !passageiros.some((p) => p.id && p.id === a.id)).map((a) => ({ value: a.id ?? '', label: a.nome, subtitle: contatoDe(a) || 'Sem contato' })),
    [achados, passageiros],
  )

  // Erro do cartão marca o campo certo: nome (vazio, longo, repetido) ou contato; o resto só mostra o aviso.
  const erroNoNome = !!erroRascunho && /nome|já está/i.test(erroRascunho)
  const erroNoContato = !!erroRascunho && /celular|e-mail/i.test(erroRascunho)

  const limpar = (campo: keyof ErrosPedido) => setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e))

  // ---- passageiros ----
  const abrirNovo = (nome = '') => { setErroRascunho(undefined); setRascunho({ indice: null, nome, telefone: '', email: '' }) }
  const abrirEdicao = (i: number) => {
    const p = passageiros[i]
    setErroRascunho(undefined)
    setRascunho({ indice: i, id: p.id, nome: p.nome, telefone: p.telefone ?? '', email: p.email ?? '' })
  }
  const mudarRascunho = (campo: 'nome' | 'telefone' | 'email', valor: string) => setRascunho((r) => (r ? { ...r, [campo]: valor } : r))
  const removerPassageiro = (i: number) => {
    setPassageiros((xs) => xs.filter((_, j) => j !== i))
    setErrosPas([])
    limpar('passageiros')
    // O cartão aberto aponta para um índice: remover antes dele desloca a lista.
    if (rascunho?.indice === i) setRascunho(null)
    else if (rascunho && rascunho.indice !== null && rascunho.indice > i) setRascunho({ ...rascunho, indice: rascunho.indice - 1 })
  }
  function escolher(id: string | null) {
    const a = achados.find((x) => x.id === id)
    if (!a || passageiros.length >= MAX_PASSAGEIROS) return
    const novo: PassageiroPedido = { ...a }
    // Sem contato válido: o cliente completa no cartão.
    if (erroPassageiro(novo)) {
      setErroRascunho(undefined)
      setRascunho({ indice: null, id: a.id, nome: a.nome, telefone: a.telefone ?? '', email: a.email ?? '' })
      return
    }
    setPassageiros((xs) => [...xs, novo])
    limpar('passageiros')
  }
  function salvarRascunho() {
    if (!rascunho) return
    const novo: PassageiroPedido = {
      ...(rascunho.id ? { id: rascunho.id } : {}),
      nome: rascunho.nome.trim(),
      telefone: rascunho.telefone.trim() || undefined,
      email: rascunho.email.trim() || undefined,
    }
    const lista = rascunho.indice === null ? [...passageiros, novo] : passageiros.map((p, i) => (i === rascunho.indice ? novo : p))
    const alvo = rascunho.indice === null ? lista.length - 1 : rascunho.indice
    const msg = errosPassageiros(lista)[alvo]
    if (msg) {
      setErroRascunho(msg)
      setTimeout(() => corpo.current?.querySelector<HTMLElement>('.pc-pp__novo [aria-invalid="true"], .pc-pp__novo [role=alert]')?.focus())
      return
    }
    setPassageiros(lista)
    setRascunho(null)
    setErroRascunho(undefined)
    setErrosPas([])
    limpar('passageiros')
  }

  function montar(): NovoPedido {
    return normalizarPedido({ passageiros, origem, destino, saida: data && hora ? deLocalSaoPaulo(`${data}T${hora}`) : '', tipoVeiculo: Number(veiculo), observacao })
  }

  /** Foca o primeiro campo inválido (ou o aviso, se o erro não tem campo) depois de pintar os erros. */
  function focarErro() {
    setTimeout(() => {
      const alvo = corpo.current?.querySelector<HTMLElement>('[aria-invalid="true"], .pc-pp__erro-foco, [role=alert]')
      alvo?.scrollIntoView({ block: 'center' })
      alvo?.focus({ preventScroll: true })
    })
  }

  /** Valida só o passo `n`; devolve se pode seguir. */
  function validarPasso(n: Passo): boolean {
    setErro(null)
    if (n === 1) {
      if (rascunho) {
        const vazio = !rascunho.nome.trim() && !rascunho.telefone.trim() && !rascunho.email.trim()
        if (!vazio) { setErroRascunho('Adicione o passageiro ou cancele o cadastro.'); focarErro(); return false }
        setRascunho(null)
      }
      const porPas = errosPassageiros(passageiros)
      const semNinguem = passageiros.length === 0
      setErrosPas(porPas)
      setErros((e) => ({ ...e, passageiros: semNinguem ? 'Informe pelo menos um passageiro.' : undefined }))
      if (semNinguem || porPas.some(Boolean)) { focarErro(); return false }
      return true
    }
    if (n === 2) {
      const { passageiros: _ignorado, ...so2 } = validarPedido(montar(), Date.now())
      // Substitui os erros do passo 2 (campo corrigido some); o de passageiros é do passo 1.
      setErros((e) => ({ passageiros: e.passageiros, ...so2 }))
      if (Object.values(so2).some(Boolean)) { focarErro(); return false }
    }
    return true
  }

  const escolherVeiculo = (v: string) => { setVeiculo(v); limpar('tipoVeiculo') }
  const ir = (n: Passo) => { setErro(null); setPasso(n) }
  const continuar = () => { if (validarPasso(passo)) ir((passo + 1) as Passo) }

  async function enviar() {
    const pedido = montar()
    const todos = validarPedido(pedido, Date.now())
    if (Object.keys(todos).length) {
      // A hora pode ter vencido enquanto o cliente conferia.
      setErros(todos)
      ir(todos.passageiros ? 1 : 2)
      focarErro()
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      const criado = await api.pedir(pedido)
      toast({ tone: 'success', message: `Pedido ${criado.numero} enviado. A Betinhos vai programar e você acompanha por aqui.` })
      onPedido()
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setEnviando(false)
    }
  }

  const hoje = paraLocalSaoPaulo(Date.now()).slice(0, 10)
  const atual = PASSOS[passo - 1]
  const pedido = passo === 3 ? montar() : null
  const nomes = passageiros.map((p) => p.nome.trim()).filter(Boolean)
  // Endereço só entra no resumo depois de 3 letras (o texto ainda vale para o pedido).
  const resumoEnd = (v: string) => (v.trim().length >= 3 ? v.trim() : '')
  const quando = data && hora ? diaSemanaDataHora(deLocalSaoPaulo(`${data}T${hora}`)) : ''

  return (
    <main className="pc-conteudo pc-pp-pagina">
      <div className={`pc-pp${passo === 3 ? ' pc-pp--conferir' : ''}`}>
        <div className="pc-pp__cab">
          <PageHeader title="Pedir serviço" />
          <p className="pc-pp__sub">Leva menos de um minuto. A gente cuida do resto.</p>
          <p className="pc-pp__sr">Passo {passo} de 3 · {atual.nome}</p>
          <nav className="pc-pp__passos" aria-label="Etapas do pedido">
            <ol>
              {PASSOS.map((st) => {
                const feito = st.n < passo
                const conteudo = (<><span className="pc-pp__bolinha" aria-hidden>{feito ? <Check size={14} strokeWidth={3} /> : st.n}</span><span className="pc-pp__rotulo">{st.nome}</span></>)
                return (
                  <li key={st.n} className={`pc-pp__passo${feito ? ' pc-pp__passo--feito' : ''}`} aria-current={st.n === passo ? 'step' : undefined}>
                    {feito
                      ? <button type="button" className="pc-pp__passo-botao" onClick={() => ir(st.n)} aria-label={`Voltar para o passo ${st.n}: ${st.nome}`}>{conteudo}</button>
                      : <span className="pc-pp__passo-botao">{conteudo}</span>}
                  </li>
                )
              })}
            </ol>
          </nav>
        </div>

        <div ref={corpo} className="pc-pp__card">
          <h2 ref={titulo} tabIndex={-1} className="pc-pp__titulo">{passo === 1 ? 'Quem vai viajar?' : atual.nome}</h2>

          {passo === 1 && (
            <div className="pc-pp__corpo">
              <p className="pc-pp__apoio">Escolha quem já viajou com a Betinhos ou cadastre alguém novo.</p>
              {erros.passageiros && !errosPas.some(Boolean) && <Alert tone="danger"><span className="pc-pp__erro-foco" tabIndex={-1}>{erros.passageiros}</span></Alert>}

              {rascunho ? (
                <div className="pc-pp__novo" role="group" aria-label={rascunho.indice === null ? 'Novo passageiro' : 'Corrigir passageiro'}>
                  <div className="pc-pp__novo-campos">
                    <Field label="Nome">
                      <Input ref={nomeNovo} value={rascunho.nome} onChange={(e) => mudarRascunho('nome', e.target.value)} autoComplete="off" placeholder="Nome completo" size="touch" maxLength={MAX_NOME} readOnly={nomeTravado} invalid={erroNoNome} />
                    </Field>
                    <Field label="Celular">
                      <Input ref={celularNovo} type="tel" inputMode="tel" value={rascunho.telefone} onChange={(e) => mudarRascunho('telefone', e.target.value)} autoComplete="off" placeholder="(11) 90000-0000" size="touch" maxLength={MAX_TELEFONE} invalid={erroNoContato} />
                    </Field>
                    <Field label="E-mail">
                      <Input type="email" value={rascunho.email} onChange={(e) => mudarRascunho('email', e.target.value)} autoComplete="off" placeholder="nome@empresa.com" size="touch" maxLength={MAX_EMAIL} invalid={erroNoContato} />
                    </Field>
                  </div>
                  <p className="pc-pp__dica">Informe celular ou e-mail. Se o contato mudou, corrija aqui.</p>
                  {erroRascunho && <p className="pc-pp__erro" role="alert" tabIndex={-1}>{erroRascunho}</p>}
                  <div className="pc-pp__novo-acoes">
                    <Button type="button" variant="secondary" size="compact" onClick={() => { setRascunho(null); setErroRascunho(undefined) }}>Cancelar</Button>
                    <Button type="button" size="compact" onClick={salvarRascunho}>{rascunho.indice === null ? 'Adicionar passageiro' : 'Salvar contato'}</Button>
                  </div>
                </div>
              ) : passageiros.length < MAX_PASSAGEIROS ? (
                <div className="pc-pp__achar">
                  <div className="pc-pp__busca">
                    <Field label="Buscar passageiro cadastrado">
                      <Select value={null} onChange={escolher} options={opcoes} loading={buscando} onSearchChange={buscar} placeholder="Digite o nome" searchPlaceholder="Buscar por nome" emptyText="Ninguém com esse nome" onCreate={(nome) => abrirNovo(nome)} />
                    </Field>
                    <span className="pc-pp__ou" aria-hidden>ou</span>
                    <Button type="button" variant="secondary" size="touch" onClick={() => abrirNovo()} icon={<UserPlus size={16} aria-hidden />}>Cadastrar novo</Button>
                </div>
                </div>
              ) : (
                <p className="pc-pp__dica">Máximo de {MAX_PASSAGEIROS} passageiros por pedido. Para mais gente, faça outro pedido.</p>
              )}

              {passageiros.length > 0 && (
              <section aria-labelledby="pc-pp-lista-titulo">
                <div className="pc-pp__lista-cab">
                  <h3 id="pc-pp-lista-titulo" className="pc-pp__lista-titulo">Neste pedido</h3>
                  <span className="pc-pp__contador">{passageiros.length} de {MAX_PASSAGEIROS}</span>
                </div>
                  <ul className="pc-pp__chips" aria-label="Passageiros do pedido">
                    {passageiros.map((p, i) => (
                      <li key={p.id ?? `novo-${i}`} className="pc-pp__chip-item">
                        <div className={`pc-pp__chip${errosPas[i] ? ' pc-pp__chip--erro' : ''}`}>
                          <span className="pc-pp__avatar" aria-hidden>{iniciais(p.nome)}</span>
                          <span className="pc-pp__chip-texto">
                            <span className="pc-pp__chip-nome">{p.nome || 'Sem nome'}</span>
                            <span className="pc-pp__chip-contato">{contatoDe(p) || 'Sem contato'}</span>
                          </span>
                          <button type="button" className="pc-pp__icone" aria-label={`Corrigir contato de ${p.nome || `passageiro ${i + 1}`}`} onClick={() => abrirEdicao(i)} disabled={cartaoAberto}><Pencil size={14} aria-hidden /></button>
                          <button type="button" className="pc-pp__icone" aria-label={`Remover ${p.nome || `passageiro ${i + 1}`}`} onClick={() => removerPassageiro(i)}><X size={16} aria-hidden /></button>
                        </div>
                        {errosPas[i] && <p className="pc-pp__erro" role="alert" tabIndex={-1}>{errosPas[i]}</p>}
                      </li>
                    ))}
                  </ul>
              </section>
              )}

              {onRepetirAnterior && !rascunho && (
                <button type="button" className="pc-pp__repetir" onClick={onRepetirAnterior}>
                  <span className="pc-pp__repetir-icone" aria-hidden><RotateCcw size={16} /></span>
                  <span className="pc-pp__repetir-texto"><strong>Repetir um pedido anterior</strong>Mesmos passageiros e trajeto de um pedido antigo.</span>
                  <ArrowRight size={16} aria-hidden />
                </button>
              )}
            </div>
          )}

          {passo === 2 && (
            <div className="pc-pp__corpo pc-pp__corpo--trajeto">
              <p className="pc-pp__recap">
                <span><b>Passageiros:</b> {nomes.join(', ') || 'nenhum'}</span>
                <button type="button" className="pc-pp__link" onClick={() => ir(1)} aria-label="Alterar passageiros">Alterar</button>
              </p>

              <Bloco icone={Route} titulo="Trajeto">
                <div
                  className={['pc-pp__rota', origem.trim() && 'pc-pp__rota--origem', destino.trim() && 'pc-pp__rota--destino', trocando && 'pc-pp__rota--trocando'].filter(Boolean).join(' ')}
                  style={{ '--giro': giros } as CSSProperties}
                >
                  <div className="pc-pp__trilho" aria-hidden><span className="pc-pp__ponto" /><span className="pc-pp__linha" /><span className="pc-pp__quadrado" /></div>
                  <div className="pc-pp__rota-campos">
                    <div className="pc-pp__rota-linha">
                      <label htmlFor={`${idRota}-o`}>Saída</label>
                      <EnderecoCampo id={`${idRota}-o`} value={origem} onChange={(v) => { setOrigem(v); limpar('origem') }} recentes={enderecos} placeholder="Endereço, empresa ou aeroporto" invalid={!!erros.origem} describedBy={erros.origem ? `${idRota}-oe` : undefined} />
                      {erros.origem && <p className="pc-pp__erro" id={`${idRota}-oe`} role="alert">{erros.origem}</p>}
                    </div>
                    <div className="pc-pp__rota-linha">
                      <label htmlFor={`${idRota}-d`}>Destino</label>
                      <EnderecoCampo id={`${idRota}-d`} value={destino} onChange={(v) => { setDestino(v); limpar('destino') }} recentes={enderecos} placeholder="Endereço, empresa ou aeroporto" invalid={!!erros.destino} describedBy={erros.destino ? `${idRota}-de` : undefined} />
                      {erros.destino && <p className="pc-pp__erro" id={`${idRota}-de`} role="alert">{erros.destino}</p>}
                    </div>
                  </div>
                  <button type="button" className="pc-pp__inverter" aria-label="Inverter saída e destino" onClick={() => { setOrigem(destino); setDestino(origem); limpar('origem'); limpar('destino'); setGiros((g) => g + 1); setTrocando(true) }}><ArrowDownUp size={16} aria-hidden /></button>
                </div>
              </Bloco>

              <Bloco
                icone={CalendarDays}
                titulo="Quando"
                acao={
                  <div className="pc-pp__atalhos" role="group" aria-label="Atalhos de data">
                    {atalhosDeData(hoje).map((a) => (
                      <button key={a.valor} type="button" className="pc-pp__atalho" aria-pressed={data === a.valor} onClick={() => { setData(a.valor); limpar('saida') }}>{a.rotulo}</button>
                    ))}
                  </div>
                }
              >
                <div className="pc-pp__quando">
                  <Field label="Data">
                    <Input type="date" value={data} min={hoje} onChange={(e) => { setData(e.target.value); limpar('saida') }} size="touch" invalid={!!erros.saida} />
                  </Field>
                  <Field label="Hora (Brasília)">
                    <Input type="time" value={hora} onChange={(e) => { setHora(e.target.value); limpar('saida') }} size="touch" invalid={!!erros.saida} />
                  </Field>
                </div>
                {erros.saida && <p className="pc-pp__erro" role="alert" tabIndex={-1}>{erros.saida}</p>}
              </Bloco>

              <Bloco icone={Car} titulo="Veículo" dica="É uma preferência; a Betinhos confirma o veículo.">
                <fieldset className="pc-pp__veiculos">
                  <legend className="pc-pp__sr">Veículo</legend>
                  <div className="pc-pp__grade">
                    {TIPOS_VEICULO.map((t) => {
                      const cap = capacidadeVeiculo(t.valor)
                      const naoCabe = cap !== undefined && passageiros.length > cap
                      return <OpcaoVeiculo key={t.valor} valor={String(t.valor)} nome={t.rotulo} detalhe={cap ? `até ${cap} pax` : ''} aviso={naoCabe ? `Não cabe ${passageiros.length} pessoas` : undefined} marcado={veiculo === String(t.valor)} onEscolher={escolherVeiculo} />
                    })}
                  </div>
                  {erros.tipoVeiculo && <p className="pc-pp__erro" role="alert" tabIndex={-1}>{erros.tipoVeiculo}</p>}
                </fieldset>
              </Bloco>

              <Bloco icone={FileText} titulo="Observação" dica="opcional">
                <Textarea aria-label="Observação" rows={3} value={observacao} onChange={(e) => { setObservacao(e.target.value); limpar('observacao') }} maxLength={MAX_TEXTO} invalid={!!erros.observacao} placeholder="Voo, bagagem, parada, centro de custo" />
                {erros.observacao && <p className="pc-pp__erro" role="alert">{erros.observacao}</p>}
              </Bloco>
            </div>
          )}

          {passo === 3 && pedido && (
            <div className="pc-pp__corpo">
              <dl className="pc-pp__resumo">
                <Secao icone={Users} nome="Passageiros" onAlterar={() => ir(1)}>
                  {pedido.passageiros.map((x) => (
                    <span key={x.id ?? x.nome} className="pc-pp__linha-resumo">{x.nome}{contatoDe(x) && <small> · {contatoDe(x)}</small>}</span>
                  ))}
                </Secao>
                <Secao icone={Route} nome="Trajeto" onAlterar={() => ir(2)}>
                  <span className="pc-pp__linha-resumo"><small>Saída</small> {pedido.origem}</span>
                  <span className="pc-pp__linha-resumo"><small>Destino</small> {pedido.destino}</span>
                </Secao>
                <Secao icone={CalendarDays} nome="Quando" onAlterar={() => ir(2)}>
                  <span className="pc-pp__linha-resumo">{diaSemanaDataHora(pedido.saida)} <small>· Brasília</small></span>
                </Secao>
                <Secao icone={Car} nome="Veículo" onAlterar={() => ir(2)}>
                  <span className="pc-pp__linha-resumo">{rotuloVeiculo(pedido.tipoVeiculo)}</span>
                </Secao>
                <Secao icone={FileText} nome="Observação" onAlterar={() => ir(2)}>
                  <span className="pc-pp__linha-resumo">{pedido.observacao ?? <small>Sem observação</small>}</span>
                </Secao>
              </dl>
              <p className="pc-pp__dica">A Betinhos confirma, programa o motorista e o voucher aparece em Meus serviços.</p>
              {erro && <Alert tone="danger">{erro}</Alert>}
            </div>
          )}

          <div className="pc-pp__rodape">
            {passo === 1 && passageiros.length === 0 && <span className="pc-pp__rodape-dica">Escolha ao menos 1 passageiro para continuar.</span>}
            {passo > 1 && <Button type="button" variant="secondary" size="touch" className="pc-pp__voltar" onClick={() => ir((passo - 1) as Passo)} icon={<ArrowLeft size={18} aria-hidden />}>Voltar</Button>}
            {passo < 3
              ? <Button type="button" size="touch" className={`pc-pp__prox${passo === 1 && passageiros.length === 0 ? ' pc-pp__prox--espera' : ''}`} onClick={continuar}>{passo === 1 ? 'Continuar para o trajeto' : 'Continuar para conferir'} <ArrowRight className="pc-pp__prox-seta" size={18} aria-hidden /></Button>
              : <Button type="button" size="touch" className="pc-pp__prox" loading={enviando} onClick={enviar} icon={<Send size={18} aria-hidden />}>Enviar pedido</Button>}
          </div>
        </div>

        {passo < 3 && (
          <aside className="pc-pp__lateral" aria-label="Seu pedido">
            <h2>Seu pedido</h2>
            <div className="pc-pp__progresso">
              <div className="pc-pp__trilha" role="progressbar" aria-label="Etapa do pedido" aria-valuemin={1} aria-valuemax={3} aria-valuenow={passo}>{PASSOS.map((st) => <span key={st.n} className={st.n <= passo ? 'pc-pp__trilha--feita' : undefined} />)}</div>
              <span>Passo {passo} de 3</span>
            </div>
            <dl>
              <ItemPedido icone={Users} nome="Passageiros" valor={nomes.join(', ')} />
              <ItemPedido icone={MapPin} nome="Saída" valor={resumoEnd(origem)} />
              <ItemPedido icone={Flag} nome="Destino" valor={resumoEnd(destino)} destaque />
              <ItemPedido icone={CalendarDays} nome="Quando" valor={quando} />
              <ItemPedido icone={Car} nome="Veículo" valor={rotuloVeiculo(Number(veiculo)) ?? ''} />
              <ItemPedido icone={FileText} nome="Observação" valor={observacao.trim()} />
            </dl>
            <p className="pc-pp__aviso"><Info size={16} aria-hidden /> Confirmamos por e-mail e o voucher aparece em Meus serviços.</p>
          </aside>
        )}
      </div>
    </main>
  )
}

function ItemPedido({ icone: Icone, nome, valor, destaque }: { icone: LucideIcon; nome: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`pc-pp__item${destaque ? ' pc-pp__item--destaque' : ''}`}>
      <span className="pc-pp__item-icone" aria-hidden><Icone size={15} /></span>
      <div>
        <dt>{nome}</dt>
        <dd className={valor ? undefined : 'pc-pp__item--vazio'}>{valor || '—'}</dd>
      </div>
    </div>
  )
}

/** Bloco de formulário: mesmo cabeçalho (ícone, título, dica) em todos os passos. Sem aria-labelledby, para não duplicar rótulos dos campos. */
function Bloco({ icone: Icone, titulo, dica, acao, children }: { icone: LucideIcon; titulo: string; dica?: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="pc-pp__bloco">
      <div className="pc-pp__bloco-cab">
        <span className="pc-pp__bloco-icone" aria-hidden><Icone size={16} /></span>
        <h3 className="pc-pp__bloco-titulo">{titulo}</h3>
        {dica && <span className="pc-pp__bloco-dica">{dica}</span>}
        {acao && <div className="pc-pp__bloco-acao">{acao}</div>}
      </div>
      {children}
    </section>
  )
}

function Secao({ icone: Icone, nome, onAlterar, children }: { icone: LucideIcon; nome: string; onAlterar: () => void; children: ReactNode }) {
  return (
    <div className="pc-pp__bloco pc-pp__secao">
      <div className="pc-pp__bloco-cab">
        <span className="pc-pp__bloco-icone" aria-hidden><Icone size={16} /></span>
        <dt className="pc-pp__bloco-titulo">{nome}</dt>
        <button type="button" className="pc-pp__link pc-pp__bloco-acao" onClick={onAlterar} aria-label={`Alterar ${nome.toLowerCase()}`}>Alterar</button>
      </div>
      <dd>{children}</dd>
    </div>
  )
}

/** Cartão de rádio: o input nativo fica escondido mas focável, então setas e espaço funcionam como num radio comum. */
function OpcaoVeiculo({ valor, nome, detalhe, aviso, marcado, onEscolher }: { valor: string; nome: string; detalhe: string; aviso?: string; marcado: boolean; onEscolher: (v: string) => void }) {
  const Icone = ICONE_VEICULO[valor] ?? Car
  return (
    <label className="pc-pp__veiculo">
      <input type="radio" name="pc-veiculo" value={valor} checked={marcado} onChange={() => onEscolher(valor)} />
      <span className="pc-pp__veiculo-corpo">
        <span className="pc-pp__veiculo-icone" aria-hidden><Icone size={18} /></span>
        <span className="pc-pp__veiculo-texto">
          <span className="pc-pp__veiculo-nome">{nome}</span>
          {detalhe && <span className="pc-pp__veiculo-det">{detalhe}</span>}
          {aviso && <span className="pc-pp__veiculo-aviso"><TriangleAlert size={12} aria-hidden /> {aviso}</span>}
        </span>
        <span className="pc-pp__veiculo-check" aria-hidden><Check size={12} strokeWidth={3} /></span>
      </span>
    </label>
  )
}

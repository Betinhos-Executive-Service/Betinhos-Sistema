import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Alert, Button, Field, Input, PageHeader, Select, Textarea, useToast } from '@betinhos/ui'
import { ArrowLeft, ClipboardCheck, Send, UserPlus, X } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { ErroPortal } from '../api/PortalApi'
import {
  MAX_EMAIL, MAX_ENDERECO, MAX_NOME, MAX_PASSAGEIROS, MAX_TELEFONE, MAX_TEXTO, TIPOS_VEICULO,
  errosPassageiros, normalizarPedido, rotuloVeiculo, validarPedido, type ErrosPedido,
} from '../domain/pedidos'
import { dataHora } from '../domain/formato'
import { deLocalSaoPaulo, paraLocalSaoPaulo } from '../domain/regras'
import type { NovoPedido, PassageiroPedido, Pedido } from '../domain/types'
import './Pedir.css'

const GENERICO = 'Não foi possível enviar o pedido agora. Seus dados continuam aqui; tente de novo em instantes.'

/** Duplicado e erro de campo vindo do servidor têm texto próprio; o resto é o aviso genérico. */
function mensagemDoErro(err: unknown): string {
  if (!(err instanceof ErroPortal)) return GENERICO
  if (err.codigo === 'duplicado') return 'Este pedido já foi enviado há menos de um minuto. Confira em Meus serviços antes de pedir de novo.'
  return err.codigo === 'nao_permitido' && err.message !== err.codigo ? err.message : GENERICO
}

const SEM_PREFERENCIA = 'auto'

type Props = { onPedido: () => void; modelo?: Pedido | null }

export function Pedir({ onPedido, modelo }: Props) {
  const api = useApi()
  const toast = useToast()
  const [passageiros, setPassageiros] = useState<PassageiroPedido[]>(() => (modelo?.pessoas ?? []).map((p) => ({ ...p })))
  const [origem, setOrigem] = useState(modelo?.origem ?? '')
  const [destino, setDestino] = useState(modelo?.destino ?? '')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const [veiculo, setVeiculo] = useState<string>(modelo?.tipoVeiculo ? String(modelo.tipoVeiculo) : SEM_PREFERENCIA)
  const [observacao, setObservacao] = useState(modelo?.observacao ?? '')
  const [erros, setErros] = useState<ErrosPedido>({})
  const [errosPas, setErrosPas] = useState<(string | undefined)[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [revisando, setRevisando] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const focarNovo = useRef(false)

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
    () => achados.filter((a) => !passageiros.some((p) => p.id && p.id === a.id)).map((a) => ({ value: a.id ?? '', label: a.nome, subtitle: [a.telefone, a.email].filter(Boolean).join(' · ') || 'Sem contato' })),
    [achados, passageiros],
  )

  const mudar = (i: number, campo: 'nome' | 'telefone' | 'email', valor: string) =>
    setPassageiros((xs) => xs.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))
  const adicionarNovo = (nome = '') => setPassageiros((xs) => (xs.length < MAX_PASSAGEIROS ? [...xs, { nome }] : xs))
  // O botão acrescenta um cartão vazio: leva o foco ao nome dele.
  useEffect(() => {
    if (!focarNovo.current) return
    focarNovo.current = false
    const cartoes = form.current?.querySelectorAll('[role=group][aria-label^="Passageiro"]')
    cartoes?.[cartoes.length - 1]?.querySelector('input')?.focus()
  }, [passageiros.length])
  const escolher = (id: string | null) => {
    const a = achados.find((x) => x.id === id)
    if (a) setPassageiros((xs) => (xs.length < MAX_PASSAGEIROS ? [...xs, { ...a }] : xs))
  }

  function montar(): NovoPedido {
    const preferencia = veiculo === SEM_PREFERENCIA ? undefined : Number(veiculo)
    return normalizarPedido({ passageiros, origem, destino, saida: data && hora ? deLocalSaoPaulo(`${data}T${hora}`) : '', tipoVeiculo: preferencia, observacao })
  }

  function revisar(e: FormEvent) {
    e.preventDefault()
    const pedido = montar()
    const novos = validarPedido(pedido, Date.now())
    // Mesmo aparo do normalizarPedido, mas sem descartar cartão vazio: ele pede o nome em vez de sumir.
    const porPas = errosPassageiros(passageiros.map((p) => ({ ...p, nome: p.nome.trim(), telefone: p.telefone?.trim(), email: p.email?.trim() })))
    setErros(novos)
    setErrosPas(porPas)
    setErro(null)
    if (Object.keys(novos).length || porPas.some(Boolean)) {
      // Depois de pintar os erros, leva o foco ao primeiro campo inválido (ou o aviso, se o erro não tem campo).
      setTimeout(() => {
        const alvo = form.current?.querySelector<HTMLElement>('[aria-invalid="true"], .pc-pedir__erro, [role=alert]')
        alvo?.scrollIntoView({ block: 'center' })
        alvo?.focus({ preventScroll: true })
      })
      return
    }
    setRevisando(true)
  }

  async function enviar() {
    setEnviando(true)
    setErro(null)
    try {
      const criado = await api.pedir(montar())
      toast({ tone: 'success', message: `Pedido ${criado.numero} enviado. A Betinhos vai programar e você acompanha por aqui.` })
      onPedido()
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setEnviando(false)
    }
  }

  const hoje = paraLocalSaoPaulo(Date.now()).slice(0, 10)

  if (revisando) {
    const p = montar()
    return (
      <main className="pc-conteudo">
        <PageHeader title="Revisar pedido" description="Confira antes de enviar. A Betinhos confirma e programa o motorista." />
        <div className="pc-pedir__form">
          <dl className="pc-pedir__resumo">
            <div><dt>Passageiros</dt><dd>{p.passageiros.map((x) => (
              <span key={x.id ?? x.nome} className="pc-pedir__linha">{x.nome}{(x.telefone || x.email) && <small> · {[x.telefone, x.email].filter(Boolean).join(' · ')}</small>}</span>
            ))}</dd></div>
            <div><dt>Saída de</dt><dd>{p.origem}</dd></div>
            <div><dt>Destino</dt><dd>{p.destino}</dd></div>
            <div><dt>Saída</dt><dd>{dataHora(p.saida)}</dd></div>
            <div><dt>Veículo</dt><dd>{rotuloVeiculo(p.tipoVeiculo) ?? 'A Betinhos escolhe'}</dd></div>
            {p.observacao && <div><dt>Observação</dt><dd>{p.observacao}</dd></div>}
          </dl>
          {erro && <Alert tone="danger">{erro}</Alert>}
          <div className="pc-pedir__acoes">
            <Button type="button" variant="secondary" size="touch" onClick={() => setRevisando(false)} icon={<ArrowLeft size={18} aria-hidden />}>Voltar e editar</Button>
            <Button type="button" size="touch" loading={enviando} onClick={enviar} icon={<Send size={18} aria-hidden />}>Enviar pedido</Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="pc-conteudo">
      <PageHeader title="Pedir serviço" description="Informe quem viaja, de onde, para onde e quando. A Betinhos confirma, programa o motorista e o voucher aparece em Meus serviços." />

      <form ref={form} className="pc-pedir__form" onSubmit={revisar} noValidate>
        <fieldset className="pc-pedir__grupo">
          <legend className="pc-pedir__legenda">Passageiros</legend>
          {erros.passageiros && !errosPas.some(Boolean) && <Alert tone="danger">{erros.passageiros}</Alert>}
          {passageiros.map((p, i) => (
            <div key={p.id ?? `novo-${i}`} className="pc-pedir__cartao" role="group" aria-label={`Passageiro ${i + 1}`}>
              <div className="pc-pedir__cabeca">
                {p.id ? <strong>{p.nome}</strong> : (
                  <Field label="Nome do novo passageiro" required>
                    <Input value={p.nome} onChange={(e) => mudar(i, 'nome', e.target.value)} autoComplete="off" placeholder="Nome completo" size="touch" maxLength={MAX_NOME} />
                  </Field>
                )}
                <Button type="button" variant="ghost" size="compact" aria-label={`Remover ${p.nome || `passageiro ${i + 1}`}`} onClick={() => setPassageiros((xs) => xs.filter((_, j) => j !== i))} icon={<X size={16} aria-hidden />} />
              </div>
              <div className="pc-pedir__contato">
                <Field label="Celular" hint={p.id ? 'Corrija se mudou' : undefined}>
                  <Input type="tel" inputMode="tel" value={p.telefone ?? ''} onChange={(e) => mudar(i, 'telefone', e.target.value)} autoComplete="off" placeholder="(11) 90000-0000" size="touch" maxLength={MAX_TELEFONE} />
                </Field>
                <Field label="E-mail">
                  <Input type="email" value={p.email ?? ''} onChange={(e) => mudar(i, 'email', e.target.value)} autoComplete="off" placeholder="nome@empresa.com" size="touch" maxLength={MAX_EMAIL} />
                </Field>
              </div>
              {errosPas[i] && <p className="pc-pedir__erro" role="alert">{errosPas[i]}</p>}
            </div>
          ))}
          {passageiros.length < MAX_PASSAGEIROS && (
            <div className="pc-pedir__add">
              <Field label="Buscar passageiro cadastrado">
                <Select value={null} onChange={escolher} options={opcoes} loading={buscando} onSearchChange={buscar} placeholder="Escolher da lista" searchPlaceholder="Buscar por nome" emptyText="Ninguém com esse nome" onCreate={(nome) => adicionarNovo(nome)} />
              </Field>
              <Button type="button" variant="secondary" size="compact" onClick={() => { focarNovo.current = true; adicionarNovo() }} icon={<UserPlus size={16} aria-hidden />}>Cadastrar novo passageiro</Button>
            </div>
          )}
        </fieldset>

        <datalist id="pc-enderecos">{enderecos.map((e) => <option key={e} value={e} />)}</datalist>
        <Field label="Saída de" error={erros.origem} required>
          <Input list="pc-enderecos" value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Endereço, empresa ou aeroporto" size="touch" maxLength={MAX_ENDERECO} invalid={!!erros.origem} />
        </Field>
        <Field label="Destino" error={erros.destino} required>
          <Input list="pc-enderecos" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Endereço, empresa ou aeroporto" size="touch" maxLength={MAX_ENDERECO} invalid={!!erros.destino} />
        </Field>
        <div className="pc-pedir__quando-linha">
          <Field label="Data" error={erros.saida} required>
            <Input type="date" value={data} min={hoje} onChange={(e) => setData(e.target.value)} size="touch" invalid={!!erros.saida} />
          </Field>
          <Field label="Hora" hint="Horário de Brasília" required>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} size="touch" invalid={!!erros.saida} />
          </Field>
        </div>
        <Field label="Tipo de veículo" error={erros.tipoVeiculo} hint="Preferência; a Betinhos confirma.">
          <Select value={veiculo} onChange={(v) => setVeiculo(v ?? SEM_PREFERENCIA)} searchable={false} clearable={false}
            options={[{ value: SEM_PREFERENCIA, label: 'A Betinhos escolhe' }, ...TIPOS_VEICULO.map((t) => ({ value: String(t.valor), label: t.rotulo }))]} />
        </Field>
        <Field label="Observação" error={erros.observacao} hint="Voo, bagagem, parada no caminho, centro de custo.">
          <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={MAX_TEXTO} invalid={!!erros.observacao} placeholder="Opcional" />
        </Field>

        <Button type="submit" size="touch" icon={<ClipboardCheck size={18} aria-hidden />} className="pc-pedir__enviar">Revisar pedido</Button>
      </form>
    </main>
  )
}

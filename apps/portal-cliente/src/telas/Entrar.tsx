import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Alert, Button, Field, Input } from '@betinhos/ui'
import { ArrowLeft, Eye, EyeOff, LogIn, Mail, RotateCw } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { ErroPortal, REENVIO_S, SENHA_MIN, senhaFraca, type CodigoErro } from '../api/PortalApi'
import { estiloDaMarca } from '../domain/marca'
import type { Sessao } from '../domain/types'
import { Parceria } from './Parceria'
import { useMarcaEntrada } from './useMarcaEntrada'
import './Entrar.css'

const SENHA_FRACA = `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ERROS: Partial<Record<CodigoErro, string>> = {
  senha_invalida: 'E-mail ou senha incorretos. No primeiro acesso, crie sua senha pelo link abaixo.',
  senha_fraca: SENHA_FRACA,
  codigo_invalido: 'Código incorreto. Confira o último e-mail recebido e digite os 6 números.',
  codigo_expirado: 'Este código expirou. Peça um novo código.',
  sem_acesso: 'Este e-mail não tem acesso ao portal. Confira o endereço ou fale com a Betinhos.',
  bloqueado: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.',
  aguarde: 'Acabamos de enviar um código. Aguarde um minuto para pedir outro.',
}

/** senha: login normal. pedir/codigo/nova: 1º acesso ou "Esqueci a senha" (código por e-mail e senha nova). */
type Etapa = 'senha' | 'pedir' | 'codigo' | 'nova'

export function Entrar({ onEntrar, dicaCodigo }: { onEntrar: (s: Sessao) => void; dicaCodigo?: string }) {
  const api = useApi()
  const [etapa, setEtapa] = useState<Etapa>('senha')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erroCampo, setErroCampo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [verSenha, setVerSenha] = useState(false)
  /** Segundos até liberar o "Reenviar código". */
  const [reenviarEm, setReenviarEm] = useState(0)
  const [reenviado, setReenviado] = useState(false)
  const formCodigoRef = useRef<HTMLFormElement>(null)
  /** Trava síncrona: Enter no mesmo frame do auto-envio ou clique duplo não mandam duas vezes. */
  const ocupado = useRef(false)
  const focoRef = useRef<HTMLInputElement>(null)
  const senhaRef = useRef<HTMLInputElement>(null)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  useEffect(() => {
    if (reenviarEm <= 0) return
    const t = setTimeout(() => setReenviarEm((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [reenviarEm])
  const chaveLink = useMemo(() => new URLSearchParams(window.location.search).get('c'), [])
  const parceira = useMarcaEntrada(chaveLink, email)

  function limparCampos() {
    setCodigo('')
    setSenha('')
    setRepetir('')
  }

  function irPara(proxima: Etapa) {
    setEtapa(proxima)
    setErro(null)
    setErroCampo(null)
    setErroSenha(null)
    setReenviado(false)
    setVerSenha(false)
    limparCampos()
    requestAnimationFrame(() => focoRef.current?.focus())
  }

  /** Valida, mostra o carregando e traduz o erro do servidor. `invalido` preenchido = mensagem no campo (o principal ou o da senha), e não envia. */
  async function enviar(e: FormEvent | null, invalido: string | null, rodar: () => Promise<void>, noCampoSenha = false) {
    e?.preventDefault()
    if (ocupado.current) return
    setErroCampo(noCampoSenha ? null : invalido)
    setErroSenha(noCampoSenha ? invalido : null)
    if (invalido) {
      if (noCampoSenha) senhaRef.current?.focus()
      return
    }
    setErro(null)
    setReenviado(false)
    ocupado.current = true
    setEnviando(true)
    try {
      await rodar()
    } catch (err) {
      const codigoErro = err instanceof ErroPortal ? err.codigo : 'falha'
      // A etapa de criar a senha expirou (10 min): recomeça pelo pedido do código.
      if (etapa === 'nova' && codigoErro === 'nao_permitido') {
        irPara('pedir')
        setErro('O tempo para criar a senha acabou. Peça um novo código.')
        return
      }
      setErro(ERROS[codigoErro] ?? 'Não foi possível continuar agora. Tente de novo em instantes.')
      limparCampos()
      ;(etapa === 'senha' ? senhaRef : focoRef).current?.focus()
    } finally {
      ocupado.current = false
      setEnviando(false)
    }
  }

  const emailInvalido = () => (EMAIL_VALIDO.test(email.trim()) ? null : 'Digite um e-mail completo, como nome@empresa.com.')

  const entrar = (e: FormEvent) => {
    const erroEmail = emailInvalido()
    return enviar(e, erroEmail ?? (senha ? null : 'Digite sua senha.'), async () => onEntrar(await api.entrar(email.trim(), senha)), !erroEmail)
  }

  const pedirCodigo = (e: FormEvent) =>
    enviar(e, emailInvalido(), async () => {
      try {
        await api.solicitarCodigo(email.trim())
      } catch (err) {
        // Código pedido há menos de 1 min (voltou ou recarregou): o anterior ainda vale, segue para digitá-lo.
        if (!(err instanceof ErroPortal && err.codigo === 'aguarde')) throw err
      }
      irPara('codigo')
      setReenviarEm(REENVIO_S)
    })

  const reenviarCodigo = () =>
    enviar(null, null, async () => {
      await api.solicitarCodigo(email.trim())
      setCodigo('')
      setReenviado(true)
      setReenviarEm(REENVIO_S)
      focoRef.current?.focus()
    })

  const confirmarCodigo = (e: FormEvent) =>
    enviar(e, /^\d{6}$/.test(codigo) ? null : 'O código tem 6 números.', async () => {
      await api.confirmarCodigo(email.trim(), codigo)
      irPara('nova')
    })

  // Senha fraca aparece na "Nova senha"; senhas diferentes, na "Repita a senha".
  const salvarSenha = (e: FormEvent) => {
    const fraca = senhaFraca(senha)
    return enviar(
      e,
      fraca ? SENHA_FRACA : senha !== repetir ? 'As duas senhas não são iguais.' : null,
      async () => onEntrar(await api.criarSenha(senha)),
      !fraca,
    )
  }

  const campoEmail = (
    <Field label="E-mail" error={erroCampo} required>
      <Input ref={focoRef} type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" size="touch" autoFocus />
    </Field>
  )
  const voltar = (rotulo: string, para: Etapa) => (
    <Button type="button" variant="ghost" size="touch" fullWidth onClick={() => irPara(para)} icon={<ArrowLeft size={18} aria-hidden />}>{rotulo}</Button>
  )
  const alerta = erro && <Alert tone="danger">{erro}</Alert>
  const olho = (
    <button type="button" className="pc-entrar__olho" onMouseDown={(e) => e.preventDefault()} onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={verSenha}>
      {verSenha ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
    </button>
  )
  const tipoSenha = verSenha ? 'text' : 'password'

  return (
    <main className="pc-entrar" style={estiloDaMarca(parceira?.cor) as CSSProperties}>
      <section className="pc-entrar__card" aria-labelledby="pc-entrar-titulo">
        <Parceria parceira={parceira} tamanho="entrar" />
        <h1 id="pc-entrar-titulo" className="pc-entrar__titulo">Portal do cliente</h1>
        {etapa === 'senha' ? (
          <form key="senha" className="pc-entrar__form" onSubmit={entrar} noValidate>
            <p className="pc-entrar__texto">Entre com o e-mail da sua empresa e a sua senha.</p>
            {campoEmail}
            <Field label="Senha" error={erroSenha} required>
              <Input ref={senhaRef} type={tipoSenha} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} size="touch" suffix={olho} />
            </Field>
            {alerta}
            <Button type="submit" size="touch" fullWidth loading={enviando} icon={<LogIn size={18} aria-hidden />}>Entrar</Button>
            <Button type="button" variant="ghost" size="touch" fullWidth onClick={() => irPara('pedir')}>Primeiro acesso ou esqueci a senha</Button>
          </form>
        ) : etapa === 'pedir' ? (
          <form key="pedir" className="pc-entrar__form pc-entrar__form--entra" onSubmit={pedirCodigo} noValidate>
            <p className="pc-entrar__texto">Enviaremos um código para o seu e-mail. Com ele, você cria a sua senha.</p>
            {campoEmail}
            {alerta}
            <Button type="submit" size="touch" fullWidth loading={enviando} icon={<Mail size={18} aria-hidden />}>Enviar código</Button>
            {voltar('Voltar para o login', 'senha')}
          </form>
        ) : etapa === 'codigo' ? (
          <form key="codigo" ref={formCodigoRef} className="pc-entrar__form pc-entrar__form--entra" onSubmit={confirmarCodigo} noValidate>
            <p className="pc-entrar__texto">Se o e-mail <strong>{email.trim()}</strong> estiver liberado, você vai receber um código de 6 dígitos. Ele vale por 10 minutos.</p>
            <p className="pc-entrar__dica">Não chegou? Confira a caixa de spam ou lixo eletrônico.</p>
            <Field label="Código do e-mail" error={erroCampo} hint={dicaCodigo} required>
              <Input
                ref={focoRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={codigo}
                onChange={(e) => {
                  const digitos = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setCodigo(digitos)
                  // Digitou ou colou os 6 números: confirma sozinho.
                  if (digitos.length === 6 && !enviando) requestAnimationFrame(() => formCodigoRef.current?.requestSubmit())
                }}
                className="pc-entrar__codigo"
                size="touch"
              />
            </Field>
            {alerta}
            {reenviado && <Alert tone="success">Enviamos um novo código. Use o do último e-mail.</Alert>}
            <Button type="submit" size="touch" fullWidth loading={enviando}>Continuar</Button>
            <Button type="button" variant="ghost" size="touch" fullWidth disabled={reenviarEm > 0 || enviando} onClick={reenviarCodigo} icon={<RotateCw size={18} aria-hidden />}>
              {reenviarEm > 0 ? `Reenviar código em ${reenviarEm} s` : 'Reenviar código'}
            </Button>
            {voltar('Trocar e-mail', 'pedir')}
          </form>
        ) : (
          <form key="nova" className="pc-entrar__form pc-entrar__form--entra" onSubmit={salvarSenha} noValidate>
            <p className="pc-entrar__texto">Crie a sua senha do portal para <strong>{email.trim()}</strong>.</p>
            {/* Campo oculto: o gerenciador de senhas do navegador associa a senha nova ao e-mail. */}
            <input type="email" autoComplete="username" value={email.trim()} readOnly hidden />
            <Field label="Nova senha" hint={`Pelo menos ${SENHA_MIN} caracteres.`} error={erroCampo} required>
              <Input ref={focoRef} type={tipoSenha} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} size="touch" suffix={olho} />
            </Field>
            <Field label="Repita a senha" error={erroSenha} required>
              <Input ref={senhaRef} type={tipoSenha} autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} size="touch" />
            </Field>
            {alerta}
            <Button type="submit" size="touch" fullWidth loading={enviando}>Salvar senha e entrar</Button>
          </form>
        )}
      </section>
    </main>
  )
}

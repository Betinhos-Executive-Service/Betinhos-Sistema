import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Alert, Button, Checkbox, Field, Input } from '@betinhos/ui'
import { ArrowLeft, Mail } from 'lucide-react'
import { renderSVG } from 'uqr'
import { useApi } from '../api/ApiContext'
import { ErroPortal, type CodigoErro } from '../api/PortalApi'
import type { Sessao } from '../domain/types'
import './Entrar.css'

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ERROS: Partial<Record<CodigoErro, string>> = {
  codigo_invalido: 'Código incorreto. Confira o último e-mail recebido e digite os 6 números.',
  codigo_expirado: 'Este código expirou. Peça um novo código.',
  totp_invalido: 'Código do autenticador incorreto. Digite os 6 números que aparecem agora no app.',
  bloqueado: 'Muitas tentativas. Aguarde 15 minutos e peça um novo código.',
}

type Cadastro = { otpauthUrl: string; segredo: string }

/** QR em SVG gerado no navegador: o segredo não passa por nenhum serviço externo. */
function QrAutenticador({ otpauthUrl }: { otpauthUrl: string }) {
  const src = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(otpauthUrl, { border: 2, blackColor: '#001A3D', whiteColor: '#FFFFFF' }))}`,
    [otpauthUrl],
  )
  return <img className="pc-entrar__qr" src={src} width={176} height={176} alt="QR code para cadastrar o portal no app autenticador" />
}

export function Entrar({ onEntrar, dicaCodigo }: { onEntrar: (s: Sessao) => void; dicaCodigo?: string }) {
  const api = useApi()
  const [etapa, setEtapa] = useState<'email' | 'codigo' | 'autenticador'>('email')
  const [cadastro, setCadastro] = useState<Cadastro | null>(null)
  const [lembrar, setLembrar] = useState(false)
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erroCampo, setErroCampo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const codigoRef = useRef<HTMLInputElement>(null)

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault()
    if (!EMAIL_VALIDO.test(email.trim())) {
      setErroCampo('Digite um e-mail completo, como nome@empresa.com.')
      return
    }
    setErroCampo(null)
    setErro(null)
    setEnviando(true)
    try {
      await api.solicitarCodigo(email.trim())
      setEtapa('codigo')
      requestAnimationFrame(() => codigoRef.current?.focus())
    } catch {
      setErro('Não foi possível enviar o código agora. Tente de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  async function entrar(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(codigo)) {
      setErroCampo('O código tem 6 números.')
      return
    }
    setErroCampo(null)
    setErro(null)
    setEnviando(true)
    try {
      const r = await api.entrar(email.trim(), codigo)
      if (r.etapa === 'ok') return onEntrar(r.sessao)
      setCadastro(r.etapa === 'cadastrar_autenticador' ? r : null)
      setCodigo('')
      setEtapa('autenticador')
      requestAnimationFrame(() => codigoRef.current?.focus())
    } catch (err) {
      falhou(err)
    } finally {
      setEnviando(false)
    }
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(codigo)) {
      setErroCampo('O código tem 6 números.')
      return
    }
    setErroCampo(null)
    setErro(null)
    setEnviando(true)
    try {
      onEntrar(await api.confirmarAutenticador(codigo, lembrar))
    } catch (err) {
      // Bloqueado: a etapa do autenticador acabou; o validador recomeça pelo e-mail depois dos 15 minutos.
      if (err instanceof ErroPortal && err.codigo === 'bloqueado') setEtapa('codigo')
      falhou(err)
    } finally {
      setEnviando(false)
    }
  }

  function falhou(err: unknown) {
    setErro((err instanceof ErroPortal && ERROS[err.codigo]) || 'Não foi possível entrar agora. Tente de novo em instantes.')
    setCodigo('')
    codigoRef.current?.focus()
  }

  const campoCodigo = (label: string, hint?: string) => (
    <Field label={label} error={erroCampo} hint={hint} required>
      <Input
        ref={codigoRef}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="pc-entrar__codigo"
        size="touch"
      />
    </Field>
  )

  function trocarEmail() {
    setEtapa('email')
    setCadastro(null)
    setCodigo('')
    setErro(null)
    setErroCampo(null)
  }

  return (
    <main className="pc-entrar">
      <section className="pc-entrar__card" aria-labelledby="pc-entrar-titulo">
        <p className="pc-marca">Betinhos Executive Service</p>
        <h1 id="pc-entrar-titulo" className="pc-entrar__titulo">Validação de serviços</h1>
        {etapa === 'email' ? (
          <form className="pc-entrar__form" onSubmit={enviarCodigo} noValidate>
            <p className="pc-entrar__texto">Entre com o e-mail cadastrado pela Betinhos. Enviaremos um código de acesso, sem senha.</p>
            <Field label="E-mail" error={erroCampo} required>
              <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" size="touch" autoFocus />
            </Field>
            {erro && <Alert tone="danger">{erro}</Alert>}
            <Button type="submit" size="touch" fullWidth loading={enviando} icon={<Mail size={18} aria-hidden />}>Enviar código</Button>
          </form>
        ) : etapa === 'codigo' ? (
          <form key="codigo" className="pc-entrar__form pc-entrar__form--entra" onSubmit={entrar} noValidate>
            <p className="pc-entrar__texto">Enviamos um código de 6 dígitos para <strong>{email.trim()}</strong>. Ele vale por 10 minutos.</p>
            {campoCodigo('Código de acesso', dicaCodigo)}
            {erro && <Alert tone="danger">{erro}</Alert>}
            <Button type="submit" size="touch" fullWidth loading={enviando}>Entrar</Button>
            <Button type="button" variant="ghost" size="touch" fullWidth onClick={trocarEmail} icon={<ArrowLeft size={18} aria-hidden />}>Trocar e-mail</Button>
          </form>
        ) : (
          <form key="autenticador" className="pc-entrar__form pc-entrar__form--entra" onSubmit={confirmar} noValidate>
            {cadastro ? (
              <>
                <p className="pc-entrar__texto">Primeiro acesso: abra o Microsoft ou Google Authenticator e leia o código abaixo.</p>
                <QrAutenticador otpauthUrl={cadastro.otpauthUrl} />
                <p className="pc-entrar__texto">
                  Sem câmera? Adicione a conta à mão com a chave{' '}
                  <code className="pc-entrar__segredo">{cadastro.segredo.match(/.{1,4}/g)?.join(' ')}</code>
                </p>
              </>
            ) : (
              <p className="pc-entrar__texto">Abra o app autenticador e digite o código de 6 dígitos do portal Betinhos.</p>
            )}
            {campoCodigo('Código do autenticador')}
            <Checkbox label="Lembrar este computador por 30 dias" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
            {erro && <Alert tone="danger">{erro}</Alert>}
            <Button type="submit" size="touch" fullWidth loading={enviando}>Confirmar</Button>
            <Button type="button" variant="ghost" size="touch" fullWidth onClick={trocarEmail} icon={<ArrowLeft size={18} aria-hidden />}>Trocar e-mail</Button>
          </form>
        )}
      </section>
    </main>
  )
}

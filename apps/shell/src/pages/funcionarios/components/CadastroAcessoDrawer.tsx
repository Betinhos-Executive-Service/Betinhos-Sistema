import { Alert, Button, buttonClassName, Dialog, Field, Input, SegmentedControl } from '@betinhos/ui'
import { AtSign, Building2, Copy, ExternalLink, Handshake, IdCard, Mail, MessageCircle, Smartphone, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { type AcessoInicial, type AcessoSource, type CadastroInput, type CadastroResultado, type Etapa, ERROS_PERMANENTES, liberacaoPendente, MSG_PENDENTE, MSG_PENDENTE_DEMORADA, parseAcessoError, mensagemWhatsApp, whatsappComMensagem } from '../data/acesso'
import { ListaEtapas, ProgressoAcesso, useRetentativa } from './AcessoProgresso'
import { digitsOnly, formatCelular, formatCpf, isValidCpf, normalizeSearch } from '../data/format'
import type { FuncionarioParecido } from '../data/parecidos'
import { ParecidosDialog } from './ParecidosDialog'
import { VINCULO } from '../data/schema'
import { useNotify } from './Toasts'

/** `emailPendente`: e-mail criado cuja liberação no Dataverse ainda não terminou (a ficha oferece "Concluir liberação"). */
type Props = { acesso: AcessoSource; inicial?: AcessoInicial; onClose: () => void; onCadastrado: (funcionarioId: string, emailPendente?: string) => void }
/** Escolha feita no aviso de parecido; mudar nome, celular ou CPF desfaz a escolha. */
type Escolha = { funcionarioId?: string; criarNovo?: boolean }
type Estado = { fase: 'form' } | { fase: 'conferindo' } | { fase: 'criando' } | { fase: 'resultado'; r: CadastroResultado } | { fase: 'erro'; mensagem: string; etapas: Etapa[] }

const DOMINIO = 'betinhos.onmicrosoft.com'
/** Na ordem de VINCULO: Colaborador, Terceiro. */
const VINCULO_ICONES = [Building2, Handshake]
const VINCULO_OPCOES = VINCULO.map((o, i) => { const Icone = VINCULO_ICONES[i]; return { value: String(o.value), label: <span className="acesso-opcao"><Icone size={16} aria-hidden />{o.label}</span> } })
const opcional = (label: string) => <>{label} <span className="acesso-opcional">(opcional)</span></>

/** primeiro.ultimo sem acentos; igual a AcessoRules.PrefixoEmail do plugin (só prévia: o plugin recalcula). */
export function prefixoDeNome(nome: string) {
  const p = normalizeSearch(nome).trim().split(/\s+/).map((w) => w.replace(/[^a-z0-9-]/g, '')).filter(Boolean)
  return p.length === 0 ? '' : p.length === 1 ? p[0] : `${p[0]}.${p[p.length - 1]}`
}

/** Copia para a área de transferência com aviso de sucesso ou falha. */
function useCopiar() {
  const notify = useNotify()
  return async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); notify('success', 'Copiado.') } catch { notify('error', 'Não foi possível copiar. Selecione e copie manualmente.') }
  }
}

/** E-mail, senha e link com botões de copiar; usado no cadastro e na reativação. */
export function CredenciaisAcesso({ r, semSenha }: { r: { emailMicrosoft: string; senhaTemporaria: string; linkApp: string }; semSenha: string }) {
  const copiar = useCopiar()
  return (
    <dl className="acesso-credenciais">
      <div className="acesso-credencial"><dt>E-mail</dt><dd><code className="acesso-credencial__email" title={r.emailMicrosoft}>{r.emailMicrosoft}</code> <Button variant="secondary" size="compact" icon={<Copy size={14} />} aria-label="Copiar e-mail" onClick={() => copiar(r.emailMicrosoft)}>Copiar</Button></dd></div>
      <div className="acesso-credencial"><dt>Senha</dt><dd>{r.senhaTemporaria ? <code>{r.senhaTemporaria}</code> : <span className="muted">{semSenha}</span>} {r.senhaTemporaria && <Button variant="secondary" size="compact" icon={<Copy size={14} />} aria-label="Copiar senha" onClick={() => copiar(r.senhaTemporaria)}>Copiar</Button>}</dd></div>
      <div className="acesso-credencial acesso-credencial--link"><dt>Link do app</dt><dd><a href={r.linkApp} target="_blank" rel="noopener noreferrer">{r.linkApp}</a></dd></div>
    </dl>
  )
}

/** R13: a senha só aparece uma vez; fechar sem enviar pede confirmação. */
export function FecharSemEnviarDialog({ open, onVoltar, onFechar }: { open: boolean; onVoltar: () => void; onFechar: () => void }) {
  return (
    <Dialog open={open} onClose={onVoltar} title="Fechar sem enviar?" actions={<><Button variant="secondary" onClick={onVoltar}>Voltar</Button><Button variant="danger" onClick={onFechar}>Fechar</Button></>}>
      A senha não aparece de novo.
    </Dialog>
  )
}

export function CadastroAcessoDrawer({ acesso, inicial, onClose, onCadastrado }: Props) {
  const [nome, setNome] = useState(inicial?.nomeCompleto ?? '')
  const [celular, setCelular] = useState(inicial?.celular ?? '')
  const [emailPessoal, setEmailPessoal] = useState('')
  const [cpf, setCpf] = useState('')
  const [vinculo, setVinculo] = useState<0 | 1>(1)
  const [escolha, setEscolha] = useState<Escolha | null>(null)
  const [parecidos, setParecidos] = useState<FuncionarioParecido[] | null>(null)
  const [prefixoManual, setPrefixoManual] = useState<string | null>(null)
  const [estado, setEstado] = useState<Estado>({ fase: 'form' })
  const [discarding, setDiscarding] = useState(false)
  const [fechandoResultado, setFechandoResultado] = useState(false)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => { panel.current?.focus() }, [])

  const touched = (estado.fase === 'form' || estado.fase === 'erro') && (nome !== (inicial?.nomeCompleto ?? '') || celular !== (inicial?.celular ?? '') || emailPessoal !== '' || cpf !== '' || prefixoManual !== null || vinculo !== 1)
  const criando = estado.fase === 'criando' || estado.fase === 'conferindo'
  const cpfErro = cpf && !isValidCpf(cpf) ? 'CPF inválido.' : undefined
  const prefixo = prefixoManual ?? prefixoDeNome(nome)
  // Igual a AcessoRules.NomeValido do plugin: sem sobrenome ele recusa com NOME_INVALIDO.
  const nomeErro = nome.trim() && !/\s/.test(nome.trim()) ? (inicial ? 'Inclua o sobrenome na ficha antes de criar o acesso.' : 'Informe nome e sobrenome.') : undefined
  const input: CadastroInput = { nomeCompleto: nome.trim(), celular: celular.trim(), emailPessoal: emailPessoal.trim() || undefined, prefixoEmail: prefixo.trim() || undefined, tipoVinculo: vinculo, funcionarioId: inicial?.funcionarioId ?? escolha?.funcionarioId, cpf: digitsOnly(cpf) || undefined, criarNovo: escolha?.criarNovo }
  const waHref = estado.fase === 'resultado' ? whatsappComMensagem(celular, mensagemWhatsApp({ nome, emailMicrosoft: estado.r.emailMicrosoft, senhaTemporaria: estado.r.senhaTemporaria, linkApp: estado.r.linkApp })) : null

  const pendente = estado.fase === 'resultado' && liberacaoPendente(estado.r.etapas)
  // Liberação pendente: tenta concluir sozinho (mesmo e-mail e ficha; a senha da primeira resposta continua valendo).
  const [erroRetentativa, setErroRetentativa] = useState('')
  const { esgotou } = useRetentativa(pendente, async () => {
    if (estado.fase !== 'resultado') return undefined
    const { funcionarioId, emailMicrosoft } = estado.r
    // Com o FuncionarioId da 1ª resposta a retentativa nunca para em HOMONIMO_ENCONTRADO.
    const r = await acesso.cadastrar({ ...input, funcionarioId, criarNovo: undefined, prefixoEmail: emailMicrosoft.split('@')[0] })
    return liberacaoPendente(r.etapas) ? undefined : r.etapas
  }, (etapas) => setEstado((e) => (e.fase === 'resultado' ? { fase: 'resultado', r: { ...e.r, etapas } } : e)), (reason) => {
    const erro = parseAcessoError(reason)
    if (!ERROS_PERMANENTES.has(erro.codigo)) return false
    setErroRetentativa(erro.message)
    return true
  })

  function requestClose() {
    if (criando) return
    // R13: a senha temporária só aparece aqui; fechar por fora, Esc ou X pede confirmação.
    if (estado.fase === 'resultado') { setFechandoResultado(true); return }
    if (touched) { setDiscarding(true); return }
    onClose()
  }

  /** Sem ficha e sem escolha: confere funcionários parecidos antes de criar conta e ficha. */
  async function enviar() {
    if (input.funcionarioId || input.criarNovo) return criar(input)
    setEstado({ fase: 'conferindo' })
    try {
      const achados = await acesso.parecidos({ nome: input.nomeCompleto, celular: input.celular, cpf: input.cpf })
      if (achados.length === 0) return criar(input)
      setParecidos(achados)
      setEstado({ fase: 'form' })
    } catch (reason) {
      setEstado({ fase: 'erro', mensagem: `Não foi possível conferir os cadastros existentes. ${parseAcessoError(reason).message}`, etapas: [] })
    }
  }

  function escolher(e: Escolha) {
    setParecidos(null)
    setEscolha(e)
    void criar({ ...input, ...e })
  }

  const editar = (set: (v: string) => void, v: string) => { set(v); setEscolha(null) }

  async function criar(dados: CadastroInput) {
    setEstado({ fase: 'criando' })
    try {
      const r = await acesso.cadastrar(dados)
      setEstado({ fase: 'resultado', r })
    } catch (reason) {
      const erro = parseAcessoError(reason)
      // O plugin achou um parecido que a tela não viu (ex.: ficha sem permissão de leitura): deixa o operador decidir.
      if (erro.codigo === 'HOMONIMO_ENCONTRADO') { setParecidos([]); setEstado({ fase: 'form' }); return }
      setEstado({ fase: 'erro', mensagem: erro.message, etapas: erro.etapas })
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !discarding && !fechandoResultado && !parecidos) requestClose() }}>
      <aside ref={panel} className="drawer drawer--acesso" role="dialog" aria-modal="true" aria-labelledby="acesso-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Escape' && !discarding && !fechandoResultado && !parecidos) requestClose() }}>
        <header className="drawer-head">
          <div className="drawer-title"><h2 id="acesso-title">Cadastrar acesso ao App Motoristas</h2></div>
          <Button variant="secondary" icon={<X size={18} />} aria-label="Fechar" onClick={requestClose} disabled={criando} />
        </header>
        <div className="drawer-body">
          {estado.fase !== 'resultado' && (
            <form id="acesso-form" onSubmit={(event) => { event.preventDefault(); void enviar() }}>
              <section className="acesso-secao" aria-labelledby="acesso-secao-motorista">
                <h3 id="acesso-secao-motorista" className="acesso-secao__titulo">Motorista</h3>
                {inicial
                  ? <div className="acesso-info"><span className="acesso-info__label">Nome completo</span><span className="acesso-info__valor">{nome}</span><span className="acesso-info__nota">da ficha do funcionário</span>{nomeErro && <span className="acesso-info__erro" role="alert">{nomeErro}</span>}</div>
                  : <Field label="Nome completo" required error={nomeErro}><Input prefix={<User size={16} aria-hidden />} value={nome} onChange={(e) => editar(setNome, e.target.value)} disabled={criando} autoComplete="off" /></Field>}
                <Field label="Celular" required hint="Com DDD. Recebe o link e a senha no WhatsApp."><Input prefix={<Smartphone size={16} aria-hidden />} inputMode="tel" placeholder="(12) 99999-9999" value={formatCelular(celular)} onChange={(e) => editar(setCelular, digitsOnly(e.target.value))} disabled={criando} /></Field>
                {!inicial && <Field label={opcional('CPF')} hint="Ajuda a achar cadastro duplicado." error={cpfErro}><Input prefix={<IdCard size={16} aria-hidden />} inputMode="numeric" value={cpf} onChange={(e) => editar(setCpf, formatCpf(e.target.value))} disabled={criando} autoComplete="off" /></Field>}
                <Field label={opcional('E-mail pessoal')} hint="Para recuperar a senha."><Input prefix={<Mail size={16} aria-hidden />} type="email" value={emailPessoal} onChange={(e) => setEmailPessoal(e.target.value)} disabled={criando} /></Field>
              </section>
              <section className="acesso-secao" aria-labelledby="acesso-secao-acesso">
                <h3 id="acesso-secao-acesso" className="acesso-secao__titulo">Acesso</h3>
                <div className="acesso-campo">
                  <span className="bt-field__label" aria-hidden>Vínculo</span>
                  <SegmentedControl<string> aria-label="Vínculo" fullWidth value={String(vinculo)} onChange={(v) => { if (!criando) setVinculo(Number(v) as 0 | 1) }} options={VINCULO_OPCOES} />
                </div>
                <Field label="E-mail Microsoft" hint="Se já existir, o sistema acrescenta um número.">
                  <Input prefix={<AtSign size={16} aria-hidden />} value={prefixo} onChange={(e) => setPrefixoManual(e.target.value)} suffix={`@${DOMINIO}`} disabled={criando} />
                </Field>
                <p className="acesso-previa" aria-live="polite">E-mail Microsoft: {prefixo ? <strong>{`${prefixo}@${DOMINIO}`}</strong> : '…'}</p>
              </section>
              {estado.fase === 'form' && <p className="acesso-efeito">Ao criar: cria a conta Microsoft, libera a licença, inclui no grupo de motoristas e gera a senha.</p>}
              {estado.fase === 'conferindo' && <p className="acesso-previa" role="status">Conferindo cadastros parecidos…</p>}
              {estado.fase === 'criando' && <ProgressoAcesso fluxo="cadastro" />}
              {estado.fase === 'erro' && (
                <Alert tone="danger" title="Não foi possível concluir">
                  {estado.mensagem}{estado.etapas.length > 0 && ' O que já foi feito fica guardado; "Tentar de novo" continua de onde parou.'}
                  <ListaEtapas etapas={estado.etapas} fluxo="cadastro" />
                </Alert>
              )}
            </form>
          )}
          {estado.fase === 'resultado' && (
            <div className="acesso-resultado">
              {pendente
                ? erroRetentativa
                  ? <Alert tone="danger" title="Conta criada, mas a liberação parou">{erroRetentativa}</Alert>
                  : <Alert tone="info" title="Conta criada, liberando no Dataverse">{esgotou ? MSG_PENDENTE_DEMORADA : MSG_PENDENTE}</Alert>
                : <Alert tone="success" title="Acesso criado e liberado">{estado.r.senhaTemporaria ? 'A senha aparece só agora. Envie para o motorista antes de fechar.' : 'A conta já existia; a senha anterior continua valendo.'}</Alert>}
              <CredenciaisAcesso r={estado.r} semSenha="Conta já existia; senha não alterada" />
              <ListaEtapas etapas={estado.r.etapas} fluxo="cadastro" />
            </div>
          )}
        </div>
        <footer className="drawer-foot drawer-foot--active">
          {estado.fase === 'resultado' ? (
            <div className="cluster">
              {waHref && <a className={buttonClassName({ variant: 'primary' })} href={waHref} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden /> Enviar no WhatsApp</a>}
              <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => onCadastrado(estado.r.funcionarioId, pendente ? estado.r.emailMicrosoft : undefined)}>Abrir ficha</Button>
            </div>
          ) : (
            <div className="cluster acesso-acoes">
              <Button variant="secondary" onClick={requestClose} disabled={criando}>Cancelar</Button>
              {estado.fase === 'erro' && <Button variant="secondary" onClick={() => void enviar()}>Tentar de novo</Button>}
              <Button type="submit" form="acesso-form" loading={criando} disabled={!nome.trim() || !celular.trim() || Boolean(cpfErro || nomeErro)}>Criar acesso</Button>
            </div>
          )}
        </footer>
      </aside>
      <Dialog open={discarding} onClose={() => setDiscarding(false)} title="Descartar alterações?" actions={<><Button variant="secondary" onClick={() => setDiscarding(false)}>Continuar editando</Button><Button variant="danger" onClick={() => { setDiscarding(false); onClose() }}>Descartar</Button></>}>
        Os dados digitados ainda não foram enviados.
      </Dialog>
      <ParecidosDialog parecidos={parecidos} onUsar={(funcionarioId) => escolher({ funcionarioId })} onCriarNovo={() => escolher({ criarNovo: true })} onCancelar={() => setParecidos(null)} />
      <FecharSemEnviarDialog open={fechandoResultado} onVoltar={() => setFechandoResultado(false)} onFechar={() => { setFechandoResultado(false); onClose() }} />
    </div>
  )
}

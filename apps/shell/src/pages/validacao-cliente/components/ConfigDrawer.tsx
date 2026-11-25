import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, ChoiceGroup, Checkbox, Dialog, Drawer, Field, Input, Radio, Sheet, Switch, Textarea, useToast } from '@betinhos/ui'
import { ImagePlus, Trash2, UserPlus } from 'lucide-react'
import type { Source } from '../data/source'
import { MODULOS, NOME_EXIBICAO_MAX, configIgual, ehCor, formDaConfig, validarConfig, validarLogo, type ConfigForm } from '../domain/config'
import { validarValidador } from '../domain/regras'
import type { Cliente, ModuloPortal, PortalConfig, Validador } from '../domain/types'
import { PrevisaoMarca } from './PrevisaoMarca'
import { UsuarioItem, useAcoesUsuario } from './UsuarioItem'

type Props = {
  cliente: Cliente | null; config: PortalConfig | null; outros: PortalConfig[]; validadores: Validador[]; source: Source; mobile: boolean
  /** Só o Renan edita logo, cor e nome; os outros veem a identidade em leitura. */
  editarIdentidade?: boolean
  onClose: () => void; onSaved: (c: PortalConfig) => void; onValidadorSaved: (v: Validador) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const NOVA: ConfigForm = { ligado: false, modulos: [], restringir: false, dominiosTexto: '', nomeExibicao: '', cor: '', logo: null, logoMudou: false }
const inicial = (config: PortalConfig | null, logo: string | null = null) => (config ? formDaConfig(config, logo) : { ...NOVA, logo })
const lerArquivo = (arquivo: File) => new Promise<string>((ok, falha) => {
  const leitor = new FileReader()
  leitor.onload = () => ok(String(leitor.result))
  leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo.'))
  leitor.readAsDataURL(arquivo)
})

/** Edição do portal de um cliente: liberado, módulos, e-mails e domínios. Fecha por X, Esc ou fundo; com alteração pergunta antes. */
export function ConfigDrawer({ cliente, config, outros, validadores, source, mobile, editarIdentidade = false, onClose, onSaved, onValidadorSaved }: Props) {
  const toast = useToast()
  const [form, setForm] = useState<ConfigForm>(inicial(config))
  const [mostrarErros, setMostrarErros] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [confirmarSaida, setConfirmarSaida] = useState(false)
  const [logoBase, setLogoBase] = useState<string | null>(null)
  const [erroLogo, setErroLogo] = useState<string | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const base = inicial(config, logoBase)
  const acoes = useAcoesUsuario(source, onValidadorSaved)
  const [novo, setNovo] = useState({ nome: '', email: '' })
  const [errosNovo, setErrosNovo] = useState<ReturnType<typeof validarValidador>>({})
  const [liberando, setLiberando] = useState(false)
  const idCliente = cliente?.id
  const [idAnterior, setIdAnterior] = useState(idCliente)
  if (idAnterior !== idCliente) { setIdAnterior(idCliente); setForm(inicial(config)); setLogoBase(null); setErroLogo(null); setMostrarErros(false); setNovo({ nome: '', email: '' }); setErrosNovo({}) }
  useEffect(() => {
    if (!idCliente) return
    let vivo = true
    source.logoDoCliente(idCliente).then((logo) => {
      if (!vivo) return
      setLogoBase(logo)
      setForm((f) => (f.logoMudou ? f : { ...f, logo }))
    }).catch(() => { if (vivo) toast({ tone: 'warning', message: 'Não foi possível ler o logo atual.' }) })
    return () => { vivo = false }
  }, [idCliente, source, toast])
  const doCliente = validadores.filter((v) => v.cliente.id === idCliente).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const set = (patch: Partial<ConfigForm>) => setForm((f) => ({ ...f, ...patch }))
  const sujo = !configIgual(form, base)
  const { erros, avisos } = useMemo(() => (cliente ? validarConfig(form, cliente.id, outros) : { erros: {}, avisos: [] }), [form, cliente, outros])

  async function escolherLogo(arquivo: File | undefined) {
    if (!arquivo) return
    const motivo = validarLogo(arquivo)
    if (motivo) { setErroLogo(motivo); return }
    try {
      setErroLogo(null)
      set({ logo: await lerArquivo(arquivo), logoMudou: true })
    } catch (reason) {
      setErroLogo(reasonText(reason))
    }
  }

  function close() {
    if (salvando) return
    if (sujo) { setConfirmarSaida(true); return }
    onClose()
  }

  async function salvar() {
    if (!cliente) return
    setMostrarErros(true)
    if (Object.keys(erros).length) return
    setSalvando(true)
    try {
      const salva = await source.salvarConfig(cliente, form)
      onSaved(salva)
      toast({ tone: 'success', message: salva.ligado ? `Portal de ${cliente.nome} salvo.` : `Portal de ${cliente.nome} desligado.` })
      onClose()
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. ${reasonText(reason)}` })
    } finally {
      setSalvando(false)
    }
  }

  async function liberarEmail() {
    if (!cliente) return
    const found = validarValidador({ ...novo, clienteId: cliente.id }, validadores.map((v) => v.email))
    setErrosNovo(found)
    if (Object.keys(found).length) return
    setLiberando(true)
    try {
      const id = await source.criarValidador({ ...novo, clienteId: cliente.id })
      onValidadorSaved({ id, nome: novo.nome.trim(), email: novo.email.trim().toLowerCase(), cliente, ativo: true, ultimoAcesso: null, senhaDefinidaEm: null })
      toast({ tone: 'success', message: `${novo.email.trim().toLowerCase()} liberado. No primeiro acesso, a pessoa cria a senha pelo código enviado ao e-mail.` })
      setNovo({ nome: '', email: '' })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível liberar o e-mail. ${reasonText(reason)}` })
    } finally {
      setLiberando(false)
    }
  }

  const toggleModulo = (valor: ModuloPortal) =>
    setForm((f) => ({ ...f, modulos: f.modulos.includes(valor) ? f.modulos.filter((m) => m !== valor) : [...f.modulos, valor] }))

  const body = (
    <form className="vc-validadores" onSubmit={(e) => { e.preventDefault(); void salvar() }} noValidate>
      <section className="vc-secao">
        <Switch label="Portal liberado" description="Desligado, ninguém deste cliente entra no portal." checked={form.ligado} disabled={salvando} onChange={(e) => set({ ligado: e.target.checked })} />
      </section>
      <section className="vc-secao">
        <ChoiceGroup label="Módulos" error={mostrarErros ? erros.modulos : undefined}>
          {MODULOS.map((m) => <Checkbox key={m.value} label={m.label} description={m.description} checked={form.modulos.includes(m.value)} disabled={salvando} onChange={() => toggleModulo(m.value)} />)}
        </ChoiceGroup>
      </section>
      <section className="vc-secao" aria-labelledby="vc-identidade-titulo">
        <h3 id="vc-identidade-titulo" className="vc-secao__titulo">Identidade no portal</h3>
        {editarIdentidade ? null : <p className="vc-muted">Só o administrador do ambiente altera logo, cor e nome.</p>}
        <div className="vc-identidade">
          <Field label="Nome de exibição" hint="Aparece no topo do portal. Vazio usa o nome do cadastro." error={erros.nomeExibicao}>
            <Input name="nome-exibicao" value={form.nomeExibicao} maxLength={NOME_EXIBICAO_MAX + 20} disabled={salvando || !editarIdentidade} onChange={(e) => set({ nomeExibicao: e.target.value })} />
          </Field>
          <Field label="Cor" hint="Faixa do topo e botão principal. Formato #RRGGBB." error={erros.cor}>
            <div className="vc-identidade__cor">
              <input type="color" aria-label="Escolher cor" value={ehCor(form.cor.trim()) ? form.cor.trim() : '#000000'} disabled={salvando || !editarIdentidade} onChange={(e) => set({ cor: e.target.value })} />
              <Input name="cor" value={form.cor} placeholder="#0a7d4a" disabled={salvando || !editarIdentidade} onChange={(e) => set({ cor: e.target.value })} />
            </div>
          </Field>
          <Field label="Logo" hint="PNG ou JPG, até 1 MB." error={erroLogo ?? undefined}>
            <div className="vc-identidade__logo">
              {form.logo ? <img src={form.logo} alt={`Logo de ${cliente?.nome ?? 'cliente'}`} /> : <span className="vc-muted">Sem logo: o portal mostra só a marca Betinhos.</span>}
              {editarIdentidade ? (
                <>
                  <input ref={arquivoRef} className="vc-identidade__arquivo" type="file" name="logo" aria-label="Arquivo do logo" accept="image/png,image/jpeg"
                    onChange={(e) => { void escolherLogo(e.target.files?.[0]); e.target.value = '' }} />
                  <Button type="button" variant="secondary" icon={<ImagePlus size={16} />} disabled={salvando} onClick={() => arquivoRef.current?.click()}>{form.logo ? 'Trocar logo' : 'Enviar logo'}</Button>
                  {form.logo ? <Button type="button" variant="secondary" icon={<Trash2 size={16} />} disabled={salvando} onClick={() => { setErroLogo(null); set({ logo: null, logoMudou: true }) }}>Remover</Button> : null}
                </>
              ) : null}
            </div>
          </Field>
          <PrevisaoMarca nome={form.nomeExibicao || cliente?.nome || ''} cor={form.cor} logo={form.logo} />
        </div>
      </section>
      <section className="vc-secao" aria-labelledby="vc-emails-titulo">
        <h3 id="vc-emails-titulo" className="vc-secao__titulo">E-mails liberados ({doCliente.length})</h3>
        <p className="vc-muted">Estas ações salvam na hora, sem precisar do Salvar.</p>
        {doCliente.length ? (
          <ul className="vc-val-lista">
            {doCliente.map((v) => <UsuarioItem key={v.id} v={v} mostrarCliente={false} ocupado={acoes.ocupado === v.id} onAlternar={(x) => void acoes.alternar(x)} onZerar={acoes.pedirZerar} />)}
          </ul>
        ) : <p className="vc-muted">Nenhum e-mail liberado para este cliente.</p>}
        <Field label="Nome" error={errosNovo.nome}><Input name="novo-nome" value={novo.nome} disabled={liberando} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} /></Field>
        <Field label="E-mail" error={errosNovo.email}><Input name="novo-email" type="email" value={novo.email} disabled={liberando} onChange={(e) => setNovo((n) => ({ ...n, email: e.target.value }))} /></Field>
        <div><Button type="button" variant="secondary" icon={<UserPlus size={16} />} loading={liberando} onClick={() => void liberarEmail()}>Liberar e-mail</Button></div>
      </section>
      <section className="vc-secao">
        <ChoiceGroup label="Domínios liberados">
          <Radio name="vc-quem-entra" label="Só e-mails cadastrados (padrão)" description="Entra quem foi cadastrado na aba Usuários." checked={!form.restringir} disabled={salvando} onChange={() => set({ restringir: false })} />
          <Radio name="vc-quem-entra" label="Também e-mails destes domínios" description="Quem usa o domínio entra e é cadastrado sozinho no primeiro pedido de código." checked={form.restringir} disabled={salvando} onChange={() => set({ restringir: true })} />
        </ChoiceGroup>
        {form.restringir ? (
          <Field label="Domínios" hint="Separe por ; vírgula ou espaço. Exemplo: tenaris.com; ternium.com.br" error={mostrarErros ? erros.dominios : undefined}>
            <Textarea rows={2} name="dominios" value={form.dominiosTexto} disabled={salvando} onChange={(e) => set({ dominiosTexto: e.target.value })} />
          </Field>
        ) : null}
      </section>
      {avisos.map((a) => <Alert key={a} tone="warning" title="Atenção">{a}</Alert>)}
    </form>
  )
  const footer = (
    <>
      <Button variant="secondary" disabled={salvando} onClick={close}>Cancelar</Button>
      <Button loading={salvando} onClick={() => void salvar()}>Salvar</Button>
    </>
  )
  const title = cliente?.nome ?? 'Cliente'
  return (
    <>
      {mobile
        ? <Sheet open={!!cliente} onClose={close} eyebrow="Portal do cliente" title={title} footer={footer}>{body}</Sheet>
        : <Drawer open={!!cliente} onClose={close} eyebrow="Portal do cliente" title={title} footer={footer}>{body}</Drawer>}
      {acoes.dialogo}
      <Dialog open={confirmarSaida} onClose={() => setConfirmarSaida(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirmarSaida(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setConfirmarSaida(false); onClose() }}>Descartar</Button>
        </>}>
        As alterações do portal de {title} ainda não foram salvas.
      </Dialog>
    </>
  )
}

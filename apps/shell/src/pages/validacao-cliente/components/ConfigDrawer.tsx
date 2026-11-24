import { useMemo, useState } from 'react'
import { Alert, Button, ChoiceGroup, Checkbox, Dialog, Drawer, Field, Input, Radio, Sheet, Switch, Textarea, useToast } from '@betinhos/ui'
import { UserPlus } from 'lucide-react'
import type { Source } from '../data/source'
import { MODULOS, configIgual, formDaConfig, validarConfig, type ConfigForm } from '../domain/config'
import { validarValidador } from '../domain/regras'
import type { Cliente, ModuloPortal, PortalConfig, Validador } from '../domain/types'
import { UsuarioItem, useAcoesUsuario } from './UsuarioItem'

type Props = {
  cliente: Cliente | null; config: PortalConfig | null; outros: PortalConfig[]; validadores: Validador[]; source: Source; mobile: boolean
  onClose: () => void; onSaved: (c: PortalConfig) => void; onValidadorSaved: (v: Validador) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const NOVA: ConfigForm = { ligado: false, modulos: [], restringir: false, dominiosTexto: '' }
const inicial = (config: PortalConfig | null) => (config ? formDaConfig(config) : NOVA)

/** Edição do portal de um cliente: liberado, módulos, e-mails e domínios. Fecha por X, Esc ou fundo; com alteração pergunta antes. */
export function ConfigDrawer({ cliente, config, outros, validadores, source, mobile, onClose, onSaved, onValidadorSaved }: Props) {
  const toast = useToast()
  const [form, setForm] = useState<ConfigForm>(inicial(config))
  const [mostrarErros, setMostrarErros] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [confirmarSaida, setConfirmarSaida] = useState(false)
  const base = inicial(config)
  const acoes = useAcoesUsuario(source, onValidadorSaved)
  const [novo, setNovo] = useState({ nome: '', email: '' })
  const [errosNovo, setErrosNovo] = useState<ReturnType<typeof validarValidador>>({})
  const [liberando, setLiberando] = useState(false)
  const idCliente = cliente?.id
  const [idAnterior, setIdAnterior] = useState(idCliente)
  if (idAnterior !== idCliente) { setIdAnterior(idCliente); setForm(base); setMostrarErros(false); setNovo({ nome: '', email: '' }); setErrosNovo({}) }
  const doCliente = validadores.filter((v) => v.cliente.id === idCliente).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const set = (patch: Partial<ConfigForm>) => setForm((f) => ({ ...f, ...patch }))
  const sujo = !configIgual(form, base)
  const { erros, avisos } = useMemo(() => (cliente ? validarConfig(form, cliente.id, outros) : { erros: {}, avisos: [] }), [form, cliente, outros])

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
        {avisos.map((a) => <Alert key={a} tone="warning" title="Domínio público">{a}</Alert>)}
      </section>
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

import { useState } from 'react'
import { Button, Dialog, Drawer, Field, Input, Select, Sheet, StatusBadge, Switch, useToast } from '@betinhos/ui'
import { KeyRound, UserPlus } from 'lucide-react'
import type { Source } from '../data/source'
import { validarValidador } from '../domain/regras'
import type { Cliente, Validador } from '../domain/types'
import { fmtData } from './ValidacaoList'

type Props = { open: boolean; onClose: () => void; validadores: Validador[]; clientes: Cliente[]; source: Source; mobile: boolean; onSaved: (v: Validador) => void }
type Erros = ReturnType<typeof validarValidador>

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const VAZIO = { nome: '', email: '', clienteId: '' }

/** Quem valida no portal: cadastrar, ativar/desativar e refazer o autenticador (zera o TOTP). */
export function ValidadoresDrawer({ open, onClose, validadores, clientes, source, mobile, onSaved }: Props) {
  const toast = useToast()
  const [form, setForm] = useState({ ...VAZIO, clienteId: clientes.length === 1 ? clientes[0].id : '' })
  const [erros, setErros] = useState<Erros>({})
  const [salvando, setSalvando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [refazer, setRefazer] = useState<Validador | null>(null)
  const [confirmarSaida, setConfirmarSaida] = useState(false)
  const sujo = !!(form.nome.trim() || form.email.trim())

  function close() {
    if (salvando) return
    if (sujo) { setConfirmarSaida(true); return }
    onClose()
  }

  async function cadastrar() {
    const found = validarValidador(form, validadores.map((v) => v.email))
    setErros(found)
    if (Object.keys(found).length) return
    setSalvando(true)
    try {
      const id = await source.criarValidador(form)
      const cliente = clientes.find((c) => c.id === form.clienteId)!
      onSaved({ id, nome: form.nome.trim(), email: form.email.trim().toLowerCase(), cliente, ativo: true, ultimoAcesso: null, totpCadastradoEm: null })
      toast({ tone: 'success', message: `${form.nome.trim()} cadastrado. No primeiro acesso, o validador lê o QR code do autenticador.` })
      setForm((f) => ({ ...VAZIO, clienteId: f.clienteId }))
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível cadastrar. ${reasonText(reason)}` })
    } finally {
      setSalvando(false)
    }
  }

  async function alternar(v: Validador) {
    setOcupado(v.id)
    try {
      await source.setValidadorAtivo(v.id, !v.ativo)
      onSaved({ ...v, ativo: !v.ativo })
      toast({ tone: 'success', message: v.ativo ? `${v.nome} não acessa mais o portal.` : `${v.nome} voltou a acessar o portal.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível alterar. ${reasonText(reason)}` })
    } finally {
      setOcupado(null)
    }
  }

  async function confirmarRefazer() {
    if (!refazer) return
    const v = refazer
    setOcupado(v.id)
    try {
      await source.refazerAutenticador(v.id)
      onSaved({ ...v, totpCadastradoEm: null })
      setRefazer(null)
      toast({ tone: 'success', message: `Autenticador de ${v.nome} zerado. Avise o validador: no próximo acesso, será preciso ler um QR code novo.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível refazer o autenticador. ${reasonText(reason)}` })
    } finally {
      setOcupado(null)
    }
  }

  const lista = [...validadores].sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
  const body = (
    <div className="vc-validadores">
      <form className="vc-secao" onSubmit={(e) => { e.preventDefault(); void cadastrar() }} noValidate>
        <h3 className="vc-secao__titulo">Cadastrar validador</h3>
        <Field label="Nome" required error={erros.nome}><Input name="nome" value={form.nome} disabled={salvando} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
        <Field label="E-mail" required error={erros.email}><Input name="email" type="email" value={form.email} disabled={salvando} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Cliente" required error={erros.clienteId}>
          <Select value={form.clienteId || null} disabled={salvando} onChange={(v) => setForm({ ...form, clienteId: v ?? '' })} options={clientes.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Escolha o cliente" />
        </Field>
        <div><Button type="submit" icon={<UserPlus size={16} />} loading={salvando}>Cadastrar validador</Button></div>
      </form>
      <section className="vc-secao" aria-labelledby="vc-val-lista">
        <h3 id="vc-val-lista" className="vc-secao__titulo">Validadores ({lista.length})</h3>
        <ul className="vc-val-lista">
          {lista.map((v) => (
            <li key={v.id} className="vc-val">
              <div className="vc-val__info">
                <strong>{v.nome}</strong>
                <span>{v.email} · {v.cliente.nome}</span>
                <span className="vc-badges">
                  {v.totpCadastradoEm ? <StatusBadge tone="success">Autenticador ativo</StatusBadge> : <StatusBadge tone="warning">Aguardando QR code</StatusBadge>}
                  <span className="vc-muted">{v.ultimoAcesso ? `Último acesso ${fmtData(v.ultimoAcesso)}` : 'Nunca acessou'}</span>
                </span>
              </div>
              <div className="vc-val__acoes">
                <Switch label={v.ativo ? 'Ativo' : 'Inativo'} checked={v.ativo} disabled={ocupado === v.id} onChange={() => void alternar(v)} />
                <Button variant="secondary" size="compact" icon={<KeyRound size={14} />} disabled={ocupado === v.id || !v.totpCadastradoEm} title={v.totpCadastradoEm ? undefined : 'O validador ainda não cadastrou o autenticador.'} onClick={() => setRefazer(v)}>Refazer autenticador</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
  const footer = <Button variant="secondary" disabled={salvando} onClick={close}>Fechar</Button>
  return (
    <>
      {mobile
        ? <Sheet open={open} onClose={close} eyebrow="Validação do cliente" title="Validadores" footer={footer}>{body}</Sheet>
        : <Drawer open={open} onClose={close} eyebrow="Validação do cliente" title="Validadores" footer={footer}>{body}</Drawer>}
      <Dialog open={refazer != null} onClose={() => { if (!ocupado) setRefazer(null) }} tone="danger" title="Refazer autenticador?"
        actions={<>
          <Button variant="secondary" disabled={!!ocupado} onClick={() => setRefazer(null)}>Cancelar</Button>
          <Button variant="danger" loading={!!ocupado} onClick={() => void confirmarRefazer()}>Refazer autenticador</Button>
        </>}>
        O código atual do app de {refazer?.nome} para de funcionar. No próximo acesso, o validador lê um QR code novo. O portal não avisa por e-mail: avise o validador.
      </Dialog>
      <Dialog open={confirmarSaida} onClose={() => setConfirmarSaida(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirmarSaida(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setConfirmarSaida(false); setForm((f) => ({ ...VAZIO, clienteId: f.clienteId })); setErros({}); onClose() }}>Descartar</Button>
        </>}>
        O cadastro do validador ainda não foi salvo.
      </Dialog>
    </>
  )
}

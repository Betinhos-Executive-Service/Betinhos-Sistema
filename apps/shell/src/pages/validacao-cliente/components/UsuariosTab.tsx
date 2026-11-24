import { useState } from 'react'
import { Button, Field, Input, Select, useToast } from '@betinhos/ui'
import { UserPlus } from 'lucide-react'
import type { Source } from '../data/source'
import { validarValidador } from '../domain/regras'
import type { Cliente, Validador } from '../domain/types'
import { UsuarioItem, useAcoesUsuario } from './UsuarioItem'

type Props = { validadores: Validador[]; clientes: Cliente[]; source: Source; onSaved: (v: Validador) => void }
type Erros = ReturnType<typeof validarValidador>

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const VAZIO = { nome: '', email: '', clienteId: '' }

/** Aba Usuários: quem usa o portal; cadastrar, ativar/desativar e zerar a senha. */
export function UsuariosTab({ validadores, clientes, source, onSaved }: Props) {
  const toast = useToast()
  const [form, setForm] = useState({ ...VAZIO, clienteId: clientes.length === 1 ? clientes[0].id : '' })
  const [erros, setErros] = useState<Erros>({})
  const [salvando, setSalvando] = useState(false)
  const { ocupado, alternar, pedirZerar, dialogo } = useAcoesUsuario(source, onSaved)

  const set = (patch: Partial<typeof VAZIO>) => setForm((f) => ({ ...f, ...patch }))

  async function cadastrar() {
    const found = validarValidador(form, validadores.map((v) => v.email))
    setErros(found)
    if (Object.keys(found).length) return
    setSalvando(true)
    try {
      const id = await source.criarValidador(form)
      const cliente = clientes.find((c) => c.id === form.clienteId)!
      onSaved({ id, nome: form.nome.trim(), email: form.email.trim().toLowerCase(), cliente, ativo: true, ultimoAcesso: null, senhaDefinidaEm: null })
      toast({ tone: 'success', message: `${form.nome.trim()} cadastrado. No primeiro acesso, a pessoa cria a senha pelo código enviado ao e-mail.` })
      setForm((f) => ({ ...VAZIO, clienteId: f.clienteId }))
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível cadastrar. ${reasonText(reason)}` })
    } finally {
      setSalvando(false)
    }
  }

  const lista = [...validadores].sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
  return (
    <>
      <div className="vc-validadores">
        <form className="vc-secao" onSubmit={(e) => { e.preventDefault(); void cadastrar() }} noValidate>
          <h3 className="vc-secao__titulo">Cadastrar usuário</h3>
          <Field label="Nome" required error={erros.nome}><Input name="nome" value={form.nome} disabled={salvando} onChange={(e) => set({ nome: e.target.value })} /></Field>
          <Field label="E-mail" required error={erros.email}><Input name="email" type="email" value={form.email} disabled={salvando} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Cliente" required error={erros.clienteId}>
            <Select value={form.clienteId || null} disabled={salvando} onChange={(v) => set({ clienteId: v ?? '' })} options={clientes.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Escolha o cliente" />
          </Field>
          <div><Button type="submit" icon={<UserPlus size={16} />} loading={salvando}>Cadastrar usuário</Button></div>
        </form>
        <section className="vc-secao" aria-labelledby="vc-val-lista">
          <h3 id="vc-val-lista" className="vc-secao__titulo">Usuários ({lista.length})</h3>
          <ul className="vc-val-lista">
            {lista.map((v) => <UsuarioItem key={v.id} v={v} mostrarCliente ocupado={ocupado === v.id} onAlternar={(x) => void alternar(x)} onZerar={pedirZerar} />)}
          </ul>
        </section>
      </div>
      {dialogo}
    </>
  )
}

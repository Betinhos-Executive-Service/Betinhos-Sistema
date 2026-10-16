import { useId, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, Drawer, Field, Input, Select, Switch, Tabs, useToast } from '@betinhos/ui'
import { Plus, Trash2 } from 'lucide-react'
import type { DocsSource } from '../data/source'
import type { TipoInput } from '../data/queries'
import { OBRIG_DA_CATEGORIA, OBRIG_LABEL } from '../domain/codes'
import type { Categoria, DocsData, TipoDoc } from '../domain/types'
import '../documentos.css'

type Props = { source: DocsSource; data: DocsData; onClose: () => void; onChanged: () => void }
type Aba = 'tipos' | 'destinatarios'
/** Tipo em edição: `inicial` é o que abriu o formulário e serve para detectar alteração não salva. */
type Edicao = { id?: string; inicial: TipoInput; form: TipoInput }

const CATEGORIAS: { value: Categoria; label: string }[] = [{ value: 'pessoas', label: 'Pessoas' }, { value: 'frota', label: 'Frota' }]
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const igual = (a: TipoInput, b: TipoInput) => JSON.stringify(a) === JSON.stringify(b)
/** O código vira nome de pasta no SharePoint e prefixo dos arquivos. */
const CODIGO_VALIDO = /^[A-Z0-9_-]{1,40}$/

const novoTipo = (categoria: Categoria, ordem: number): TipoInput => ({ codigo: '', nome: '', categoria, temValidade: true, validadePadraoMeses: null, obrigatorioPara: [], ordem })
const doTipo = (t: TipoDoc): TipoInput => ({ codigo: t.codigo, nome: t.nome, categoria: t.categoria, temValidade: t.temValidade, validadePadraoMeses: t.validadePadraoMeses, obrigatorioPara: [...t.obrigatorioPara], ordem: t.ordem })

/** Tipos de documento e destinatários dos avisos; fechar com o formulário de tipo alterado pede confirmação e salvando não fecha. */
export function ConfigDrawer({ source, data, onClose, onChanged }: Props) {
  const [aba, setAba] = useState<Aba>('tipos')
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [saving, setSaving] = useState(false)
  /** O que o "Descartar" faz: fechar o drawer inteiro ou só voltar do formulário para a lista. */
  const [confirmar, setConfirmar] = useState<'fechar' | 'voltar' | null>(null)
  const dirty = edicao != null && !igual(edicao.form, edicao.inicial)

  const fechar = () => { if (saving) return; if (dirty) { setConfirmar('fechar'); return } onClose() }
  const voltar = () => { if (saving) return; if (dirty) { setConfirmar('voltar'); return } setEdicao(null) }
  const descartar = () => { const acao = confirmar; setConfirmar(null); if (acao === 'voltar') setEdicao(null); else onClose() }

  return (
    <>
      <Drawer open onClose={fechar} size="wide" eyebrow="Documentos" title="Configurações de documentos">
        <Tabs aria-label="Configurações" value={aba} onChange={setAba} tabs={[{ value: 'tipos', label: 'Tipos de documento' }, { value: 'destinatarios', label: 'Destinatários' }]}>
          {aba === 'tipos'
            ? <Tipos source={source} data={data} onChanged={onChanged} edicao={edicao} setEdicao={setEdicao} saving={saving} setSaving={setSaving} onVoltar={voltar} />
            : <Destinatarios source={source} data={data} onChanged={onChanged} />}
        </Tabs>
      </Drawer>
      <Dialog open={confirmar != null} onClose={() => setConfirmar(null)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirmar(null)}>Continuar editando</Button>
          <Button variant="danger" onClick={descartar}>Descartar</Button>
        </>}>
        O que foi alterado neste tipo de documento será perdido.
      </Dialog>
    </>
  )
}

type TiposProps = {
  source: DocsSource; data: DocsData; onChanged: () => void
  edicao: Edicao | null; setEdicao: (e: Edicao | null | ((e: Edicao | null) => Edicao | null)) => void
  saving: boolean; setSaving: (v: boolean) => void
  onVoltar: () => void
}

function Tipos({ source, data, onChanged, edicao, setEdicao, saving, setSaving, onVoltar }: TiposProps) {
  const toast = useToast()
  const formId = useId()
  const [erro, setErro] = useState<string | null>(null)
  const porCategoria = (c: Categoria) => data.tipos.filter((t) => t.categoria === c).sort((a, b) => a.ordem - b.ordem)

  const abrir = (id: string | undefined, form: TipoInput) => { setErro(null); setEdicao({ id, inicial: form, form }) }
  const set = (patch: Partial<TipoInput>) => setEdicao((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e))

  const salvar = async () => {
    if (!edicao || saving) return
    const { id } = edicao
    const form = { ...edicao.form, codigo: edicao.form.codigo.trim().toUpperCase(), nome: edicao.form.nome.trim() }
    if (!form.nome || !form.codigo) { setErro('Informe nome e código.'); return }
    if (!CODIGO_VALIDO.test(form.codigo)) { setErro('Use só letras, números, - ou _ (até 40).'); return }
    if (data.tipos.some((t) => t.codigo.toUpperCase() === form.codigo && t.id !== id)) { setErro('Já existe um tipo com este código.'); return }
    setSaving(true); setErro(null)
    try { await source.salvarTipo(form, id); toast({ tone: 'success', message: 'Tipo salvo' }); setEdicao(null); onChanged() }
    catch (e) { setErro(msg(e)) } finally { setSaving(false) }
  }

  if (edicao) {
    const f = edicao.form
    return (
      <form id={formId} className="doc-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        {erro ? <Alert tone="danger" title="Não foi possível salvar">{erro}</Alert> : null}
        <Field label="Nome" required><Input value={f.nome} disabled={saving} onChange={(e) => set({ nome: e.target.value })} /></Field>
        <Field label="Código" required hint="Também é o nome da pasta no SharePoint. Fica bloqueado depois de salvo."><Input value={f.codigo} disabled={saving || Boolean(edicao.id)} onChange={(e) => set({ codigo: e.target.value })} /></Field>
        <Field label="Categoria" hint={edicao.id ? 'Não muda depois de salvo.' : undefined}>
          <Select aria-label="Categoria" searchable={false} clearable={false} disabled={saving || Boolean(edicao.id)}
            options={CATEGORIAS} value={f.categoria} onChange={(v) => { if (v && v !== f.categoria) set({ categoria: v as Categoria, obrigatorioPara: [] }) }} />
        </Field>
        <Switch label="Tem validade" checked={f.temValidade} disabled={saving} onChange={(e) => set({ temValidade: e.target.checked })} />
        {f.temValidade ? <Field label="Validade padrão (meses)" hint="Vazio: a validade é digitada."><Input type="number" min={1} value={f.validadePadraoMeses ?? ''} disabled={saving} onChange={(e) => set({ validadePadraoMeses: e.target.value ? Number(e.target.value) : null })} /></Field> : null}
        <fieldset className="doc-fieldset">
          <legend>Obrigatório para</legend>
          {OBRIG_DA_CATEGORIA[f.categoria].map((code) => (
            <Checkbox key={code} label={OBRIG_LABEL[code]} checked={f.obrigatorioPara.includes(code)} disabled={saving}
              onChange={(e) => set({ obrigatorioPara: e.target.checked ? [...f.obrigatorioPara, code] : f.obrigatorioPara.filter((x) => x !== code) })} />
          ))}
        </fieldset>
        <div className="doc-acoes">
          <Button variant="secondary" disabled={saving} onClick={onVoltar}>Voltar</Button>
          <Button type="submit" loading={saving}>Salvar tipo</Button>
        </div>
      </form>
    )
  }

  return (
    <div className="doc-form">
      {CATEGORIAS.map((c) => (
        <section key={c.value} className="doc-checklist">
          <h3 className="doc-checklist__title">{c.label}</h3>
          <ul className="doc-checklist__list">
            {porCategoria(c.value).map((t) => (
              <li key={t.id} className="doc-item" aria-label={t.nome}>
                <div className="doc-item__head">
                  <strong className="doc-item__nome">{t.nome}</strong>
                  <Button size="compact" variant="ghost" onClick={() => abrir(t.id, doTipo(t))}>Editar</Button>
                </div>
                <p className="doc-muted">{t.codigo} · {t.temValidade ? (t.validadePadraoMeses ? `vence em ${t.validadePadraoMeses} meses` : 'validade digitada') : 'sem validade'}{t.obrigatorioPara.length ? ` · obrigatório: ${t.obrigatorioPara.map((x) => OBRIG_LABEL[x]).join(', ')}` : ''}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="doc-acoes">
        <Button icon={<Plus size={16} />} onClick={() => abrir(undefined, novoTipo('pessoas', Math.max(0, ...data.tipos.map((t) => t.ordem)) + 1))}>Novo tipo</Button>
      </div>
    </div>
  )
}

function Destinatarios({ source, data, onChanged }: { source: DocsSource; data: DocsData; onChanged: () => void }) {
  const toast = useToast()
  const [escolha, setEscolha] = useState<Record<Categoria, string | null>>({ pessoas: null, frota: null })
  const [ocupado, setOcupado] = useState(false)
  const funcionarios = useMemo(() => data.donos.filter((d) => d.categoria === 'pessoas' && d.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [data.donos])

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true)
    try { await fn(); toast({ tone: 'success', message: ok }); onChanged(); return true }
    catch (e) { toast({ tone: 'danger', message: `Não foi possível salvar: ${msg(e)}` }); return false }
    finally { setOcupado(false) }
  }

  return (
    <div className="doc-form">
      <p className="doc-muted">Quem recebe os avisos de vencimento por e-mail. O endereço usado é o e-mail Betinhos do funcionário.</p>
      {CATEGORIAS.map((c) => {
        const atuais = data.destinatarios.filter((d) => d.categoria === c.value)
        const opcoes = funcionarios.filter((f) => !atuais.some((a) => a.funcionarioId === f.id)).map((f) => ({ value: f.id, label: f.nome }))
        const escolhido = escolha[c.value]
        const adicionar = async () => {
          const f = funcionarios.find((x) => x.id === escolhido)
          if (f && await agir(() => source.adicionarDestinatario(c.value, f.id, f.nome), 'Destinatário adicionado')) setEscolha((e) => ({ ...e, [c.value]: null }))
        }
        return (
          <section key={c.value} className="doc-checklist">
            <h3 className="doc-checklist__title">{c.label}</h3>
            <ul className="doc-checklist__list">
              {atuais.length ? atuais.map((d) => {
                const f = funcionarios.find((x) => x.id === d.funcionarioId)
                return (
                  <li key={d.id} className="doc-item doc-item__head">
                    <span><strong className="doc-item__nome">{d.nome}</strong>{f && !f.email ? <span className="doc-muted"> · sem e-mail Betinhos</span> : null}</span>
                    <Button size="compact" variant="ghost" icon={<Trash2 size={14} />} disabled={ocupado} aria-label={`Remover ${d.nome} de ${c.label}`} onClick={() => void agir(() => source.removerDestinatario(d.id), 'Destinatário removido')} />
                  </li>
                )
              }) : <li className="doc-muted">Ninguém recebe avisos de {c.label}.</li>}
            </ul>
            <div className="doc-acoes doc-acoes--cheia">
              <Select className="doc-acoes__select" aria-label={`Funcionário para ${c.label}`} placeholder="Escolha um funcionário" disabled={ocupado}
                options={opcoes} value={escolhido} onChange={(v) => setEscolha((e) => ({ ...e, [c.value]: v }))} />
              <Button size="compact" disabled={ocupado || !escolhido} aria-label={`Adicionar em ${c.label}`} onClick={() => void adicionar()}>Adicionar</Button>
            </div>
          </section>
        )
      })}
    </div>
  )
}

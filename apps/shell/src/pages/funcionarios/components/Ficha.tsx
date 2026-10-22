import { Alert, Button, buttonClassName, Dialog, Spinner, Tabs } from '@betinhos/ui'
import { ChevronLeft, ExternalLink, FolderOpen, Save, Undo2, X } from 'lucide-react'
import { useQueryTexto } from '../../../nav/queryState'
import { useIsMobile } from '../lib/useMediaQuery'
import { useEffect, useMemo, useRef, useState } from 'react'
import { computeAlertas } from '../data/alerts'
import { todaySP } from '../data/dates'
import { changedKeys, draftFrom, emptyDraft, validateDraft } from '../data/patch'
import { FIELDS, FUNCAO, GROUP_LABELS, optionLabel, TABLE, type FieldGroup } from '../data/schema'
import type { DataSource } from '../data/source'
import type { Draft, Funcionario, ImageField } from '../data/types'
import { errorMessage } from '../data/xrm'
import { AlertBadge, Avatar, StatusBadge } from './Badges'
import { FieldInput } from './FieldInput'
import { ImageDrop } from './ImageDrop'
import { AnotacoesTab } from './Anotacoes'
import { AcessoApp } from './AcessoApp'
import type { AcessoInicial, AcessoSource } from '../data/acesso'
import { DocumentosArquivos } from './DocumentosArquivos'
import { Checklist } from '../../documentos/components/Checklist'
import type { DocsSource } from '../../documentos/data/source'
import { EquipamentosTab, MultasTab, VeiculosTab } from './RelatedTabs'
import { SecretText } from './SecretText'
import { useNotify } from './Toasts'
import { VeiculoPicker } from './VeiculoPicker'

type Tab = 'dados' | 'documentos' | 'multas' | 'veiculos' | 'equipamentos' | 'anotacoes'
const TABS: { key: Tab; label: string }[] = [
  { key: 'dados', label: 'Dados' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'multas', label: 'Multas' },
  { key: 'veiculos', label: 'Veículos' },
  { key: 'equipamentos', label: 'Equipamentos' },
  { key: 'anotacoes', label: 'Anotações' },
]
const GROUPS: FieldGroup[] = ['pessoais', 'vinculo', 'contato', 'detalhes']

type Props = {
  source: DataSource
  docs?: DocsSource | null
  id: string | null
  onClose: () => void
  onSaved: (id: string, created: boolean) => void
  /** Muda quando algo fora da ficha alterou o registro (ex.: cadastro de acesso); força a releitura. */
  versao?: number
  acesso?: AcessoSource | null
  onCadastrarAcesso?: (inicial: AcessoInicial) => void
}

export function Ficha({ source, docs, id, onClose, onSaved, versao, acesso, onCadastrarAcesso }: Props) {
  const notify = useNotify()
  const [original, setOriginal] = useState<Funcionario | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // A seção aberta vive na URL (`secao=documentos`); "Dados" é o padrão. Colaborador novo só tem a seção Dados.
  const [secao, setTab] = useQueryTexto('secao', 'dados')
  const tab: Tab = !id ? 'dados' : TABS.find((item) => item.key === secao)?.key ?? 'dados'
  const idAnterior = useRef(id)
  const [discarding, setDiscarding] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const mobile = useIsMobile()

  useEffect(() => {
    // Trocar de colaborador volta para Dados; na abertura da ficha vale a seção da URL.
    if (idAnterior.current !== id) { idAnterior.current = id; setTab('dados') }
    setErrors({})
    if (!id) {
      setOriginal(null)
      setDraft(emptyDraft())
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setLoadError(null)
    source.get(id).then(
      (record) => { if (alive) { setOriginal(record); setDraft(draftFrom(record)); setLoading(false) } },
      (reason) => { if (alive) { setLoadError(errorMessage(reason)); setLoading(false) } },
    )
    return () => { alive = false }
  }, [id, source, versao])

  useEffect(() => { panel.current?.focus() }, [id])

  const dirty = useMemo(() => changedKeys(original, draft), [original, draft])
  const baseline = useMemo(() => JSON.stringify(original ? draftFrom(original) : emptyDraft()), [original])
  const touched = JSON.stringify(draft) !== baseline
  const isNew = !id
  const nome = String(draft.values.cr40f_nomecompleto ?? '') || (isNew ? 'Novo colaborador' : '')
  const alertas = original ? computeAlertas({
    status: original.values.cr40f_status as number,
    validadeCnh: original.values.cr40f_validadedacnh as string | null,
    dataAso: original.values.cr40f_datadoaso as string | null,
    aniversario: original.values.cr40f_datadeaniversario as string | null,
  }, todaySP()) : []

  // Com alteração não salva, pergunta antes de fechar; durante o salvamento, não fecha.
  function requestClose() {
    if (saving) return
    if (touched) { setDiscarding(true); return }
    onClose()
  }

  function setValue(key: string, value: Draft['values'][string]) {
    setDraft((current) => ({ ...current, values: { ...current.values, [key]: value } }))
    if (errors[key]) setErrors(({ [key]: _, ...rest }) => rest)
  }

  async function save() {
    const found = validateDraft(draft)
    setErrors(found)
    if (Object.keys(found).length) {
      setTab('dados')
      notify('error', `Corrija ${Object.keys(found).length} campo(s) antes de salvar.`)
      return
    }
    setSaving(true)
    try {
      const savedId = await source.save(original, draft)
      const fresh = await source.get(savedId)
      setOriginal(fresh)
      setDraft(draftFrom(fresh))
      notify('success', isNew ? 'Colaborador criado.' : 'Alterações salvas.')
      onSaved(savedId, isNew)
    } catch (reason) {
      notify('error', `Não salvou: ${errorMessage(reason)}. Suas alterações continuam na tela.`)
    } finally {
      setSaving(false)
    }
  }

  async function upload(field: ImageField, file: File) {
    if (!original) return
    try {
      await source.uploadImage(original.id, field, file)
      const fresh = await source.get(original.id)
      setOriginal(fresh)
      notify('success', 'Imagem atualizada.')
      onSaved(original.id, false)
    } catch (reason) {
      notify('error', `Imagem não enviada: ${errorMessage(reason)}`)
    }
  }

  const link = typeof draft.values.cr40f_linkparadocumentos === 'string' ? draft.values.cr40f_linkparadocumentos : ''

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !discarding) requestClose() }}>
      <aside
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-title"
        tabIndex={-1}
        onKeyDown={(event) => { if (event.key === 'Escape' && !discarding) requestClose() }}
      >
        {mobile && (
          <div className="m-ficha-bar">
            <button type="button" className="m-back" onClick={requestClose}><ChevronLeft size={22} aria-hidden /> Funcionários</button>
            {!isNew && <Button variant="secondary" size="touch" icon={<ExternalLink size={18} />} aria-label="Abrir no formulário nativo" onClick={() => source.openForm(TABLE, id!)} />}
          </div>
        )}
        <header className="drawer-head">
          <Avatar name={nome} src={original?.fotoUrl ?? original?.fotoThumb ?? null} size={mobile ? 64 : 56} />
          <div className="drawer-title">
            <h2 id="ficha-title">{nome}</h2>
            <div className="cluster">
              {original && <StatusBadge value={original.values.cr40f_status} />}
              {original && <span className="muted">{optionLabel(FUNCAO, original.values.cr40f_funcao)}</span>}
              {alertas.map((alerta) => <AlertBadge key={alerta.kind} alerta={alerta} />)}
            </div>
          </div>
          {!mobile && (
            <div className="cluster">
              {!isNew && <Button variant="secondary" icon={<ExternalLink size={18} />} title="Abrir no formulário nativo" aria-label="Abrir no formulário nativo" onClick={() => source.openForm(TABLE, id!)} />}
              <Button variant="secondary" icon={<X size={18} />} aria-label="Fechar ficha" onClick={requestClose} />
            </div>
          )}
        </header>

        <div className="drawer-tabs">
          <Tabs aria-label="Seções da ficha" value={tab} onChange={(next) => setTab(next)} tabs={TABS.map((item) => ({ value: item.key, label: item.label, disabled: isNew && item.key !== 'dados' }))} />
        </div>

        <div className="drawer-body" role="tabpanel">
          {loading && <p className="loading-line"><Spinner size={16} label="Carregando ficha" /> Carregando ficha…</p>}
          {loadError && <Alert tone="danger" title="Não foi possível carregar a ficha.">{loadError}</Alert>}

          {!loading && !loadError && tab === 'dados' && (
            <form id="ficha-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
              {GROUPS.map((group) => (
                <fieldset key={group} className="group">
                  <legend>{GROUP_LABELS[group]}</legend>
                  <div className="fields">
                    {FIELDS.filter((field) => field.group === group && !(isNew && field.readonly)).map((field) => (
                      <FieldInput
                        key={field.key}
                        field={field}
                        value={draft.values[field.key]}
                        error={errors[field.key]}
                        changed={!isNew && dirty.includes(field.key)}
                        onChange={(value) => setValue(field.key, value)}
                      />
                    ))}
                    {group === 'vinculo' && (
                      <VeiculoPicker source={source} value={draft.veiculo} changed={!isNew && dirty.includes('cr40f_veiculoatual')} onChange={(veiculo) => setDraft((current) => ({ ...current, veiculo }))} />
                    )}
                  </div>
                </fieldset>
              ))}
              {original && acesso && (
                <AcessoApp
                  funcionario={original}
                  acesso={acesso}
                  onCadastrar={() => onCadastrarAcesso?.({ funcionarioId: original.id, nomeCompleto: String(original.values.cr40f_nomecompleto ?? ''), celular: String(original.values.cr40f_telefonecorporativo ?? '') })}
                  onEncerrado={() => { void source.get(original.id).then((fresh) => { setOriginal(fresh); setDraft(draftFrom(fresh)); onSaved(fresh.id, false) }).catch(() => notify('error', 'Acesso encerrado, mas a ficha não recarregou. Reabra a ficha.')) }}
                />
              )}
            </form>
          )}

          {!loading && original && tab === 'documentos' && (
            <div className="docs">
              {docs ? (
                // O painel de renovação é um <dialog> nativo dentro desta ficha: o Esc dele não pode subir e fechar a ficha.
                <div style={{ display: 'contents' }} onKeyDown={(event) => { if (event.key === 'Escape' && (event.target as HTMLElement).closest('dialog')) event.stopPropagation() }}>
                  <Checklist source={docs} donoId={original.id} />
                </div>
              ) : null}
              {docs ? <h3 className="doc-checklist__title">Outros arquivos</h3> : null}
              <DocumentosArquivos source={source} id={original.id} />
              <div className="images">
                <ImageDrop label="Foto" src={original.fotoUrl} onUpload={(file) => upload('cr40f_foto', file)} />
                <ImageDrop label="Assinatura" src={original.assinaturaUrl} onUpload={(file) => upload('cr40f_assinatura', file)} />
              </div>
              {link
                ? <a className={buttonClassName({ variant: 'secondary' })} href={link} target="_blank" rel="noopener noreferrer"><FolderOpen size={16} aria-hidden /> Pasta antiga no OneDrive</a>
                : null}
              <SecretText html={original.loginsesenhas} onSave={async (html) => { await source.saveLogins(original.id, html); setOriginal(await source.get(original.id)) }} />
            </div>
          )}

          {original && tab === 'multas' && <MultasTab source={source} id={original.id} />}
          {original && tab === 'veiculos' && <VeiculosTab source={source} id={original.id} />}
          {original && tab === 'equipamentos' && <EquipamentosTab source={source} id={original.id} />}
          {original && tab === 'anotacoes' && <AnotacoesTab source={source} id={original.id} />}
        </div>

        {tab === 'dados' && !loading && !loadError && (
          <footer className={`drawer-foot${dirty.length || isNew ? ' drawer-foot--active' : ''}`}>
            <span className="drawer-foot-status">{isNew ? 'Preencha os obrigatórios (*)' : dirty.length ? `${dirty.length} alteração(ões) não salva(s)` : 'Sem alterações'}</span>
            <div className="cluster">
              {!isNew && (
                <Button variant="secondary" icon={<Undo2 size={16} />} disabled={!dirty.length || saving} onClick={() => { if (original) { setDraft(draftFrom(original)); setErrors({}) } }}>
                  Desfazer
                </Button>
              )}
              <Button type="submit" form="ficha-form" icon={<Save size={16} />} loading={saving} disabled={!isNew && !dirty.length}>
                {isNew ? 'Criar colaborador' : 'Salvar'}
              </Button>
            </div>
          </footer>
        )}
      </aside>
      <Dialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setDiscarding(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setDiscarding(false); onClose() }}>Descartar</Button>
        </>}
      >
        As alterações feitas nesta ficha ainda não foram salvas.
      </Dialog>
    </div>
  )
}

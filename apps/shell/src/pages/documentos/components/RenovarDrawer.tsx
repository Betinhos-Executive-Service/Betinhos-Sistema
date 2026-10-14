import { useEffect, useId, useState } from 'react'
import { Alert, Button, Dialog, Drawer, Field, Input, Textarea, Upload, type UploadFile } from '@betinhos/ui'
import { DOC_MAX_BYTES } from '../../funcionarios/data/sharepoint'
import type { DocsSource } from '../data/source'
import type { SalvarDocResult } from '../data/salvar'
import { validadeSugerida } from '../domain/vencimento'
import type { DocEmitido, Dono, TipoDoc } from '../domain/types'
import '../documentos.css'

export type AlvoRenovar = { tipo: TipoDoc; dono: Dono; anterior: DocEmitido | null }
type Form = { numero: string; emissao: string; validade: string; observacao: string; arquivos: File[] }
const VAZIO: Form = { numero: '', emissao: '', validade: '', observacao: '', arquivos: [] }
export const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

type Props = { alvo: AlvoRenovar | null; source: DocsSource; onClose: () => void; onSaved: (r: SalvarDocResult) => void }

/** Adiciona ou renova um documento; fechar com alteração pede confirmação e salvando não fecha. */
export function RenovarDrawer({ alvo, source, onClose, onSaved }: Props) {
  const formId = useId()
  const [form, setForm] = useState<Form>(VAZIO)
  const [validadeManual, setValidadeManual] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  useEffect(() => { setForm(VAZIO); setValidadeManual(false); setErros({}); setFalha(null); setConfirmar(false) }, [alvo])

  if (!alvo) return null
  const { tipo, dono, anterior } = alvo
  // Tipo com validade padrão (ASO): a emissão é a data do exame que a ficha e o App Motoristas usam para calcular o vencimento.
  const exigeEmissao = tipo.validadePadraoMeses != null
  const dirty = form.numero !== '' || form.emissao !== '' || form.validade !== '' || form.observacao !== '' || form.arquivos.length > 0

  const fechar = () => { if (saving) return; if (dirty) { setConfirmar(true); return } onClose() }
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const mudarEmissao = (emissao: string) => {
    const sugerida = validadeSugerida(tipo, emissao || null)
    set(validadeManual || !sugerida ? { emissao } : { emissao, validade: sugerida })
  }

  const validar = () => {
    const e: Record<string, string> = {}
    if (exigeEmissao && !form.emissao) e.emissao = 'Informe a data de emissão.'
    if (tipo.temValidade && !form.validade) e.validade = 'Informe a validade.'
    if (form.emissao && form.validade && form.validade < form.emissao) e.validade = 'A validade não pode ser antes da emissão.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  const salvar = async () => {
    if (saving || !validar()) return
    setSaving(true); setFalha(null)
    let r: SalvarDocResult
    try {
      r = await source.salvarDocumento({ tipo, dono, anterior, numero: form.numero, emissao: form.emissao || null, validade: form.validade || null, observacao: form.observacao, arquivos: form.arquivos })
    } catch (reason) {
      setFalha(reason instanceof Error ? reason.message : String(reason))
      return
    } finally { setSaving(false) }
    // Fora do try: o documento já foi salvo; um erro de quem chamou não pode pedir para salvar de novo.
    onSaved(r)
  }

  const uploadFiles: UploadFile[] = form.arquivos.map((f) => ({ name: f.name, size: f.size, type: f.type }))
  // O Upload devolve os mesmos objetos que recebeu, menos o removido: reconcilia por posição, nunca por nome.
  const footer = (
    <>
      <Button variant="secondary" disabled={saving} onClick={fechar}>Cancelar</Button>
      <Button type="submit" form={formId} loading={saving}>Salvar documento</Button>
    </>
  )

  return (
    <>
      <Drawer open onClose={fechar} eyebrow={dono.nome} title={`${anterior ? 'Renovar' : 'Adicionar'} ${tipo.nome}`} footer={footer}>
        <form id={formId} className="doc-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
          {falha ? <Alert tone="danger" title="Não foi possível salvar">{falha} O que você digitou foi mantido.</Alert> : null}
          {anterior ? <p className="doc-muted">O documento atual vira histórico ao salvar.</p> : null}
          <Field label="Número"><Input value={form.numero} disabled={saving} onChange={(e) => set({ numero: e.target.value })} /></Field>
          <div className="doc-form__datas">
            <Field label="Emissão" required={exigeEmissao} error={erros.emissao}><Input type="date" value={form.emissao} disabled={saving} onChange={(e) => mudarEmissao(e.target.value)} /></Field>
            {tipo.temValidade ? (
              <Field label="Validade" required error={erros.validade} hint={tipo.validadePadraoMeses ? `Sugerida: emissão + ${tipo.validadePadraoMeses} meses` : undefined}>
                <Input type="date" value={form.validade} disabled={saving} onChange={(e) => { setValidadeManual(true); set({ validade: e.target.value }) }} />
              </Field>
            ) : null}
          </div>
          <Field label="Observação"><Textarea rows={2} value={form.observacao} disabled={saving} onChange={(e) => set({ observacao: e.target.value })} /></Field>
          <Upload
            label="Arquivos"
            hint="PDF, JPG ou PNG, até 10 MB cada."
            accept={ACCEPT}
            maxSize={DOC_MAX_BYTES}
            files={uploadFiles}
            disabled={saving}
            onChange={(files, added) => set({ arquivos: [...form.arquivos.filter((_, i) => files.includes(uploadFiles[i])), ...added] })}
          />
        </form>
      </Drawer>
      <Dialog open={confirmar} onClose={() => setConfirmar(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirmar(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setConfirmar(false); onClose() }}>Descartar</Button>
        </>}>
        O que foi digitado neste documento será perdido.
      </Dialog>
    </>
  )
}

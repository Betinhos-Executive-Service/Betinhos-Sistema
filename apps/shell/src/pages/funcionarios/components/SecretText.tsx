import { Button } from '@betinhos/ui'
import { Copy, Eye, EyeOff, Lock, Save, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { plainToRichText, richTextToPlain } from '../data/format'
import { errorMessage } from '../data/xrm'
import { useNotify } from './Toasts'

/** "Logins e senhas": editável, oculto por padrão; o olho revela. */
export function SecretText({ html, onSave }: { html: string | null; onSave: (html: string | null) => Promise<void> }) {
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)
  const notify = useNotify()
  const text = useMemo(() => richTextToPlain(html), [html])
  const [value, setValue] = useState(text)
  useEffect(() => setValue(text), [text])
  const dirty = value.trim() !== text

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      notify('success', 'Logins copiados.')
    } catch {
      notify('error', 'Não foi possível copiar. Revele e selecione o texto.')
    }
  }

  async function save() {
    setSaving(true)
    try {
      await onSave(plainToRichText(value) || null)
      notify('success', 'Logins e senhas salvos.')
    } catch (error) {
      notify('error', `Não foi possível salvar: ${errorMessage(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="secret" aria-labelledby="secret-title">
      <header>
        <h3 id="secret-title"><Lock size={16} aria-hidden /> Logins e senhas</h3>
        <div className="secret-actions">
          {value && <Button variant="secondary" size="compact" icon={<Copy size={14} />} onClick={copy}>Copiar</Button>}
          {dirty && <Button variant="secondary" size="compact" icon={<Undo2 size={14} />} disabled={saving} onClick={() => setValue(text)}>Desfazer</Button>}
          {dirty && <Button size="compact" icon={<Save size={14} />} loading={saving} onClick={() => void save()}>Salvar</Button>}
        </div>
      </header>
      <div className="bt-control bt-control--textarea secret-field">
        <textarea
          aria-label="Logins e senhas"
          className={`bt-control__input${revealed ? '' : ' is-masked'}`}
          value={value}
          placeholder="Nada cadastrado."
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
        />
        <Button variant="ghost" size="compact" className="secret-eye" icon={revealed ? <EyeOff size={16} /> : <Eye size={16} />} aria-pressed={revealed} aria-label={revealed ? 'Ocultar logins e senhas' : 'Mostrar logins e senhas'} title={revealed ? 'Ocultar' : 'Mostrar'} onClick={() => setRevealed((current) => !current)} />
      </div>
    </section>
  )
}

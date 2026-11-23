import { useMemo, useState } from 'react'
import { compararMatrizes, type Matriz } from '@betinhos/app-config'
import { Button, Dialog, Field, Textarea } from '@betinhos/ui'
import { afetadosPorMudanca, ROTULO_PERFIL, rotuloChave } from '../domain/regras'
import type { Motorista } from '../domain/types'

type Props = {
  open: boolean
  onClose: () => void
  publicada: Matriz | null
  rascunho: Matriz
  numeroNoAr: number | null
  motoristas: Motorista[]
  hoje: string
  /** Devolve `true` quando publicou (o diálogo fecha). */
  onConfirmar: (nota: string) => Promise<boolean>
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios)

/** O que muda, quantos motoristas sentem e a nota da versão. Não fecha durante a publicação; nota digitada pede confirmação para sair. */
export function PublicarDialog({ open, onClose, publicada, rascunho, numeroNoAr, motoristas, hoje, onConfirmar }: Props) {
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [descartar, setDescartar] = useState(false)

  // Fechado, não recalcula a cada célula alterada na matriz.
  const mudancas = useMemo(() => (open ? compararMatrizes(publicada, rascunho) : []), [open, publicada, rascunho])
  const itens = useMemo(() => mudancas.map((m) => ({ m, afetados: afetadosPorMudanca(m, publicada, rascunho, motoristas, hoje) })), [mudancas, publicada, rascunho, motoristas, hoje])
  const total = useMemo(() => new Set(itens.flatMap((i) => i.afetados.map((a) => a.id))).size, [itens])

  const fechar = () => {
    if (enviando) return
    if (nota.trim()) { setDescartar(true); return }
    onClose()
  }
  const publicar = async () => {
    setEnviando(true)
    try { if (await onConfirmar(nota)) { setNota(''); onClose() } } finally { setEnviando(false) }
  }

  return (
    <>
      <Dialog open={open} onClose={fechar} title={`Publicar a versão ${(numeroNoAr ?? 0) + 1}?`}
        actions={<>
          <Button variant="secondary" disabled={enviando} onClick={fechar}>Cancelar</Button>
          <Button loading={enviando} disabled={mudancas.length === 0} onClick={() => void publicar()}>Publicar</Button>
        </>}>
        <div className="am-publicar">
          <p>{mudancas.length} {plural(mudancas.length, 'mudança', 'mudanças')} · {total} {plural(total, 'motorista sentirá', 'motoristas sentirão')} a diferença{total ? ' (já descontadas as exceções e o grupo piloto)' : ''}.</p>
          <ul className="am-publicar__lista">
            {itens.map(({ m, afetados }) => (
              <li key={`${m.perfil}:${m.chave}`}>
                <span><strong>{rotuloChave(m.chave)}</strong> · {ROTULO_PERFIL[m.perfil]}: {m.de ? 'ligado' : 'desligado'} → <strong>{m.para ? 'ligado' : 'desligado'}</strong></span>
                <small className="am-muted">{afetados.length} {plural(afetados.length, 'motorista', 'motoristas')}</small>
              </li>
            ))}
          </ul>
          <Field label="Nota da versão (opcional)" hint="Aparece no histórico. Ex.: por que essa mudança.">
            <Textarea rows={3} maxLength={500} value={nota} disabled={enviando} onChange={(e) => setNota(e.target.value)} />
          </Field>
        </div>
      </Dialog>
      <Dialog open={descartar} onClose={() => setDescartar(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setDescartar(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setDescartar(false); setNota(''); onClose() }}>Descartar</Button>
        </>}>
        A nota desta versão ainda não foi publicada.
      </Dialog>
    </>
  )
}

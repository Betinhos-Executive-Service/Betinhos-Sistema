import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Checkbox } from '@betinhos/ui'
import { FileText } from 'lucide-react'
import { baixarComprovantes, textoErroPdf } from '../../comunicados/data/baixarComprovantes'
import type { Source as ComunicadosSource } from '../../comunicados/data/source'
import { descricaoConclusao, paresDoMotorista } from '../../comunicados/domain/comprovante'
import { plural } from '../../comunicados/domain/comunicados'
import { Status, useLoad } from './RelatedTabs'
import { useNotify } from './Toasts'

/** Comunicados que o motorista já concluiu (ciência assinada ou leitura confirmada); marcados por padrão para o PDF de evidência. */
export function ComunicadosTab({ source, id, nome }: { source: ComunicadosSource; id: string; nome: string }) {
  const notify = useNotify()
  const load = useCallback(() => Promise.all([source.comunicados(), source.destinatariosDoMotorista(id)]), [source, id])
  const { data, loading, error } = useLoad(load)
  const pares = useMemo(() => (data ? paresDoMotorista(nome, data[0], data[1], new Set()) : []), [data, nome])
  const [desmarcados, setDesmarcados] = useState<ReadonlySet<string>>(new Set())
  const [gerando, setGerando] = useState(false)
  useEffect(() => setDesmarcados(new Set()), [data])

  const escolhidos = pares.filter((par) => !desmarcados.has(par.destinatario.id))
  const alternar = (destId: string) => setDesmarcados((atual) => { const novo = new Set(atual); if (!novo.delete(destId)) novo.add(destId); return novo })
  const gerar = async () => {
    setGerando(true)
    try { await baixarComprovantes(source, 'motorista', nome, escolhidos) } catch (reason) { notify('error', textoErroPdf(reason)) } finally { setGerando(false) }
  }

  return (
    <div className="related">
      <Status loading={loading} error={error} empty={!pares.length} emptyText="Este motorista ainda não concluiu nenhum comunicado." />
      {pares.length ? (
        <>
          <ul className="cards">
            {pares.map((par) => (
              <li key={par.destinatario.id} className="card">
                <Checkbox label={par.comunicado.titulo} description={descricaoConclusao(par)}
                  checked={!desmarcados.has(par.destinatario.id)} disabled={gerando} onChange={() => alternar(par.destinatario.id)} />
              </li>
            ))}
          </ul>
          <div className="cluster">
            <Button icon={<FileText size={16} />} loading={gerando} disabled={!escolhidos.length} onClick={() => void gerar()}>Gerar PDF ({escolhidos.length})</Button>
            <span className="muted">{pares.length} {plural(pares.length, 'comunicado concluído', 'comunicados concluídos')}</span>
          </div>
        </>
      ) : null}
    </div>
  )
}

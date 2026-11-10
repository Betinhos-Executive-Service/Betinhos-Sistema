import { useEffect, useMemo, useState } from 'react'
import { Alert, Avatar, Button, Checkbox, Dialog, SearchBox, Skeleton, useToast } from '@betinhos/ui'
import { ArrowLeft, FileText } from 'lucide-react'
import { baixarComprovantes, textoErroPdf } from '../data/baixarComprovantes'
import type { Source } from '../data/source'
import { descricaoConclusao, paresDoMotorista } from '../domain/comprovante'
import { plural, type Comunicado, type Destinatario, type Motorista } from '../domain/comunicados'

type Props = { motoristas: Motorista[]; comunicados: Comunicado[]; source: Source; onClose: () => void }

/** Passo 1: escolher o motorista. Passo 2: marcar os comunicados que ele concluiu (todos marcados) e gerar o PDF. */
export function PdfMotoristaDialog({ motoristas, comunicados, source, onClose }: Props) {
  const toast = useToast()
  const [busca, setBusca] = useState('')
  const [motorista, setMotorista] = useState<Motorista | null>(null)
  const [rows, setRows] = useState<Destinatario[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [desmarcados, setDesmarcados] = useState<ReadonlySet<string>>(new Set())
  const [gerando, setGerando] = useState(false)
  const [tentativa, setTentativa] = useState(0)

  // Só a escolha mais recente vale: trocar de motorista antes da resposta descarta a anterior.
  useEffect(() => {
    if (!motorista) return
    let vale = true
    setRows(null)
    setErro(null)
    setDesmarcados(new Set())
    source.destinatariosDoMotorista(motorista.id).then(
      (lista) => { if (vale) setRows(lista) },
      (reason: unknown) => { if (vale) setErro(reason instanceof Error ? reason.message : String(reason)) },
    )
    return () => { vale = false }
  }, [motorista, source, comunicados, tentativa])

  const termo = busca.trim().toLowerCase()
  const lista = motoristas.filter((m) => !termo || m.nome.toLowerCase().includes(termo))
  const concluidos = useMemo(() => (motorista && rows ? paresDoMotorista(motorista.nome, comunicados, rows, new Set()) : []), [motorista, rows, comunicados])
  const escolhidos = concluidos.filter((par) => !desmarcados.has(par.destinatario.id))

  const alternar = (id: string) => setDesmarcados((atual) => { const next = new Set(atual); if (!next.delete(id)) next.add(id); return next })
  const fechar = () => { if (!gerando) onClose() }
  const gerar = async () => {
    if (!motorista || gerando || !escolhidos.length) return
    setGerando(true)
    try {
      await baixarComprovantes(source, 'motorista', motorista.nome, escolhidos)
      onClose()
    } catch (reason) {
      toast({ tone: 'danger', message: textoErroPdf(reason) })
      setGerando(false)
    }
  }

  const voltar = <Button variant="secondary" disabled={gerando} icon={<ArrowLeft size={16} />} onClick={() => { setMotorista(null); setRows(null); setErro(null) }}>Trocar motorista</Button>

  return (
    <Dialog open title={motorista ? `PDF de ${motorista.nome}` : 'Gerar PDF por motorista'} onClose={fechar}
      actions={motorista
        ? <>{voltar}<Button icon={<FileText size={16} />} loading={gerando} disabled={!escolhidos.length} onClick={() => void gerar()}>Gerar PDF ({escolhidos.length})</Button></>
        : <Button variant="secondary" onClick={fechar}>Fechar</Button>}>
      {!motorista ? (
        <div className="cm-pdfdlg" key="motorista">
          <p>Escolha o motorista. Depois você marca os comunicados que entram no PDF.</p>
          <SearchBox value={busca} onChange={setBusca} placeholder="Buscar motorista" aria-label="Buscar motorista" />
          <ul className="cm-pdfdlg__list">
            {lista.map((m) => (
              <li key={m.id}>
                <button type="button" className="cm-pdfdlg__pick" onClick={() => setMotorista(m)}><Avatar name={m.nome} size="sm" /><span>{m.nome}</span></button>
              </li>
            ))}
            {!lista.length ? <li className="cm-pdfdlg__empty">Nenhum motorista encontrado.</li> : null}
          </ul>
        </div>
      ) : (
        <div className="cm-pdfdlg" key="comunicados" aria-busy={!rows && !erro}>
          {erro ? <Alert tone="danger" title="Não foi possível carregar" action={<Button variant="secondary" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</Button>}>{erro}</Alert> : null}
          {!rows && !erro ? [0, 1, 2].map((i) => <Skeleton key={i} shape="rect" height={36} />) : null}
          {rows && !concluidos.length ? <p className="cm-pdfdlg__empty">Este motorista ainda não concluiu nenhum comunicado.</p> : null}
          {concluidos.length ? (
            <>
              <p>{concluidos.length} {plural(concluidos.length, 'comunicado concluído', 'comunicados concluídos')}. Desmarque o que não deve entrar no PDF.</p>
              <ul className="cm-pdfdlg__list">
                {concluidos.map((par) => (
                  <li key={par.destinatario.id} className={desmarcados.has(par.destinatario.id) ? undefined : 'is-checked'}>
                    <Checkbox label={par.comunicado.titulo} description={descricaoConclusao(par)}
                      checked={!desmarcados.has(par.destinatario.id)} disabled={gerando} onChange={() => alternar(par.destinatario.id)} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </Dialog>
  )
}

import { Button } from '@betinhos/ui'
import { AlertCircle, Download, ExternalLink, FileText, Paperclip } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { formatBR, todaySP } from '../data/dates'
import { fileToBase64, base64ToBlob, validateAditivo, type DataSource } from '../data/source'
import type { Funcionario } from '../data/types'

type Props = {
  /** Colaborador salvo; sem id (colaborador novo) não há o que gerar. */
  id: string | null
  atual: Funcionario['aditivo']
  /** Dia da assinatura registrada (`yyyy-MM-dd`), coluna `new_aditivoassinaturaem`. */
  assinadoEm: string | null
  source: Pick<DataSource, 'gerarAditivo' | 'registrarAditivo'>
  /** Chamado depois que o servidor aceitou o PDF assinado (a ficha recarrega). */
  onRegistrado: () => void | Promise<void>
  disabled?: boolean
  /** Dia de hoje (`yyyy-MM-dd`, Brasília); injetável para teste. */
  hoje?: string
}

const VALIDADOR = 'https://validar.iti.gov.br'

/** Aditivo de assinatura eletrônica: gera o PDF, o gestor assina no gov.br e anexa o arquivo devolvido; o servidor confere e registra. */
export function AditivoAssinatura({ id, atual, assinadoEm, source, onRegistrado, disabled, hoje }: Props) {
  const campoData = useId()
  const input = useRef<HTMLInputElement>(null)
  const [gerando, setGerando] = useState(false)
  const [anexando, setAnexando] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [data, setData] = useState(hoje ?? todaySP())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const limite = hoje ?? todaySP()
  const futura = data > limite
  const ocupado = Boolean(disabled) || gerando || enviando

  function fechar() { setAnexando(false); setArquivo(null); setErro(null); setData(limite) }

  function escolher(file: File | undefined) {
    if (!file) return
    const problema = validateAditivo(file)
    setErro(problema)
    setArquivo(problema ? null : file)
  }

  async function gerar() {
    if (!id) return
    setGerando(true); setErro(null)
    try {
      const { pdfBase64, nomeArquivo } = await source.gerarAditivo(id)
      const url = URL.createObjectURL(base64ToBlob(pdfBase64, 'application/pdf'))
      const link = document.createElement('a')
      link.href = url; link.download = nomeArquivo
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) {
      setErro(reason instanceof Error ? reason.message : 'Não foi possível gerar o aditivo.')
    } finally { setGerando(false) }
  }

  async function registrar() {
    if (!id || !arquivo || futura) return
    setEnviando(true); setErro(null)
    try {
      await source.registrarAditivo(id, await fileToBase64(arquivo), data)
      fechar()
      await onRegistrado()
    } catch (reason) {
      // A recusa do servidor aparece sem alteração.
      setErro(reason instanceof Error ? reason.message : 'Não foi possível registrar o aditivo.')
    } finally { setEnviando(false) }
  }

  return (
    <div className="aditivo field--wide">
      <p className="hint">Sem o aditivo, o motorista não assina termos pelo app.</p>
      {!id && <p className="hint">Salve o colaborador para gerar o aditivo.</p>}
      {atual && assinadoEm && (
        <div className="cluster">
          <span className="aditivo-pendente">Assinado em {formatBR(assinadoEm)}</span>
          <a className="aditivo-link" href={atual.url} target="_blank" rel="noopener noreferrer" title={atual.nome}><Download size={16} aria-hidden /> Baixar</a>
          <a className="aditivo-link" href={VALIDADOR} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden /> Conferir no validar.iti.gov.br</a>
        </div>
      )}
      <div className="cluster">
        <Button variant="secondary" size="compact" icon={<FileText size={16} />} disabled={ocupado || !id} onClick={() => void gerar()}>{gerando ? 'Gerando…' : 'Gerar aditivo'}</Button>
        <Button variant="secondary" size="compact" icon={<Paperclip size={16} />} disabled={ocupado || !id || anexando} onClick={() => setAnexando(true)}>Anexar assinado</Button>
      </div>
      {anexando && (
        <div className="aditivo-anexar">
          <div className="cluster">
            <Button variant="secondary" size="compact" disabled={ocupado} onClick={() => input.current?.click()}>{arquivo ? 'Trocar PDF' : 'Escolher PDF'}</Button>
            <span className="aditivo-pendente">{arquivo ? arquivo.name : 'PDF assinado no gov.br, até 5 MB'}</span>
          </div>
          <div className="bt-field">
            <label className="bt-field__label" htmlFor={campoData}>Data da assinatura</label>
            <div className={`bt-control bt-control--input${futura ? ' bt-control--invalid' : ''}`}>
              <input id={campoData} className="bt-control__input" type="date" max={limite} value={data} disabled={ocupado} aria-invalid={futura} onChange={(event) => setData(event.target.value)} />
            </div>
          </div>
          {futura && <span className="bt-field__error" role="alert"><AlertCircle size={14} aria-hidden />A data da assinatura não pode ser no futuro.</span>}
          {erro && <span className="bt-field__error" role="alert"><AlertCircle size={14} aria-hidden />{erro}</span>}
          <div className="cluster">
            <Button size="compact" disabled={ocupado || !arquivo || futura || !data} onClick={() => void registrar()}>{enviando ? 'Registrando…' : 'Registrar aditivo'}</Button>
            <Button variant="secondary" size="compact" disabled={enviando} onClick={fechar}>Cancelar</Button>
          </div>
        </div>
      )}
      {!anexando && erro && <span className="bt-field__error" role="alert"><AlertCircle size={14} aria-hidden />{erro}</span>}
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden aria-label="Arquivo do aditivo (PDF)" onChange={(event) => { escolher(event.target.files?.[0]); event.target.value = '' }} />
    </div>
  )
}

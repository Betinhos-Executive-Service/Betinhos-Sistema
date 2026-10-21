import { useCallback, useEffect, useId, useRef, useState, type HTMLAttributes, type SyntheticEvent } from 'react'
import { Alert, Button, Dialog, Progress, StatusBadge, useToast } from '@betinhos/ui'
import { ImageOff, ImagePlus, Star, Trash2, X } from 'lucide-react'
import type { Source } from '../data/source'
import { ajustesAoExcluir, ajustesCapa, aplicarAjustes, arquivosColados, editavel, miniaturaDaCapa, nasceCapa, nomeFoto, ordenarFotos, validarFoto, type AjusteCapa, type Foto } from '../domain/fotos'

type Props = {
  /** Item salvo; null = cadastro novo (fotos só depois do primeiro salvamento). */
  equipamentoId: string | null
  source: Source
  /** Miniatura da capa para a lista (null = sem capa, volta ao ícone do tipo). */
  onCapa: (equipamentoId: string, miniatura: string | null) => void
  /** Avisa o drawer enquanto há envio na fila (o drawer não fecha no meio). */
  onEnviando: (enviando: boolean) => void
}

type Progresso = { total: number; feitos: number; atual: string }

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const temArquivos = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
/** `cancel` (Esc) é evento do React em qualquer elemento, mas os tipos só o declaram no <dialog>. */
const PARAR_CANCEL = { onCancel: (event: SyntheticEvent) => event.stopPropagation() } as HTMLAttributes<HTMLDivElement>
const AJUDA = 'Cole com Ctrl+V, arraste as imagens ou use Adicionar fotos. PNG, JPG, GIF ou BMP até 5 MB.'

/**
 * Fotos do equipamento, como os anexos do Planner: Ctrl+V com o drawer aberto, arrastar vários arquivos ou escolher
 * (no celular abre câmera ou galeria). Envio uma a uma, na ordem; a primeira vira capa.
 */
export function FotosSecao({ equipamentoId, source, onCapa, onEnviando }: Props) {
  const toast = useToast()
  const tituloId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [fotos, setFotos] = useState<Foto[] | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [vendo, setVendo] = useState<Foto | null>(null)
  const [excluindo, setExcluindo] = useState<Foto | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Refs para o laço de envio e os listeners da janela lerem o estado atual, não o da renderização que os criou.
  const fotosRef = useRef<Foto[]>([])
  const itemRef = useRef(equipamentoId)
  const fila = useRef<File[]>([])
  const rodando = useRef(false)
  const montado = useRef(true)
  itemRef.current = equipamentoId

  const atualizar = useCallback((id: string, fn: (list: Foto[]) => Foto[]) => {
    if (itemRef.current !== id) return
    fotosRef.current = ordenarFotos(fn(fotosRef.current))
    setFotos(fotosRef.current)
    onCapa(id, miniaturaDaCapa(fotosRef.current))
  }, [onCapa])

  const carregar = useCallback(async (id: string) => {
    setFotos(null)
    setErroCarga(null)
    try {
      const list = ordenarFotos(await source.fotos(id))
      if (itemRef.current !== id) return
      fotosRef.current = list
      setFotos(list)
      // Acerta a miniatura da lista com o que está gravado (outra pessoa pode ter mexido nas fotos).
      onCapa(id, miniaturaDaCapa(list))
    } catch (reason) {
      if (itemRef.current === id) setErroCarga(reasonText(reason))
    }
  }, [source, onCapa])

  // Outro item (ou cadastro novo): recomeça do zero; o que estava na fila do item anterior não é enviado.
  useEffect(() => {
    fila.current = []
    fotosRef.current = []
    setFotos(null)
    setErros([])
    setProgresso(null)
    setVendo(null)
    setExcluindo(null)
    if (equipamentoId) void carregar(equipamentoId)
  }, [equipamentoId, carregar])

  // Drawer fechado (ou ?ver= trocado por voltar/avançar): o que ainda está na fila não é enviado e o drawer deixa de
  // esperar por esta seção (a foto que já estava subindo termina sozinha, sem mexer no aviso de envio da próxima).
  useEffect(() => {
    montado.current = true
    return () => { montado.current = false; fila.current = []; onEnviando(false) }
  }, [onEnviando])

  const pronto = Boolean(equipamentoId) && fotos != null

  async function processar(id: string) {
    rodando.current = true
    onEnviando(true)
    try {
      while (fila.current.length && itemRef.current === id) {
        const file = fila.current.shift()!
        const nome = nomeFoto(file)
        setProgresso((p) => p && { ...p, atual: nome })
        try {
          const nova = await source.addFoto(id, file, nome, nasceCapa(fotosRef.current))
          atualizar(id, (list) => [...list, nova])
        } catch (reason) {
          if (itemRef.current === id) setErros((e) => [...e, `${nome}: não foi enviada. ${reasonText(reason)}`])
        }
        if (itemRef.current === id) setProgresso((p) => p && { ...p, feitos: p.feitos + 1 })
      }
    } finally {
      rodando.current = false
      // Item trocado (voltar/avançar) enquanto a última foto do anterior subia: a fila agora é do item aberto e segue.
      if (fila.current.length && itemRef.current && itemRef.current !== id) void processar(itemRef.current)
      else if (montado.current) { setProgresso(null); onEnviando(false) }
    }
  }

  /** Valida tudo antes (inválido não vai para a fila) e envia os válidos na ordem recebida. */
  function adicionar(files: File[]) {
    if (!files.length) return
    if (!equipamentoId) { setErros(['Salve o item para adicionar fotos.']); return }
    if (fotos == null) { setErros([erroCarga ? 'As fotos não carregaram; tente de novo antes de enviar.' : 'Aguarde as fotos carregarem.']); return }
    const problemas: string[] = []
    const validos: File[] = []
    for (const file of files) {
      const problema = validarFoto(file)
      if (problema) problemas.push(`${file.name || 'Arquivo colado'}: ${problema}`)
      else validos.push(file)
    }
    setErros((e) => (rodando.current ? [...e, ...problemas] : problemas))
    if (!validos.length) return
    fila.current.push(...validos)
    setProgresso((p) => ({ total: (p?.total ?? 0) + validos.length, feitos: p?.feitos ?? 0, atual: p?.atual ?? nomeFoto(validos[0]) }))
    if (!rodando.current) void processar(equipamentoId)
  }
  const adicionarRef = useRef(adicionar)
  adicionarRef.current = adicionar

  // Ctrl+V com o drawer aberto envia a imagem (como na ficha do veículo); texto colado num campo segue para o campo.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = arquivosColados(event.clipboardData, editavel(event.target))
      if (!files) return
      event.preventDefault()
      adicionarRef.current(files)
    }
    // Arquivo solto em qualquer ponto do drawer vira foto; sem isso o navegador abriria a imagem e a tela se perderia.
    const onDragOver = (event: DragEvent) => {
      if (!temArquivos(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setArrastando(true)
    }
    const onDragLeave = (event: DragEvent) => { if (!event.relatedTarget) setArrastando(false) }
    const onDrop = (event: DragEvent) => {
      if (!temArquivos(event)) return
      event.preventDefault()
      setArrastando(false)
      adicionarRef.current(Array.from(event.dataTransfer?.files ?? []))
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  /**
   * Grava as marcações uma a uma e reflete na tela de uma vez no fim (sem mostrar duas capas no meio da troca);
   * `antes` entra junto (a foto excluída sai da grade com a promoção da nova capa). Falha no meio: a tela fica com o que gravou.
   */
  async function gravarAjustes(id: string, ajustes: AjusteCapa[], antes: (list: Foto[]) => Foto[] = (list) => list) {
    const feitos: AjusteCapa[] = []
    try {
      for (const a of ajustes) {
        await source.setFotoCapa(a.id, a.capa)
        feitos.push(a)
      }
    } finally {
      atualizar(id, (list) => aplicarAjustes(antes(list), feitos))
    }
  }

  async function definirCapa(foto: Foto) {
    if (!equipamentoId || ocupado) return
    const id = equipamentoId
    setOcupado(foto.id)
    try {
      await gravarAjustes(id, ajustesCapa(fotosRef.current, foto.id))
      toast({ tone: 'success', message: `${foto.nome} é a capa agora.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível trocar a capa. ${reasonText(reason)}` })
    } finally {
      setOcupado(null)
    }
  }

  async function excluir(foto: Foto) {
    if (!equipamentoId || ocupado) return
    const id = equipamentoId
    setExcluindo(null)
    setOcupado(foto.id)
    try {
      const ajustes = ajustesAoExcluir(fotosRef.current, foto.id)
      await source.deleteFoto(foto.id)
      await gravarAjustes(id, ajustes, (list) => list.filter((f) => f.id !== foto.id))
      toast({ tone: 'success', message: `Foto ${foto.nome} excluída.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível excluir a foto. ${reasonText(reason)}` })
    } finally {
      setOcupado(null)
    }
  }

  const desabilitado = !pronto
  const total = fotos?.length ?? 0

  let corpo
  if (!equipamentoId) corpo = <p className="eq-fotos__vazio">Salve o item para adicionar fotos.</p>
  else if (erroCarga) {
    corpo = <Alert tone="danger" title="Não foi possível carregar as fotos" action={<Button variant="secondary" size="compact" onClick={() => void carregar(equipamentoId)}>Tentar de novo</Button>}>{erroCarga}</Alert>
  } else if (fotos == null) corpo = <p className="eq-fotos__vazio" role="status">Carregando fotos…</p>
  else if (!fotos.length) corpo = <p className="eq-fotos__vazio">Nenhuma foto ainda. A primeira vira a capa do item na lista.</p>
  else {
    corpo = (
      <ul className="eq-fotos__grade" aria-label="Fotos do equipamento">
        {fotos.map((f) => (
          <li key={f.id} className={`eq-foto${f.capa ? ' eq-foto--capa' : ''}`}>
            <button type="button" className="eq-foto__ver" aria-label={`Ver ${f.nome}`} onClick={() => setVendo(f)}>
              {f.miniatura ? <img src={f.miniatura} alt="" /> : <ImageOff size={24} aria-hidden="true" />}
            </button>
            <div className="eq-foto__pe">
              <span className="eq-foto__nome" title={f.nome}>{f.nome}</span>
              <span className="eq-foto__acoes">
                {f.capa
                  ? <StatusBadge tone="info" icon={<Star size={12} aria-hidden="true" />}>Capa</StatusBadge>
                  : <Button variant="ghost" size="compact" icon={<Star size={16} />} aria-label={`Definir ${f.nome} como capa`} title="Definir como capa" loading={ocupado === f.id} disabled={ocupado != null} onClick={() => void definirCapa(f)} />}
                <Button variant="ghost" size="compact" icon={<Trash2 size={16} />} aria-label={`Excluir ${f.nome}`} title="Excluir" disabled={ocupado != null} onClick={() => setExcluindo(f)} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section className={`eq-fotos${arrastando && pronto ? ' eq-fotos--arrastando' : ''}${desabilitado ? ' eq-fotos--desabilitada' : ''}`} aria-labelledby={tituloId} aria-disabled={!equipamentoId || undefined}>
      <div className="eq-fotos__cabeca">
        <h3 className="eq-form__legend eq-fotos__titulo" id={tituloId}>Fotos{total ? ` (${total})` : ''}</h3>
        <Button variant="secondary" size="compact" icon={<ImagePlus size={16} />} disabled={desabilitado} onClick={() => input.current?.click()}>Adicionar fotos</Button>
        {/* accept image/* abre câmera ou galeria no celular; o tipo exato é conferido por validarFoto. */}
        <input ref={input} type="file" accept="image/*" multiple hidden aria-label="Escolher fotos" onChange={(event) => { adicionar(Array.from(event.target.files ?? [])); event.target.value = '' }} />
      </div>
      {equipamentoId ? <p className="eq-muted">{arrastando && pronto ? 'Solte para enviar as fotos.' : AJUDA}</p> : null}
      {progresso ? <Progress value={progresso.feitos} max={progresso.total} label={`Enviando foto ${Math.min(progresso.feitos + 1, progresso.total)} de ${progresso.total} · ${progresso.atual}`} /> : null}
      {erros.length ? (
        // Some no próximo envio sem erro ou ao trocar de item.
        <Alert tone="danger" title={erros.length === 1 ? 'Uma foto não foi enviada' : `${erros.length} fotos não foram enviadas`}>
          <ul className="eq-fotos__erros">{erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Alert>
      ) : null}
      {corpo}
      {/* O Esc dos diálogos internos não chega ao onCancel do Drawer (o React propaga o cancel pela árvore e fecharia o drawer junto). */}
      <div {...PARAR_CANCEL}>
      <FotoViewer foto={vendo} onClose={() => setVendo(null)} />
      <Dialog open={excluindo != null} onClose={() => setExcluindo(null)} tone="danger" title="Excluir foto?"
        actions={<>
          <Button variant="secondary" onClick={() => setExcluindo(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => excluindo && void excluir(excluindo)}>Excluir</Button>
        </>}>
        {excluindo ? `${excluindo.nome} sai do equipamento e não dá para desfazer.${excluindo.capa && total > 1 ? ' A foto mais antiga restante vira a capa.' : ''}` : null}
      </Dialog>
      </div>
    </section>
  )
}

/** Foto grande (`size=full`); se não carregar, mostra a miniatura com aviso. Fecha por X, Esc ou fundo. */
function FotoViewer({ foto, onClose }: { foto: Foto | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => { setFalhou(false) }, [foto?.id])
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (foto && !dialog.open) dialog.showModal?.()
    if (!foto && dialog.open) dialog.close?.()
  }, [foto])
  const src = foto ? (falhou || !foto.url ? foto.miniatura : foto.url) : null
  return (
    <dialog ref={ref} className="eq-viewer" aria-label={foto?.nome ?? 'Foto'} onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      {foto ? (
        <div className="eq-viewer__panel">
          <header className="eq-viewer__head">
            <strong className="eq-viewer__nome">{foto.nome}</strong>
            {foto.capa ? <StatusBadge tone="info">Capa</StatusBadge> : null}
            <Button variant="ghost" size="compact" icon={<X size={18} />} aria-label="Fechar foto" onClick={onClose} />
          </header>
          <div className="eq-viewer__corpo">
            {src ? <img src={src} alt={foto.nome} onError={() => setFalhou(true)} /> : <ImageOff size={32} aria-hidden="true" />}
          </div>
          {falhou && foto.miniatura ? <p className="eq-muted">A imagem grande não carregou; mostrando a miniatura.</p> : null}
        </div>
      ) : null}
    </dialog>
  )
}

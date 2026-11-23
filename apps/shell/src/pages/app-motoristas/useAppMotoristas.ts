import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Matriz, Perfil } from '@betinhos/app-config'
import type { DefinirPessoa, Source } from './data/source'
import { horaCurta } from './domain/formato'
import { codigoDoErro, contarMudancas, definirCelula, mensagemDoErro, materializar, textoDoErro } from './domain/regras'
import type { Motorista, Versao } from './domain/types'

export type EstadoSalvamento = 'salvo' | 'salvando' | 'erro'

const ATRASO_SALVAR = 600

/**
 * Configuração do App: versões, motoristas e o rascunho em edição. A matriz da tela muda na hora e é gravada com
 * atraso (debounce), sempre uma gravação por vez e com a marca do rascunho que a tela abriu; se outra pessoa mexeu
 * antes (`RASCUNHO_ALTERADO`), a tela recarrega e avisa.
 */
export function useAppMotoristas(source: Source, aviso: (tom: 'success' | 'danger' | 'info', texto: string) => void) {
  const [versoes, setVersoes] = useState<Versao[]>([])
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [matriz, setMatriz] = useState<Matriz>(() => materializar(null))
  const [existe, setExiste] = useState(false)
  const [estado, setEstado] = useState<EstadoSalvamento>('salvo')
  const [ocupado, setOcupado] = useState(false)

  const marca = useRef('')
  const pendente = useRef<Matriz | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emVoo = useRef<Promise<void>>(Promise.resolve())
  const token = useRef(0)
  /** A última gravação falhou: o servidor ainda tem o rascunho antigo, então publicar agora publicaria sem as últimas mudanças. */
  const gravacaoFalhou = useRef(false)

  const publicada = useMemo(() => versoes.find((v) => v.estado === 'publicada') ?? null, [versoes])
  const rascunho = useMemo(() => versoes.find((v) => v.estado === 'rascunho') ?? null, [versoes])

  const aplicarCarga = useCallback((vs: Versao[], ms: Motorista[]) => {
    const r = vs.find((v) => v.estado === 'rascunho') ?? null
    const p = vs.find((v) => v.estado === 'publicada') ?? null
    setVersoes(vs); setMotoristas(ms)
    marca.current = r?.marca ?? ''
    pendente.current = null
    gravacaoFalhou.current = false
    setMatriz(materializar((r ?? p)?.matriz ?? null))
    setExiste(r != null)
    setEstado('salvo')
  }, [])

  const reload = useCallback(async () => {
    const atual = ++token.current
    setLoading(true); setError(null)
    try {
      const c = await source.load()
      if (atual !== token.current) return
      aplicarCarga(c.versoes, c.motoristas)
      setLoaded(true)
    } catch (reason) {
      if (atual === token.current) setError(textoDoErro(reason))
    } finally { if (atual === token.current) setLoading(false) }
  }, [source, aplicarCarga])

  useEffect(() => { void reload() }, [reload])

  /** Recarrega depois de um conflito e avisa quem mexeu. */
  const aposConflito = useCallback(async (reason: unknown) => {
    try {
      const c = await source.load()
      const r = c.versoes.find((v) => v.estado === 'rascunho')
      aplicarCarga(c.versoes, c.motoristas)
      aviso('danger', mensagemDoErro(reason, { quemAlterou: r?.alteradoPor, quando: r ? horaCurta(r.alteradoEm) : undefined }))
    } catch { aviso('danger', mensagemDoErro(reason)) }
  }, [source, aplicarCarga, aviso])

  const gravar = useCallback(() => {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null }
    emVoo.current = emVoo.current.then(async () => {
      const alvo = pendente.current
      if (!alvo) return
      pendente.current = null
      gravacaoFalhou.current = false
      setEstado('salvando')
      try {
        marca.current = await source.salvarRascunho(alvo, marca.current)
        setExiste(true)
        setEstado(pendente.current ? 'salvando' : 'salvo')
      } catch (reason) {
        pendente.current = null
        gravacaoFalhou.current = true
        setEstado('erro')
        if (codigoDoErro(reason) === 'RASCUNHO_ALTERADO') await aposConflito(reason)
        else aviso('danger', `Não foi possível salvar o rascunho. ${mensagemDoErro(reason)}`)
      }
    })
    return emVoo.current
  }, [source, aposConflito, aviso])

  // Sair da tela com mudança ainda no atraso grava antes de perder.
  const gravarAtual = useRef(gravar)
  useEffect(() => { gravarAtual.current = gravar }, [gravar])
  useEffect(() => () => { if (pendente.current) void gravarAtual.current() }, [])

  const programar = useCallback((nova: Matriz) => {
    setMatriz(nova); setExiste(true); setEstado('salvando')
    pendente.current = nova
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => { void gravar() }, ATRASO_SALVAR)
  }, [gravar])

  const alterarCelula = useCallback((perfil: Perfil, chave: string, ligado: boolean) => {
    programar(definirCelula(pendente.current ?? matriz, perfil, chave, ligado))
  }, [matriz, programar])

  const carregarMatriz = useCallback((nova: Matriz) => programar(materializar(nova)), [programar])

  const descartar = useCallback(async () => {
    setOcupado(true)
    try {
      if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null }
      pendente.current = null
      await emVoo.current
      await source.salvarRascunho(null, marca.current, true)
      await reload()
      aviso('success', 'Rascunho descartado. Vale de novo a versão publicada.')
    } catch (reason) {
      if (codigoDoErro(reason) === 'RASCUNHO_ALTERADO') await aposConflito(reason)
      else aviso('danger', `Não foi possível descartar o rascunho. ${mensagemDoErro(reason)}`)
    } finally { setOcupado(false) }
  }, [source, reload, aposConflito, aviso])

  /** Grava o que está pendente e publica. Devolve o número da versão ou `null` se falhou (o aviso já foi dado). */
  const publicar = useCallback(async (nota: string): Promise<number | null> => {
    setOcupado(true)
    try {
      if (pendente.current) await gravar()
      await emVoo.current
      if (gravacaoFalhou.current) {
        aviso('danger', 'As últimas mudanças não foram gravadas. Revise o rascunho antes de publicar.')
        return null
      }
      const numero = await source.publicar(nota.trim())
      await reload()
      return numero
    } catch (reason) {
      if (codigoDoErro(reason) === 'RASCUNHO_ALTERADO') await aposConflito(reason)
      else aviso('danger', mensagemDoErro(reason))
      return null
    } finally { setOcupado(false) }
  }, [source, gravar, reload, aposConflito, aviso])

  const definirPessoa = useCallback(async (dados: DefinirPessoa): Promise<boolean> => {
    try { await source.definirPessoa(dados) } catch (reason) {
      aviso('danger', mensagemDoErro(reason))
      return false
    }
    try { setMotoristas((await source.load()).motoristas) } catch { aviso('info', 'Gravado, mas não foi possível atualizar a lista. Use Atualizar.') }
    return true
  }, [source, aviso])

  const mudancas = useMemo(() => contarMudancas(publicada?.matriz ?? null, matriz), [publicada, matriz])

  return { versoes, motoristas, publicada, rascunho, matriz, mudancas, temRascunho: existe, estado, ocupado, loaded, loading, error, reload, alterarCelula, carregarMatriz, descartar, publicar, definirPessoa }
}

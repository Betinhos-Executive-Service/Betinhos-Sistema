// apps/shell/src/pages/frota/components/useOpcoesBusca.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLookupSearch } from '../../geral/components/useLookupSearch'
import type { OpcaoBusca } from '../data/source'

/**
 * Opções de uma busca no servidor (funcionário, cidade) para o Select do DS: lista inicial ao abrir, refinada ao
 * digitar (useLookupSearch da Geral, com pausa e descarte de resposta velha). A escolhida fica sempre na lista.
 * Texto vazio (abrir o painel, apagar a digitação) volta à lista inicial sem nova busca nem "Carregando…"; se a carga
 * inicial tinha falhado, é a hora de tentar de novo.
 * `buscar` precisa ser estável (useCallback).
 */
export function useOpcoesBusca(buscar: (texto: string) => Promise<OpcaoBusca[]>, escolhida: OpcaoBusca | null) {
  const busca = useLookupSearch(buscar)
  const [iniciais, setIniciais] = useState<OpcaoBusca[]>([])
  const montado = useRef(true)
  const falhouInicial = useRef(false)
  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])
  const carregarIniciais = useCallback(() => {
    buscar('').then(
      (lista) => { falhouInicial.current = false; if (montado.current) setIniciais(lista) },
      () => { falhouInicial.current = true },
    )
  }, [buscar])
  useEffect(() => { carregarIniciais() }, [carregarIniciais])
  const { reset, onSearch: buscarNoServidor } = busca
  const onSearch = useCallback((texto: string) => {
    if (texto.trim() !== '') { buscarNoServidor(texto); return }
    reset()
    if (falhouInicial.current) carregarIniciais()
  }, [reset, buscarNoServidor, carregarIniciais])
  const encontradas = busca.found ?? iniciais
  const lista = escolhida && !encontradas.some((o) => o.id === escolhida.id) ? [escolhida, ...encontradas] : encontradas
  return { opcoes: lista.map((o) => ({ value: o.id, label: o.nome })), lista, carregando: busca.searching, onSearch }
}

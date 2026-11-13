import { Suspense, lazy, useEffect, useRef, type ComponentType } from 'react'
import { ToastProvider } from '@betinhos/ui'
import type { Host } from '../host'
import { useHashRoute } from '../nav/useHashRoute'
import { CarregandoRegistro } from './BrandLoader'
import { fecharGavetaRegistro, useGavetaRegistro, type TabelaComGaveta } from './registroAberto'
import type { GavetaProps } from './gavetas/comum'

/** Um adaptador por tabela, carregado só quando a gaveta dela abre pela primeira vez. */
const ADAPTADORES: Record<TabelaComGaveta, ComponentType<GavetaProps>> = {
  cr40f_funcionarios: lazy(() => import('./gavetas/GavetaFuncionario')),
  cr40f_veiculos: lazy(() => import('./gavetas/GavetaVeiculo')),
  cr40f_clientes1: lazy(() => import('./gavetas/GavetaCliente')),
  cr40f_bancodedados: lazy(() => import('./gavetas/GavetaPessoa')),
  cr40f_equipamento: lazy(() => import('./gavetas/GavetaEquipamento')),
  cr40f_financeiro: lazy(() => import('./gavetas/GavetaOp')),
  cr40f_pagantes: lazy(() => import('./gavetas/GavetaPagante')),
  cr40f_despesaoperacional: lazy(() => import('./gavetas/GavetaDespesa')),
}

/**
 * Hospedeiro único das gavetas de registro: o lookup de uma lista abre aqui a gaveta da tela daquela tabela, por cima
 * da lista, sem trocar a rota (a lista fica intacta atrás). Trocar de tela fecha a gaveta.
 */
export function GavetaRegistro({ host }: { host: Host }) {
  const aberto = useGavetaRegistro()
  const route = useHashRoute()
  const rotaInicial = useRef(route)
  useEffect(() => {
    if (route === rotaInicial.current) return
    rotaInicial.current = route
    fecharGavetaRegistro()
  }, [route])

  const Adaptador = aberto ? ADAPTADORES[aberto.table] : null
  return (
    <ToastProvider>
      {aberto && Adaptador ? (
        <Suspense fallback={<CarregandoRegistro label="Carregando registro" onCancel={fecharGavetaRegistro} />}>
          <Adaptador key={`${aberto.table}:${aberto.id}`} host={host} id={aberto.id} onClose={fecharGavetaRegistro} />
        </Suspense>
      ) : null}
    </ToastProvider>
  )
}

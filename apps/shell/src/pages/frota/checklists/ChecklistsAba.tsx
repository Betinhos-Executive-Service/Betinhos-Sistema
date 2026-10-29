import { useShellHeader } from '@betinhos/ui'
import { useState } from 'react'
import type { Host } from '../../../host'
import { GestaoChecklists } from './components/GestaoChecklists'
import { configurarDataverse } from './data/dataverse'
import './components/gestao.css'

/**
 * Aba Checklists da Frota: a antiga tela `new_gestaochecklistsveiculos` (repo tela-gestao-checklists) dentro do shell.
 * No localhost a tela usa o mock em memória de `domain/gestaoChecklists.ts`; no Dataverse, o cliente do host.
 */
export function ChecklistsAba({ host, titulo }: { host: Host; titulo: string }) {
  // Liga o cliente antes do primeiro render: as consultas partem do efeito de carga da GestaoChecklists.
  useState(() => configurarDataverse(host.mode === 'dataverse' ? host.client : null))
  useShellHeader({ title: titulo })
  return (
    <div className="page page--full frota-page">
      <div className="gestao-checklists"><GestaoChecklists /></div>
    </div>
  )
}

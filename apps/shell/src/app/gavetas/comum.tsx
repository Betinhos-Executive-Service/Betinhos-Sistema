import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Drawer } from '@betinhos/ui'
import type { Host } from '../../host'
import { BrandLoader } from '../BrandLoader'

/** O que todo adaptador recebe do hospedeiro: o registro (tabela já escolhida) e o fechar. */
export type GavetaProps = { host: Host; id: string; onClose: () => void }

export const mensagem = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Registro que não veio (excluído, inativo ou sem permissão) vira erro, mostrado na própria gaveta. */
export function existente<T>(registro: T | null, rotulo: string): T {
  if (registro == null) throw new Error(`${rotulo} não encontrado ou inativo.`)
  return registro
}

type Estado<T> = { ok: true; dados: T } | { ok: false; erro: string } | null

/** Carga do registro (e do que a gaveta precisa); `carregar` precisa ser estável (useCallback). */
export function useCarga<T>(carregar: () => Promise<T>) {
  const [tentativa, setTentativa] = useState(0)
  const [estado, setEstado] = useState<Estado<T>>(null)
  useEffect(() => {
    let cancelado = false
    setEstado(null)
    carregar().then(
      (dados) => { if (!cancelado) setEstado({ ok: true, dados }) },
      (reason: unknown) => { if (!cancelado) setEstado({ ok: false, erro: mensagem(reason) }) },
    )
    return () => { cancelado = true }
  }, [carregar, tentativa])
  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), [])
  return { estado, tentarDeNovo }
}

/** Enquanto carrega ou se falhar, a gaveta já aparece por cima da lista, com o estado; carregado, mostra a da tela. */
export function ComCarga<T>({ carga, rotulo, onClose, children }: { carga: ReturnType<typeof useCarga<T>>; rotulo: string; onClose: () => void; children: (dados: T) => ReactNode }) {
  const { estado, tentarDeNovo } = carga
  if (estado?.ok) return <>{children(estado.dados)}</>
  return (
    <Drawer open eyebrow={rotulo} title={estado ? `Não foi possível abrir` : `Carregando…`} onClose={onClose}>
      {estado
        ? <Alert tone="danger" title={`Não foi possível abrir ${rotulo.toLowerCase()}`} action={<Button variant="secondary" onClick={tentarDeNovo}>Tentar de novo</Button>}>{estado.erro}</Alert>
        : <BrandLoader variant="inline" size="md" label={`Carregando ${rotulo.toLowerCase()}`} text={`Carregando ${rotulo.toLowerCase()}…`} />}
    </Drawer>
  )
}

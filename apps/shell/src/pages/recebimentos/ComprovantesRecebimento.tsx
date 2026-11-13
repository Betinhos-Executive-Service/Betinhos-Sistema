import { useEffect, useState } from 'react'
import { Alert, Button } from '@betinhos/ui'
import { BrandLoader } from '../../app/BrandLoader'
import { ComprovantesGaleria } from '../../lib/comprovantes/Galeria'
import { metaRecebimento, ordenar, type Recebimento } from './domain'
import type { RecebimentosSource } from './source'

type Estado = { lista: Recebimento[] } | { erro: string } | null

/** Comprovantes dos serviços, recarregados quando muda o conjunto de ids. */
export function useRecebimentos(source: RecebimentosSource, reservaIds: string[]) {
  const chave = reservaIds.join('|')
  const [estado, setEstado] = useState<Estado>(null)
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let vivo = true
    setEstado(null)
    source.carregar(chave ? chave.split('|') : []).then(
      (lista) => { if (vivo) setEstado({ lista: ordenar(lista) }) },
      (erro) => { if (vivo) setEstado({ erro: erro instanceof Error ? erro.message : String(erro) }) },
    )
    return () => { vivo = false }
  }, [source, chave, tentativa])
  return { estado, recarregar: () => setTentativa((n) => n + 1) }
}

/** Galeria dos comprovantes que o motorista enviou ao receber; carregando, erro com nova tentativa e vazio. */
export function ComprovantesRecebimento({ source, reservaIds }: { source: RecebimentosSource; reservaIds: string[] }) {
  const { estado, recarregar } = useRecebimentos(source, reservaIds)
  if (estado == null) return <BrandLoader variant="inline" size="sm" label="Carregando comprovantes" text="Carregando comprovantes…" />
  if ('erro' in estado) {
    return (
      <Alert tone="danger" title="Não foi possível carregar os comprovantes">
        {estado.erro} <Button variant="ghost" size="compact" onClick={recarregar}>Tentar de novo</Button>
      </Alert>
    )
  }
  if (!estado.lista.length) return <p className="cmp-vazio">Nenhum comprovante enviado pelo motorista.</p>
  return <ComprovantesGaleria anexos={estado.lista} ler={source.arquivo} meta={metaRecebimento} />
}

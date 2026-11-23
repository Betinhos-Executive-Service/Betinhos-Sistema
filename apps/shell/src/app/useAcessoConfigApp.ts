import { useMemo } from 'react'
import { SEM_ACESSO, type Acesso } from '../pages/app-motoristas/domain/acesso'
import { temPerfil } from './acessos'
import { useAcessos } from './AcessosProvider'

/** `null` enquanto lê; erro na leitura = sem acesso (o servidor recusa de qualquer jeito). Usa a leitura de papéis do AcessosProvider. */
export function useAcessoConfigApp(): Acesso | null {
  const valor = useAcessos()
  return useMemo(() => {
    if (valor.status === 'carregando') return null
    if (valor.status === 'erro') return SEM_ACESSO
    return { admin: valor.acessos.admin, gestor: temPerfil(valor.acessos, 'operacional', 'gestor') }
  }, [valor])
}

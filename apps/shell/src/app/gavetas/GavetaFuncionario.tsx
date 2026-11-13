import { useMemo, useState } from 'react'
import { createDocsSource } from '../../pages/documentos/data/source'
import { FichaPessoaCentral } from '../../pages/documentos/components/FichaCentral'
import { createAcessoSource, type AcessoInicial } from '../../pages/funcionarios/data/acesso'
import { createSource as createComunicadosSource } from '../../pages/comunicados/data/source'
import { CadastroAcessoDrawer } from '../../pages/funcionarios/components/CadastroAcessoDrawer'
import type { GavetaProps } from './comum'

/** Ficha de Funcionários por cima da lista (a mesma da tela e da central de documentos). */
export default function GavetaFuncionario({ host, id, onClose }: GavetaProps) {
  const docs = useMemo(() => { try { return createDocsSource(host) } catch { return null } }, [host])
  const acesso = useMemo(() => createAcessoSource(host), [host])
  const comunicados = useMemo(() => createComunicadosSource(host), [host])
  const [cadastro, setCadastro] = useState<{ inicial: AcessoInicial } | null>(null)
  const [versao, setVersao] = useState(0)
  return (
    <>
      <FichaPessoaCentral host={host} docs={docs} id={id} onClose={onClose} onChanged={() => undefined} versao={versao} acesso={acesso} comunicados={comunicados} onCadastrarAcesso={(inicial) => setCadastro({ inicial })} />
      {cadastro ? <CadastroAcessoDrawer acesso={acesso} inicial={cadastro.inicial} onClose={() => setCadastro(null)} onCadastrado={() => { setCadastro(null); setVersao((v) => v + 1) }} /> : null}
    </>
  )
}

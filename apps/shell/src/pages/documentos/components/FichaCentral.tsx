import { useMemo } from 'react'
import { Alert, Button, Drawer } from '@betinhos/ui'
import type { Host } from '../../../host'
import { Ficha } from '../../funcionarios/components/Ficha'
import { createFuncionariosSource } from '../../funcionarios/data/hostSource'
import { FichaVeiculo } from '../../frota/components/FichaVeiculo'
import { Carregando } from '../../frota/components/Ui'
import { todaySP } from '../../frota/data/dates'
import { createFrotaSource } from '../../frota/data/hostSource'
import type { DataSource as FrotaSource } from '../../frota/data/source'
import { useFrotaCarga } from '../../frota/useFrotaCarga'
import type { DocsSource } from '../data/source'
import '../../funcionarios/funcionarios.css'
import '../../frota/frota.css'

type Props = { host: Host; docs: DocsSource; id: string; onClose: () => void; onChanged: () => void }

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Ficha de Funcionários aberta por cima da central, sem trocar de tela. A seção (`secao=documentos`) vem da URL. */
export function FichaPessoaCentral({ host, docs, id, onClose, onChanged }: Props) {
  const fonte = useMemo(() => { try { return { source: createFuncionariosSource(host), erro: null } } catch (e) { return { source: null, erro: mensagem(e) } } }, [host])
  if (!fonte.source) return <Indisponivel titulo="Ficha indisponível" erro={fonte.erro} onClose={onClose} />
  // O CSS da ficha é escopado em .func (a tela Funcionários).
  return <div className="func"><Ficha source={fonte.source} docs={docs} id={id} onClose={onClose} onSaved={() => onChanged()} /></div>
}

/** Ficha do veículo por cima da central: as tabelas da Frota só são carregadas quando o usuário pede. */
export function FichaVeiculoCentral({ host, docs, id, onClose, onChanged }: Props) {
  const fonte = useMemo(() => { try { return { source: createFrotaSource(host), erro: null } } catch (e) { return { source: null, erro: mensagem(e) } } }, [host])
  if (!fonte.source) return <Indisponivel titulo="Ficha indisponível" erro={fonte.erro} onClose={onClose} />
  return <VeiculoCarregado source={fonte.source} docs={docs} id={id} onClose={onClose} onChanged={onChanged} />
}

function VeiculoCarregado({ source, docs, id, onClose, onChanged }: Omit<Props, 'host'> & { source: FrotaSource }) {
  const { result, fatal, reload } = useFrotaCarga(source)
  if (fatal) return <Indisponivel titulo="Não foi possível carregar o veículo" erro={fatal} onClose={onClose} onRetry={() => void reload()} />
  if (!result) {
    return (
      <Drawer open size="wide" eyebrow="Veículo" title="Carregando veículo" onClose={onClose}>
        <Carregando />
      </Drawer>
    )
  }
  return (
    <FichaVeiculo
      source={source}
      docs={docs}
      id={id}
      data={result.data}
      errors={result.errors}
      today={todaySP()}
      onClose={onClose}
      // Manutenção, multa e colisão abrem na tela Frota, que tem o drawer do registro.
      onOpen={(kind, registro) => { window.location.hash = `#/frota?ficha=${encodeURIComponent(id)}&registro=${kind}:${encodeURIComponent(registro)}` }}
      onReload={() => { void reload(); onChanged() }}
    />
  )
}

function Indisponivel({ titulo, erro, onClose, onRetry }: { titulo: string; erro: string | null; onClose: () => void; onRetry?: () => void }) {
  return (
    <Drawer open eyebrow="Ficha" title={titulo} onClose={onClose}>
      <Alert tone="danger" title={titulo} action={onRetry ? <Button variant="secondary" onClick={onRetry}>Tentar de novo</Button> : undefined}>{erro}</Alert>
    </Drawer>
  )
}

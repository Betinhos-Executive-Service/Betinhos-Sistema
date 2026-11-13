import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import { Alert, Button, Drawer } from '@betinhos/ui'
import type { Host } from '../../../host'
import { Ficha } from '../../funcionarios/components/Ficha'
import { createFuncionariosSource } from '../../funcionarios/data/hostSource'
import { FichaVeiculo } from '../../frota/components/FichaVeiculo'
import { Carregando } from '../../frota/components/Ui'
import { todaySP } from '../../frota/data/dates'
import { createFrotaSource } from '../../frota/data/hostSource'
import type { DataSource as FrotaSource } from '../../frota/data/source'
import type { Veiculo } from '../../frota/data/types'
import { useFrotaCarga } from '../../frota/useFrotaCarga'
import type { DocsSource } from '../data/source'
import '../../funcionarios/funcionarios.css'
import '../../frota/frota.css'

type Props = { host: Host; docs: DocsSource | null; id: string; onClose: () => void; onChanged: () => void }
/** O que a tela Funcionários também passa à ficha (acesso ao app, comunicados); a central não usa. */
type ExtrasFicha = Pick<ComponentProps<typeof Ficha>, 'versao' | 'acesso' | 'comunicados' | 'onCadastrarAcesso'>

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Ficha de Funcionários aberta por cima da central (ou de outra lista), sem trocar de tela. A seção (`secao=documentos`) vem da URL. */
export function FichaPessoaCentral({ host, docs, id, onClose, onChanged, ...extras }: Props & ExtrasFicha) {
  const fonte = useMemo(() => { try { return { source: createFuncionariosSource(host), erro: null } } catch (e) { return { source: null, erro: mensagem(e) } } }, [host])
  if (!fonte.source) return <Indisponivel titulo="Ficha indisponível" erro={fonte.erro} onClose={onClose} />
  // O CSS da ficha é escopado em .func (a tela Funcionários).
  return <div className="func"><Ficha source={fonte.source} docs={docs} id={id} onClose={onClose} onSaved={() => onChanged()} {...extras} /></div>
}

/** Ficha do veículo por cima da central: as tabelas da Frota só são carregadas quando o usuário pede. */
export function FichaVeiculoCentral({ host, docs, id, onClose, onChanged }: Props) {
  const fonte = useMemo(() => { try { return { source: createFrotaSource(host), erro: null } } catch (e) { return { source: null, erro: mensagem(e) } } }, [host])
  if (!fonte.source) return <Indisponivel titulo="Ficha indisponível" erro={fonte.erro} onClose={onClose} />
  return <VeiculoCarregado source={fonte.source} docs={docs} id={id} onClose={onClose} onChanged={onChanged} />
}

function VeiculoCarregado({ source, docs, id, onClose, onChanged }: Omit<Props, 'host'> & { source: FrotaSource }) {
  const { result: carga, fatal, reload } = useFrotaCarga(source)
  const naCarga = carga?.data.veiculos.some((v) => v.id === id) ?? false
  // A carga da Frota só traz os veículos ativos: um inativo vem à parte e entra na cópia que a ficha recebe.
  const [avulso, setAvulso] = useState<{ id: string; veiculo: Veiculo | null; erro: string | null } | null>(null)
  useEffect(() => {
    if (!carga || naCarga || !source.veiculo) return
    let cancelado = false
    source.veiculo(id).then(
      (veiculo) => { if (!cancelado) setAvulso({ id, veiculo, erro: null }) },
      (e: unknown) => { if (!cancelado) setAvulso({ id, veiculo: null, erro: mensagem(e) }) },
    )
    return () => { cancelado = true }
  }, [carga, naCarga, source, id])
  const esperandoAvulso = Boolean(carga && !naCarga && source.veiculo && avulso?.id !== id)
  const result = carga && !naCarga && avulso?.id === id && avulso.veiculo ? { ...carga, data: { ...carga.data, veiculos: [...carga.data.veiculos, avulso.veiculo] } } : carga
  if (fatal) return <Indisponivel titulo="Não foi possível carregar o veículo" erro={fatal} onClose={onClose} onRetry={() => void reload()} />
  if (avulso?.id === id && avulso.erro) return <Indisponivel titulo="Não foi possível carregar o veículo" erro={avulso.erro} onClose={onClose} />
  if (!result || esperandoAvulso) {
    return (
      <Drawer open size="wide" eyebrow="Veículo" title="Carregando veículo" onClose={onClose}>
        <Carregando label="Carregando veículo" size="md" />
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

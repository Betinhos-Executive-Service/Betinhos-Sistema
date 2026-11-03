import { Breadcrumb, Button } from '@betinhos/ui'
import { ArrowLeft } from 'lucide-react'

type Props = { onBack: () => void; disabled?: boolean; atual: string }

/** Topo de toda tela interna do módulo: Voltar no canto superior esquerdo, antes do caminho e do título. */
export function NavTopo({ onBack, disabled, atual }: Props) {
  return (
    <div className="tr-nav">
      <Button variant="secondary" size="compact" icon={<ArrowLeft size={16} />} disabled={disabled} onClick={onBack}>Voltar</Button>
      <Breadcrumb items={[{ label: 'Treinamentos', href: '#/treinamentos' }, { label: atual }]} />
    </div>
  )
}

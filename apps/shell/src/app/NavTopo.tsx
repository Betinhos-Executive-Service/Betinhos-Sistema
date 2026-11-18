import { Breadcrumb, Button } from '@betinhos/ui'
import { ArrowLeft } from 'lucide-react'
import './NavTopo.css'

type Props = { modulo: string; href: string; atual: string; onBack: () => void; disabled?: boolean }

/** Topo das telas internas de um módulo: Voltar no canto superior esquerdo, antes do caminho e do título. */
export function NavTopo({ modulo, href, atual, onBack, disabled }: Props) {
  return (
    <div className="nav-topo">
      <Button variant="secondary" size="compact" icon={<ArrowLeft size={16} />} disabled={disabled} onClick={onBack}>Voltar</Button>
      <Breadcrumb items={[{ label: modulo, href }, { label: atual }]} />
    </div>
  )
}

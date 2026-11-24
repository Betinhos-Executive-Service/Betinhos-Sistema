import { EmptyState, useShellHeader } from '@betinhos/ui'
import { Lock } from 'lucide-react'

export function InicioSemAcesso() {
  useShellHeader({ title: 'Página Inicial' })
  return (
    <div className="page">
      <EmptyState className="surface" align="start" icon={<Lock size={36} />} title="Você ainda não tem acesso aos módulos">
        Peça ao TI da Betinhos, ou a quem administra os acessos do sistema, o perfil da sua área. O Planner continua disponível no menu.
      </EmptyState>
    </div>
  )
}

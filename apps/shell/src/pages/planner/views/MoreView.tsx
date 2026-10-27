// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import PageHeader from '../components/PageHeader'
import { canViewManagement } from '../domain/management'
import { ChevronRight, Lightbulb, Settings, Target, Users } from 'lucide-react'


export function MoreView({ onNavigate, canViewManagement = false }: any) {
  return (
    <div className="page-content more-page-content">
      <PageHeader
        eyebrow="Atalhos"
        title="Mais"
        description="Acesse origens e configurações sem tirar o foco das tarefas."
      />
      <section className="more-actions">
        <button
          className="panel more-action"
          type="button"
          onClick={() => onNavigate("ideas")}
        >
          <span className="more-action-icon more-action-icon-ideas">
            <Lightbulb size={19} />
          </span>
          <span>
            <strong>Boas ideias</strong>
            <small>Sugestões compartilhadas pela equipe</small>
          </span>
          <ChevronRight size={17} />
        </button>
        {canViewManagement && <button
          className="panel more-action"
          type="button"
          onClick={() => onNavigate("management")}
        >
          <span className="more-action-icon more-action-icon-action">
            <Target size={19} />
          </span>
          <span>
            <strong>Gestão</strong>
            <small>Cobranças, carga e retornos pendentes</small>
          </span>
          <ChevronRight size={17} />
        </button>}
        <button
          className="panel more-action"
          type="button"
          onClick={() => onNavigate("contacts")}
        >
          <span className="more-action-icon more-action-icon-contact">
            <Users size={19} />
          </span>
          <span>
            <strong>Contatos</strong>
            <small>Casos recebidos e responsáveis</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button
          className="panel more-action"
          type="button"
          onClick={() => onNavigate("settings")}
        >
          <span className="more-action-icon">
            <Settings size={19} />
          </span>
          <span>
            <strong>Configurações</strong>
            <small>Dados, recarregamento e versão</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </section>
    </div>
  );
}

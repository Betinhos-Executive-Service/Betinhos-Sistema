import { useEffect, useMemo, useRef, useState } from "react";
import betinhosLogo from "../../assets/images/logo-betinhos-b-500.png";
import carCrashIcon from "../../assets/icons/car-crash-svgrepo-com.svg";
import carIcon from "../../assets/icons/car.svg";
import historyIcon from "../../assets/icons/clock.svg";
import invoiceReceiptIcon from "../../assets/icons/invoice-receipt.svg";
import { filterAgendaGalleryItems, getAgendaItemStartDate } from "../../app/agendaVisibility.ts";
import { PullToRefresh } from "../../shared/ui/PullToRefresh";
import { WebPushLink } from "../../shared/ui/WebPushLink";
import type { AgendaItem } from "../../types";

const baseModules = [
  {
    id: "services",
    label: "Serviços",
    detail: "Corridas de hoje",
    icon: "services",
    disabled: false,
  },
  {
    id: "history",
    label: "Histórico",
    detail: "Serviços finalizados",
    icon: "history",
    disabled: false,
  },
  {
    id: "comunicados",
    label: "Comunicados",
    detail: "Avisos da operação",
    icon: "comunicados",
    disabled: false,
  },
  {
    id: "checklists",
    label: "Checklist",
    detail: "Vistoria do veículo",
    icon: "checklist",
    disabled: false,
  },
  {
    id: "multas",
    label: "Multas",
    detail: "Termos para assinar",
    icon: "multas",
    disabled: false,
  },
  {
    id: "treinamentos",
    label: "Treinamentos",
    detail: "Conteúdos do RH",
    icon: "treinamentos",
    disabled: false,
  },
  {
    id: "postosProximos",
    label: "Postos próximos",
    detail: "Mapa da rede CTF",
    icon: "postosProximos",
    disabled: false,
  },
  {
    id: "maintenancePhoto",
    label: "Manutenção",
    detail: "Solicitar reparo",
    icon: "maintenance",
    disabled: false,
  },
  {
    id: "expenses",
    label: "Gastos",
    detail: "Registrar despesas",
    icon: "expenses",
    disabled: false,
  },
  {
    id: "collisions",
    label: "Colis\u00f5es",
    detail: "Registro de colis\u00f5es",
    icon: "collisions",
    disabled: false,
  }
];

// Fica sempre por último na grade, depois dos módulos condicionais.
const ideasModule = {
  id: "ideas",
  label: "Boas ideias",
  detail: "Sugerir melhorias",
  icon: "ideas",
  disabled: false,
};

const screenAliases: Record<string, string[]> = {
  comunicados: ["comunicados"],
  checklists: ["checklists"],
  multas: ["multas"],
  treinamentos: ["treinamentos"],
  postosProximos: ["postosProximos"],
  services: ["servicos", "services", "Services", "serviços"],
  history: ["historico", "history", "History", "histórico"],
  maintenancePhoto: ["maintenancePhoto", "maintenance", "MaintenancePhoto", "manutencao", "manutenção"],
  collisions: ["collisions", "colisoes", "Collisions"],
  expenses: ["gastos", "expenses", "Expenses"],
  personalReceipt: ["reciboPersonalizado", "personalReceipt", "gerarReciboPersonalizado", "recibopersonalizado"],
  ideas: ["boasIdeias", "ideas", "ideias"],
  meuCarro: ["meuCarro"],
};

const moduleHandlers: Record<string, string[]> = {
  comunicados: [],
  checklists: [],
  multas: [],
  treinamentos: [],
  postosProximos: [],
  services: [
    "onServices",
    "onService",
    "onOpenServices",
    "onOpenService",
    "onServicesClick",
    "onServiceClick",
    "onServicesPress",
    "onServicePress",
    "openServices",
    "openService",
    "handleServices",
    "handleService",
  ],
  history: [
    "onHistory",
    "onHistorico",
    "onOpenHistory",
    "onOpenHistorico",
    "onHistoryClick",
    "onHistoricoClick",
    "onHistoryPress",
    "onHistoricoPress",
    "openHistory",
    "openHistorico",
    "handleHistory",
    "handleHistorico",
  ],
  maintenancePhoto: [
    "onOpenMaintenancePhoto",
    "onOpenMaintenance",
    "onMaintenancePhotoClick",
    "onMaintenanceClick",
    "onMaintenancePress",
    "openMaintenancePhoto",
    "openMaintenance",
  ],
  collisions: ["onOpenCollisions", "onCollisionsClick", "onCollisionsPress", "openCollisions"],
  expenses: ["onOpenExpenses", "onExpensesClick", "onExpensesPress", "openExpenses"],
  personalReceipt: ["onOpenPersonalReceipt", "onPersonalReceipt", "openPersonalReceipt", "openRecibo", "onOpenRecibo"],
};

const navigationHandlers = [
  "onNavigate",
  "navigate",
  "setScreen",
  "setCurrentScreen",
  "onScreenChange",
  "onChangeScreen",
  "onNavigateTo",
  "handleNavigate",
];

type InitialScreenProps = {
  onNavigate?: (screen: string) => void;
  navigate?: (screen: string) => void;
  setScreen?: (screen: string) => void;
  setCurrentScreen?: (screen: string) => void;
  onScreenChange?: (screen: string) => void;
  onChangeScreen?: (screen: string) => void;
  onNavigateTo?: (screen: string) => void;
  handleNavigate?: (screen: string) => void;
  onOpenServices?: () => void;
  onServices?: () => void;
  onService?: () => void;
  onOpenService?: () => void;
  onServicesClick?: () => void;
  onServiceClick?: () => void;
  onServicesPress?: () => void;
  onServicePress?: () => void;
  openServices?: () => void;
  openService?: () => void;
  handleServices?: () => void;
  handleService?: () => void;
  onOpenHistory?: () => void;
  onHistory?: () => void;
  onHistorico?: () => void;
  onOpenHistorico?: () => void;
  onHistoryClick?: () => void;
  onHistoricoClick?: () => void;
  onHistoryPress?: () => void;
  onHistoricoPress?: () => void;
  openHistory?: () => void;
  openHistorico?: () => void;
  handleHistory?: () => void;
  handleHistorico?: () => void;
  onOpenMaintenancePhoto?: () => void;
  onOpenMaintenance?: () => void;
  onMaintenancePhotoClick?: () => void;
  onMaintenanceClick?: () => void;
  onMaintenancePress?: () => void;
  openMaintenancePhoto?: () => void;
  openMaintenance?: () => void;
  onOpenCollisions?: () => void;
  onCollisionsClick?: () => void;
  onCollisionsPress?: () => void;
  openCollisions?: () => void;
  onOpenExpenses?: () => void;
  onExpensesClick?: () => void;
  onExpensesPress?: () => void;
  openExpenses?: () => void;
  onOpenPersonalReceipt?: () => void;
  onPersonalReceipt?: () => void;
  openPersonalReceipt?: () => void;
  openRecibo?: () => void;
  onOpenRecibo?: () => void;
  onRefresh?: () => void | Promise<void>;
  driverId?: string;
  driverName?: string;
  motoristaNome?: string;
  nextServiceAt?: string | Date | null;
  proximoServicoEm?: string | Date | null;
  services?: AgendaItem[];
  pendingComunicados?: number;
  pendingChecklists?: number;
  pendingMultas?: number;
  pendingTreinamentos?: number;
  pendingGastosCartao?: number;
  /** "Você tem N multas para assinar · prazo até dd/mm"; null sem pendências. */
  multasBanner?: string | null;
  canGeneratePersonalReceipt?: boolean;
  isThirdParty?: boolean;
  showLocalReset?: boolean;
  onResetLocalData?: () => void;
  /** Reabre o tour de primeiro acesso ("Ver tour de novo" no rodapé). */
  onShowTour?: () => void;
  [key: string]: unknown;
};

function getFirstName(name?: string) {
  return name?.trim().split(/\s+/)[0] || "Renan";
}

function getServiceDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getServiceDateFromAgendaItem(item: AgendaItem) {
  const fieldValue = item.detail?.fields.find((field) => {
    const label = field.label.toLowerCase();
    return label.includes("data") && (label.includes("horário") || label.includes("horario"));
  })?.value;

  if (!fieldValue) return null;

  const match = fieldValue.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, day, month, year, hour, minute] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

function getRelativeDateFromTimeLabel(item: AgendaItem, now: number) {
  if (!item.time) return null;

  const timeMatch = item.time.match(/(\d{2}):(\d{2})/);
  if (!timeMatch) return null;

  const [, hour, minute] = timeMatch;
  const label = item.time.toUpperCase();
  const date = new Date(now);

  if (label.includes("AMANH")) {
    date.setDate(date.getDate() + 1);
  }

  date.setHours(Number(hour), Number(minute), 0, 0);
  return date;
}

void getServiceDateFromAgendaItem;
void getRelativeDateFromTimeLabel;

function resolveAgendaDate(item: AgendaItem, now: number) {
  const date = getAgendaItemStartDate(item, now);
  if (date && date.getTime() >= now) return date;
  return null;
}

function formatTimeUntil(date: Date, now: number) {
  const diffMs = date.getTime() - now;
  if (diffMs <= 0) return "menos de 1min";

  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}min`;
  return `${hours}h${String(minutes).padStart(2, "0")}min`;
}

function getNextServiceItem(props: InitialScreenProps, now: number) {
  const directDate = getServiceDate(props.nextServiceAt ?? props.proximoServicoEm);
  if (directDate) return { date: directDate, item: null };

  const serviceDates = filterAgendaGalleryItems(props.services ?? [], now)
    .filter((service) => service.tipo !== "HEADER" && !service.canceled && service.detail)
    .map((item) => {
      const date = resolveAgendaDate(item, now);
      return { item, date };
    })
    .filter((service): service is { item: AgendaItem; date: Date } => Boolean(service.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return serviceDates[0] ?? null;
}

function isToday(date: Date, now: number) {
  const today = new Date(now);
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isTodayAgendaItem(item: AgendaItem, now: number) {
  const timeLabel = item.time?.toUpperCase() ?? "";
  if (timeLabel.includes("HOJE")) return true;
  if (timeLabel.includes("AMANH")) return false;

  const date = getAgendaItemStartDate(item, now);
  return Boolean(date && isToday(date, now));
}

function getTodayAgendaCount(services: AgendaItem[] | undefined, now: number) {
  return filterAgendaGalleryItems(services ?? [], now).filter((service) => {
    return service.tipo !== "HEADER" && !service.canceled && service.detail && isTodayAgendaItem(service, now);
  }).length;
}

function ModuleIcon({ name }: { name: string }) {
  if (name === "services") {
    return <img src={carIcon} alt="" />;
  }

  if (name === "comunicados") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Zm3 4h10M7 12h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
  }

  if (name === "multas") {
    // Lucide file-pen: documento para assinar.
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v9.5M14 2v5h5M13.4 12.6a2 2 0 1 1 2.8 2.8L10 21.6 6 22l.4-4 7-5.4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
  }

  if (name === "treinamentos") {
    // Lucide graduation-cap: conteúdo de formação.
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 10.9 12.8 6.2a2 2 0 0 0-1.6 0L2.6 10.9a1 1 0 0 0 0 1.8l8.6 4.7a2 2 0 0 0 1.6 0l8.6-4.7a1 1 0 0 0 0-1.8ZM22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
  }

  if (name === "postosProximos") {
    // Lucide fuel: posto de combustível.
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
  }

  if (name === "checklist") {
    // Lucide clipboard-check.
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m1 10 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
  }

  if (name === "history") {
    return <img src={historyIcon} alt="" />;
  }

  if (name === "collisions") {
    return <img src={carCrashIcon} alt="" />;
  }

  if (name === "receipt") {
    return <img src={invoiceReceiptIcon} alt="" />;
  }

  if (name === "ideas") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
        <path d="M9 18h6M10 22h4" />
      </svg>
    );
  }

  if (name === "maintenance") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.7 6.3a4 4 0 0 0-5.1 5.1L4.8 16.2a2 2 0 1 0 2.8 2.8l4.8-4.8a4 4 0 0 0 5.1-5.1l-2.4 2.4-2.8-2.8 2.4-2.4Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h12v12H6z" />
      <path d="M8 5h8v2H8z" />
      <path d="M9 11h6M9 15h3" />
    </svg>
  );
}

const plural = (n: number) => (n === 1 ? "" : "s");

export function InitialScreen(props: InitialScreenProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const driverName = getFirstName(props.driverName ?? props.motoristaNome);
  const nextService = useMemo(() => getNextServiceItem(props, now), [now, props.nextServiceAt, props.proximoServicoEm, props.services]);
  const nextServiceDate = nextService?.date ?? null;
  const agendaCount = useMemo(() => getTodayAgendaCount(props.services, now), [now, props.services]);
  const modules = useMemo(
    () => baseModules.concat(
      props.canGeneratePersonalReceipt
        ? [
          {
            id: "personalReceipt",
            label: "Recibo personalizado",
            detail: "Gerar recibo sob demanda",
            icon: "receipt",
            disabled: false
          }
        ]
        : []
    ).concat([ideasModule]),
    [props.canGeneratePersonalReceipt]
  );

  const servicesModule = modules.find((module) => module.id === "services");
  const gridModules = modules.filter((module) => module.id !== "services");
  const multasPrazo = props.multasBanner?.split(" · ")[1];
  const pendingTypes = [
    { id: "checklists", count: props.pendingChecklists ?? 0, text: (n: number) => `${n} checklist${plural(n)} pendente${plural(n)}` },
    { id: "multas", count: props.pendingMultas ?? 0, text: (n: number) => `${n} multa${plural(n)} para assinar${multasPrazo ? ` · ${multasPrazo}` : ""}` },
    { id: "comunicados", count: props.pendingComunicados ?? 0, text: (n: number) => `${n} comunicado${plural(n)} para ler` },
    { id: "treinamentos", count: props.pendingTreinamentos ?? 0, text: (n: number) => `${n} treinamento${plural(n)} para fazer` },
    { id: "gastosCartao", count: props.pendingGastosCartao ?? 0, text: (n: number) => `Gastos do cartão · ${n} para completar` },
  ];
  const pendingCounts: Record<string, number> = Object.fromEntries(pendingTypes.map((type) => [type.id === "gastosCartao" ? "expenses" : type.id, type.count]));
  const pendencias = pendingTypes
    .filter((type) => type.count > 0)
    .map((type) => ({ id: type.id, text: type.text(type.count) }));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const navigateTo = (screen: string) => {
    const module = modules.find((item) => item.id === screen);
    if (module?.disabled) return;

    for (const handlerName of moduleHandlers[screen] ?? []) {
      const handler = props[handlerName];
      if (typeof handler === "function") {
        handler();
        return;
      }
    }

    const navigator = navigationHandlers
      .map((handlerName) => props[handlerName])
      .find((handler): handler is (screen: string) => void => typeof handler === "function");

    const aliases = screenAliases[screen] ?? [screen];
    const targetScreen = screen === "maintenancePhoto" ? "solicitarManutencao" : screen === "collisions" ? "colisoesInicio" : aliases[0];
    if (navigator) {
      navigator(targetScreen);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("betinhos:navigate", {
        detail: { screen: aliases[0], aliases },
      }),
    );
  };
  return (
    <PullToRefresh className="pull-refresh--home" scrollRef={shellRef} onRefresh={props.onRefresh ?? (() => window.location.reload())}>
    <main ref={shellRef} className="concept-shell">
      <header className="concept-topbar">
        <div>
          <span className="concept-kicker">Olá,</span>
          <h1>{driverName}</h1>
        </div>
        <img className="concept-avatar" src={betinhosLogo} alt="Betinhos" />
      </header>

      {nextServiceDate && (
        <button className="concept-next-service" type="button" onClick={() => navigateTo("services")}>
          <span className="concept-next-eyebrow">Próximo serviço em</span>
          <strong>{formatTimeUntil(nextServiceDate, now)}</strong>
          <small>{nextService?.item?.description ?? "Abrir agenda"}</small>
        </button>
      )}

      {servicesModule && (
        <button
          className="concept-module-card concept-module-card--primary"
          type="button"
          data-tour="servicos"
          disabled={servicesModule.disabled}
          aria-disabled={servicesModule.disabled}
          onClick={() => navigateTo("services")}
        >
          <span className="concept-module-meta" aria-hidden="true">
            <ModuleIcon name={servicesModule.icon} />
          </span>
          <span className="concept-module-text">
            <strong>{servicesModule.label}</strong>
            <small>
              {servicesModule.detail}
              {agendaCount > 0 ? <span className="concept-inline-count"> • {agendaCount}</span> : null}
            </small>
          </span>
        </button>
      )}

      {pendencias.length > 0 && (
        <section className="concept-pending" aria-label="Pendências">
          {pendencias.map((item) => (
            <button className="concept-pending-row" key={item.id} type="button" onClick={() => navigateTo(item.id)}>
              <span className="concept-pending-dot" aria-hidden="true" />
              <span className="concept-pending-text">{item.text}</span>
              <span className="concept-pending-chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      )}

      <section className="concept-tile-grid" aria-label="Módulos do aplicativo">
        {gridModules.map((module) => {
          const count = pendingCounts[module.id] ?? 0;
          return (
            <button
              className="concept-tile"
              key={module.id}
              type="button"
              data-tour={module.id}
              disabled={module.disabled}
              aria-disabled={module.disabled}
              aria-label={count > 0 ? `${module.label}, ${count} pendente${plural(count)}` : module.label}
              onClick={() => navigateTo(module.id)}
            >
              <span className="concept-tile-icon" aria-hidden="true">
                <ModuleIcon name={module.icon} />
                {count > 0 ? <span className="concept-tile-badge">{count > 9 ? "9+" : count}</span> : null}
              </span>
              <span className="concept-tile-label">{module.label}</span>
            </button>
          );
        })}
      </section>

      <footer className="concept-footer">
        <WebPushLink driverId={props.driverId} />
        {props.onShowTour ? (
          <button type="button" className="concept-tour-link" onClick={props.onShowTour}>
            Ver tour de novo
          </button>
        ) : null}
        {props.showLocalReset && props.onResetLocalData ? (
          <button type="button" className="local-reset" onClick={props.onResetLocalData}>
            Resetar dados locais
          </button>
        ) : null}
      </footer>
    </main>
    </PullToRefresh>
  );
}

export default InitialScreen;

import { useRef, useState, type CSSProperties } from "react";
import { Button, Drawer, SearchBox, StatusBadge, type StatusTone } from "@betinhos/ui";
import { Icon } from "./Icon";
import type { Driver, PassengerLink, Service } from "../domain/types";
import { displayDriverName, formatDate, formatTime, normalizeText, parseDate } from "../domain/utils";
import { servicePassengerText, stripContactPhone } from "../domain/logic";

type ServiceCardProps = {
  service: Service;
  passengerLinks?: PassengerLink[];
  drivers?: Driver[];
  mode?: "driver" | "clone";
  active?: boolean;
  busy?: boolean;
  error?: string;
  feedback?: boolean;
  highlighted?: boolean;
  showAction?: boolean;
  itemIndex?: number;
  onCardOpen?: (serviceId: string) => void;
  onDriverOpen?: (serviceId: string) => void;
  onDriverClose?: (serviceId: string) => void;
  onDriverConfirm?: (serviceId: string, driverId: string) => void;
  onCloneOpen?: (serviceId: string) => void;
  requestClose?: (dirty: boolean, close: () => void) => void;
};

const normalize = normalizeText;

function initials(label: string) {
  return label.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export function ServiceCard({
  service,
  passengerLinks = [],
  drivers = [],
  mode = "driver",
  active = false,
  busy = false,
  error = "",
  feedback = false,
  highlighted = false,
  showAction = true,
  itemIndex = 0,
  onCardOpen = () => {},
  onDriverOpen = () => {},
  onDriverClose = () => {},
  onDriverConfirm = () => {},
  onCloneOpen = () => {},
  requestClose = (_dirty: boolean, close: () => void) => close()
}: ServiceCardProps) {
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");
  const editorContext = useRef("");

  const driverLabel = service.motoristaId ? service.motoristaLabel : "Sem motorista";
  const driverState = service.motoristaId ? "is-assigned" : "is-missing";
  const driverChoices = drivers
    .map((driver) => ({ id: driver.id, label: displayDriverName(driver), full: driver.name || displayDriverName(driver) }))
    .sort((left, right) => (left.id === service.motoristaId ? -1 : right.id === service.motoristaId ? 1 : left.label.localeCompare(right.label, "pt-BR")));
  const filteredDrivers = pickerQuery.trim()
    ? driverChoices.filter((driver) => normalize(`${driver.label} ${driver.full}`).includes(normalize(pickerQuery)))
    : driverChoices;
  const hasDriverSelection = !!selectedDriverId;
  const driverChanged = selectedDriverId !== String(service.motoristaId || "");
  const removingCurrentDriver = !hasDriverSelection && !!service.motoristaId;
  const confirmDisabled = !driverChanged || busy;
  const passengerNames = passengerLinks.map((link) => stripContactPhone(link.passengerLabel)).filter(Boolean);
  const passengerSummary = passengerNames.length ? `${passengerNames.length} PAX` : servicePassengerText(service, passengerLinks);
  const serviceDate = parseDate(service.dataSaida);
  const serviceHour = serviceDate ? serviceDate.getHours() : 0;
  const period = serviceHour < 12 ? "morning" : serviceHour < 18 ? "afternoon" : "night";
  const visualTone = !service.motoristaId ? "alert" : service.statusValue === 202410008 ? "done" : period;
  const statusText = service.statusLabel || "Serviço";
  const statusBadgeTone: StatusTone = (() => {
    const normalized = normalize(String(service.statusLabel || ""));
    if (normalized.includes("cancel")) return "danger";
    if (normalized.includes("confirm")) return "success";
    if (normalized.includes("program")) return "info";
    return "neutral";
  })();
  const vehicleTypeText = service.tipoVeiculoLabel || service.tipoServicoLabel || "";
  const cardClass = [
    "service-card",
    `service-card--tone-${visualTone}`,
    `service-card--period-${period}`,
    busy ? "is-driver-busy" : "",
    feedback ? "service-card--driver-updated" : "",
    highlighted ? "service-card--clone-highlight" : ""
  ].filter(Boolean).join(" ");

  // Reinicia o seletor sempre que o editor abre (ou o motorista atual muda com ele aberto).
  const nextContext = active ? `${service.id}:${service.motoristaId || ""}` : "";
  if (editorContext.current !== nextContext) {
    editorContext.current = nextContext;
    setPickerQuery("");
    setSelectedDriverId(active ? String(service.motoristaId || "") : "");
  }

  function requestEditorClose() {
    if (busy) return;
    requestClose(driverChanged, () => onDriverClose(service.id));
  }

  return (
    <>
      <article className={cardClass} data-service-id={service.id} style={{ "--item-index": itemIndex } as CSSProperties}>
        <button
          type="button"
          className="service-card__surface"
          aria-label={`Abrir detalhes do serviço ${service.readableId || service.id}`}
          onClick={() => onCardOpen(service.id)}
        >
          <div className="service-card__datetime">
            <strong>{formatTime(service.dataSaida)}</strong>
            <small>{formatDate(service.dataSaida)}</small>
          </div>

          <div className="service-card__body">
            <div className="service-card__heading">
              <div className="service-card__badges">
                <span className="service-card__id">#{service.readableId || "-"}</span>
                <StatusBadge tone={statusBadgeTone} className="service-card__status">{statusText}</StatusBadge>
                {vehicleTypeText && <span className="service-card__vehicle-type">{vehicleTypeText}</span>}
              </div>
            </div>

            <div className="service-card__route">
              <span className="sr-only">Trajeto</span>
              <strong>{service.trajeto || "-"}</strong>
            </div>

            <div className="service-card__meta">
              <div className="service-card__meta-item service-card__meta-item--pax">
                <Icon name="users" />
                <span className="sr-only">PAX</span>
                <strong>{passengerSummary}</strong>
              </div>
              <div className="service-card__meta-item">
                <Icon name="building" />
                <span className="sr-only">Cliente</span>
                <strong>{service.clienteLabel || "Sem cliente"}</strong>
              </div>
            </div>
          </div>
        </button>

        <div className="service-card__footer">
          <div className={`service-card__driver ${driverState} ${feedback ? "is-confirmed" : ""}`} data-current-driver="">
            <span className="service-card__driver-icon">{feedback ? <Icon name="check" /> : service.motoristaId ? <Icon name="user" /> : <Icon name="alert" />}</span>
            <span className="sr-only">Motorista</span>
            <strong>{driverLabel}</strong>
          </div>

          {showAction && (
            <div className="service-card__actions">
              {mode === "clone" ? (
                <Button variant="secondary" size="compact" icon={<Icon name="copy" />} data-action="clone-open" onClick={() => onCloneOpen(service.id)}>Duplicar este pedido</Button>
              ) : feedback ? (
                <div className="driver-card-feedback" aria-live="polite"><Icon name="check" /><strong>{busy ? "Salvando motorista..." : "Motorista atualizado"}</strong></div>
              ) : (
                <Button variant="secondary" size="compact" icon={<Icon name="swap" />} data-action="driver-open-edit" onClick={() => onDriverOpen(service.id)}>{service.motoristaId ? "Trocar motorista" : "Definir motorista"}</Button>
              )}
            </div>
          )}
        </div>
      </article>

      {active && (
        <Drawer
          open
          onClose={requestEditorClose}
          eyebrow={`Pedido #${service.readableId || "-"} · ${formatDate(service.dataSaida)} às ${formatTime(service.dataSaida)}`}
          title={service.motoristaId ? "Trocar motorista" : "Definir motorista"}
          footer={(
            <>
              <Button variant="secondary" data-action="driver-close-edit" disabled={busy} onClick={requestEditorClose}>Cancelar</Button>
              <Button variant="primary" icon={<Icon name="check" />} data-action="driver-confirm" disabled={confirmDisabled} loading={busy} onClick={() => onDriverConfirm(service.id, selectedDriverId)}>
                {busy ? "Salvando..." : removingCurrentDriver ? "Salvar sem motorista" : "Salvar motorista"}
              </Button>
            </>
          )}
        >
          <div className="driver-editor" data-driver-form="">
            <p className="driver-editor__route">{service.trajeto || "Sem trajeto"}</p>
            <SearchBox value={pickerQuery} onChange={setPickerQuery} placeholder="Buscar motorista" aria-label="Buscar motorista" disabled={busy} />
            <div className="driver-picker" role="listbox" aria-label="Motoristas">
              {service.motoristaId && !pickerQuery.trim() && (
                <button type="button" role="option" className={`driver-option driver-option--none ${selectedDriverId === "" ? "is-selected" : ""}`} aria-selected={selectedDriverId === ""} disabled={busy} onClick={() => setSelectedDriverId("")}>
                  <span className="driver-option__avatar" aria-hidden="true"><Icon name="close" /></span>
                  <span className="driver-option__name">Deixar sem motorista</span>
                  <span className="driver-option__check" aria-hidden="true"><Icon name="check" /></span>
                </button>
              )}
              {filteredDrivers.length ? filteredDrivers.map((driver) => (
                <button key={driver.id} type="button" role="option" className={`driver-option ${selectedDriverId === driver.id ? "is-selected" : ""}`} aria-selected={selectedDriverId === driver.id} disabled={busy} onClick={() => setSelectedDriverId(driver.id)}>
                  <span className="driver-option__avatar" aria-hidden="true">{initials(driver.label)}</span>
                  <span className="driver-option__name">{driver.label}</span>
                  {driver.id === service.motoristaId && <StatusBadge tone="info" className="driver-option__badge">Atual</StatusBadge>}
                  <span className="driver-option__check" aria-hidden="true"><Icon name="check" /></span>
                </button>
              )) : (
                <p className="driver-picker__empty">Nenhum motorista encontrado para “{pickerQuery}”.</p>
              )}
            </div>
            <p className={`driver-editor__hint ${error ? "is-error" : ""}`} data-driver-message="" aria-live="polite">
              {error
                ? error
                : busy
                  ? "Salvando motorista..."
                  : removingCurrentDriver
                    ? "O serviço ficará sem motorista. Você poderá desfazer logo depois."
                    : !driverChanged
                      ? "Toque em um motorista diferente do atual."
                      : "A troca é aplicada ao salvar."}
            </p>
          </div>
        </Drawer>
      )}
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DetailData, DetailPassenger } from "../../types";
import { hasDataverseRuntime } from "../../lib/dataverse";
import { openExternalUrl } from "../../lib/localWorkflow";
import { languageFlagCode, passengerContactLinks } from "../../lib/passengerContact";
import { LanguageFlag } from "./LanguageFlag";
import {
  canRequestPassengerPhoto,
  createPassengerPhotoStore,
  fetchFotoJsonMock,
  fetchFotoJsonRemote,
  passengerInitial
} from "../../lib/passengerPhoto";

function Avatar({ name, url, size }: { name: string; url?: string; size: "sm" | "lg" }) {
  return (
    <span className={`passenger-avatar passenger-avatar--${size} ${url ? "" : "is-initial"}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : passengerInitial(name)}
    </span>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}

function PassengerName({ passenger, className }: { passenger: DetailPassenger; className: string }) {
  const code = languageFlagCode(passenger.language);
  return (
    <span className={className}>
      {code ? <LanguageFlag code={code} label={passenger.language} /> : null}
      <span className="passenger-name-text">{passenger.name}</span>
    </span>
  );
}

function PassengerSheet({ passenger, url, onClose }: { passenger: DetailPassenger; url?: string; onClose: () => void }) {
  const links = passengerContactLinks(passenger.phone, passenger.whatsappUrl);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div className="passenger-sheet-overlay" onClick={onClose}>
      <div className="passenger-sheet" role="dialog" aria-modal="true" aria-label={`Passageiro ${passenger.name}`} onClick={(event) => event.stopPropagation()}>
        <button className="passenger-sheet-close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        {url ? <img className="passenger-sheet-photo" src={url} alt={`Foto de ${passenger.name}`} /> : <Avatar name={passenger.name} size="lg" />}
        <PassengerName passenger={passenger} className="passenger-sheet-name" />
        <dl className="passenger-sheet-info">
          <div><dt>Telefone</dt><dd>{passenger.phone || "Sem telefone"}</dd></div>
        </dl>
        {links ? (
          <div className="passenger-sheet-actions">
            <button type="button" onClick={() => openExternalUrl(links.tel)}><PhoneIcon />Ligar</button>
            <button type="button" onClick={() => openExternalUrl(links.whatsapp)}><MessageIcon />WhatsApp</button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * Seção "Passageiros e Telefones de Contato": uma linha por passageiro com avatar (foto só em
 * serviço Programado, senão a inicial), bandeira do idioma, nome, telefone e atalhos Ligar/WhatsApp.
 */
export function PassengerContacts({ detail, label }: { detail: DetailData; label: string }) {
  const passengers = detail.passengers ?? [];
  const reservaId = detail.dataverse?.id ?? "";
  const eligible = canRequestPassengerPhoto(detail);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);
  const passengerKey = passengers.map((p) => p.id).join(",");

  // Nova instância (e descarte da anterior) ao trocar serviço, status ou passageiros.
  const store = useMemo(
    () => (eligible && reservaId ? createPassengerPhotoStore(hasDataverseRuntime() ? fetchFotoJsonRemote : fetchFotoJsonMock) : null),
    [eligible, reservaId, passengerKey]
  );

  useEffect(() => {
    setUrls({});
    setViewingId(null);
    if (!store) return undefined;
    let active = true;
    passengers.forEach((passenger) => {
      void store.get(reservaId, passenger.id).then((url) => {
        if (active && url) setUrls((current) => ({ ...current, [passenger.id]: url }));
      });
    });
    return () => {
      active = false;
      store.dispose();
    };
    // passengers acompanha passengerKey, que já está em store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const viewing = passengers.find((p) => p.id === viewingId);

  return (
    <div className="detail-field passenger-contacts">
      <div className="detail-field-label">{label}</div>
      <ul className="passenger-list">
        {passengers.map((passenger) => {
          const links = passengerContactLinks(passenger.phone, passenger.whatsappUrl);
          return (
            <li className="passenger-row" key={passenger.id}>
              <button className="passenger-row-open" type="button" aria-label={`Abrir ficha de ${passenger.name}`} onClick={() => setViewingId(passenger.id)}>
                <Avatar name={passenger.name} url={urls[passenger.id]} size="sm" />
                <span className="passenger-row-text">
                  <PassengerName passenger={passenger} className="passenger-row-name" />
                  <span className="passenger-row-meta">{passenger.phone || "Sem telefone"}</span>
                </span>
              </button>
              {links ? (
                <span className="passenger-row-actions">
                  <button type="button" aria-label={`Ligar para ${passenger.name}`} onClick={() => openExternalUrl(links.tel)}><PhoneIcon /></button>
                  <button type="button" aria-label={`WhatsApp de ${passenger.name}`} onClick={() => openExternalUrl(links.whatsapp)}><MessageIcon /></button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {viewing ? <PassengerSheet passenger={viewing} url={urls[viewing.id]} onClose={() => setViewingId(null)} /> : null}
    </div>
  );
}

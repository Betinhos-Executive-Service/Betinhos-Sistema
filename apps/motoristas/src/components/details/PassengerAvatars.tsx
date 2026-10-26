import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DetailData, DetailPassenger } from "../../types";
import { hasDataverseRuntime } from "../../lib/dataverse";
import {
  canRequestPassengerPhoto,
  createPassengerPhotoStore,
  fetchFotoJsonMock,
  fetchFotoJsonRemote,
  passengerInitial
} from "../../lib/passengerPhoto";

function PhotoViewer({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="passenger-photo-overlay" role="dialog" aria-modal="true" aria-label={`Foto de ${name}`} onClick={onClose}>
      <button className="passenger-photo-close" type="button" aria-label="Fechar foto" onClick={onClose}>×</button>
      <figure className="passenger-photo-figure" onClick={(event) => event.stopPropagation()}>
        <img src={url} alt={`Foto de ${name}`} />
        <figcaption>{name}</figcaption>
      </figure>
    </div>,
    document.body
  );
}

/** Avatares dos passageiros no detalhe; foto só em serviço Programado, senão a inicial. */
export function PassengerAvatars({ detail }: { detail: DetailData }) {
  const passengers = detail.passengers ?? [];
  const reservaId = detail.dataverse?.id ?? "";
  const eligible = canRequestPassengerPhoto(detail);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<DetailPassenger | null>(null);
  const passengerKey = passengers.map((p) => p.id).join(",");

  // Nova instância (e descarte da anterior) ao trocar serviço, status ou passageiros.
  const store = useMemo(
    () => (eligible && reservaId ? createPassengerPhotoStore(hasDataverseRuntime() ? fetchFotoJsonRemote : fetchFotoJsonMock) : null),
    [eligible, reservaId, passengerKey]
  );

  useEffect(() => {
    setUrls({});
    setViewing(null);
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

  if (!passengers.length) return null;

  const viewingUrl = viewing ? urls[viewing.id] : "";

  return (
    <div className="passenger-avatars" aria-label="Passageiros">
      {passengers.map((passenger) => {
        const url = urls[passenger.id];
        const firstName = passenger.name.trim().split(/\s+/)[0] || "Passageiro";
        return (
          <div className="passenger-avatar-item" key={passenger.id}>
            {url ? (
              <button className="passenger-avatar" type="button" aria-label={`Ampliar foto de ${passenger.name}`} onClick={() => setViewing(passenger)}>
                <img src={url} alt="" />
              </button>
            ) : (
              <span className="passenger-avatar is-initial" aria-hidden="true">{passengerInitial(passenger.name)}</span>
            )}
            <span className="passenger-avatar-name">{firstName}</span>
          </div>
        );
      })}
      {viewing && viewingUrl ? <PhotoViewer name={viewing.name} url={viewingUrl} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

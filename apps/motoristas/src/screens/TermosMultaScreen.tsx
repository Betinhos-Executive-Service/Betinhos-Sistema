import { useEffect, useState } from "react";
import { reportAppError } from "../lib/appErrorLogger";
import { AppShell } from "../components/layout/AppShell";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { TermoMultaDetalheScreen } from "./TermoMultaDetalheScreen";
import { formatBrl, formatDataHora, isMockTermos, parseEvidencias, type TermoMulta } from "../lib/termosMulta";

export type TermosLoadStatus = "loading" | "ready" | "error";

type Props = {
  items: TermoMulta[];
  loadStatus: TermosLoadStatus;
  onBack: () => void;
  onReload: () => Promise<void>;
};

export function TermosMultaScreen({ items, loadStatus, onBack, onReload }: Props) {
  const [selectedId, setSelectedId] = useState("");
  // Guarda o termo aberto: depois de assinar ele sai da lista de pendentes, mas a tela de sucesso continua.
  const [selected, setSelected] = useState<TermoMulta | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    try { await onReload(); }
    catch (cause) {
      reportAppError(cause, { source: "termosMulta", action: "refresh", screen: "Multas", notifyUser: false });
      setError("Não foi possível atualizar as multas. Tente novamente.");
    }
  };

  useEffect(() => { void refresh(); }, []);

  const open = (termo: TermoMulta) => { setSelectedId(termo.id); setSelected(termo); };
  const close = () => { setSelectedId(""); setSelected(null); void refresh(); };

  return (
    <AppShell screenLabel="Multas">
      {selected ? (
        // O detalhe desenha o próprio cabeçalho: o Voltar dele volta uma etapa do fluxo.
        <TermoMultaDetalheScreen key={selectedId} termo={selected} onDone={close} onRefresh={refresh} />
      ) : (
        <>
        <ServicesMenu
          title="Multas para assinar"
          eyebrow={isMockTermos() ? "Operação · Mock local" : "Operação"}
          homeLabel="Voltar"
          homeIcon="arrowLeft"
          onHome={onBack}
          onRefresh={refresh}
        />
        <section className="termo-screen" aria-label="Multas para assinar">
          {error ? <p className="termo-alert" data-tone="erro" role="alert">{error}</p> : null}
          {loadStatus === "loading" && !items.length ? (
            <div className="termo-skeleton" role="status" aria-busy="true" aria-label="Carregando multas"><span /><span /></div>
          ) : loadStatus === "error" && !items.length ? (
            <div className="termo-alert" data-tone="erro" role="alert">
              <p>Não foi possível carregar as multas.</p>
              <button type="button" className="termo-text-button" onClick={() => void refresh()}>Tentar de novo</button>
            </div>
          ) : items.length ? (
            <ul className="termo-list">
              {items.map((termo) => {
                const ev = parseEvidencias(termo.evidenciasJson);
                return (
                  <li key={termo.id}>
                    <button type="button" className="termo-row" onClick={() => open(termo)}>
                      <span className="termo-row-main">
                        <strong>{ev.placa || termo.nome}</strong>
                        <span>{ev.infracao || "Infração não informada"}</span>
                        <small>{formatDataHora(ev.dataHora)}</small>
                      </span>
                      <span className="termo-row-side">
                        <strong>{formatBrl(termo.valorTotal)}</strong>
                        <span className="termo-badge" data-tone="atencao">Aguardando sua assinatura</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="termo-empty">Nenhum termo pendente.</p>
          )}
        </section>
        </>
      )}
    </AppShell>
  );
}

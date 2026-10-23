import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { reportAppError } from "../lib/appErrorLogger";
import { AppShell } from "../components/layout/AppShell";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { TermoMultaDetalheScreen } from "./TermoMultaDetalheScreen";
import { formatBrl, formatDataHora, isMockTermos, parseEvidencias, prazoAssinatura, proximaAba, separarTermos, TERMO_STATUS, type AbaTermos, type TermoMulta } from "../lib/termosMulta";

export type TermosLoadStatus = "loading" | "ready" | "error";

type Props = {
  items: TermoMulta[];
  loadStatus: TermosLoadStatus;
  onBack: () => void;
  onReload: () => Promise<void>;
};


function situacaoTermo(termo: TermoMulta) {
  if (termo.status === TERMO_STATUS.pendente) return { tone: "atencao", texto: `Assine até ${prazoAssinatura(termo.enviadoEm)}` };
  if (termo.status === TERMO_STATUS.contestado) return { tone: "neutro", texto: "Contestado" };
  if (termo.status === TERMO_STATUS.expirado) return { tone: "neutro", texto: "Expirado: fale com o gestor de frota" };
  return { tone: "sucesso", texto: termo.assinadoEm ? `Assinado em ${formatDataHora(termo.assinadoEm).slice(0, 10)}` : "Assinado" };
}

export function TermosMultaScreen({ items, loadStatus, onBack, onReload }: Props) {
  // Guarda o termo aberto: depois de assinar ele muda de aba, mas a tela de sucesso continua.
  const [selected, setSelected] = useState<TermoMulta | null>(null);
  const [aba, setAba] = useState<AbaTermos>("pendentes");
  const tabRefs = useRef<Partial<Record<AbaTermos, HTMLButtonElement | null>>>({});
  const onTabKey = (event: KeyboardEvent) => {
    const next = proximaAba(aba, event.key);
    if (!next) return;
    event.preventDefault();
    setAba(next);
    tabRefs.current[next]?.focus();
  };
  const [error, setError] = useState("");
  const { pendentes, concluidos } = separarTermos(items);
  const lista = aba === "pendentes" ? pendentes : concluidos;

  const refresh = async () => {
    setError("");
    try { await onReload(); }
    catch (cause) {
      reportAppError(cause, { source: "termosMulta", action: "refresh", screen: "Multas", notifyUser: false });
      setError("Não foi possível atualizar as multas. Tente novamente.");
    }
  };

  useEffect(() => { void refresh(); }, []);

  const close = () => { setSelected(null); void refresh(); };

  return (
    <AppShell screenLabel="Multas">
      {selected ? (
        // O detalhe desenha o próprio cabeçalho: o Voltar dele volta uma etapa do fluxo.
        <TermoMultaDetalheScreen key={selected.id} termo={selected} onDone={close} onRefresh={refresh} />
      ) : (
        <>
        <ServicesMenu
          title="Multas"
          eyebrow={isMockTermos() ? "Operação · Mock local" : "Operação"}
          homeLabel="Voltar"
          homeIcon="arrowLeft"
          onHome={onBack}
          onRefresh={refresh}
        />
        <section className="termo-screen" aria-label="Multas">
          <div className="termo-tabs" role="tablist" aria-label="Situação das multas" onKeyDown={onTabKey}>
            {([["pendentes", "Pendentes", pendentes.length], ["concluidos", "Concluídos", concluidos.length]] as const).map(([id, label, count]) => (
              <button key={id} ref={(el) => { tabRefs.current[id] = el; }} type="button" role="tab" id={`termo-tab-${id}`} tabIndex={aba === id ? 0 : -1} aria-selected={aba === id} aria-controls="termo-tabpanel" className="termo-tab" onClick={() => setAba(id)}>
                {label}{count ? <span className="termo-tab-count">{count}</span> : null}
              </button>
            ))}
          </div>
          <div id="termo-tabpanel" role="tabpanel" aria-labelledby={`termo-tab-${aba}`} className="termo-tabpanel" key={aba}>
            {error ? <p className="termo-alert" data-tone="erro" role="alert">{error}</p> : null}
            {loadStatus === "loading" && !items.length ? (
              <div className="termo-skeleton" role="status" aria-busy="true" aria-label="Carregando multas"><span /><span /></div>
            ) : loadStatus === "error" && !items.length ? (
              <div className="termo-alert" data-tone="erro" role="alert">
                <p>Não foi possível carregar as multas.</p>
                <button type="button" className="termo-text-button" onClick={() => void refresh()}>Tentar de novo</button>
              </div>
            ) : lista.length ? (
              <ul className="termo-list">
                {lista.map((termo) => {
                  const ev = parseEvidencias(termo.evidenciasJson);
                  const sit = situacaoTermo(termo);
                  return (
                    <li key={termo.id}>
                      <button type="button" className="termo-row" onClick={() => setSelected(termo)}>
                        <span className="termo-row-main">
                          <strong>{ev.placa || termo.nome}</strong>
                          <span>{ev.infracao || "Infração não informada"}</span>
                          <small>{formatDataHora(ev.dataHora)}</small>
                        </span>
                        <span className="termo-row-side">
                          <strong>{formatBrl(termo.valorTotal)}</strong>
                          <span className="termo-badge" data-tone={sit.tone}>{sit.texto}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="termo-empty">{aba === "pendentes" ? "Nenhuma multa para assinar." : "Nenhum termo assinado, contestado ou expirado ainda."}</p>
            )}
          </div>
        </section>
        </>
      )}
    </AppShell>
  );
}

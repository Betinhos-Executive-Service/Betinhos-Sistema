import { useEffect, useState } from "react";
import { reportAppError } from "../../shared/appErrorLogger";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { BrandLoader } from "../../shared/ui/BrandLoader";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import { customApiErrorMessage } from "../../data/dataverse/customApi";
import { AceiteCnhCard } from "./AceiteCnhCard";
import { agruparMinhasMultas, descreverParcela, horaDoCache, SEM_CONEXAO_TEXTO, type CargaStatus, type MinhaMulta } from "./minhasMultas";
import { TermoMultaDetalheScreen } from "./TermoMultaDetalheScreen";
import { abrirPdf, baixarPdf, formatDataHora, isMockTermos, navegadorPdfEnv, obterTermo, type TermoMulta } from "./termosMulta";

type Props = {
  items: MinhaMulta[];
  termos: TermoMulta[];
  loadStatus: CargaStatus;
  /** Hora da leitura guardada quando a lista veio do aparelho (sem conexão); null com dados novos. */
  offlineEm: string | null;
  onBack: () => void;
  onReload: () => Promise<void>;
  onDeclarar: (multaId: string) => Promise<void>;
  /** Avisa o App quando um termo abre ou fecha (o tour tem um capítulo para cada estado). */
  onSelectedChange?: (id: string) => void;
};

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const ligar = () => setOnline(true);
    const desligar = () => setOnline(false);
    window.addEventListener("online", ligar);
    window.addEventListener("offline", desligar);
    return () => { window.removeEventListener("online", ligar); window.removeEventListener("offline", desligar); };
  }, []);
  return online;
}

function MultaCard({ multa, somenteLeitura, onAbrirTermo, onDeclarar }: { multa: MinhaMulta; somenteLeitura: boolean; onAbrirTermo: (m: MinhaMulta) => void; onDeclarar: (id: string) => Promise<void> }) {
  const [pdf, setPdf] = useState({ busy: false, erro: "" });
  const verPdf = async () => {
    if (!multa.termoId) return;
    setPdf({ busy: true, erro: "" });
    try {
      await abrirPdf(await baixarPdf(multa.termoId), navegadorPdfEnv());
      setPdf({ busy: false, erro: "" });
    } catch (error) {
      reportAppError(error, { source: "termosMulta", action: "baixarPdf", screen: "Multas", detailId: multa.termoId, detailType: "TERMO_MULTA", notifyUser: false });
      setPdf({ busy: false, erro: customApiErrorMessage(error, "Não foi possível abrir o PDF.") });
    }
  };
  const parcelas = multa.parcelas;
  return (
    <li className="multa-card" data-grupo={multa.grupo}>
      <div className="multa-card-head">
        <strong>{multa.placa || multa.auto}</strong>
        <small>{formatDataHora(multa.dataHora)}</small>
      </div>
      {multa.local ? <span className="multa-card-local">{multa.local}</span> : null}
      {multa.infracao ? <span className="multa-card-local">{multa.infracao}</span> : null}
      <span className="termo-badge" data-tone={multa.grupo === "precisa" ? "atencao" : multa.grupo === "encerrada" ? "neutro" : "sucesso"}>{multa.situacao}</span>
      {parcelas.length ? (
        <ul className="multa-parcelas" aria-label="Parcelas do desconto em folha">
          {parcelas.map((p) => <li key={p.numero}>{descreverParcela(p, parcelas.length)}</li>)}
        </ul>
      ) : null}
      {multa.acao === "assinar" ? (
        <button type="button" className="termo-primary" disabled={somenteLeitura} onClick={() => onAbrirTermo(multa)}>
          {somenteLeitura ? SEM_CONEXAO_TEXTO : "Abrir termo"}
        </button>
      ) : null}
      {multa.acao === "aceite" ? <AceiteCnhCard multa={multa} semConexao={somenteLeitura} onDeclarar={onDeclarar} /> : null}
      {multa.termoStatus === "assinado" && multa.termoId ? (
        <button type="button" className="termo-text-button" disabled={somenteLeitura || pdf.busy} aria-busy={pdf.busy || undefined} onClick={() => void verPdf()}>
          {pdf.busy ? "Abrindo PDF" : "Ver termo assinado (PDF)"}
        </button>
      ) : null}
      {pdf.erro ? <p className="termo-alert" data-tone="erro" role="alert">{pdf.erro}</p> : null}
    </li>
  );
}

function Grupo({ titulo, itens, destaque, ...resto }: { titulo: string; itens: MinhaMulta[]; destaque?: boolean; somenteLeitura: boolean; onAbrirTermo: (m: MinhaMulta) => void; onDeclarar: (id: string) => Promise<void> }) {
  return (
    <section className="multa-grupo" data-destaque={destaque || undefined} aria-label={titulo}>
      <h2 className="multa-grupo-titulo">{titulo}<span className="termo-tab-count">{itens.length}</span></h2>
      <ul className="termo-list">{itens.map((m) => <MultaCard key={m.id} multa={m} {...resto} />)}</ul>
    </section>
  );
}

export function MinhasMultasScreen({ items, termos, loadStatus, offlineEm, onBack, onReload, onDeclarar, onSelectedChange }: Props) {
  // Guarda o termo aberto: depois de assinar a multa muda de grupo, mas a tela de sucesso continua.
  const [selected, setSelected] = useState<TermoMulta | null>(null);
  useEffect(() => { onSelectedChange?.(selected?.id ?? ""); }, [selected?.id, onSelectedChange]);
  const [encerradasAbertas, setEncerradasAbertas] = useState(false);
  const [error, setError] = useState("");
  const online = useOnline();
  const somenteLeitura = !online || offlineEm !== null;
  const grupos = agruparMinhasMultas(items);

  const refresh = async () => {
    setError("");
    try { await onReload(); }
    catch (cause) {
      reportAppError(cause, { source: "termosMulta", action: "refresh", screen: "Multas", notifyUser: false });
      setError("Não foi possível atualizar as multas. Tente novamente.");
    }
  };
  useEffect(() => { void refresh(); }, []);

  const abrirTermo = async (multa: MinhaMulta) => {
    if (!multa.termoId) return;
    try {
      const termo = termos.find((t) => t.id === multa.termoId) ?? await obterTermo(multa.termoId);
      if (termo) setSelected(termo); else setError("Não encontramos o termo desta multa. Atualize a lista.");
    } catch (cause) {
      reportAppError(cause, { source: "termosMulta", action: "abrirTermo", screen: "Multas", detailId: multa.termoId, notifyUser: false });
      setError("Não foi possível abrir o termo. Tente novamente.");
    }
  };

  const declarar = async (multaId: string) => {
    await onDeclarar(multaId);
    await refresh();
  };

  const close = () => { setSelected(null); void refresh(); };
  const comuns = { somenteLeitura, onAbrirTermo: (m: MinhaMulta) => void abrirTermo(m), onDeclarar: declarar };

  return (
    <AppShell screenLabel="Multas">
      {selected ? (
        // O detalhe desenha o próprio cabeçalho: o Voltar dele volta uma etapa do fluxo.
        <TermoMultaDetalheScreen key={selected.id} termo={selected} onDone={close} onRefresh={refresh} />
      ) : (
        <>
          <ServicesMenu title="Multas" eyebrow={isMockTermos() ? "Operação · Mock local" : "Operação"} homeLabel="Voltar" homeIcon="arrowLeft" onHome={onBack} onRefresh={refresh} />
          <section className="termo-screen" aria-label="Multas">
            {offlineEm ? <p className="termo-alert" data-tone="atencao" role="status">Sem conexão. Mostrando as multas de {horaDoCache(offlineEm)}.</p> : null}
            {error ? <p className="termo-alert" data-tone="erro" role="alert">{error}</p> : null}
            {loadStatus === "loading" && !items.length ? (
              <BrandLoader variant="inline" label="Carregando multas" text="Carregando multas" />
            ) : loadStatus === "error" && !items.length ? (
              <div className="termo-alert" data-tone="erro" role="alert">
                <p>Não foi possível carregar as multas.</p>
                <button type="button" className="termo-text-button" onClick={() => void refresh()}>Tentar de novo</button>
              </div>
            ) : !items.length ? (
              <p className="termo-empty">Você não tem multas no momento.</p>
            ) : (
              <div className="multa-grupos">
                {grupos.precisa.length ? <Grupo titulo="Precisa de você" itens={grupos.precisa} destaque {...comuns} /> : null}
                {grupos.andamento.length ? <Grupo titulo="Em andamento" itens={grupos.andamento} {...comuns} /> : null}
                {grupos.encerrada.length ? (
                  <section className="multa-grupo" aria-label="Encerradas">
                    <h2 className="multa-grupo-titulo">
                      <button type="button" className="multa-grupo-toggle" aria-expanded={encerradasAbertas} onClick={() => setEncerradasAbertas((v) => !v)}>
                        Encerradas<span className="termo-tab-count">{grupos.encerrada.length}</span>
                      </button>
                    </h2>
                    {encerradasAbertas ? <ul className="termo-list">{grupos.encerrada.map((m) => <MultaCard key={m.id} multa={m} {...comuns} />)}</ul> : null}
                  </section>
                ) : null}
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

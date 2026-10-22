import { useMemo, useReducer, useRef } from "react";
import { reportAppError } from "../lib/appErrorLogger";
import { customApiErrorMessage } from "../lib/customApi";
import { SignaturePad } from "../components/comunicados/SignaturePad";
import { SelfieCapture } from "../components/termos/SelfieCapture";
import {
  assinarTermo,
  baixarPdf,
  canAdvance,
  contestarTermo,
  createSingleFlight,
  descreverAcordo,
  descreverGpsErro,
  formatBrl,
  formatDataHora,
  GPS_PRECISAO_AVISO_M,
  initialTermoFlow,
  parseEvidencias,
  termoFlowReducer,
  validarMotivo,
  type TermoMulta,
  type TermoStep
} from "../lib/termosMulta";

type Props = { termo: TermoMulta; onDone: () => void };

const STEP_TITLE: Partial<Record<TermoStep, string>> = {
  selfie: "Tire uma selfie",
  local: "Confirme sua localização",
  assinatura: "Assine o termo",
  contestar: "Por que você não concorda?"
};
const SIGN_STEPS: TermoStep[] = ["selfie", "local", "assinatura"];

function SuccessCheck() {
  return (
    <svg className="termo-check" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="24" />
      <path d="M15 27l7 7 15-16" />
    </svg>
  );
}

export function TermoMultaDetalheScreen({ termo, onDone }: Props) {
  const [flow, dispatch] = useReducer(termoFlowReducer, undefined, initialTermoFlow);
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const evidencias = useMemo(() => parseEvidencias(termo.evidenciasJson), [termo.evidenciasJson]);
  const acordo = descreverAcordo(termo);
  const stepIndex = SIGN_STEPS.indexOf(flow.step);

  const pedirGps = () => {
    if (!navigator.geolocation) { dispatch({ type: "gpsErro", message: descreverGpsErro(null) }); return; }
    dispatch({ type: "gpsErro", message: "" });
    navigator.geolocation.getCurrentPosition(
      (pos) => dispatch({ type: "gps", value: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, precisao: pos.coords.accuracy } }),
      (error) => dispatch({ type: "gpsErro", message: descreverGpsErro(error) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Uma única referência por tela: duplo toque reaproveita o envio em andamento.
  const enviarAssinatura = useMemo(() => createSingleFlight(async () => {
    const current = flowRef.current;
    if (!canAdvance(current)) return;
    dispatch({ type: "submit" });
    try {
      const result = await assinarTermo(termo.id, { selfieJpegBase64: current.selfie, strokes: current.strokes, gps: current.gps, dispositivo: navigator.userAgent });
      dispatch({ type: "signed", assinadoEm: result.assinadoEm });
    } catch (error) {
      reportAppError(error, { source: "termosMulta", action: "assinarTermo", screen: "Multas", detailId: termo.id, detailType: "TERMO_MULTA", payload: { strokeCount: current.strokes.length, hasGps: Boolean(current.gps) }, notifyUser: false });
      dispatch({ type: "error", message: customApiErrorMessage(error, "Não foi possível registrar a assinatura. Tente de novo.") });
    }
  }), [termo.id]);

  const enviarContestacao = useMemo(() => createSingleFlight(async () => {
    const current = flowRef.current;
    if (!canAdvance(current)) return;
    dispatch({ type: "submit" });
    try {
      await contestarTermo(termo.id, current.motivo);
      dispatch({ type: "contested" });
    } catch (error) {
      reportAppError(error, { source: "termosMulta", action: "contestarTermo", screen: "Multas", detailId: termo.id, detailType: "TERMO_MULTA", notifyUser: false });
      dispatch({ type: "error", message: customApiErrorMessage(error, "Não foi possível registrar a contestação. Tente de novo.") });
    }
  }), [termo.id]);

  const baixar = async () => {
    try {
      const url = URL.createObjectURL(await baixarPdf(termo.id));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${termo.nome || "termo-multa"}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      reportAppError(error, { source: "termosMulta", action: "baixarPdf", screen: "Multas", detailId: termo.id, detailType: "TERMO_MULTA", notifyUser: false });
      dispatch({ type: "error", message: customApiErrorMessage(error, "Não foi possível baixar o PDF.") });
    }
  };

  const motivoErro = flow.motivo ? validarMotivo(flow.motivo) : "";

  const footer = (() => {
    const busy = flow.enviando;
    const spinner = busy ? <span className="termo-spinner" aria-hidden="true" /> : null;
    switch (flow.step) {
      case "detalhe":
        return (
          <>
            <button type="button" className="termo-primary" onClick={() => dispatch({ type: "go", step: "selfie" })}>Assinar</button>
            <button type="button" className="termo-text-button termo-footer-secondary" onClick={() => dispatch({ type: "go", step: "contestar" })}>Não concordo</button>
          </>
        );
      case "selfie":
        return <button type="button" className="termo-primary" disabled={!canAdvance(flow)} onClick={() => { dispatch({ type: "go", step: "local" }); if (!flow.gps) pedirGps(); }}>Continuar</button>;
      case "local":
        return <button type="button" className="termo-primary" disabled={!canAdvance(flow)} onClick={() => dispatch({ type: "go", step: "assinatura" })}>Continuar</button>;
      case "assinatura":
        return <button type="button" className="termo-primary" disabled={!canAdvance(flow) || busy} aria-busy={busy} onClick={() => void enviarAssinatura()}>{spinner}{busy ? "Enviando assinatura" : "Confirmar assinatura"}</button>;
      case "contestar":
        return <button type="button" className="termo-primary" disabled={!canAdvance(flow) || busy} aria-busy={busy} onClick={() => void enviarContestacao()}>{spinner}{busy ? "Enviando" : "Enviar"}</button>;
      case "sucesso":
        return <button type="button" className="termo-primary" onClick={() => void baixar()}>Baixar PDF</button>;
      default:
        return <button type="button" className="termo-primary" onClick={onDone}>Voltar para multas</button>;
    }
  })();

  const back = () => {
    if (flow.enviando) return;
    if (flow.step === "detalhe" || flow.step === "sucesso" || flow.step === "contestado" || flow.step === "semAditivo") { onDone(); return; }
    if (flow.step === "contestar" || flow.step === "selfie") { dispatch({ type: "go", step: "detalhe" }); return; }
    dispatch({ type: "go", step: SIGN_STEPS[stepIndex - 1] });
  };

  return (
    <div className="termo-flow">
      <div className="termo-flow-scroll">
        <div className="termo-step" key={flow.step}>
          {STEP_TITLE[flow.step] ? (
            <header className="termo-step-header">
              <button type="button" className="termo-text-button" onClick={back} disabled={flow.enviando}>‹ Voltar</button>
              {stepIndex >= 0 ? <span className="termo-step-count">Passo {stepIndex + 1} de 3</span> : null}
              <h2>{STEP_TITLE[flow.step]}</h2>
            </header>
          ) : null}

          {flow.erro && flow.step !== "semAditivo" ? <p className="termo-alert" data-tone="erro" role="alert">{flow.erro}</p> : null}

          {flow.step === "detalhe" ? (
            <>
              <section className="termo-card" aria-label="Evidências da multa">
                <span className="termo-badge" data-tone="atencao">Aguardando sua assinatura</span>
                <dl className="termo-evidencias">
                  <div><dt>Placa</dt><dd>{evidencias.placa || "—"}</dd></div>
                  <div><dt>Data e hora</dt><dd>{formatDataHora(evidencias.dataHora) || "—"}</dd></div>
                  <div className="is-wide"><dt>Local</dt><dd>{evidencias.local || "—"}</dd></div>
                  <div className="is-wide"><dt>Infração</dt><dd>{evidencias.infracao || "—"}</dd></div>
                  <div><dt>Valor</dt><dd>{formatBrl(evidencias.valor ?? termo.valorTotal)}</dd></div>
                  <div className="is-wide">
                    <dt>Rastreador (InFleet)</dt>
                    <dd>{evidencias.infleetIndisponivel ? "Dados do rastreador indisponíveis" : evidencias.viagens.length
                      ? evidencias.viagens.map((v) => `Viagem ${formatDataHora(v.inicio).slice(-5)}–${formatDataHora(v.fim).slice(-5)}`).join(" · ")
                      : "Nenhuma viagem registrada no horário"}</dd>
                  </div>
                </dl>
              </section>
              <section className="termo-acordo" aria-label="Acordo de pagamento">
                <span>Acordo</span>
                <strong>{acordo}</strong>
              </section>
              <section className="termo-texto" aria-label="Texto do termo" tabIndex={0}>
                <p>{termo.texto}</p>
                {termo.versaoTexto ? <small>Versão do texto: {termo.versaoTexto}</small> : null}
              </section>
            </>
          ) : null}

          {flow.step === "selfie" ? (
            <>
              <p className="termo-help">A selfie confirma que foi você quem assinou. Use a câmera da frente, com o rosto bem iluminado.</p>
              <SelfieCapture value={flow.selfie} onChange={(value) => dispatch({ type: "selfie", value })} />
            </>
          ) : null}

          {flow.step === "local" ? (
            <>
              <p className="termo-help">A localização entra no registro da assinatura. Ela é usada só neste termo.</p>
              {flow.gps ? (
                <div className="termo-alert" data-tone={flow.gps.precisao > GPS_PRECISAO_AVISO_M ? "atencao" : "sucesso"} role="status">
                  <p>{flow.gps.precisao > GPS_PRECISAO_AVISO_M
                    ? `Localização imprecisa (cerca de ${Math.round(flow.gps.precisao)} m). Você pode seguir assim mesmo.`
                    : `Localização confirmada (precisão de ${Math.round(flow.gps.precisao)} m).`}</p>
                </div>
              ) : flow.gpsErro ? (
                <div className="termo-alert" data-tone="erro" role="alert">
                  <p>{flow.gpsErro}</p>
                  <button type="button" className="termo-text-button" onClick={pedirGps}>Tentar de novo</button>
                </div>
              ) : (
                <p className="termo-alert" data-tone="info" role="status">Buscando sua localização…</p>
              )}
            </>
          ) : null}

          {flow.step === "assinatura" ? (
            <>
              <p className="termo-help">Desenhe sua assinatura no quadro. Ao confirmar, o termo fica registrado com data e hora do servidor.</p>
              <div className="termo-signature">
                <SignaturePad value={flow.strokes} onChange={(value) => dispatch({ type: "strokes", value })} />
              </div>
            </>
          ) : null}

          {flow.step === "contestar" ? (
            <div className="termo-field">
              <label htmlFor="termo-motivo">Motivo <span>(mínimo 10 caracteres)</span></label>
              <textarea
                id="termo-motivo"
                value={flow.motivo}
                maxLength={2000}
                aria-invalid={Boolean(motivoErro) || undefined}
                aria-describedby="termo-motivo-ajuda"
                onChange={(event) => dispatch({ type: "motivo", value: event.target.value })}
              />
              <small id="termo-motivo-ajuda" className={motivoErro ? "is-error" : undefined}>{motivoErro || `${flow.motivo.trim().length}/2000`}</small>
            </div>
          ) : null}

          {flow.step === "sucesso" ? (
            <section className="termo-result" role="status">
              <SuccessCheck />
              <h2>{flow.assinadoEm ? `Termo assinado em ${formatDataHora(flow.assinadoEm)}` : "Termo assinado"}</h2>
              <p>A cópia também vai para o seu e-mail.</p>
              <button type="button" className="termo-text-button" onClick={onDone}>Voltar para multas</button>
            </section>
          ) : null}

          {flow.step === "contestado" ? (
            <section className="termo-result" role="status">
              <SuccessCheck />
              <h2>Sua contestação foi registrada.</h2>
              <p>O gestor de frota vai entrar em contato.</p>
            </section>
          ) : null}

          {flow.step === "semAditivo" ? (
            <section className="termo-result" role="alert">
              <h2>Procure o escritório</h2>
              <p>Para assinar pelo app, procure o escritório e assine o aditivo de assinatura eletrônica.</p>
              <small className="termo-server-msg">{flow.erro}</small>
            </section>
          ) : null}
        </div>
      </div>
      <footer className="termo-footer">{footer}</footer>
    </div>
  );
}

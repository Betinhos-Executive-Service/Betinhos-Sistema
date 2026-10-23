import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { reportAppError } from "../lib/appErrorLogger";
import { customApiErrorMessage } from "../lib/customApi";
import { SignaturePad } from "../components/comunicados/SignaturePad";
import { SelfieCapture } from "../components/termos/SelfieCapture";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import {
  abrirPdf,
  assinarTermo,
  baixarPdf,
  canAdvance,
  consultarAditivo,
  contestarTermo,
  createSingleFlight,
  descreverAcordo,
  descreverGpsErro,
  formatBrl,
  formatDataHora,
  GPS_PRECISAO_AVISO_M,
  initialTermoFlow,
  isMockTermos,
  navegadorPdfEnv,
  parseEvidencias,
  prazoAssinatura,
  termoFlowReducer,
  TERMO_STATUS,
  validarMotivo,
  type TermoMulta,
  type TermoStep
} from "../lib/termosMulta";

type Props = { termo: TermoMulta; onDone: () => void; onRefresh: () => void | Promise<void> };

const STEP_TITLE: Partial<Record<TermoStep, string>> = {
  selfie: "Tire uma selfie",
  local: "Confirme sua localização",
  assinatura: "Assine o termo",
  contestar: "Por que você não concorda?"
};
const SIGN_STEPS: TermoStep[] = ["selfie", "local", "assinatura"];
const CONTESTADO_TEXTO = "Contestado — o gestor de frota vai falar com você";

function SuccessCheck() {
  return (
    <svg className="termo-check" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="24" />
      <path d="M15 27l7 7 15-16" />
    </svg>
  );
}

// Ícone neutro da contestação: não é sucesso nem erro, é um assunto em aberto com o gestor.
function NeutralMark() {
  return (
    <svg className="termo-neutral" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="24" />
      <path d="M17 22h18M17 30h12" />
    </svg>
  );
}

export function TermoMultaDetalheScreen({ termo, onDone, onRefresh }: Props) {
  const [flow, dispatch] = useReducer(termoFlowReducer, undefined, initialTermoFlow);
  const [checandoAditivo, setChecandoAditivo] = useState(false);
  const [pdfState, setPdfState] = useState<{ busy: boolean; erro: string }>({ busy: false, erro: "" });
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const evidencias = useMemo(() => parseEvidencias(termo.evidenciasJson), [termo.evidenciasJson]);
  const acordo = descreverAcordo(termo);
  const prazo = prazoAssinatura(termo.enviadoEm);
  const pendente = termo.status === TERMO_STATUS.pendente;
  const stepIndex = SIGN_STEPS.indexOf(flow.step);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const firstRender = useRef(true);

  // Troca de passo: o foco vai para o título do passo (leitor de tela anuncia onde o motorista está).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    titleRef.current?.focus();
  }, [flow.step]);

  const pedirGps = () => {
    if (!navigator.geolocation) { dispatch({ type: "gpsErro", message: descreverGpsErro(null) }); return; }
    dispatch({ type: "gpsErro", message: "" });
    navigator.geolocation.getCurrentPosition(
      (pos) => dispatch({ type: "gps", value: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, precisao: pos.coords.accuracy } }),
      (error) => dispatch({ type: "gpsErro", message: descreverGpsErro(error) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Antes da selfie: sem aditivo não adianta tirar foto, GPS e assinatura (o plugin recusaria no fim).
  const iniciarAssinatura = useMemo(() => createSingleFlight(async () => {
    setChecandoAditivo(true);
    try {
      dispatch({ type: "go", step: (await consultarAditivo()) ? "selfie" : "semAditivo" });
    } catch (error) {
      // Sem a resposta não segue para a selfie: mostra o erro e "Tentar de novo" (cadastro duplicado vai para a tela final).
      reportAppError(error, { severity: "warning", source: "termosMulta", action: "consultarAditivo", screen: "Multas", detailId: termo.id, detailType: "TERMO_MULTA", notifyUser: false });
      dispatch({ type: "error", message: customApiErrorMessage(error, "Não foi possível conferir seu cadastro. Verifique a internet e tente de novo.") });
    } finally {
      setChecandoAditivo(false);
    }
  }), [termo.id]);

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
      dispatch({ type: "error", message: customApiErrorMessage(error, "Não foi possível registrar a assinatura. Verifique a internet e tente de novo.") });
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
      dispatch({ type: "error", message: customApiErrorMessage(error, "Não foi possível registrar a contestação. Verifique a internet e tente de novo.") });
    }
  }), [termo.id]);

  const baixar = useMemo(() => createSingleFlight(async () => {
    setPdfState({ busy: true, erro: "" });
    const falha = (metodo: string, error: unknown) =>
      reportAppError(error, { severity: "warning", source: "termosMulta", action: `abrirPdf-${metodo}`, screen: "Multas", detailId: termo.id, detailType: "TERMO_MULTA", notifyUser: false });
    try {
      const metodo = await abrirPdf(await baixarPdf(termo.id), navegadorPdfEnv(falha));
      reportAppError(new Error(`PDF aberto por ${metodo}`), { severity: "info", source: "termosMulta", action: "abrirPdf", screen: "Multas", detailId: termo.id, detailType: "TERMO_MULTA", notifyUser: false });
      setPdfState({ busy: false, erro: "" });
    } catch (error) {
      reportAppError(error, { source: "termosMulta", action: "baixarPdf", screen: "Multas", detailId: termo.id, detailType: "TERMO_MULTA", notifyUser: false });
      setPdfState({ busy: false, erro: customApiErrorMessage(error, "Não foi possível abrir o PDF.") });
    }
  }), [termo.id]);

  const motivoErro = flow.motivo ? validarMotivo(flow.motivo) : "";
  const pdfBotao = (className: string) => (
    <button type="button" className={className} disabled={pdfState.busy} aria-busy={pdfState.busy || undefined} onClick={() => void baixar()}>
      {pdfState.busy ? "Abrindo PDF" : "Baixar PDF"}
    </button>
  );

  const footer = (() => {
    const busy = flow.enviando;
    const spinner = busy ? <span className="termo-spinner" aria-hidden="true" /> : null;
    switch (flow.step) {
      case "detalhe":
        if (termo.status === TERMO_STATUS.assinado) return <>{pdfBotao("termo-primary")}<button type="button" className="termo-text-button termo-footer-secondary" onClick={onDone}>Voltar para multas</button></>;
        if (!pendente) return <button type="button" className="termo-primary" onClick={onDone}>Voltar para multas</button>;
        return (
          <>
            <button type="button" className="termo-primary" disabled={checandoAditivo} aria-busy={checandoAditivo || undefined} onClick={() => void iniciarAssinatura()}>
              {checandoAditivo ? <><span className="termo-spinner" aria-hidden="true" />Verificando</> : flow.erro ? "Tentar de novo" : "Assinar"}
            </button>
            <button type="button" className="termo-text-button termo-footer-secondary" disabled={checandoAditivo} onClick={() => dispatch({ type: "go", step: "contestar" })}>Não concordo</button>
          </>
        );
      case "selfie":
        return <button type="button" className="termo-primary" disabled={!canAdvance(flow)} onClick={() => { dispatch({ type: "go", step: "local" }); if (!flow.gps) pedirGps(); }}>Continuar</button>;
      case "local":
        return <button type="button" className="termo-primary" disabled={!canAdvance(flow)} onClick={() => dispatch({ type: "go", step: "assinatura" })}>Continuar</button>;
      case "assinatura":
        return <button type="button" className="termo-primary" disabled={!canAdvance(flow) || busy} aria-busy={busy} onClick={() => void enviarAssinatura()}>{spinner}{busy ? "Enviando assinatura" : flow.erro ? "Tentar de novo" : "Confirmar assinatura"}</button>;
      case "contestar":
        return <button type="button" className="termo-primary" disabled={!canAdvance(flow) || busy} aria-busy={busy} onClick={() => void enviarContestacao()}>{spinner}{busy ? "Enviando" : flow.erro ? "Tentar de novo" : "Enviar"}</button>;
      case "sucesso":
        return <><button type="button" className="termo-primary" onClick={onDone}>Voltar para multas</button>{pdfBotao("termo-text-button termo-footer-secondary")}</>;
      default:
        return <button type="button" className="termo-primary" onClick={onDone}>Voltar para multas</button>;
    }
  })();

  const finalStep = flow.step === "detalhe" || flow.step === "sucesso" || flow.step === "contestado" || flow.step === "semAditivo" || flow.step === "encerrado";
  const back = () => {
    if (flow.enviando) return;
    if (finalStep) { onDone(); return; }
    if (flow.step === "contestar" || flow.step === "selfie") { dispatch({ type: "go", step: "detalhe" }); return; }
    dispatch({ type: "go", step: SIGN_STEPS[stepIndex - 1] });
  };

  return (
    <>
    <ServicesMenu
      title="Termo de multa"
      eyebrow={isMockTermos() ? "Operação · Mock local" : "Operação"}
      homeLabel="Voltar"
      homeIcon="arrowLeft"
      onHome={back}
      // Atualizar no meio da assinatura descartaria selfie e traços: só no detalhe.
      onRefresh={flow.step === "detalhe" ? onRefresh : undefined}
    />
    <div className="termo-flow" aria-busy={flow.enviando || undefined}>
      <div className="termo-flow-scroll" tabIndex={0} aria-label="Conteúdo do termo">
        <div className="termo-step" key={flow.step}>
          {STEP_TITLE[flow.step] ? (
            <header className="termo-step-header">
              {stepIndex >= 0 ? <span className="termo-step-count">Passo {stepIndex + 1} de 3</span> : null}
              <h2 ref={titleRef} tabIndex={-1}>{STEP_TITLE[flow.step]}</h2>
            </header>
          ) : null}

          {flow.erro && !["semAditivo", "encerrado"].includes(flow.step) ? <p className="termo-alert" data-tone="erro" role="alert">{flow.erro}</p> : null}

          {flow.step === "detalhe" ? (
            <>
              {pendente ? (
                <p className="termo-prazo" role="note"><strong>Assine ou conteste até {prazo}.</strong> Depois disso o termo expira e o gestor de frota fala com você.</p>
              ) : termo.status === TERMO_STATUS.expirado ? (
                <p className="termo-alert" data-tone="neutro" role="note">Expirado: fale com o gestor de frota.</p>
              ) : termo.status === TERMO_STATUS.contestado ? (
                <div className="termo-alert" data-tone="neutro" role="note">
                  <p>{CONTESTADO_TEXTO}</p>
                  {termo.motivoContestacao ? <small className="termo-motivo">Seu motivo: {termo.motivoContestacao}</small> : null}
                </div>
              ) : (
                <p className="termo-alert" data-tone="sucesso" role="note">Assinado em {formatDataHora(termo.assinadoEm)}.</p>
              )}
              {pdfState.erro ? <p className="termo-alert" data-tone="erro" role="alert">{pdfState.erro}</p> : null}
              <section className="termo-card" aria-labelledby="termo-o-que">
                <h3 id="termo-o-que" className="termo-section-title">O que aconteceu</h3>
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
              <section className="termo-acordo" aria-labelledby="termo-aceita">
                <h3 id="termo-aceita" className="termo-section-title">{pendente ? "O que você está aceitando" : "Acordo"}</h3>
                <strong>{acordo}</strong>
              </section>
              <section className="termo-texto" aria-labelledby="termo-texto-titulo">
                <h3 id="termo-texto-titulo" className="termo-section-title">Texto do termo</h3>
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
              <p className="termo-help">Ao confirmar, o termo fica registrado com data e hora do servidor.</p>
              <div className="termo-signature" data-empty={flow.strokes.length === 0 || undefined}>
                <SignaturePad value={flow.strokes} onChange={(value) => dispatch({ type: "strokes", value })} />
                <span className="termo-signature-hint" aria-hidden="true">Assine com o dedo aqui</span>
                <span className="termo-signature-line" aria-hidden="true" />
              </div>
            </>
          ) : null}

          {flow.step === "contestar" ? (
            <>
              <p className="termo-help">Conte o que aconteceu. O gestor de frota vai falar com você pessoalmente e nada é descontado enquanto isso.</p>
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
            </>
          ) : null}

          {flow.step === "sucesso" ? (
            <section className="termo-result" role="status">
              <SuccessCheck />
              <h2 ref={titleRef} tabIndex={-1}>{flow.assinadoEm ? `Termo assinado em ${formatDataHora(flow.assinadoEm)}` : "Termo assinado"}</h2>
              <p>A cópia também vai para o seu e-mail. O termo fica em Concluídos.</p>
              {pdfState.erro ? <p className="termo-alert" data-tone="erro" role="alert">{pdfState.erro}</p> : null}
            </section>
          ) : null}

          {flow.step === "contestado" ? (
            <section className="termo-result" role="status">
              <NeutralMark />
              <h2 ref={titleRef} tabIndex={-1}>{CONTESTADO_TEXTO}</h2>
              <p>Nenhum valor é descontado enquanto vocês conversam. O termo fica em Concluídos com o seu motivo.</p>
            </section>
          ) : null}

          {flow.step === "semAditivo" ? (
            <section className="termo-result" role="alert">
              <h2 ref={titleRef} tabIndex={-1}>Procure o escritório</h2>
              <p>Para assinar pelo app, você precisa antes assinar no escritório o aditivo de assinatura eletrônica. Depois disso, volte aqui; o prazo continua até {prazo}.</p>
            </section>
          ) : null}

          {flow.step === "encerrado" ? (
            <section className="termo-result" role="alert">
              <h2 ref={titleRef} tabIndex={-1}>Este termo não pode ser assinado</h2>
              <p>{flow.erro}</p>
              <p>Se achar que é um engano, fale com o gestor de frota.</p>
            </section>
          ) : null}
        </div>
      </div>
      <footer className="termo-footer">{footer}</footer>
    </div>
    </>
  );
}

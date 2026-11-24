import { useRef, useState } from "react";
import { enviarAditivoAssinado } from "./aditivoAcoes";
import { reportAppError } from "../../shared/appErrorLogger";
import { customApiErrorMessage } from "../../data/dataverse/customApi";
import { SuccessCheck } from "./SuccessCheck";
import { ServicesMenu } from "../../shared/ui/navigation/ServicesMenu";
import {
  abrirPdf,
  ADITIVO_ASSINADOR_URL,
  gerarMeuAditivo,
  isMockTermos,
  navegadorPdfEnv
} from "./termosMulta";

type PainelProps = {
  /** Texto do botão depois de confirmado ("Continuar" no termo, "Voltar ao início" na tela avulsa). */
  continuarLabel: string;
  onConcluir: () => void;
  /** Chamado quando o servidor registrou o aditivo (antes de o motorista tocar no botão final). */
  onConfirmado?: () => void;
  titleRef?: React.Ref<HTMLHeadingElement>;
};

/** O motorista baixa o próprio aditivo, assina no gov.br e devolve o PDF; o servidor confere e libera na hora. */
export function AditivoPainel({ continuarLabel, onConcluir, onConfirmado, titleRef }: PainelProps) {
  const [baixando, setBaixando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const baixar = async () => {
    if (baixando) return;
    setBaixando(true);
    setErro("");
    try {
      await abrirPdf(await gerarMeuAditivo(), navegadorPdfEnv());
    } catch (error) {
      reportAppError(error, { source: "aditivo", action: "gerarMeuAditivo", screen: "Aditivo", notifyUser: false });
      setErro(customApiErrorMessage(error, "Não foi possível abrir o aditivo."));
    } finally {
      setBaixando(false);
    }
  };

  const enviar = async (file: File | undefined) => {
    if (!file || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await enviarAditivoAssinado(file, onConfirmado);
      setConfirmado(true);
    } catch (error) {
      reportAppError(error, { source: "aditivo", action: "registrarMeuAditivo", screen: "Aditivo", notifyUser: false });
      setErro(customApiErrorMessage(error, "Não foi possível enviar o aditivo."));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (confirmado) {
    return (
      <section className="termo-result" role="status">
        <SuccessCheck />
        <h2 ref={titleRef} tabIndex={-1}>Aditivo confirmado</h2>
        <p>Sua assinatura eletrônica está liberada.</p>
        <button type="button" className="termo-primary" onClick={onConcluir}>{continuarLabel}</button>
      </section>
    );
  }

  return (
    <section className="termo-result" aria-label="Aditivo de assinatura eletrônica">
      <h2 ref={titleRef} tabIndex={-1}>Assine o aditivo de assinatura eletrônica</h2>
      <p>Para assinar pelo app, você precisa antes assinar este aditivo no gov.br. Leva poucos minutos.</p>
      <ol className="termo-help">
        <li>Baixe o aditivo.</li>
        <li>Abra o <a href={ADITIVO_ASSINADOR_URL} target="_blank" rel="noopener noreferrer">assinador do gov.br</a> e assine sem alterar o arquivo.</li>
        <li>Envie aqui o PDF que o gov.br devolver (até 5 MB).</li>
      </ol>
      {erro ? <p className="termo-alert" data-tone="erro" role="alert">{erro}</p> : null}
      <button type="button" className="termo-primary" disabled={baixando || enviando} aria-busy={baixando || undefined} onClick={() => void baixar()}>
        {baixando ? "Abrindo PDF" : "Baixar aditivo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        data-testid="aditivo-arquivo"
        onChange={(event) => void enviar(event.target.files?.[0])}
      />
      <button type="button" className="termo-text-button" disabled={baixando || enviando} aria-busy={enviando || undefined} onClick={() => inputRef.current?.click()}>
        {enviando ? "Conferindo a assinatura" : "Enviar aditivo assinado"}
      </button>
    </section>
  );
}

/** Tela avulsa aberta pelo cartão da tela inicial. */
export function AditivoScreen({ onBack, onConfirmado }: { onBack: () => void; onConfirmado: () => void }) {
  return (
    <>
      <ServicesMenu title="Aditivo" eyebrow={isMockTermos() ? "Operação · Mock local" : "Operação"} homeLabel="Voltar" homeIcon="arrowLeft" onHome={onBack} />
      <div className="termo-flow">
        <div className="termo-flow-scroll" tabIndex={0} aria-label="Aditivo de assinatura eletrônica">
          <div className="termo-step">
            <AditivoPainel continuarLabel="Voltar ao início" onConcluir={onBack} onConfirmado={onConfirmado} />
          </div>
        </div>
      </div>
    </>
  );
}

import { useRef, useState } from "react";
import { Check, Download, ExternalLink, Lock, Upload } from "lucide-react";
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

type EstadoPasso = "feito" | "atual" | "pendente";

/** Passo atual: o primeiro que o motorista ainda não fez nesta visita. Nada trava: quem já baixou antes pode enviar direto. */
function estadoDoPasso(numero: number, baixou: boolean, abriuGovBr: boolean): EstadoPasso {
  const atual = !baixou ? 1 : !abriuGovBr ? 2 : 3;
  return numero < atual ? "feito" : numero === atual ? "atual" : "pendente";
}

function Passo({ numero, estado, titulo, children }: { numero: number; estado: EstadoPasso; titulo: string; children: React.ReactNode }) {
  return (
    <li className="aditivo-passo" data-estado={estado} aria-current={estado === "atual" ? "step" : undefined}>
      <span className="aditivo-passo-marca" aria-hidden="true">
        {estado === "feito" ? <Check size={16} strokeWidth={3} /> : numero}
      </span>
      <div className="aditivo-passo-corpo">
        <h3>
          <span className="aditivo-sr">{`Passo ${numero}${estado === "feito" ? ", feito" : ""}: `}</span>
          {titulo}
        </h3>
        {children}
      </div>
    </li>
  );
}

/** O motorista baixa o próprio aditivo, assina no gov.br e devolve o PDF; o servidor confere e libera na hora. */
export function AditivoPainel({ continuarLabel, onConcluir, onConfirmado, titleRef }: PainelProps) {
  const [baixando, setBaixando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<{ passo: 1 | 3; texto: string } | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [baixou, setBaixou] = useState(false);
  const [abriuGovBr, setAbriuGovBr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ocupado = baixando || enviando;

  const baixar = async () => {
    if (ocupado) return;
    setBaixando(true);
    setErro(null);
    try {
      await abrirPdf(await gerarMeuAditivo(), navegadorPdfEnv());
      setBaixou(true);
    } catch (error) {
      reportAppError(error, { source: "aditivo", action: "gerarMeuAditivo", screen: "Aditivo", notifyUser: false });
      setErro({ passo: 1, texto: customApiErrorMessage(error, "Não foi possível abrir o aditivo.") });
    } finally {
      setBaixando(false);
    }
  };

  const enviar = async (file: File | undefined) => {
    if (!file || ocupado) return;
    // Quem chegou ao envio já passou pelos passos 1 e 2 (talvez em outra visita).
    setBaixou(true);
    setAbriuGovBr(true);
    setEnviando(true);
    setErro(null);
    try {
      await enviarAditivoAssinado(file, onConfirmado);
      setConfirmado(true);
    } catch (error) {
      reportAppError(error, { source: "aditivo", action: "registrarMeuAditivo", screen: "Aditivo", notifyUser: false });
      setErro({ passo: 3, texto: customApiErrorMessage(error, "Não foi possível enviar o aditivo.") });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (confirmado) {
    return (
      <section className="termo-result aditivo-ok" role="status">
        <SuccessCheck />
        <h2 ref={titleRef} tabIndex={-1}>Aditivo confirmado</h2>
        <p>Conferimos a assinatura do gov.br e o seu CPF. Sua assinatura eletrônica no app está liberada.</p>
        <button type="button" className="termo-primary" onClick={onConcluir}>{continuarLabel}</button>
      </section>
    );
  }

  const estado = (numero: number) => estadoDoPasso(numero, baixou, abriuGovBr);
  const classeAcao = (numero: number) => (estado(numero) === "atual" ? "termo-primary" : "aditivo-acao-secundaria");

  return (
    <section className="aditivo" aria-label="Aditivo de assinatura eletrônica">
      <header className="aditivo-topo">
        <span className="termo-badge" data-tone="atencao"><Lock size={12} strokeWidth={2.5} aria-hidden="true" /> Assinatura bloqueada</span>
        <h2 ref={titleRef} tabIndex={-1}>Assine o aditivo no gov.br</h2>
        <p>Para assinar os termos pelo app, falta este aditivo. Você faz sozinho, em poucos minutos, e a liberação é na hora.</p>
      </header>

      <ol className="aditivo-passos">
        <Passo numero={1} estado={estado(1)} titulo="Baixe o aditivo">
          <p>PDF com os seus dados, pronto para assinar.</p>
          {erro?.passo === 1 ? <p className="termo-alert" data-tone="erro" role="alert">{erro.texto}</p> : null}
          <button type="button" className={classeAcao(1)} disabled={ocupado} aria-busy={baixando || undefined} onClick={() => void baixar()}>
            {baixando ? <span className="termo-spinner" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
            {baixando ? "Abrindo PDF" : baixou ? "Baixar de novo" : "Baixar aditivo"}
          </button>
        </Passo>

        <Passo numero={2} estado={estado(2)} titulo="Assine no gov.br">
          <p>No assinador, envie o PDF e assine com sua conta gov.br (nível prata ou ouro). Não altere o arquivo.</p>
          <a className={classeAcao(2)} href={ADITIVO_ASSINADOR_URL} target="_blank" rel="noopener noreferrer" onClick={() => { setBaixou(true); setAbriuGovBr(true); }}>
            <ExternalLink size={18} aria-hidden="true" />
            Abrir assinador gov.br
          </a>
        </Passo>

        <Passo numero={3} estado={estado(3)} titulo="Envie o PDF assinado">
          <p>Use o arquivo que o gov.br devolveu (até 5 MB). Conferimos a assinatura e o seu CPF na hora.</p>
          {erro?.passo === 3 ? <p className="termo-alert" data-tone="erro" role="alert">{erro.texto}</p> : null}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            data-testid="aditivo-arquivo"
            onChange={(event) => void enviar(event.target.files?.[0])}
          />
          <button type="button" className={classeAcao(3)} disabled={ocupado} aria-busy={enviando || undefined} onClick={() => inputRef.current?.click()}>
            {enviando ? <span className="termo-spinner" aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}
            {enviando ? "Conferindo a assinatura" : "Enviar PDF assinado"}
          </button>
        </Passo>
      </ol>
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

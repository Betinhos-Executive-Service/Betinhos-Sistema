import { useState } from "react";
import { customApiErrorMessage } from "../../data/dataverse/customApi";
import { reportAppError } from "../../shared/appErrorLogger";
import { diaMes, SEM_CONEXAO_TEXTO, type MinhaMulta } from "./minhasMultas";

type Props = {
  multa: MinhaMulta;
  /** Sem rede ou mostrando o cache: o botão não age. */
  semConexao: boolean;
  onDeclarar: (multaId: string) => Promise<void>;
};

// Cartão do aceite na CNH Digital: o motorista aceita lá e avisa aqui; o gestor confere depois.
export function AceiteCnhCard({ multa, semConexao, onDeclarar }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [registrado, setRegistrado] = useState(false);

  const declarar = async () => {
    if (semConexao || (typeof navigator !== "undefined" && navigator.onLine === false)) { setErro(SEM_CONEXAO_TEXTO); return; }
    setEnviando(true);
    setErro("");
    try {
      await onDeclarar(multa.id);
      // Declaração gravada: se a releitura da lista falhar, o cartão não volta a "Registrando" nem acusa falha.
      setRegistrado(true);
    } catch (cause) {
      reportAppError(cause, { source: "termosMulta", action: "declararAceite", screen: "Multas", detailId: multa.id, detailType: "MULTA", notifyUser: false });
      setErro(customApiErrorMessage(cause, "Não foi possível registrar. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="multa-aceite" data-tour="multas-aceite">
      <ol className="multa-passos">
        <li>Abra o app CNH Digital</li>
        <li>Toque em Infrações e escolha a multa {multa.auto}</li>
        <li>Aceite a indicação{multa.prazoAceite ? ` até ${diaMes(multa.prazoAceite)}` : ""} e volte aqui</li>
      </ol>
      {registrado ? <p className="termo-alert" data-tone="sucesso" role="status">Aceite registrado. O gestor vai conferir; atualize a lista para ver a situação.</p> : <button type="button" className="termo-primary multa-botao" disabled={enviando || semConexao} aria-busy={enviando || undefined} onClick={() => void declarar()}>
        {semConexao ? SEM_CONEXAO_TEXTO : enviando ? "Registrando" : "Já aceitei na CNH Digital"}
      </button>}
      {erro ? <p className="termo-alert" data-tone="erro" role="alert">{erro}</p> : null}
    </div>
  );
}

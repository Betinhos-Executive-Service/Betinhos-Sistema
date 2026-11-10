import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import { reportAppError } from "../../shared/appErrorLogger";
import { SEM_AVALIACOES, enviarAvaliacao } from "./avaliacaoPostos";
import { customApiErrorMessage } from "../../data/dataverse/customApi";
import { formatDiaMes } from "./gastosCartao";
import { carregarRankingPostos, conviteDispensado, dispensarConvite, type ConviteAvaliacao } from "./rankingPostos";

type Estado = "pergunta" | "salvando" | "salva";

/** Pergunta como foi o posto do último abastecimento. É um extra: se a carga falhar, o relatório segue sem ele. */
export function ConvitePosto() {
  const [convite, setConvite] = useState<ConviteAvaliacao | null>(null);
  const [estado, setEstado] = useState<Estado>("pergunta");
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    carregarRankingPostos()
      .then(({ convite: novo }) => { if (ativo && novo && !conviteDispensado(novo)) setConvite(novo); })
      .catch(() => { /* O relatório não depende do convite. */ });
    return () => { ativo = false; };
  }, []);

  if (!convite) return null;

  const fechar = () => { dispensarConvite(convite); setConvite(null); };
  const avaliar = async (recomenda: boolean) => {
    setEstado("salvando");
    setErro("");
    try {
      await enviarAvaliacao(convite.postoId, SEM_AVALIACOES, { recomenda, motivos: [], comentario: "" });
      dispensarConvite(convite);
      setEstado("salva");
    } catch (error) {
      reportAppError(error, { severity: "warning", source: "app", action: "avaliarPostoConvite", screen: "GastosRelatorio", notifyUser: false });
      setErro(customApiErrorMessage(error, "Não foi possível salvar. Tente de novo."));
      setEstado("pergunta");
    }
  };

  if (estado === "salva") return <p className="gr-convite-salva" role="status"><Check aria-hidden="true" />Avaliação salva. Obrigado!</p>;

  return (
    <section className="gr-convite" aria-labelledby="gr-convite-titulo">
      <div className="gr-convite-topo">
        <p id="gr-convite-titulo"><strong>Como foi no {convite.nome}?</strong><span>Você abasteceu lá em {formatDiaMes(convite.data)}.</span></p>
        <button type="button" className="gr-convite-fechar" aria-label="Agora não" onClick={fechar}><SystemIcon name="dismiss" /></button>
      </div>
      <div className="rp-escolha">
        <button type="button" data-tom="positivo" disabled={estado === "salvando"} onClick={() => avaliar(true)}><ThumbsUp aria-hidden="true" />Recomendo</button>
        <button type="button" data-tom="negativo" disabled={estado === "salvando"} onClick={() => avaliar(false)}><ThumbsDown aria-hidden="true" />Não recomendo</button>
      </div>
      {erro ? <div className="termo-alert" data-tone="erro" role="alert"><p>{erro}</p></div> : null}
    </section>
  );
}

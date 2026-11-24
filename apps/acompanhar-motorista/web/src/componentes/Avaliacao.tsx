import { useState, type FormEvent } from "react";
import { useIdioma } from "../i18n";
import { Check, Estrela } from "../icones";

// Avaliação: mostrada uma vez na fase concluído; depois de enviada (ou se o /dados diz avaliado) só o agradecimento.
// Estrelas são botões (aria-pressed); o texto do cliente nunca vira HTML.
export function Avaliacao({ visivel, avaliado }: { visivel: boolean; avaliado: boolean }) {
  const { t } = useIdioma();
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviada, setEnviada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const agradecer = avaliado || enviada;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (!nota || enviando) return;
    setEnviando(true); setErro("");
    try {
      const r = await fetch(location.pathname + "/avaliacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nota, comentario: comentario.trim() || null }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 200 || (r.status === 409 && j.jaAvaliado)) setEnviada(true);
      else setErro(t(r.status === 429 ? "av.erro429" : "av.erro"));
    } catch { setErro(t("av.semConexao")); }
    setEnviando(false);
  }

  return (
    <div className="avaliacao" id="avaliacao" hidden={!visivel}>
      <form id="av-form" className={nota ? "com-nota" : undefined} noValidate hidden={agradecer} onSubmit={enviar}>
        <h2 id="av-titulo">{t("av.titulo")}</h2>
        <div className="estrelas" role="group" aria-labelledby="av-titulo">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={"estrela" + (n <= nota ? " on" : "")} data-nota={n} aria-pressed={n === nota} aria-label={t("av.nota", { n })} onClick={() => setNota(n)}><Estrela /></button>
          ))}
        </div>
        <p className="av-erro" id="av-erro" role="alert" hidden={!erro}>{erro}</p>
        <div className="av-linha">
          <div className="av-extra" id="av-extra" hidden={!nota}>
            <label className="av-label sr" htmlFor="av-comentario">{t("av.comentario")}</label>
            <textarea id="av-comentario" maxLength={1000} rows={2} placeholder={t("av.comentario")} aria-describedby="av-conta" value={comentario} onChange={(e) => setComentario(e.target.value)} />
            <span className={"av-conta" + (comentario.length >= 900 ? " perto" : "")} id="av-conta">{t("av.conta", { n: comentario.length })}</span>
          </div>
          <button type="submit" className="btn btn-primario av-enviar" id="av-enviar" disabled={!nota || enviando}>{t(enviando ? "av.enviando" : "av.enviar")}</button>
        </div>
      </form>
      <div className="av-obrigado" id="av-obrigado" role="status" hidden={!agradecer}><Check /><span>{t("av.obrigado")}</span></div>
    </div>
  );
}

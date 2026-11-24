import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useIdioma } from "../i18n";
import { base, faltasDe, type Passageiro } from "./usePassageiros";

const EASE = [0.23, 1, 0.32, 1] as const;

function AvatarPax({ p, versao }: { p: Passageiro; versao?: number }) {
  const inicial = (p.primeiroNome || "?").charAt(0).toUpperCase();
  const src = p.temFoto ? `${base()}/${p.id}/foto${versao ? "?v=" + versao : ""}` : "";
  const [falhou, setFalhou] = useState("");
  return <span className="pax-av" aria-hidden="true">{src && falhou !== src ? <img src={src} alt="" onError={() => setFalhou(src)} /> : inicial}</span>;
}

interface Props {
  lista: Passageiro[]; aberto: boolean; visivel: boolean; versaoFoto: Record<string, number>;
  salvo: { id: string; antes: string[] } | null; limparSalvo: () => void;
  editar: (p: Passageiro, origem: HTMLElement) => void;
}

// Seção "Passageiros": a pessoa vê quem falta completar. Dado salvo: a linha ganha um flash de sucesso e as tags "Falta ..." que
// deixaram de valer somem com fade e escala (AnimatePresence).
export function CardPassageiros({ lista, aberto, visivel, versaoFoto, salvo, limparSalvo, editar }: Props) {
  const { t } = useIdioma();
  return (
    <section className="pax" id="pax" aria-labelledby="pax-titulo" hidden={!visivel || !lista.length}>
      <h2 id="pax-titulo">{t("pax.titulo")}</h2>
      <p className="pax-nota" id="pax-nota" role="status" hidden={aberto}>{t("pax.encerrado")}</p>
      <ul className="pax-lista" id="pax-lista">
        {lista.map((p) => {
          const faltas = aberto ? faltasDe(p) : [];
          const corpo = (
            <>
              {salvo?.id === p.id ? <motion.span className="pax-flash" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.1, delay: 0.2, ease: "easeOut", times: [0, 0.25, 1] }} onAnimationComplete={limparSalvo} /> : null}
              <AvatarPax p={p} versao={versaoFoto[p.id]} />
              <span className="pax-info">
                <b>{p.primeiroNome}</b>
                {p.telefoneMascarado ? <span>{p.telefoneMascarado}</span> : null}
                {p.emailMascarado ? <span>{p.emailMascarado}</span> : null}
                <span className="pax-selos">
                  <AnimatePresence initial={false}>
                    {faltas.map((c) => <motion.span key={c} className="pax-selo" exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.32, delay: 0.26, ease: EASE } }}>{t(c)}</motion.span>)}
                  </AnimatePresence>
                </span>
              </span>
              {aberto ? <span className="pax-editar">{t("pax.editar")}</span> : null}
            </>
          );
          return (
            <li key={p.id}>
              {aberto
                ? <button type="button" className="pax-btn" aria-label={t("pax.editarDe", { nome: p.primeiroNome })} onClick={(e) => editar(p, e.currentTarget)}>{corpo}</button>
                : <div className="pax-btn">{corpo}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

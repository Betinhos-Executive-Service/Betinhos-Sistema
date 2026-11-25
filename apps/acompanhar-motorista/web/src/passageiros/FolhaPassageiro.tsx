import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { reduzMovimento } from "../bt";
import { useToast } from "../componentes/Toast";
import { useIdioma } from "../i18n";
import { Camera, Fechar, Galeria } from "../icones";
import { emailValido, telefoneParaEnvio, telefoneValido } from "../../../src/validacao-cadastro.mjs";
import { comprimirFoto } from "./foto";
import { base, ErroHttp, type Passageiro } from "./usePassageiros";

const EASE = [0.23, 1, 0.32, 1] as const, SAIDA = [0.55, 0, 0.8, 0.2] as const;
const ERROS: Record<number, string> = { 400: "pax.err.400", 409: "pax.err.409", 410: "pax.err.410", 413: "pax.err.413", 429: "pax.err.429" };
const celular = () => matchMedia("(max-width: 819px)").matches;

interface Props {
  editando: Passageiro | null; versaoFoto: Record<string, number>;
  salvar: (id: string, corpo: Record<string, unknown>) => Promise<void>; fechar: () => void;
}

// Folha de edição: no celular sobe da borda com mola (leve overshoot); no desktop e na confirmação surge do centro.
// A saída é mais rápida (200 ms). Clique fora e Esc pedem confirmação quando há alteração; durante o envio não fecha.
export function FolhaPassageiro({ editando, versaoFoto, salvar, fechar }: Props) {
  return <AnimatePresence>{editando ? <Folha key={editando.id} p={editando} versaoFoto={versaoFoto} salvar={salvar} fechar={fechar} /> : null}</AnimatePresence>;
}

function Folha({ p, versaoFoto, salvar, fechar }: { p: Passageiro; versaoFoto: Record<string, number>; salvar: Props["salvar"]; fechar: () => void }) {
  const { t } = useIdioma();
  const toast = useToast();
  const [tel, setTel] = useState(""), [email, setEmail] = useState("");
  const [foto, setFoto] = useState<{ foto: string; miniatura: string } | null>(null);
  const [preparando, setPreparando] = useState(false), [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(""), [confirmar, setConfirmar] = useState(false), [previaFalhou, setPreviaFalhou] = useState(false);
  const nome = useRef<HTMLHeadingElement>(null), confTitulo = useRef<HTMLHeadingElement>(null);
  const vivo = useRef(true);
  const sujo = Boolean(foto || tel.trim() || email.trim());
  const curto = celular(), sem = reduzMovimento();

  useEffect(() => { nome.current?.focus(); return () => { vivo.current = false; }; }, []);
  useEffect(() => { if (confirmar) confTitulo.current?.focus(); }, [confirmar]);

  const tentarFechar = () => { if (enviando || confirmar) return; if (!sujo) fechar(); else setConfirmar(true); };
  const continuar = () => { setConfirmar(false); nome.current?.focus(); };
  // Esc na fase de captura: não deixa o mapa ou a folha de detalhes tratarem a mesma tecla.
  const ref = useRef({ tentarFechar, continuar, confirmar });
  ref.current = { tentarFechar, continuar, confirmar };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (ref.current.confirmar) ref.current.continuar(); else ref.current.tentarFechar();
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, []);

  async function escolher(entrada: HTMLInputElement) {
    const arq = entrada.files && entrada.files[0];
    entrada.value = "";
    if (!arq) return;
    setErro(""); setPreparando(true);
    try { const r = await comprimirFoto(arq); if (vivo.current) { setFoto(r); setPreviaFalhou(false); } }
    catch (e) { if (vivo.current) setErro(t(e instanceof Error && /^pax\./.test(e.message) ? e.message : "pax.err.abrir")); }
    // Folha fechada durante a compressão: a foto é descartada.
    if (vivo.current) setPreparando(false);
  }

  async function enviar() {
    if (enviando || preparando) return;
    const tl = tel.trim(), em = email.trim(), corpo: Record<string, unknown> = {};
    if (tl && !telefoneValido(tl)) return setErro(t("pax.err.tel"));
    if (em && !emailValido(em)) return setErro(t("pax.err.email"));
    if (foto) { corpo.fotoBase64 = foto.foto; if (foto.miniatura) corpo.miniaturaBase64 = foto.miniatura; }
    if (tl) corpo.telefone = telefoneParaEnvio(tl);
    if (em) corpo.email = em;
    if (!Object.keys(corpo).length) return;
    setErro(""); setEnviando(true);
    try {
      await salvar(p.id, corpo);
      toast(t("pax.salvo"));
      fechar();
    } catch (e) {
      setEnviando(false);
      setErro(t((e instanceof ErroHttp && ERROS[e.status]) || "pax.err.rede"));
    }
  }

  const inicial = (p.primeiroNome || "?").charAt(0).toUpperCase();
  const fotoAtual = p.temFoto ? `${base()}/${p.id}/foto${versaoFoto[p.id] ? "?v=" + versaoFoto[p.id] : ""}` : "";
  const dur = (x: number) => (sem ? 0 : x);
  const mola = sem ? { duration: 0 } : { type: "spring" as const, stiffness: 340, damping: 30, mass: 0.9 };
  const folhaIni = curto ? { y: "100%" } : { opacity: 0, y: 24, scale: 0.96 };
  const folhaSai = curto ? { y: "100%" } : { opacity: 0, y: 12, scale: 0.98 };
  const bloqueado = enviando;
  return (
    <motion.div className="pf" id="pf" role="dialog" aria-modal="true" aria-labelledby="pf-nome"
      initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: dur(0.22), ease: EASE } }} exit={{ opacity: 0, pointerEvents: "none", transition: { duration: dur(0.2), ease: SAIDA } }}
      onClick={(e) => { if (e.target === e.currentTarget) tentarFechar(); }}>
      <motion.div className="pf-folha" initial={folhaIni} animate={{ y: 0, opacity: 1, scale: 1, transition: mola }} exit={{ ...folhaSai, transition: { duration: dur(0.2), ease: SAIDA } }}>
        <button type="button" className="qd pf-fechar" id="pf-fechar" aria-label={t("pax.fechar")} onClick={tentarFechar}><Fechar /></button>
        <h2 id="pf-nome" tabIndex={-1} ref={nome}>{p.primeiroNome}</h2>
        <p className="pf-sub">{t("pax.sub")}</p>
        <div className="pf-foto">
          <div className="pf-previa" id="pf-previa" aria-hidden="true">
            {foto ? <img alt="" src={"data:image/jpeg;base64," + (foto.miniatura || foto.foto)} />
              : fotoAtual && !previaFalhou ? <img alt="" src={fotoAtual} onError={() => setPreviaFalhou(true)} /> : inicial}
          </div>
          <div className="pf-botoes">
            <button type="button" className="btn btn-secundario" id="pf-camera" disabled={bloqueado} onClick={() => document.getElementById("pf-arq-camera")!.click()}><Camera /><span>{t("pax.camera")}</span></button>
            <button type="button" className="btn btn-secundario" id="pf-galeria" disabled={bloqueado} onClick={() => document.getElementById("pf-arq-galeria")!.click()}><Galeria /><span>{t("pax.galeria")}</span></button>
          </div>
          <input type="file" id="pf-arq-camera" accept="image/*" capture="user" hidden onChange={(e) => escolher(e.currentTarget)} />
          <input type="file" id="pf-arq-galeria" accept="image/*" hidden onChange={(e) => escolher(e.currentTarget)} />
        </div>
        <label className="pf-rotulo" htmlFor="pf-tel">{t("pax.tel")}</label>
        <input className="pf-campo" id="pf-tel" type="tel" inputMode="tel" autoComplete="off" placeholder="(11) 99999-0000" value={tel} disabled={bloqueado} onChange={(e) => setTel(e.target.value)} />
        <p className="pf-atual" id="pf-tel-atual" hidden={!p.telefoneMascarado}>{p.telefoneMascarado ? t("pax.atual", { v: p.telefoneMascarado }) : ""}</p>
        <label className="pf-rotulo" htmlFor="pf-email">{t("pax.email")}</label>
        <input className="pf-campo" id="pf-email" type="email" inputMode="email" autoComplete="off" placeholder="nome@exemplo.com" value={email} disabled={bloqueado} onChange={(e) => setEmail(e.target.value)} />
        <p className="pf-atual" id="pf-email-atual" hidden={!p.emailMascarado}>{p.emailMascarado ? t("pax.atual", { v: p.emailMascarado }) : ""}</p>
        <p className="pf-erro" id="pf-erro" role="alert" hidden={!erro}>{erro}</p>
        <button type="button" className="btn btn-primario pf-salvar" id="pf-salvar" disabled={enviando || preparando || !sujo} onClick={enviar}>{t(enviando ? "pax.salvando" : "pax.salvar")}</button>
      </motion.div>
      <AnimatePresence>
        {confirmar ? (
          <motion.div key="conf" className="pf pf-conf" id="pf-conf" role="alertdialog" aria-modal="true" aria-labelledby="pf-conf-titulo"
            initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: dur(0.22), ease: EASE } }} exit={{ opacity: 0, pointerEvents: "none", transition: { duration: dur(0.2), ease: SAIDA } }}
            onClick={(e) => { if (e.target === e.currentTarget) { e.stopPropagation(); continuar(); } }}>
            <motion.div className="pf-folha" initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1, transition: mola }} exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: dur(0.2), ease: SAIDA } }}>
              <h2 id="pf-conf-titulo" tabIndex={-1} ref={confTitulo}>{t("pax.descartarTitulo")}</h2>
              <div className="pf-conf-acoes">
                <button type="button" className="btn btn-primario" id="pf-continuar" onClick={continuar}>{t("pax.continuar")}</button>
                <button type="button" className="btn btn-secundario" id="pf-descartar" onClick={fechar}>{t("pax.descartar")}</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

import { useEffect, useLayoutEffect, useRef } from "react";
import { useIdioma } from "../i18n";
import { Mensagem, Telefone } from "../icones";
import type { Cfg, Dados } from "../tipos";
import { digitos, iniciais, linkLigar, linkWhats, nomesCarro } from "../util";
import { Avatar, FotoCarro } from "./Foto";
import { Sino } from "./Sino";

export type Tela = null | "motorista" | "carro" | "negado" | "iphone";

// "Modelo · cor", com a marca só quando couber na linha (senão, só o modelo). Texto escrito direto no nó para medir o corte.
function NomeCarro({ veiculo, esqueleto }: { veiculo: NonNullable<Dados["veiculo"]>; esqueleto: boolean }) {
  const { t, cor } = useIdioma();
  const ref = useRef<HTMLSpanElement>(null);
  const ajustar = () => {
    const el = ref.current;
    if (!el) return;
    if (esqueleto) { el.textContent = "Modelo · cor"; return; }
    const n = nomesCarro(veiculo), sufixo = veiculo.cor ? " · " + cor(veiculo.cor) : "";
    if (!n.completo) { el.textContent = t("veiculo.betinhos"); return; }
    el.textContent = n.completo + sufixo;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) el.textContent = n.modelo + sufixo;
  };
  useLayoutEffect(ajustar);
  useEffect(() => {
    const f = () => requestAnimationFrame(ajustar);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  });
  return <span id="m-carro" ref={ref} className={esqueleto ? "esqueleto" : undefined} />;
}

export function contatoMotorista(d: Dados | null, cfg: Cfg) {
  const m = d?.motorista ?? {};
  let tel = digitos(m.telefone);
  if (tel.length < 10) tel = "";
  return { tel, ligar: linkLigar(tel, cfg), whats: linkWhats(tel, cfg), nota: !tel && (!!cfg.telefone || !!cfg.whatsapp) };
}

interface Props { dados: Dados | null; cfg: Cfg; abrirTela: (q: Exclude<Tela, null>) => void }

// Card "Seu motorista": avatar e nome, carro em caixa (modelo, cor e placa Mercosul) e os botões de contato.
// Em definição o avatar é tracejado ("?") e o sino de aviso mora aqui; com motorista, o sino vai para a etapa atual da linha do tempo.
export function CardMotorista({ dados, cfg, abrirTela }: Props) {
  const { t } = useIdioma();
  const carregou = dados !== null;
  const m = dados?.motorista ?? {}, v = dados?.veiculo ?? {};
  const nome = m.nome || t("m.motorista");
  const c = contatoMotorista(dados, cfg);
  const semContato = !c.ligar && !c.whats;
  const emDefinicao = !!dados?.emDefinicao;
  const acoes = (
    <div className="m-acoes" id="m-contato" hidden={carregou && semContato}>
      <a className="btn btn-secundario" id="m-ligar" href={c.ligar} hidden={!c.ligar} aria-label={emDefinicao || !c.tel ? t("m.ligarCentral") : t("m.ligarPara", { nome })}><Telefone /><span>{t("m.ligar")}</span></a>
      <a className="btn btn-secundario" id="m-whats" href={c.whats} hidden={!c.whats} target="_blank" rel="noopener" aria-label={emDefinicao || !c.tel ? t("m.whatsCentral") : t("m.whatsDe", { nome })}><Mensagem /><span>WhatsApp</span></a>
    </div>
  );
  if (emDefinicao) return (
    <section className="card c-motorista motorista" id="cartao" aria-labelledby="m-rotulo">
      <h2 id="m-rotulo">{t("card.seuMotorista")}</h2>
      <div className="m-topo">
        <Avatar className="avatar vazio" id="m-avatar" inicial="?" />
        <span className="m-info"><b id="m-nome">{t("m.emDefinicao")}</b><small className="m-papel">{t("m.emDefinicaoAviso")}</small></span>
      </div>
      {acoes}
      {cfg.vapid ? <Sino vapid={cfg.vapid} emDefinicao abrirTela={abrirTela} /> : null}
    </section>
  );
  return (
    <section className="card c-motorista motorista" id="cartao" aria-labelledby="m-rotulo">
      <h2 id="m-rotulo">{t("card.seuMotorista")}</h2>
      <button type="button" className="m-abrir m-topo" id="abrir-motorista" aria-haspopup="dialog" aria-label={t("m.abrir")} onClick={() => abrirTela("motorista")}>
        <Avatar className="avatar" id="m-avatar" src={m.foto} inicial={iniciais(nome)} />
        <span className="m-info"><b id="m-nome" className={carregou ? undefined : "esqueleto"}>{nome}</b></span>
      </button>
      <div className="m-veiculo" id="abrir-carro" role="button" tabIndex={0} aria-haspopup="dialog" aria-label={t("m.abrirCarro")}
        onClick={() => abrirTela("carro")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirTela("carro"); } }}>
        <FotoCarro className="foto-veiculo" id="v-foto" src={v.foto} hidden={!v.foto} />
        <div className="v-info">
          <NomeCarro veiculo={v} esqueleto={!carregou} />
          <span className={"placa" + (carregou ? "" : " esqueleto")} id="m-placa" aria-label={t("placa")} hidden={carregou && !v.placa}>{carregou ? v.placa || "–" : "AAA0A00"}</span>
        </div>
      </div>
      {acoes}
      <p className="m-nota" id="m-nota" hidden={!c.nota}>{t("m.nota")}</p>
    </section>
  );
}

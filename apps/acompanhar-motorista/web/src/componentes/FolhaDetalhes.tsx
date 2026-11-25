import { useEffect, useRef } from "react";
import { useIdioma } from "../i18n";
import { Fechar, Mensagem, Sino, Telefone } from "../icones";
import type { Cfg, Dados } from "../tipos";
import { iniciais, nomesCarro } from "../util";
import { Avatar, FotoCarro } from "./Foto";
import { contatoMotorista, type Tela } from "./CardMotorista";

// Tela cheia (motorista ou carro) ou folha de aviso do sino ("negado", "iphone"): fecha no X, no Esc e no clique fora; o foco fica preso dentro.
export function FolhaDetalhes({ tela, dados, cfg, fechar }: { tela: Tela; dados: Dados | null; cfg: Cfg; fechar: () => void }) {
  const { t, cor } = useIdioma();
  const raiz = useRef<HTMLDivElement>(null);
  const fecharBtn = useRef<HTMLButtonElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const aviso = tela !== null && tela !== "motorista" && tela !== "carro";
  const m = dados?.motorista ?? {}, v = dados?.veiculo ?? {};
  const nome = m.nome || t("m.motorista");
  const c = contatoMotorista(dados, cfg);
  const n = nomesCarro(v);

  useEffect(() => { if (tela) (aviso ? titulo.current : fecharBtn.current)?.focus(); }, [tela, aviso]);
  useEffect(() => {
    if (!tela) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { fechar(); return; }
      if (e.key !== "Tab") return;
      const itens = Array.from(raiz.current?.querySelectorAll<HTMLElement>("a[href],button") ?? []).filter((x) => !x.hidden && !x.closest("[hidden]") && x.offsetParent !== null);
      if (!itens.length) return;
      const a = document.activeElement, ult = itens[itens.length - 1], pri = itens[0];
      if (e.shiftKey && a === pri) { e.preventDefault(); ult.focus(); } else if (!e.shiftKey && a === ult) { e.preventDefault(); pri.focus(); }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [tela, fechar]);

  const rotulo = tela === null ? t("tc.detalhes") : aviso ? t("sino." + tela + "Titulo") : tela === "carro" ? t("tc.carro") : t("m.motorista");
  return (
    <div className={"tc" + (aviso ? " tc-baixo" : "")} id="tc" role="dialog" aria-modal="true" aria-label={rotulo} hidden={tela === null} ref={raiz} onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="tc-folha">
        <button type="button" className="qd tc-fechar" id="tc-fechar" aria-label={t("tc.fechar")} ref={fecharBtn} onClick={fechar}><Fechar /></button>
        <div id="tc-motorista" hidden={tela !== "motorista"}>
          <Avatar className="tc-foto" id="tc-m-foto" src={m.foto} inicial={iniciais(nome)} />
          <span className="tc-papel">{t("m.papel")}</span><h2 id="tc-m-nome">{nome}</h2>
          <div className="tc-acoes">
            <a className="btn btn-secundario" id="tc-ligar" href={c.ligar} hidden={!c.ligar}><Telefone /><span>{t("m.ligar")}</span></a>
            <a className="btn btn-primario" id="tc-whats" href={c.whats} hidden={!c.whats} target="_blank" rel="noopener"><Mensagem /><span>WhatsApp</span></a>
          </div>
          <p className="tc-nota" id="tc-m-nota" hidden={!c.nota}>{t("m.nota")}</p>
        </div>
        <div id="tc-carro" hidden={tela !== "carro"}>
          <FotoCarro className="tc-carro-foto" id="tc-c-foto" src={v.foto} />
          <span className="placa placa-grande" id="tc-placa" aria-label={t("placa")} hidden={!v.placa}>{v.placa || "–"}</span>
          <h2 id="tc-c-modelo">{n.completo || t("veiculo.betinhos")}</h2>
          <p className="tc-cor" id="tc-c-cor" hidden={!v.cor}>{cor(v.cor)}</p>
        </div>
        <div id="tc-aviso" hidden={!aviso}>
          <div className="tc-icone" aria-hidden="true"><Sino /></div>
          <h2 className="tc-titulo" id="tc-a-titulo" tabIndex={-1} ref={titulo}>{aviso ? t("sino." + tela + "Titulo") : ""}</h2>
          <p className="tc-texto" id="tc-a-texto">{aviso ? t("sino." + tela) : ""}</p>
          <div className="tc-acoes"><button type="button" className="btn btn-primario" id="tc-entendi" onClick={fechar}>{t("sino.entendi")}</button></div>
        </div>
      </div>
    </div>
  );
}

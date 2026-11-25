import { useCallback, useEffect, useRef, useState } from "react";
import { BT } from "./bt";
import { Avaliacao } from "./componentes/Avaliacao";
import { CardCompartilhar } from "./componentes/CardCompartilhar";
import { CardMapa } from "./componentes/CardMapa";
import { CardMotorista, type Tela } from "./componentes/CardMotorista";
import { Contato } from "./componentes/Contato";
import { Faixa } from "./componentes/Faixa";
import { FolhaDetalhes } from "./componentes/FolhaDetalhes";
import { LinhaDoTempo } from "./componentes/LinhaDoTempo";
import { useAgora } from "./hooks/useAgora";
import { useEta } from "./hooks/useEta";
import { useViagem } from "./hooks/useViagem";
import { useIdioma } from "./i18n";
import { CardPassageiros } from "./passageiros/CardPassageiros";
import { FolhaPassageiro } from "./passageiros/FolhaPassageiro";
import { faltasDe, usePassageiros, type Passageiro } from "./passageiros/usePassageiros";
import { estadoViagem } from "./portal";
import { estadoVivo, esperaMin, idadePosicao } from "./status";

export function App() {
  const { t, setTitulo } = useIdioma();
  const { dados, falhandoDesde, desvio, retomada } = useViagem();
  const agora = useAgora();
  const eta = useEta(dados);
  const [tela, setTela] = useState<Tela>(null);
  const origemTela = useRef<Element | null>(null);
  const [editando, setEditando] = useState<Passageiro | null>(null);
  const origemPax = useRef<HTMLElement | null>(null);
  const pax = usePassageiros(!!editando);
  const [diag, setDiag] = useState("");
  const avisouChegada = useRef(false);

  const concluido = dados?.fase === "concluido";
  const noLocal = dados?.fase === "no_local" && !!dados.posicao;
  const estado = dados ? estadoViagem(dados) : null;
  const comMapa = estado === "a_caminho" || estado === "no_local" || estado === "em_viagem";
  const idade = idadePosicao(dados, desvio, agora);
  const vivo = estadoVivo(dados, t, idade, falhandoDesde, agora);
  const os = String(dados?.titulo ?? "").match(/OS[-\s]*(\d+)/i);
  const espera = dados ? esperaMin(dados, desvio, agora) : 0;
  const reserva = os ? t("reserva", { n: "OS-" + os[1] }) : null;

  useEffect(() => {
    if (concluido) setTitulo("titulo.concluido");
    else if (noLocal) {
      setTitulo("titulo.chegou");
      if (!avisouChegada.current) {
        avisouChegada.current = true;
        if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(200);
      }
    }
  }, [concluido, noLocal, setTitulo]);

  const semAviso = useCallback(() => {}, []);
  const abrirTela = useCallback((q: Exclude<Tela, null>) => { origemTela.current = document.activeElement; setTela(q); }, []);
  const fecharTela = useCallback(() => {
    setTela(null);
    const o = origemTela.current as HTMLElement | null;
    origemTela.current = null;
    if (o && o.isConnected) o.focus();
  }, []);
  const editar = useCallback((p: Passageiro, origem: HTMLElement) => { origemPax.current = origem; setEditando(p); }, []);
  const fecharEdicao = useCallback(() => {
    setEditando(null);
    const o = origemPax.current;
    origemPax.current = null;
    if (o && o.isConnected) o.focus();
  }, []);

  const faltam = pax.aberto && !concluido ? pax.lista.filter((p) => faltasDe(p).length > 0) : [];
  return (
    <>
      <div id="app" className={concluido ? "fim" : undefined}>
        <Faixa dados={dados} eta={eta} reserva={reserva} espera={espera} />
        <div className="diag" id="diag" hidden={!diag}>{diag}</div>
        <main className="corpo">
          {concluido ? <Avaliacao visivel avaliado={!!dados?.avaliado} /> : null}
          {faltam.length ? (
            <div className="faixa-pax" id="faixa-pax" role="status">
              <span>{t("pax.faixa", { n: faltam.length })}</span>
              <button type="button" className="btn btn-secundario btn-leve" onClick={(e) => editar(faltam[0], e.currentTarget)}>{t("pax.completar")}</button>
            </div>
          ) : null}
          {comMapa ? <CardMapa dados={dados} retomada={retomada} vivo={vivo} eta={eta} aoMostrarCard={semAviso} aoMapaPronto={semAviso} aoDiagnostico={setDiag} /> : null}
          <CardMotorista dados={dados} cfg={BT.cfg} abrirTela={abrirTela} />
          <LinhaDoTempo dados={dados} cfg={BT.cfg} chegada={eta.chegada} abrirTela={abrirTela} />
          {concluido ? null : <CardPassageiros lista={pax.lista} aberto={pax.aberto} visivel={pax.existe} versaoFoto={pax.versaoFoto} salvo={pax.salvo} limparSalvo={pax.limparSalvo} editar={editar} />}
          {concluido ? null : <CardCompartilhar />}
          <Contato cfg={BT.cfg} />
          <footer className="rodape">Betinhos Executive Service</footer>
        </main>
        <span className="versao" aria-hidden="true">{BT.versao}</span>
      </div>
      <FolhaDetalhes tela={tela} dados={dados} cfg={BT.cfg} fechar={fecharTela} />
      <FolhaPassageiro editando={editando} versaoFoto={pax.versaoFoto} salvar={pax.salvar} fechar={fecharEdicao} />
    </>
  );
}

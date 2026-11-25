import { useCallback, useEffect, useRef, useState } from "react";
import { BT } from "./bt";
import { Cabecalho } from "./componentes/Cabecalho";
import { CardMapa } from "./componentes/CardMapa";
import { CardMotorista, type Tela } from "./componentes/CardMotorista";
import { CardStatus } from "./componentes/CardStatus";
import { CardTrajeto } from "./componentes/CardTrajeto";
import { FolhaDetalhes } from "./componentes/FolhaDetalhes";
import { useAgora } from "./hooks/useAgora";
import { useEta } from "./hooks/useEta";
import { useViagem } from "./hooks/useViagem";
import { useIdioma } from "./i18n";
import { CardPassageiros } from "./passageiros/CardPassageiros";
import { FolhaPassageiro } from "./passageiros/FolhaPassageiro";
import { usePassageiros, type Passageiro } from "./passageiros/usePassageiros";
import { estadoVivo, idadePosicao } from "./status";

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
  const [fimCard, setFimCard] = useState(false);
  const [mapaPronto, setMapaPronto] = useState(false);
  const [diag, setDiag] = useState("");
  const avisouChegada = useRef(false);

  const concluido = dados?.fase === "concluido";
  const noLocal = dados?.fase === "no_local" && !!dados.posicao;
  const semMapa = dados?.rastreio === false;
  const idade = idadePosicao(dados, desvio, agora);
  const vivo = estadoVivo(dados, t, idade, falhandoDesde, agora);
  const os = String(dados?.titulo ?? "").match(/OS[-\s]*(\d+)/i);
  const titulo = dados?.titulo ? dados.titulo.replace(/\s*\bOS[-\s]*\d+/i, "").trim() || dados.titulo : null;
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

  // Sem mapa (biblioteca lenta ou ausente), o card final não fica escondido: aparece em 600 ms.
  useEffect(() => {
    if (!concluido || mapaPronto || fimCard) return;
    const id = setTimeout(() => setFimCard(true), semMapa ? 0 : 600);
    return () => clearTimeout(id);
  }, [concluido, mapaPronto, fimCard, semMapa]);

  const mostrarCard = useCallback(() => setFimCard(true), []);
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

  return (
    <>
      <div id="app" className={(concluido ? "fim" : "") + (fimCard ? " fim-card" : "")}>
        <Cabecalho reserva={reserva} />
        <div className="diag" id="diag" hidden={!diag}>{diag}</div>
        <main className={"portal" + (semMapa ? " sem-mapa" : "")}>
          <div className="col-a">
            <CardStatus dados={dados} cfg={BT.cfg} eta={eta} idade={idade} desvio={desvio} agora={agora} titulo={titulo} />
            <CardMotorista dados={dados} cfg={BT.cfg} oculto={concluido} abrirTela={abrirTela} />
            <CardTrajeto dados={dados} chegada={eta.chegada} oculto={concluido} />
            <CardPassageiros lista={pax.lista} aberto={pax.aberto} visivel={pax.existe} versaoFoto={pax.versaoFoto} salvo={pax.salvo} limparSalvo={pax.limparSalvo} editar={editar} />
          </div>
          {semMapa ? null : (
            <div className="col-b">
              <CardMapa dados={dados} retomada={retomada} vivo={{ ...vivo, oculto: vivo.oculto || concluido }} aoMostrarCard={mostrarCard} aoMapaPronto={setMapaPronto} aoDiagnostico={setDiag} />
            </div>
          )}
        </main>
        <span className="versao" aria-hidden="true">{BT.versao}</span>
      </div>
      <FolhaDetalhes tela={tela} dados={dados} cfg={BT.cfg} fechar={fecharTela} />
      <FolhaPassageiro editando={editando} versaoFoto={pax.versaoFoto} salvar={pax.salvar} fechar={fecharEdicao} />
    </>
  );
}

import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import type { EnvioPendente } from "./useEnvioPendente";
import type { FilaItem } from "./fila";
import { MENSAGEM_SESSAO } from "./processador";
import { avisoAgendaOffline } from "../servicos/agendaOffline";

type Props = Pick<EnvioPendente, "descartar" | "escolherCarro" | "itens" | "online" | "rodar" | "tentarDeNovo"> & {
  agendaOfflineEm?: string | null;
  despesasPendentes?: number;
};

const rotuloPendentes = (total: number) => `${total} ${total === 1 ? "envio pendente" : "envios pendentes"}`;

// Indicador fixo e discreto: só aparece sem conexão ou com envio na fila. Só os botões recebem toque.
export function EnvioPendenteIndicador({ agendaOfflineEm = null, descartar, escolherCarro, despesasPendentes = 0, itens, online, rodar, tentarDeNovo }: Props) {
  const [descartando, setDescartando] = useState<FilaItem | null>(null);
  const total = itens.length + despesasPendentes;
  const visivel = !(online && total === 0 && !agendaOfflineEm);
  const comAcao = itens.find((item) => item.estado === "precisa-acao" || item.estado === "falhou");
  const comAcaoVisivel = visivel && Boolean(comAcao);

  // Reserva uma faixa no rodapé das telas enquanto o indicador aparece, para ele nunca cobrir conteúdo.
  useEffect(() => {
    if (!visivel) return;
    const classes = comAcaoVisivel ? ["com-envio-pendente", "com-envio-pendente--acao"] : ["com-envio-pendente"];
    document.body.classList.add(...classes);
    return () => document.body.classList.remove("com-envio-pendente", "com-envio-pendente--acao");
  }, [visivel, comAcaoVisivel]);

  if (!visivel) return null;
  const enviando = itens.some((item) => item.estado === "enviando");

  let texto: string;
  let acoes: React.ReactNode = null;
  if (comAcao?.estado === "precisa-acao" && comAcao.motivo === "carro") {
    texto = `${comAcao.titulo}: escolha o carro para enviar`;
    acoes = <button type="button" onClick={() => void escolherCarro(comAcao)}>Escolher carro</button>;
  } else if (comAcao?.estado === "precisa-acao") {
    texto = comAcao.ultimoErro || MENSAGEM_SESSAO;
    acoes = <button type="button" onClick={() => window.location.reload()}>Entrar de novo</button>;
  } else if (comAcao) {
    texto = `${comAcao.titulo} não foi enviado`;
    acoes = (
      <>
        <button type="button" onClick={() => void tentarDeNovo(comAcao)}>Tentar de novo</button>
        <button type="button" onClick={() => setDescartando(comAcao)}>Descartar</button>
      </>
    );
  } else if (enviando) {
    texto = "Enviando…";
  } else if (!online) {
    texto = total ? `Sem conexão · ${rotuloPendentes(total)}` : agendaOfflineEm ? avisoAgendaOffline(agendaOfflineEm) : "Sem conexão";
  } else if (total) {
    texto = rotuloPendentes(total);
    acoes = itens.length ? <button type="button" onClick={() => rodar(true)}>Enviar agora</button> : null;
  } else {
    texto = avisoAgendaOffline(agendaOfflineEm ?? "");
  }

  return (
    <>
      <div className={`envio-pendente${comAcao ? " envio-pendente--acao" : ""}`} role="status" aria-live="polite">
        <span className="envio-pendente-texto">{texto}</span>
        {acoes}
      </div>
      {descartando ? (
        <ConfirmDialog
          title="Descartar envio?"
          message={`O serviço ${descartando.titulo} não será enviado agora e volta para a agenda.`}
          confirmLabel="Descartar"
          cancelLabel="Continuar"
          onCancel={() => setDescartando(null)}
          onConfirm={() => { void descartar(descartando); setDescartando(null); }}
        />
      ) : null}
    </>
  );
}

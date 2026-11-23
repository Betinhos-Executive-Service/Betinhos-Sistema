import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import type { EnvioPendente } from "./useEnvioPendente";
import type { FilaItem } from "./fila";
import { descreverIndicador } from "./textoIndicador";

type Props = Pick<EnvioPendente, "descartar" | "escolherCarro" | "itens" | "online" | "rodar" | "tentarDeNovo"> & {
  agendaOfflineEm?: string | null;
  despesasPendentes?: number;
};

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

  const { texto, situacao } = descreverIndicador({ itens, online, total, agendaOfflineEm });
  let acoes: React.ReactNode = null;
  if (comAcao && situacao === "carro") {
    acoes = <button type="button" onClick={() => void escolherCarro(comAcao)}>Escolher carro</button>;
  } else if (situacao === "sessao") {
    acoes = <button type="button" onClick={() => window.location.reload()}>Entrar de novo</button>;
  } else if (comAcao && situacao === "recusado") {
    // Recusa da configuração do App: reenviar não resolve; só dá para descartar.
    acoes = <button type="button" onClick={() => setDescartando(comAcao)}>Descartar</button>;
  } else if (comAcao) {
    acoes = (
      <>
        <button type="button" onClick={() => void tentarDeNovo(comAcao)}>Tentar de novo</button>
        <button type="button" onClick={() => setDescartando(comAcao)}>Descartar</button>
      </>
    );
  } else if (situacao === "pendente" && itens.length) {
    acoes = <button type="button" onClick={() => rodar(true)}>Enviar agora</button>;
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

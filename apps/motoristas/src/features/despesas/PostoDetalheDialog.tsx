import { MapPin } from "lucide-react";
import { createPortal } from "react-dom";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import { useDetalheDialog } from "./useDetalheDialog";
import { formatDiaMes } from "./gastosCartao";
import { formatBRL } from "./gastosRelatorio";
import { RECOMENDACAO, rotuloDistancia, urlMaps, type PostoProximo } from "./rankingPostos";

/** Ficha de leitura do posto. Fecha no X, no Esc e tocando fora. */
export function PostoDetalheDialog({ posto, dias, onClose }: { posto: PostoProximo; dias: number; onClose: () => void }) {
  const fecharRef = useDetalheDialog(onClose);
  const recomendacao = RECOMENDACAO[posto.cor];
  return createPortal(
    <div className="gr-detalhe-overlay" role="dialog" aria-modal="true" aria-labelledby="rp-detalhe-titulo" onClick={onClose}>
      <div className="gr-detalhe" onClick={(event) => event.stopPropagation()}>
        <header className="gr-detalhe-topo">
          <div className="gr-detalhe-titulos">
            <h2 id="rp-detalhe-titulo">{posto.nome}</h2>
            <strong className="gr-detalhe-valor">{formatBRL(posto.precoLitro)}/L</strong>
          </div>
          <span className="termo-badge" data-tone={recomendacao.tom}>{recomendacao.rotulo}</span>
          <button ref={fecharRef} type="button" className="gr-detalhe-fechar" aria-label="Fechar" onClick={onClose}><SystemIcon name="dismiss" /></button>
        </header>
        <div className="gr-detalhe-corpo">
          <dl className="gr-detalhe-campos">
            {posto.endereco ? <div><dt>Endereço</dt><dd>{posto.endereco}</dd></div> : null}
            <div><dt>Distância</dt><dd>{rotuloDistancia(posto)}</dd></div>
            <div><dt>Média</dt><dd>{posto.abastecimentos === 1 ? "Baseada em 1 abastecimento" : `${posto.abastecimentos} abastecimentos em ${dias} dias`}</dd></div>
          </dl>
          <a className="rp-maps" href={urlMaps(posto)} target="_blank" rel="noreferrer"><MapPin aria-hidden="true" />Abrir no Maps</a>
          {posto.historico.length ? (
            <section aria-labelledby="rp-historico">
              <h3 className="termo-section-title" id="rp-historico">Últimos abastecimentos</h3>
              <ul className="rp-historico">
                {posto.historico.map((item, indice) => (
                  <li key={`${item.data}-${indice}`}><span>{formatDiaMes(item.data)}</span><strong>{formatBRL(item.precoLitro)}/L</strong></li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

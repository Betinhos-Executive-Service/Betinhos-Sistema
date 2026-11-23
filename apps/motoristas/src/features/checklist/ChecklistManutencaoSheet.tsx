import { useEffect, useId, useRef } from "react";
import { ActionButton } from "../../shared/ui/ActionButton";
import type { ChecklistPedidoManutencao } from "./checklists";

type Props = {
  pedido: ChecklistPedidoManutencao;
  /** Abre "Solicitar manutenção" já preenchida. */
  onPedir: () => void;
  /** Fecha e volta para a lista (X, Esc, toque fora, "Agora não"). */
  onDepois: () => void;
};

// Fim do checklist com itens Não OK: mostra o que ficou com problema e leva para a manutenção já preenchida.
// Mesma folha de baixo da leitura do recibo (classes leitura-cartao-*), com a lista dos itens.
export function ChecklistManutencaoSheet({ pedido, onPedir, onDepois }: Props) {
  const titleId = useId();
  const titleRef = useRef<HTMLDivElement>(null);
  const onDepoisRef = useRef(onDepois);
  onDepoisRef.current = onDepois;
  const total = pedido.itens.length;

  useEffect(() => {
    titleRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onDepoisRef.current(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="leitura-cartao-overlay" onClick={onDepois}>
      <div className="leitura-cartao-sheet checklist-manutencao-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="leitura-cartao-handle" aria-hidden="true"><span /></div>
        <button className="leitura-cartao-close" type="button" aria-label="Fechar" onClick={onDepois}>×</button>
        <span className="checklist-manutencao-ok">Checklist enviado</span>
        <div ref={titleRef} id={titleId} tabIndex={-1} className="leitura-cartao-title">
          {total === 1 ? "1 item precisa de manutenção" : `${total} itens precisam de manutenção`}
        </div>
        <p className="leitura-cartao-sub">Peça agora e a oficina já recebe o problema com as fotos.</p>

        <ul className="checklist-manutencao-itens">
          {pedido.itens.map((item) => (
            <li key={item.chave}>
              {item.foto ? <img src={item.foto} alt="" /> : <span className="checklist-manutencao-sem-foto" aria-hidden="true">!</span>}
              <div>
                <strong>{item.rotulo}</strong>
                {item.problemas.length ? <span>{item.problemas.join(" · ")}</span> : null}
              </div>
            </li>
          ))}
        </ul>

        <p className="checklist-manutencao-pronto">
          Já vai preenchido: {pedido.placa ? `veículo ${pedido.placa}, ` : "veículo, "}{pedido.kmAtual ? "km, " : ""}descrição e {pedido.fotos.length === 1 ? "a foto" : "as fotos"}. Você só escolhe a gravidade.
        </p>

        <div className="leitura-cartao-acoes">
          <ActionButton variant="primary" label="Pedir manutenção" onClick={onPedir} />
          <ActionButton label="Agora não" onClick={onDepois} />
        </div>
      </div>
    </div>
  );
}

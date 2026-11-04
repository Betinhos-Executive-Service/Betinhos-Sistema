import { ActionBar, ActionButton } from "../components/common/ActionButton";
import { AppShell } from "../components/layout/AppShell";
import { ServicesMenu } from "../components/navigation/ServicesMenu";
import { formatDiaMes, isMockGastosCartao, type GastoCartao, type GastosCartaoLoadStatus } from "../lib/gastosCartao";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type GastosCartaoScreenProps = {
  items: GastoCartao[];
  loadStatus: GastosCartaoLoadStatus;
  onBack: () => void;
  onReload: () => void;
  onOpen: (id: string) => void;
  onAttach: () => void;
};

export function GastosCartaoScreen({ items, loadStatus, onBack, onReload, onOpen, onAttach }: GastosCartaoScreenProps) {
  return (
    <AppShell screenLabel="GastosCartao">
      <ServicesMenu
        title="Gastos"
        eyebrow={isMockGastosCartao() ? "Financeiro · Mock local" : "Financeiro"}
        homeLabel="Voltar"
        homeIcon="arrowLeft"
        onHome={onBack}
        onRefresh={onReload}
      />
      <section className="termo-screen" aria-label="Gastos do cartão para completar">
        {loadStatus === "loading" && !items.length ? (
          <div className="termo-skeleton" role="status" aria-busy="true" aria-label="Carregando gastos do cartão"><span /><span /></div>
        ) : loadStatus === "error" && !items.length ? (
          <div className="termo-alert" data-tone="erro" role="alert">
            <p>Não foi possível carregar os gastos do cartão.</p>
            <button type="button" className="termo-text-button" onClick={onReload}>Tentar de novo</button>
          </div>
        ) : items.length ? (
          <>
          <h2 className="gastos-cartao-heading">Do cartão, para completar</h2>
          <ul className="termo-list">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="termo-row" onClick={() => onOpen(item.id)}>
                  <span className="termo-row-main">
                    <strong>{item.estabelecimento || "Gasto do cartão"}</strong>
                    <span>{BRL.format(item.valor)}</span>
                    <small>{[formatDiaMes(item.dataGasto), item.cartaoFinal ? `Cartão final ${item.cartaoFinal}` : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="termo-row-side"><span className="termo-badge" data-tone="atencao">Completar</span></span>
                </button>
              </li>
            ))}
          </ul>
          </>
        ) : (
          <p className="termo-empty">Nenhum gasto do cartão para completar. Para lançar um gasto novo, toque em Anexar despesa.</p>
        )}
      </section>
      <ActionBar className="finalize-actions maintenance-actions">
        <ActionButton className="finalize-primary" variant="primary" label="Anexar despesa" onClick={onAttach} />
      </ActionBar>
    </AppShell>
  );
}

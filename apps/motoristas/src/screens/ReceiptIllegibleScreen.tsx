import { ActionButton } from "../components/common/ActionButton";
import { SystemIcon } from "../components/icons/SystemIcon";
import { AppShell } from "../components/layout/AppShell";
import { FormMenu } from "../components/navigation/FormMenu";

type ReceiptIllegibleScreenProps = {
  photoDataUrl: string;
  /** Abre a câmera para substituir a foto ilegível. */
  onRetake: () => void;
  /** Sai sem nova foto e segue para o preenchimento manual. */
  onBack: () => void;
};

const TIPS = [
  "Aproxime o celular até o comprovante ocupar a tela.",
  "Procure mais luz e evite reflexo e sombra.",
  "Mostre o cupom inteiro, esticado e sem dobras."
] as const;

/** Foto ilegível (1ª e 2ª tentativa): miniatura, dicas e "Tirar outra foto". Na 3ª, o app vai direto ao formulário. */
export function ReceiptIllegibleScreen({ photoDataUrl, onRetake, onBack }: ReceiptIllegibleScreenProps) {
  return (
    <AppShell screenLabel="TelaComprovanteIlegivel">
      <FormMenu title="Comprovante" onBack={onBack} />
      <section className="main-panel receipt-reading-main">
        <article className="receipt-reading-card receipt-illegible-card" aria-labelledby="receipt-illegible-title">
          <div className="receipt-reading-thumb">
            {photoDataUrl ? <img src={photoDataUrl} alt="Foto do comprovante que não foi lida" /> : null}
          </div>
          <div className="receipt-illegible-heading">
            <span className="receipt-illegible-icon" aria-hidden="true">
              <SystemIcon name="warning" />
            </span>
            <h2 id="receipt-illegible-title" className="receipt-reading-title" role="alert">Não consegui ler o comprovante</h2>
          </div>
          <ul className="receipt-illegible-tips" aria-label="Dicas para a nova foto">
            {TIPS.map((tip) => (
              <li key={tip} className="receipt-illegible-tip">
                <span className="receipt-illegible-tip-icon" aria-hidden="true">
                  <SystemIcon name="check" />
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          <ActionButton className="receipt-illegible-retake" variant="primary" idleLabel="Tirar outra foto" icon={<SystemIcon name="camera" />} onClick={onRetake} />
        </article>
      </section>
    </AppShell>
  );
}

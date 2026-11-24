import { useIdioma } from "../i18n";
import { Fechado, Relogio } from "../icones";
import { BT } from "../bt";
import { Contato } from "./Contato";
import { SeletorIdioma } from "./SeletorIdioma";

// Link sem acompanhamento: expirado (TTL venceu) ou revogado (encerrado pela Betinhos). Sem cartão do motorista, sem mapa.
export function LinkInvalido({ estado }: { estado: "expirado" | "revogado" }) {
  const { t } = useIdioma();
  return (
    <main className="vazio">
      <SeletorIdioma className="idioma vazio-topo" />
      <div>
        <img src="/logo-b-128.png" alt="Betinhos Executive Service" width={64} height={64} style={{ margin: "0 auto 16px", display: "block", borderRadius: "50%" }} />
        <div className="icone">{estado === "expirado" ? <Relogio /> : <Fechado />}</div>
        <h1>{t(`${estado}.titulo`)}</h1><p>{t(`${estado}.texto`)}</p>
        <Contato cfg={BT.cfg} />
      </div>
    </main>
  );
}

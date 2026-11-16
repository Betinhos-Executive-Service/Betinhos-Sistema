import { useEffect, useId, useRef, useState } from "react";
import { ActionButton } from "../../shared/ui/ActionButton";
import { SystemIcon } from "../../shared/ui/icons/SystemIcon";
import { formatarChave, formatarCnpj, MODELOS_NOTA, normalizarChave, validarChave, type OrigemChave } from "./chaveNotaFiscal";

export type ChaveSugerida = { chave: string; origem: OrigemChave };

type Props = {
  /** Número do comprovante (1, 2…) na despesa. */
  comprovante: number;
  /** Chave achada no PDF ou pela leitura rápida, para o motorista confirmar. */
  sugerida?: ChaveSugerida | null;
  /** Recusa da última tentativa (DV, mês, repetida), mostrada no topo. */
  erro?: string;
  onLerCodigo: () => void;
  /** Confere a chave (mês e repetida). Devolve a mensagem de recusa, ou null quando gravou. */
  onConfirmar: (chave: string, origem: OrigemChave) => Promise<string | null>;
  onSemChave: (situacao: "nao-verificada" | "sem-nota") => void;
  onClose: () => void;
};

const ORIGEM_TEXTO: Record<OrigemChave, string> = {
  qr: "lida no QR",
  "codigo-barras": "lida no código de barras",
  pdf: "achada no PDF",
  "leitura-rapida": "lida na foto",
  digitada: "digitada"
};

function DetalheDaChave({ chave }: { chave: string }) {
  const r = validarChave(chave);
  if (!r.ok) return null;
  return (
    <dl className="nota-fiscal-detalhe">
      <div><dt>Emitente</dt><dd>{formatarCnpj(r.nota.cnpj)}</dd></div>
      <div><dt>Nota</dt><dd>{MODELOS_NOTA[r.nota.modelo]} {r.nota.numero} · {r.nota.uf}</dd></div>
    </dl>
  );
}

/** Situação da chave enquanto o motorista digita: só reclama quando já há 44 posições (ou passou). */
export function avisoDaDigitacao(texto: string) {
  const chave = normalizarChave(texto);
  if (!chave) return { valida: false, texto: "" };
  if (chave.length < 44) return { valida: false, texto: `${chave.length} de 44` };
  const r = validarChave(chave);
  return r.ok ? { valida: true, texto: "Chave válida" } : { valida: false, texto: r.erro };
}

// Chave da nota fiscal do comprovante, em folha de baixo: ler o código, digitar, "Não consigo ler" ou "Sem nota fiscal".
export function NotaFiscalSheet({ comprovante, sugerida, erro, onLerCodigo, onConfirmar, onSemChave, onClose }: Props) {
  const titleId = useId();
  const inputId = useId();
  const avisoId = useId();
  const titleRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [digitando, setDigitando] = useState(false);
  const [texto, setTexto] = useState("");
  const [conferindo, setConferindo] = useState(false);
  const [recusa, setRecusa] = useState(erro ?? "");
  const [descartar, setDescartar] = useState(false);
  const aviso = avisoDaDigitacao(texto);
  const temRascunho = digitando && normalizarChave(texto).length > 0;

  const fechar = () => {
    if (conferindo) return;
    if (temRascunho) { setDescartar(true); return; }
    onClose();
  };
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;

  useEffect(() => { setRecusa(erro ?? ""); }, [erro]);
  useEffect(() => { if (digitando) inputRef.current?.focus(); }, [digitando]);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { fecharRef.current(); return; }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focaveis = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex='-1']"));
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!primeiro || !ultimo) return;
      const atual = document.activeElement;
      if (event.shiftKey && (atual === primeiro || !sheetRef.current.contains(atual))) { event.preventDefault(); ultimo.focus(); }
      else if (!event.shiftKey && (atual === ultimo || !sheetRef.current.contains(atual))) { event.preventDefault(); primeiro.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const atual = document.activeElement;
      if (!atual || atual === document.body || sheetRef.current?.contains(atual)) anterior?.focus();
    };
  }, []);

  const confirmar = async (chave: string, origem: OrigemChave) => {
    setConferindo(true);
    setRecusa("");
    try {
      const motivo = await onConfirmar(chave, origem);
      if (motivo) setRecusa(motivo);
    } finally {
      setConferindo(false);
    }
  };

  return (
    <div className="leitura-cartao-overlay" onClick={fechar}>
      <div
        ref={sheetRef}
        className="leitura-cartao-sheet nota-fiscal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={conferindo}
        onClick={(event) => event.stopPropagation()}
        data-testid="nota-fiscal-sheet"
      >
        <div className="leitura-cartao-handle"><span /></div>
        <button className="leitura-cartao-close" type="button" aria-label="Fechar" onClick={fechar}>×</button>
        <div ref={titleRef} id={titleId} tabIndex={-1} className="leitura-cartao-title">Nota fiscal do comprovante {comprovante}</div>
        <p className="leitura-cartao-sub">
          {digitando ? "Digite os 44 números da chave de acesso, como estão no cupom ou no DANFE." : "A chave de acesso confere se a nota é deste mês e se não foi usada em outra despesa."}
        </p>

        {recusa ? (
          <div className="nota-fiscal-alerta" role="alert">
            <SystemIcon name="warning" />
            <span>{recusa}</span>
          </div>
        ) : null}

        {descartar ? (
          <div className="nota-fiscal-descartar" role="alertdialog" aria-label="Descartar alterações?">
            <strong>Descartar a chave digitada?</strong>
            <div className="leitura-cartao-acoes">
              <ActionButton variant="primary" label="Continuar editando" onClick={() => setDescartar(false)} />
              <ActionButton label="Descartar" onClick={onClose} />
            </div>
          </div>
        ) : digitando ? (
          <div className="nota-fiscal-digitar">
            <label htmlFor={inputId} className="nota-fiscal-rotulo">Chave de acesso</label>
            <input
              ref={inputRef}
              id={inputId}
              className="nota-fiscal-input"
              value={texto}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={60}
              placeholder="0000 0000 0000 …"
              aria-describedby={avisoId}
              aria-invalid={Boolean(aviso.texto) && !aviso.valida && normalizarChave(texto).length >= 44}
              onChange={(event) => { setTexto(event.target.value); setRecusa(""); }}
              onKeyDown={(event) => { if (event.key === "Enter" && aviso.valida) void confirmar(normalizarChave(texto), "digitada"); }}
              data-testid="nota-fiscal-input"
            />
            <div id={avisoId} className={`nota-fiscal-aviso ${aviso.valida ? "is-ok" : normalizarChave(texto).length >= 44 ? "is-erro" : ""}`} aria-live="polite">{aviso.texto}</div>
            {aviso.valida ? <DetalheDaChave chave={normalizarChave(texto)} /> : null}
            <div className="leitura-cartao-acoes">
              <ActionButton variant="primary" label="Conferir chave" loadingLabel="Conferindo" state={conferindo ? "loading" : "idle"} disabled={!aviso.valida} onClick={() => void confirmar(normalizarChave(texto), "digitada")} />
              <ActionButton label="Voltar" disabled={conferindo} onClick={() => { setDigitando(false); setTexto(""); setRecusa(""); }} />
            </div>
          </div>
        ) : (
          <>
            {sugerida ? (
              <div className="nota-fiscal-sugerida">
                <span className="nota-fiscal-rotulo">Chave {ORIGEM_TEXTO[sugerida.origem]}</span>
                <code>{formatarChave(sugerida.chave)}</code>
                <DetalheDaChave chave={sugerida.chave} />
              </div>
            ) : null}
            <div className="leitura-cartao-acoes nota-fiscal-caminhos">
              {sugerida ? (
                <ActionButton variant="primary" label="Usar esta chave" loadingLabel="Conferindo" state={conferindo ? "loading" : "idle"} onClick={() => void confirmar(sugerida.chave, sugerida.origem)} />
              ) : null}
              <ActionButton variant={sugerida ? "secondary" : "primary"} label="Ler o QR ou o código de barras" disabled={conferindo} onClick={onLerCodigo} />
              <ActionButton label="Digitar a chave" disabled={conferindo} onClick={() => { setDigitando(true); setRecusa(""); }} />
              <ActionButton label="Não consigo ler" disabled={conferindo} onClick={() => onSemChave("nao-verificada")} />
              <ActionButton label="Comprovante sem nota fiscal" disabled={conferindo} onClick={() => onSemChave("sem-nota")} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import type React from "react";
import logo from "../../assets/images/logo-betinhos-b-192.webp";

export type BrandLoaderProps = {
  /** Nome lido pelo leitor de tela (ex.: "Carregando serviços"). */
  label: string;
  /** Texto visível embaixo da logo; sem ele só a logo aparece. */
  text?: string;
  /**
   * `overlay` (padrão): véu cinza com blur sobre o bloco que carrega; o pai precisa de `position` (classe `brand-loader-host`).
   * `inline`: ocupa o lugar do conteúdo que ainda não chegou. `fullscreen`: só para a abertura do app.
   */
  variant?: "overlay" | "inline" | "fullscreen";
  /** `lg` tela/lista, `md` painel/diálogo, `sm` card/linha. */
  size?: "lg" | "md" | "sm";
};

/** Marca do loader: anel navy girando em volta da logo B (estilos em brand-loader.css). */
export function BrandLoaderMark({ children }: { children?: React.ReactNode }) {
  return (
    <span className="brand-loader__mark" aria-hidden="true">
      <span className="brand-loader__ring" />
      <img className="brand-loader__logo" src={logo} alt="" />
      {children}
    </span>
  );
}

/**
 * Loader geral do App Motoristas. Fica no bloco que carrega, nunca na tela toda:
 * se só a lista carrega, o cabeçalho, a navegação e o resto da tela continuam usáveis.
 */
export function BrandLoader({ label, text, variant = "overlay", size = "lg" }: BrandLoaderProps) {
  const classes = ["brand-loader"];
  if (variant === "inline") classes.push("brand-loader--inline");
  if (variant === "fullscreen") classes.push("brand-loader--fixed");
  if (size !== "lg") classes.push(`brand-loader--${size}`);
  return (
    <div className={classes.join(" ")} role="status" aria-live="polite" aria-label={label}>
      <BrandLoaderMark />
      {text ? <p className="brand-loader__label" aria-hidden="true">{text}</p> : null}
    </div>
  );
}

/** Tira o splash do index.html (mesmo visual, aparece antes do JS) com um fade curto. */
export function esconderSplashInicial() {
  const splash = document.getElementById("boot-splash");
  if (!splash) return;
  splash.style.transition = "opacity 180ms ease-out";
  splash.style.opacity = "0";
  setTimeout(() => splash.remove(), 200);
}

import type React from "react";
import logo from "../../assets/images/logo-betinhos-b-192.webp";

type BrandLoaderProps = {
  /** Nome lido pelo leitor de tela (ex.: "Carregando serviços"). */
  label: string;
  /** Texto visível embaixo da logo; sem ele só a logo aparece. */
  text?: string;
  /** Cobre a janela toda; sem isso cobre o pai mais próximo com `position: relative`. */
  fullscreen?: boolean;
};

/** Marca do loader: anel girando em volta da logo B (estilos em brand-loader.css). */
export function BrandLoaderMark({ children }: { children?: React.ReactNode }) {
  return (
    <span className="brand-loader__mark" aria-hidden="true">
      <span className="brand-loader__ring" />
      <img className="brand-loader__logo" src={logo} alt="" />
      {children}
    </span>
  );
}

/** Loader geral do App Motoristas: logo B no centro, anel girando e fundo acinzentado com blur. */
export function BrandLoader({ label, text, fullscreen }: BrandLoaderProps) {
  return (
    <div className={fullscreen ? "brand-loader brand-loader--fixed" : "brand-loader"} role="status" aria-label={label}>
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

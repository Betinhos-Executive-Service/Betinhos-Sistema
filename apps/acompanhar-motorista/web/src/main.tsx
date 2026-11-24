import { MotionConfig } from "motion/react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BT } from "./bt";
import { ToastProvider } from "./componentes/Toast";
import { LinkInvalido } from "./componentes/LinkInvalido";
import { IdiomaProvider } from "./i18n";
import "./estilo.css";

const invalido = BT.estado !== "ativo";
createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <IdiomaProvider tituloInicial={invalido ? (BT.estado === "expirado" ? "expirado.titulo" : "revogado.titulo") : "titulo.pagina"}>
      <ToastProvider>{invalido ? <LinkInvalido estado={BT.estado as "expirado" | "revogado"} /> : <App />}</ToastProvider>
    </IdiomaProvider>
  </MotionConfig>,
);

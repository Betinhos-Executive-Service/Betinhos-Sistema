import { useState } from "react";
import { motion } from "motion/react";
import { SystemIcon } from "../icons/SystemIcon";
import { reportAppError } from "../../appErrorLogger";

type ServicesMenuProps = {
  onHome: () => void;
  /** Sem onRefresh o botão fica invisível (mantém o lugar no layout), por exemplo durante a assinatura. */
  onRefresh?: () => void | Promise<void>;
  title?: string;
  eyebrow?: string;
  homeLabel?: string;
  homeIcon?: "home" | "arrowLeft";
};

export function ServicesMenu({ onHome, onRefresh, title = "Seus Serviços", eyebrow = "Agenda", homeLabel = "Início", homeIcon = "home" }: ServicesMenuProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent("betinhos:refresh-visual", { detail: { phase: "start" } }));
    try {
      await onRefresh();
    } catch (error) {
      reportAppError(error, {
        severity: "error",
        source: "services-menu",
        action: "refresh",
        component: "ServicesMenu"
      });
      throw error;
    } finally {
      window.dispatchEvent(new CustomEvent("betinhos:refresh-visual", { detail: { phase: "done" } }));
      window.setTimeout(() => setIsRefreshing(false), 360);
    }
  };

  return (
    <header className="menu services-menu">
      <div className="services-menu-inner">
        <motion.div className="services-discovery-bar" layout transition={{ type: "spring", bounce: 0.18, duration: 0.42 }}>
          <motion.button
            className="services-nav-button services-nav-button--home"
            aria-label={homeLabel}
            onClick={onHome}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
          >
            <SystemIcon name={homeIcon} />
            <span>{homeLabel}</span>
          </motion.button>

          <motion.div className="services-title-block" layout>
            <span>{eyebrow}</span>
            <strong>{title}</strong>
          </motion.div>

          <motion.button
            className="services-nav-button services-nav-button--refresh"
            aria-label="Atualizar"
            onClick={refresh}
            disabled={!onRefresh}
            aria-hidden={onRefresh ? undefined : true}
            tabIndex={onRefresh ? undefined : -1}
            style={onRefresh ? undefined : { visibility: "hidden" }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
          >
            <motion.span animate={{ rotate: isRefreshing ? 360 : 0 }} transition={{ duration: 0.42, ease: "easeOut" }}>
              <SystemIcon name="refresh" />
            </motion.span>
          </motion.button>
        </motion.div>
      </div>
    </header>
  );
}

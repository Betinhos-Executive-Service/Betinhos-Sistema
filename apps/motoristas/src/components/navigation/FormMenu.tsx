import { useContext } from "react";
import { TourHelpButton, TourHelpContext } from "../common/TourHelp";
import { SystemIcon, type SystemIconName } from "../icons/SystemIcon";

type FormMenuProps = {
  title: string;
  onBack?: () => void;
  rightIcon?: SystemIconName;
  rightLabel?: string;
  onRightClick?: () => void;
};

export function FormMenu({ title, onBack, rightIcon, rightLabel, onRightClick }: FormMenuProps) {
  const hasHelp = Boolean(useContext(TourHelpContext));
  return (
    <header className="menu form-menu">
      <button className="icon-button form-menu-button" aria-label="Voltar" disabled={!onBack} onClick={onBack}>
        <SystemIcon name="arrowLeft" />
      </button>
      <div className="form-menu-title">{title}</div>
      <TourHelpButton className="form-menu-button" />
      {rightIcon ? (
        <button className="icon-button form-menu-button" aria-label={rightLabel ?? "Ação"} disabled={!onRightClick} onClick={onRightClick}>
          <SystemIcon name={rightIcon} />
        </button>
      ) : hasHelp ? null : (
        <div className="form-menu-spacer" aria-hidden="true" />
      )}
    </header>
  );
}

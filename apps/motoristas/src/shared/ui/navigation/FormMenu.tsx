import { TourHelpButton, useTourHelp } from "../TourHelp";
import { SystemIcon, type SystemIconName } from "../icons/SystemIcon";

type FormMenuProps = {
  title: string;
  onBack?: () => void;
  rightIcon?: SystemIconName;
  rightLabel?: string;
  onRightClick?: () => void;
};

export function FormMenu({ title, onBack, rightIcon, rightLabel, onRightClick }: FormMenuProps) {
  const hasHelp = Boolean(useTourHelp());
  return (
    <header className="menu form-menu" data-help={hasHelp || undefined}>
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

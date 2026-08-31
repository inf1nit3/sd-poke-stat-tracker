/**
 * Minimal @decky/ui stub for jsdom component tests. Focusable renders a
 * plain div and maps the Deck-specific onOKButton to a normal click so
 * tests can drive tab switches etc. with userEvent/click.
 */
import type { CSSProperties, ReactNode } from "react";

export interface FocusableProps {
  children?: ReactNode;
  onOKButton?: () => void;
  onOKActionDescription?: string;
  focusWithinClassName?: string;
  style?: CSSProperties;
  onClick?: () => void;
  [key: string]: unknown;
}

export function Focusable({
  children,
  onOKButton,
  style,
  onClick,
  ...rest
}: FocusableProps) {
  return (
    <div onClick={onOKButton ?? onClick} style={style} {...rest}>
      {children}
    </div>
  );
}

export function PanelSection({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <section>
      {title ? <div data-testid="panel-title">{title}</div> : null}
      {children}
    </section>
  );
}

export function PanelSectionRow({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}

export function ButtonItem({
  children,
  onClick,
  disabled,
  layout,
}: {
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  layout?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-layout={layout}
    >
      {children}
    </button>
  );
}

export const findModuleExport = () => undefined;
export const SteamClient = null;

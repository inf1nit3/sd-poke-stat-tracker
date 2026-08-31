/**
 * Minimal @decky/ui stub for jsdom component tests. Focusable renders a
 * plain div and maps the Deck-specific onOKButton to a normal click so
 * tests can drive tab switches etc. with userEvent/click.
 */
import type { CSSProperties, ReactNode } from "react";

export interface FocusableProps {
  children?: ReactNode;
  onOKButton?: () => void;
  onActivate?: () => void;
  onOKActionDescription?: string;
  focusWithinClassName?: string;
  style?: CSSProperties;
  onClick?: () => void;
  [key: string]: unknown;
}

export function Focusable({
  children,
  onOKButton,
  onActivate,
  style,
  onClick,
  ...rest
}: FocusableProps) {
  return (
    <div onClick={onOKButton ?? onActivate ?? onClick} style={style} {...rest}>
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

export function Dropdown({
  menuLabel,
  selectedOption,
  onChange,
  rgOptions,
}: {
  menuLabel?: string;
  selectedOption?: string;
  onChange?: (opt: { data: string; label: string }) => void;
  rgOptions?: Array<{ data: string; label: string }>;
}) {
  return (
    <div data-menu-label={menuLabel} data-selected={selectedOption}>
      {(rgOptions ?? []).map((opt) => (
        <button
          key={opt.data}
          type="button"
          data-dropdown-option={opt.data}
          disabled={opt.data === selectedOption}
          onClick={() => onChange?.(opt)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
}) {
  return (
    <input
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    />
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      onClick={() => onChange?.(!checked)}
    >
      {checked ? "On" : "Off"}
    </button>
  );
}

export function Spinner() {
  return <div role="status" aria-label="Loading" />;
}

export const findModuleExport = () => undefined;
export const SteamClient = null;

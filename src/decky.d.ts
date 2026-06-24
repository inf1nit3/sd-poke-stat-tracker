declare module "@decky/api" {
  export type ServerAPI = {
    [key: string]: any;
  };

  export interface Router {
    [key: string]: any;
  }

  export function call<T = any>(
    method: string,
    ...args: any[]
  ): Promise<T>;

  export function definePlugin<T>(
    fn: (api?: ServerAPI) => T
  ): (api?: ServerAPI) => T;

  export function routerHook(
    routes: any[],
    legacy?: boolean
  ): () => void;

  export const toaster: {
    toast: (msg: string) => void;
  };
}

declare module "decky-frontend-lib" {
  import type { ComponentType, ReactNode, CSSProperties, Ref } from "react";

  export const staticClasses: Record<string, string>;

  export const Focusable: ComponentType<any>;
  export const Navigation: ComponentType<any>;

  export const PanelSection: ComponentType<{
    title?: string;
    children?: ReactNode;
  }>;
  export const PanelSectionRow: ComponentType<{
    children?: ReactNode;
  }>;

  export const ButtonItem: ComponentType<{
    layout?: "below" | "above" | "inline";
    onClick?: (e?: any) => void;
    disabled?: boolean;
    children?: ReactNode;
  }>;

  export const DialogButton: ComponentType<any>;
  export const TextField: ComponentType<{
    label?: string;
    value?: string;
    onChange?: (e: any) => void;
    disabled?: boolean;
    placeholder?: string;
  }>;
  export const Dropdown: ComponentType<{
    menuLabel?: string;
    selectedOption?: string;
    onChange?: (option: { data: any; label: string }) => void;
    options?: Array<{ data: any; label: string }>;
    disabled?: boolean;
  }>;
  export const SingleDropdown: ComponentType<any>;
  export const Toggle: ComponentType<{
    value?: boolean;
    onChange?: (value: boolean) => void;
    disabled?: boolean;
    children?: ReactNode;
  }>;
  export const Slider: ComponentType<any>;
  export const Spinner: ComponentType<{ children?: ReactNode }>;
  export const ConfirmModal: ComponentType<any>;
  export const Modal: ComponentType<any>;
  export const Tabs: ComponentType<any>;

  export interface MenuItemProps {
    onClick?: (e?: any) => void;
    disabled?: boolean;
    children?: ReactNode;
  }
  export const MenuItem: ComponentType<MenuItemProps>;
  export const MenuGroup: ComponentType<{ children?: ReactNode }>;
  export const ReorderableEntry: ComponentType<any>;

  export interface PatchTouchMenuProps {
    menuLabel?: string;
    content: ReactNode;
    icon?: ReactNode;
    onMenuClose?: () => void;
  }
  export function PatchTouchMenu(props: PatchTouchMenuProps): () => void;
}

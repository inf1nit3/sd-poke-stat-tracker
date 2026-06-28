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
    toast: (msg: any) => void;
  };
}


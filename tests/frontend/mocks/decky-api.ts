/**
 * Stub for the @decky/api module. The real module only exists inside
 * Steam's CEF; tests route every call<...> through a dispatch table.
 */
type CallHandler = (method: string, ...args: unknown[]) => unknown;

let handler: CallHandler = () => {
  throw new Error("mockCall not configured for this test");
};

export const callLog: { method: string; args: unknown[] }[] = [];

export function mockCall(fn: CallHandler) {
  handler = fn;
}

export function resetCallLog() {
  callLog.length = 0;
}

export async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  callLog.push({ method, args });
  return handler(method, ...args) as Promise<T> | T;
}

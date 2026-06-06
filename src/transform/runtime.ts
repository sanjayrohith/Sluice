import { getQuickJS } from "quickjs-emscripten";
import { TransformMemoryError, TransformTimeoutError } from "./errors.js";
import { installSandboxGlobals } from "./globals.js";

export interface TransformRuntimeOptions {
  timeoutMs?: number;
  memoryLimitBytes?: number;
}

export async function evaluateTransform(
  source: string,
  input: unknown,
  options: TransformRuntimeOptions = {},
): Promise<unknown> {
  const quickJs = await getQuickJS();
  const runtime = quickJs.newRuntime();
  const context = runtime.newContext();
  installSandboxGlobals(context);
  const deadline = performance.now() + (options.timeoutMs ?? 100);
  let timedOut = false;
  runtime.setMemoryLimit(options.memoryLimitBytes ?? 16 * 1024 * 1024);
  runtime.setInterruptHandler(() => {
    timedOut = performance.now() >= deadline;
    return timedOut;
  });

  try {
    const inputHandle = context.newString(JSON.stringify(input));
    context.setProp(context.global, "__sluice_event_json", inputHandle);
    inputHandle.dispose();

    const code = `(function () {
      ${source.replace(/^\s*export\s+default\s+/, "return ")}
    })() (JSON.parse(__sluice_event_json))`;
    const result = context.unwrapResult(context.evalCode(code));
    const value = context.dump(result);
    result.dispose();
    return value;
  } catch (error) {
    if (timedOut) throw new TransformTimeoutError();
    const message = error instanceof Error ? error.message : String(error);
    if (/out of memory|memory limit|allocation failed/i.test(message)) {
      throw new TransformMemoryError(message);
    }
    throw error;
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

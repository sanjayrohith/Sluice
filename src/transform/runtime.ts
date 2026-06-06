import { getQuickJS } from "quickjs-emscripten";

export async function evaluateTransform(source: string, input: unknown): Promise<unknown> {
  const quickJs = await getQuickJS();
  const runtime = quickJs.newRuntime();
  const context = runtime.newContext();

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
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

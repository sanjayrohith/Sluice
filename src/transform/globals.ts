import type { QuickJSContext } from "quickjs-emscripten";

import { logger } from "../lib/logger.js";

export function installSandboxGlobals(context: QuickJSContext): void {
  const consoleObject = context.newObject();
  const log = context.newFunction("log", (...args) => {
    logger.info({ transform: args.map((arg) => context.dump(arg)) }, "transform console.log");
  });
  context.setProp(consoleObject, "log", log);
  context.setProp(context.global, "console", consoleObject);
  log.dispose();
  consoleObject.dispose();

  const forbidden = context.evalCode(
    "delete globalThis.fetch; delete globalThis.require; delete globalThis.process; " +
      "delete globalThis.setTimeout; delete globalThis.setInterval; delete globalThis.setImmediate;",
  );
  forbidden.dispose();
}

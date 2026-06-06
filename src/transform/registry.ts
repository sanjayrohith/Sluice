import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { getQuickJS } from "quickjs-emscripten";

import type { SourcesConfig } from "../config/sources.js";

export interface CompiledTransform {
  sourceId: string;
  filePath: string;
  mtimeMs: number;
  source: string;
}

export class TransformRegistry {
  private readonly cache = new Map<string, CompiledTransform>();

  constructor(private readonly config: SourcesConfig) {}

  async loadAll(): Promise<void> {
    for (const source of this.config.sources.values()) {
      if (source.transform) await this.load(source.id);
    }
  }

  async load(sourceId: string): Promise<CompiledTransform> {
    const source = this.config.sources.get(sourceId);
    if (!source?.transform) throw new Error(`No transform configured for source ${sourceId}`);

    const filePath = resolve(source.transform);
    const mtimeMs = statSync(filePath).mtimeMs;
    const cached = this.cache.get(sourceId);
    if (cached?.mtimeMs === mtimeMs && cached.filePath === filePath) return cached;

    const sourceCode = readFileSync(filePath, "utf8");
    await validateSyntax(sourceCode, filePath);
    const compiled = { sourceId, filePath, mtimeMs, source: sourceCode };
    this.cache.set(sourceId, compiled);
    return compiled;
  }
}

async function validateSyntax(source: string, filePath: string): Promise<void> {
  const quickJs = await getQuickJS();
  const runtime = quickJs.newRuntime();
  const context = runtime.newContext();
  try {
    const code = `(function () { ${source.replace(/^\s*export\s+default\s+/, "return ")} })()`;
    const result = context.evalCode(code, filePath, { compileOnly: true });
    if ("error" in result && result.error) {
      const error = result.error;
      const message = context.dump(error);
      error.dispose();
      throw new Error(`Invalid transform ${filePath}: ${String(message)}`);
    }
    if ("value" in result && result.value) result.value.dispose();
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

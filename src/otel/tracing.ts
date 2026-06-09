import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export type ServiceRole = "ingress" | "worker";

let sdk: NodeSDK | undefined;

export function initializeTracing(role: ServiceRole): void {
  if (process.env.OTEL_ENABLED === "false") return;

  sdk = new NodeSDK({
    serviceName: "sluice",
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "sluice",
      "sluice.role": role,
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
  });
  sdk.start();
}

export async function shutdownTracing(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}

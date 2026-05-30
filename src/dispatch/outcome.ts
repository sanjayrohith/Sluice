import type { DeliveryResult } from "./deliver.js";

export type DeliveryOutcome = "success" | "retryable" | "permanent";

export function classifyOutcome(result: DeliveryResult): DeliveryOutcome {
  if (result.status >= 200 && result.status < 300) {
    return "success";
  }

  if (result.status === 0 || result.status === 408 || result.status === 429 || result.status >= 500) {
    return "retryable";
  }

  return "permanent";
}

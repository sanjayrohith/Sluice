import { logger } from "./logger.js";

export type DomainEvent =
  | "ingress.accepted"
  | "ingress.duplicate"
  | "ingress.rejected"
  | "delivery.attempt"
  | "delivery.succeeded"
  | "delivery.retry_scheduled"
  | "delivery.dead";

export function logDomainEvent(
  event: DomainEvent,
  fields: Record<string, unknown> = {},
): void {
  logger.info({ ...fields, event }, event);
}

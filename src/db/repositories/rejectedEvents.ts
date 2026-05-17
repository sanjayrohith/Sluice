import { query } from "../pool.js";

export async function recordRejection(input: {
  sourceId: string;
  reason: string;
  rawBody: Buffer;
  headers: Record<string, string | undefined>;
}): Promise<void> {
  await query(
    `INSERT INTO rejected_events (source_id, reason, raw_body, headers)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [input.sourceId, input.reason, input.rawBody, JSON.stringify(input.headers)],
  );
}

import { query } from "../pool.js";

export async function insertEvent(input: {
  sourceId: string;
  dedupKey: string | null;
  rawBody: Buffer;
  headers: Record<string, string>;
}): Promise<number | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO events (source_id, dedup_key, raw_body, headers)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (source_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [input.sourceId, input.dedupKey, input.rawBody, JSON.stringify(input.headers)],
  );

  return result.rows[0] ? Number(result.rows[0].id) : null;
}

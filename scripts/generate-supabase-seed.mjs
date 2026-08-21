import { readFile, writeFile } from "node:fs/promises";

const pieces = JSON.parse(await readFile(new URL("../app/data/pieces.json", import.meta.url), "utf8"));
const projectId = "20270000-0000-4000-8000-000000000001";
const q = (value) => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const a = (values) => `array[${values.map(q).join(", ")}]::text[]`;

const rows = pieces.map((piece) => `(
  '${projectId}', ${q(`xlsx-${piece.id}`)}, ${q(piece.title)}, ${q(piece.composer)},
  ${piece.durationSeconds}, ${piece.grade ?? "null"}, ${piece.priceCents}, ${piece.owned}, ${a(piece.genres)},
  ${q(piece.sampleUrl)}, ${q(piece.purchaseUrl)}, ${q(piece.soloStatus)}::public.solo_status,
  ${q(piece.solos)}, ${q(piece.source)}, ${q(piece.subtitle)}, ${q(piece.note)}
)`).join(",\n");

const sql = `-- Generated from app/data/pieces.json. Re-run npm run seed:generate after an import.\n\ninsert into public.projects (id, name, target_min_seconds, target_max_seconds)\nvalues ('${projectId}', 'Jahreskonzert 2027', 1500, 1800)\non conflict (id) do update set\n  name = excluded.name,\n  target_min_seconds = excluded.target_min_seconds,\n  target_max_seconds = excluded.target_max_seconds,\n  updated_at = now();\n\ninsert into public.pieces (\n  project_id, import_key, title, composer, duration_seconds, grade, price_cents, owned, genres,\n  sample_url, purchase_url, solo_status, solos, source, subtitle, note\n) values\n${rows}\non conflict (project_id, import_key) do update set\n  title = excluded.title, composer = excluded.composer, duration_seconds = excluded.duration_seconds,\n  grade = excluded.grade, price_cents = excluded.price_cents, owned = excluded.owned, genres = excluded.genres,\n  sample_url = excluded.sample_url, purchase_url = excluded.purchase_url, solo_status = excluded.solo_status,\n  solos = excluded.solos, source = excluded.source, subtitle = excluded.subtitle, note = excluded.note, updated_at = now();\n`;

await writeFile(new URL("../supabase/seed.sql", import.meta.url), sql);

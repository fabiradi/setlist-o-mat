-- Generated from app/data/pieces.json. Re-run npm run seed:generate after an import.

insert into public.projects (id, name, target_min_seconds, target_max_seconds)
values ('20270000-0000-4000-8000-000000000001', 'Jahreskonzert 2027', 1500, 1800)
on conflict (id) do update set
  name = excluded.name,
  target_min_seconds = excluded.target_min_seconds,
  target_max_seconds = excluded.target_max_seconds,
  updated_at = now();

insert into public.pieces (
  project_id, import_key, title, composer, duration_seconds, grade, price_cents, owned, genres,
  sample_url, purchase_url, solo_status, solos, source, subtitle, note
) values
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-1', 'Fanfare am Morgen', 'Demo-Arrangement A',
  215, 2.5, 6900, false, array['Konzertwerk']::text[],
  null, null, 'none'::public.solo_status,
  null, 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-2', 'Neon Groove', 'Demo-Arrangement B',
  248, 3, 0, true, array['Funk']::text[],
  null, null, 'available'::public.solo_status,
  'Altsaxophon oder Trompete', 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-3', 'Cinema Skies', 'Demo-Arrangement C',
  332, 3.5, 9800, false, array['Filmmusik']::text[],
  null, null, 'unknown'::public.solo_status,
  null, 'Demodaten', 'Beispiel für noch offene Soli-Angaben', null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-4', 'Kupfer & Konfetti', 'Demo-Arrangement D',
  189, 2, 7400, false, array['Polka']::text[],
  null, null, 'available'::public.solo_status,
  'Tenorhorn', 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-5', 'Midnight Radio', 'Demo-Arrangement E',
  276, 3, 8600, false, array['Rock/Pop']::text[],
  null, null, 'none'::public.solo_status,
  null, 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-6', 'Wolken über Wien', 'Demo-Arrangement F',
  301, 2.5, 0, true, array['Walzer']::text[],
  null, null, 'available'::public.solo_status,
  'Flöte oder Oboe', 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-7', 'Brass Boulevard', 'Demo-Arrangement G',
  223, 3.5, 9200, false, array['Jazz']::text[],
  null, null, 'available'::public.solo_status,
  'Trompete, Posaune oder Saxophon', 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-8', 'Nordlicht', 'Demo-Arrangement H',
  354, 4, 11900, false, array['Konzertwerk']::text[],
  null, null, 'unknown'::public.solo_status,
  null, 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-9', 'Pixel Parade', 'Demo-Arrangement I',
  196, 2.5, 7800, false, array['Game Music']::text[],
  null, null, 'none'::public.solo_status,
  null, 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-10', 'Quiet River', 'Demo-Arrangement J',
  264, 2, 0, true, array['Ballade']::text[],
  null, null, 'available'::public.solo_status,
  'Flügelhorn oder Euphonium', 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-11', 'Salsa im Regen', 'Demo-Arrangement K',
  238, 3.5, 8900, false, array['Latin']::text[],
  null, null, 'available'::public.solo_status,
  'Percussion und Trompete', 'Demodaten', null, null
),
(
  '20270000-0000-4000-8000-000000000001', 'xlsx-12', 'Zugabe mit Sternen', 'Demo-Arrangement L',
  172, 2.5, 6500, false, array['Marsch']::text[],
  null, null, 'none'::public.solo_status,
  null, 'Demodaten', null, null
)
on conflict (project_id, import_key) do update set
  title = excluded.title, composer = excluded.composer, duration_seconds = excluded.duration_seconds,
  grade = excluded.grade, price_cents = excluded.price_cents, owned = excluded.owned, genres = excluded.genres,
  sample_url = excluded.sample_url, purchase_url = excluded.purchase_url, solo_status = excluded.solo_status,
  solos = excluded.solos, source = excluded.source, subtitle = excluded.subtitle, note = excluded.note, updated_at = now();

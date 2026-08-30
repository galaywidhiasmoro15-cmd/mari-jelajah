
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS locations_external_id_key ON public.locations(external_id) WHERE external_id IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule if any
DO $$ BEGIN
  PERFORM cron.unschedule('gobio-sync-locations');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'gobio-sync-locations',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--4a487d5f-b0e9-43d9-8eeb-8da945f06079.lovable.app/api/public/sync-locations',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_i8M3-vuTg7EklD87Gdp8xg_TA1OlwI1"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

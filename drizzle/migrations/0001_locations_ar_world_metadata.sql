
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS altitude_meters double precision,
  ADD COLUMN IF NOT EXISTS anchor_height_meters double precision DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS ar_scale double precision DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS ar_offset_x double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ar_offset_y double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ar_offset_z double precision DEFAULT 0;

UPDATE public.locations SET
  anchor_height_meters = COALESCE(anchor_height_meters, 1.5),
  ar_scale = COALESCE(ar_scale, 1.0),
  ar_offset_x = COALESCE(ar_offset_x, 0),
  ar_offset_y = COALESCE(ar_offset_y, 0),
  ar_offset_z = COALESCE(ar_offset_z, 0);

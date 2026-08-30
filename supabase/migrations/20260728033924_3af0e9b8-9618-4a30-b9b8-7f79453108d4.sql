
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  class text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, class)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO anon, authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students_all" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  content text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  radius_meters integer NOT NULL DEFAULT 10,
  kind text NOT NULL DEFAULT 'materi',
  question text,
  choices jsonb,
  correct_answer text,
  points integer NOT NULL DEFAULT 10,
  street_view_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO anon, authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_all" ON public.locations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  action text NOT NULL,
  answer text,
  is_correct boolean,
  points_earned integer NOT NULL DEFAULT 0,
  distance_meters double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_student_idx ON public.activities(student_id);
CREATE INDEX activities_location_idx ON public.activities(location_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO anon, authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities_all" ON public.activities FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_locations_updated BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 2 contoh lokasi (bisa dihapus dari dashboard admin)
INSERT INTO public.locations (title, description, content, lat, lng, radius_meters, kind, points)
VALUES
  ('Ekosistem Taman', 'Amati keanekaragaman tumbuhan di taman ini.', 'Materi: Ekosistem terdiri dari komponen biotik dan abiotik yang saling berinteraksi...', -6.200000, 106.816666, 10, 'materi', 10);

INSERT INTO public.locations (title, description, lat, lng, radius_meters, kind, question, choices, correct_answer, points)
VALUES
  ('Kuis Fotosintesis', 'Jawab soal di titik ini.', -6.200100, 106.816800, 10, 'soal',
   'Apa gas yang dihasilkan tumbuhan saat fotosintesis?',
   '["Karbondioksida","Oksigen","Nitrogen","Hidrogen"]'::jsonb,
   'Oksigen', 20);

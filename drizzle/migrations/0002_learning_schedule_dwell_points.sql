-- 1. Kolom baru pada locations (aman, semua punya default / nullable)
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'materi',
  ADD COLUMN IF NOT EXISTS media_image_url text,
  ADD COLUMN IF NOT EXISTS media_video_url text,
  ADD COLUMN IF NOT EXISTS schedule_date date,
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS dwell_seconds integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS award_points boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE public.locations SET activity_type = kind WHERE activity_type = 'materi' AND kind = 'soal';

-- 2. Pengaturan kegiatan global (satu baris)
CREATE TABLE IF NOT EXISTS public.event_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  name text NOT NULL DEFAULT 'Jelajah Biologi',
  event_date date,
  start_time time,
  end_time time,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_settings TO anon, authenticated;
GRANT ALL ON public.event_settings TO service_role;
ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_settings_all ON public.event_settings;
CREATE POLICY event_settings_all ON public.event_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
INSERT INTO public.event_settings (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

-- 3. Progres siswa per titik (sumber kebenaran dwell & poin)
CREATE TABLE IF NOT EXISTS public.student_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  dwell_seconds integer NOT NULL DEFAULT 0,
  last_tick_at timestamptz,
  status text NOT NULL DEFAULT 'belum_mulai',
  answered_correct boolean,
  points_awarded integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, location_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_progress TO anon, authenticated;
GRANT ALL ON public.student_progress TO service_role;
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_progress_all ON public.student_progress;
CREATE POLICY student_progress_all ON public.student_progress FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. Waktu server sebagai sumber waktu utama
CREATE OR REPLACE FUNCTION public.server_now()
RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now() $$;

-- 5. Helper: apakah titik sedang dalam jadwal aktif
CREATE OR REPLACE FUNCTION public.location_window(p_location uuid)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE WHEN l.schedule_date IS NOT NULL AND l.start_time IS NOT NULL
      THEN ((l.schedule_date + l.start_time) AT TIME ZONE COALESCE(e.timezone, 'Asia/Jakarta')) END,
    CASE WHEN l.schedule_date IS NOT NULL AND l.end_time IS NOT NULL
      THEN ((l.schedule_date + l.end_time) AT TIME ZONE COALESCE(e.timezone, 'Asia/Jakarta')) END
  FROM public.locations l
  LEFT JOIN public.event_settings e ON e.singleton
  WHERE l.id = p_location;
$$;

-- 6. Akumulasi dwell di server (client memanggil tiap beberapa detik saat di radius)
CREATE OR REPLACE FUNCTION public.tick_dwell(p_student uuid, p_location uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.locations%ROWTYPE;
  pr public.student_progress%ROWTYPE;
  w record;
  v_active boolean := true;
  v_delta integer := 0;
BEGIN
  SELECT * INTO l FROM public.locations WHERE id = p_location;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Titik tidak ditemukan'); END IF;

  SELECT * INTO w FROM public.location_window(p_location);
  IF w.starts_at IS NOT NULL AND now() < w.starts_at THEN v_active := false; END IF;
  IF w.ends_at IS NOT NULL AND now() > w.ends_at THEN v_active := false; END IF;

  INSERT INTO public.student_progress (student_id, location_id, last_tick_at, status)
  VALUES (p_student, p_location, now(), 'sedang_belajar')
  ON CONFLICT (student_id, location_id) DO NOTHING;

  SELECT * INTO pr FROM public.student_progress
    WHERE student_id = p_student AND location_id = p_location FOR UPDATE;

  IF v_active AND pr.completed_at IS NULL AND pr.dwell_seconds < l.dwell_seconds THEN
    v_delta := LEAST(15, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(pr.last_tick_at, now()))))::int));
    UPDATE public.student_progress SET
      dwell_seconds = LEAST(l.dwell_seconds, dwell_seconds + v_delta),
      last_tick_at = now(),
      status = CASE WHEN LEAST(l.dwell_seconds, dwell_seconds + v_delta) >= l.dwell_seconds
                    THEN 'dwell_selesai' ELSE 'sedang_belajar' END,
      updated_at = now()
    WHERE id = pr.id
    RETURNING * INTO pr;
  ELSE
    UPDATE public.student_progress SET last_tick_at = now(), updated_at = now()
    WHERE id = pr.id RETURNING * INTO pr;
  END IF;

  RETURN json_build_object(
    'dwell_seconds', pr.dwell_seconds,
    'required_seconds', l.dwell_seconds,
    'status', pr.status,
    'active', v_active,
    'points_awarded', pr.points_awarded,
    'completed', pr.completed_at IS NOT NULL,
    'starts_at', w.starts_at,
    'ends_at', w.ends_at,
    'server_now', now()
  );
END;
$$;

-- 7. Klaim poin (aman dari double point & race condition)
CREATE OR REPLACE FUNCTION public.claim_activity(p_student uuid, p_location uuid, p_answer text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.locations%ROWTYPE;
  pr public.student_progress%ROWTYPE;
  w record;
  v_needs_answer boolean;
  v_correct boolean := NULL;
  v_award integer := 0;
  v_points integer;
BEGIN
  SELECT * INTO l FROM public.locations WHERE id = p_location;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Titik tidak ditemukan'); END IF;

  SELECT * INTO w FROM public.location_window(p_location);
  IF w.starts_at IS NOT NULL AND now() < w.starts_at THEN
    RETURN json_build_object('error', 'Titik belum aktif.'); END IF;
  IF w.ends_at IS NOT NULL AND now() > w.ends_at THEN
    RETURN json_build_object('error', 'Waktu titik ini sudah berakhir.'); END IF;

  INSERT INTO public.student_progress (student_id, location_id)
  VALUES (p_student, p_location) ON CONFLICT (student_id, location_id) DO NOTHING;

  SELECT * INTO pr FROM public.student_progress
    WHERE student_id = p_student AND location_id = p_location FOR UPDATE;

  IF pr.dwell_seconds < l.dwell_seconds THEN
    RETURN json_build_object('error', 'Waktu belajar di titik ini belum terpenuhi.',
      'dwell_seconds', pr.dwell_seconds, 'required_seconds', l.dwell_seconds);
  END IF;

  v_needs_answer := l.activity_type LIKE '%soal%';

  IF v_needs_answer THEN
    IF p_answer IS NULL THEN RETURN json_build_object('error', 'Jawaban belum dipilih.'); END IF;
    v_correct := (p_answer = l.correct_answer);
    INSERT INTO public.activities (student_id, location_id, action, answer, is_correct, points_earned)
    VALUES (p_student, p_location, 'answer', p_answer, v_correct, 0);
    IF NOT v_correct THEN
      UPDATE public.student_progress SET answered_correct = false, updated_at = now() WHERE id = pr.id;
      RETURN json_build_object('correct', false, 'points_earned', 0);
    END IF;
  END IF;

  IF pr.completed_at IS NOT NULL THEN
    RETURN json_build_object('already', true, 'correct', v_correct, 'points_earned', 0,
      'total_points', (SELECT points FROM public.students WHERE id = p_student));
  END IF;

  IF l.award_points THEN v_award := l.points; END IF;

  UPDATE public.students
    SET points = points + v_award,
        level = GREATEST(1, FLOOR((points + v_award) / 50) + 1),
        updated_at = now()
    WHERE id = p_student
    RETURNING points INTO v_points;

  UPDATE public.student_progress SET
    points_awarded = v_award,
    answered_correct = v_correct,
    completed_at = now(),
    status = 'selesai',
    updated_at = now()
  WHERE id = pr.id;

  INSERT INTO public.activities (student_id, location_id, action, is_correct, points_earned)
  VALUES (p_student, p_location,
          CASE WHEN v_needs_answer THEN 'award_soal' ELSE 'award_materi' END,
          v_correct, v_award);

  RETURN json_build_object('correct', v_correct, 'points_earned', v_award,
    'total_points', v_points, 'completed', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.server_now() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.location_window(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_dwell(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_activity(uuid, uuid, text) TO anon, authenticated;
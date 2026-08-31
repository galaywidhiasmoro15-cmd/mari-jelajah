import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStudentId } from "@/lib/session";
import { levelFromPoints } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Eye, Glasses, X, Compass } from "lucide-react";
import { ARScene, type ARActivation, type ARStatus, type ARWorldLocation } from "@/components/ar/ARScene";
import { ARCapabilityNotice } from "@/components/ar/ARCapabilityNotice";
import { detectARCapabilities, type ARCapabilities } from "@/lib/ar/webxr";
import { DeviceOrientationPose } from "@/lib/ar/devicePose";

export const Route = createFileRoute("/ar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mode AR Dunia Nyata — BioWes" },
      {
        name: "description",
        content:
          "Titik Biologi ditempatkan sebagai objek 3D pada koordinat dunia nyata: marker, materi, dan soal tetap menempel di lokasinya.",
      },
      { property: "og:title", content: "Mode AR Dunia Nyata — BioWes" },
      {
        property: "og:description",
        content: "AR berbasis koordinat dunia (WebXR bila tersedia, fallback GPS + sensor) untuk belajar Biologi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ARPage,
});

type Student = { id: string; name: string; class: string; points: number; level: number };
type Location = ARWorldLocation;

function ARPage() {
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [stereo, setStereo] = useState(false);
  const [caps, setCaps] = useState<ARCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [status, setStatus] = useState<ARStatus | null>(null);
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = openId;

  useEffect(() => {
    void detectARCapabilities().then(setCaps);
  }, []);

  useEffect(() => {
    const id = getStudentId();
    if (id) {
      void supabase
        .from("students")
        .select("*")
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setStudent(data as Student);
        });
    }
    void supabase
      .from("locations")
      .select("*")
      .then(({ data }) => setLocations(((data as unknown as Location[]) || []).filter((l) => l.lat && l.lng)));
  }, []);

  const awardMateri = useCallback(
    async (loc: Location) => {
      if (!student) return;
      const { data: prev } = await supabase
        .from("activities")
        .select("id")
        .eq("student_id", student.id)
        .eq("location_id", loc.id)
        .eq("action", "award_materi")
        .limit(1);
      await supabase.from("activities").insert({ student_id: student.id, location_id: loc.id, action: "open_materi" });
      if (!prev || prev.length === 0) {
        const np = student.points + loc.points;
        await supabase.from("students").update({ points: np, level: levelFromPoints(np) }).eq("id", student.id);
        await supabase
          .from("activities")
          .insert({ student_id: student.id, location_id: loc.id, action: "award_materi", points_earned: loc.points });
        setStudent({ ...student, points: np, level: levelFromPoints(np) });
        toast.success(`+${loc.points} poin!`);
      }
      setAnswered("done");
    },
    [student],
  );

  const answerSoal = useCallback(
    async (loc: Location, choice: string) => {
      if (!student) return;
      const correct = choice === loc.correct_answer;
      let earned = 0;
      if (correct) {
        const { data: prev } = await supabase
          .from("activities")
          .select("id")
          .eq("student_id", student.id)
          .eq("location_id", loc.id)
          .eq("is_correct", true)
          .limit(1);
        if (!prev || prev.length === 0) {
          earned = loc.points;
          const np = student.points + earned;
          await supabase.from("students").update({ points: np, level: levelFromPoints(np) }).eq("id", student.id);
          setStudent({ ...student, points: np, level: levelFromPoints(np) });
        }
      }
      await supabase.from("activities").insert({
        student_id: student.id,
        location_id: loc.id,
        action: "answer",
        answer: choice,
        is_correct: correct,
        points_earned: earned,
      });
      setAnswered(correct ? "correct" : "wrong");
      if (correct) toast.success(earned > 0 ? `Benar! +${earned} poin` : "Benar!");
      else toast.error("Belum tepat, coba lagi.");
    },
    [student],
  );

  const onActivate = useCallback(
    (a: ARActivation) => {
      const loc = locations.find((l) => l.id === a.locationId);
      if (!loc) return;
      if (a.type === "open") {
        setOpenId(loc.id);
        setAnswered(null);
      } else if (a.type === "choice") {
        void answerSoal(loc, a.choice);
      } else if (a.type === "finish") {
        void awardMateri(loc);
      } else {
        setOpenId(null);
        setAnswered(null);
      }
    },
    [locations, answerSoal, awardMateri],
  );

  // Buka otomatis saat siswa masuk radius; tutup saat keluar (histeresis di ARScene).
  const onStatus = useCallback((s: ARStatus) => {
    setStatus(s);
    const current = openIdRef.current;
    if (!current) {
      const nearest = [...s.inRange].sort((a, b) => a.distance - b.distance)[0];
      if (nearest) {
        setOpenId(nearest.id);
        setAnswered(null);
      }
      return;
    }
    if (!s.inRange.some((r) => r.id === current)) {
      setOpenId(null);
      setAnswered(null);
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const perm = await DeviceOrientationPose.requestPermission();
    if (perm === "denied") {
      setError("Izin sensor gerak ditolak. Mode AR berjalan terbatas tanpa mengikuti arah pandang.");
    }
    setStarted(true);
    try {
      await (document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> }).requestFullscreen?.();
    } catch {
      /* opsional */
    }
  }, []);

  const scene = useMemo(
    () => (
      <ARScene
        locations={locations}
        openId={openId}
        answered={answered}
        stereo={stereo}
        preferWebXR={!!caps?.webxrAR}
        onActivate={onActivate}
        onStatus={onStatus}
        onError={setError}
      />
    ),
    [locations, openId, answered, stereo, caps?.webxrAR, onActivate, onStatus],
  );

  if (!started) {
    return (
      <div className="merapi-bg min-h-screen text-white">
        <Toaster position="top-center" richColors />
        <div className="flex min-h-screen items-center justify-center bg-emerald-950/70 p-6">
          <div className="w-full max-w-sm space-y-5 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/15 ring-4 ring-white/20">
              <Glasses className="h-10 w-10" />
            </div>
            <h1 className="text-2xl font-black">Mode AR BioWes</h1>
            <p className="text-sm text-emerald-50/90">
              Titik pembelajaran ditempatkan sebagai objek 3D pada koordinat dunia nyata. Berjalanlah menuju
              titik, lalu <b>pandang</b> marker, materi, atau pilihan jawaban ±2 detik untuk memilih.
            </p>
            <ARCapabilityNotice caps={caps} error={error} />
            <Button onClick={start} className="w-full bg-emerald-500 hover:bg-emerald-600">
              <Eye className="mr-2 h-4 w-4" /> Mulai Mode AR
            </Button>
            <button onClick={() => setStereo((s) => !s)} className="text-xs underline">
              Tampilan: {stereo ? "Stereo (Cardboard)" : "Layar penuh"}
            </button>
            <div>
              <button onClick={() => navigate({ to: "/student" })} className="text-xs text-emerald-100/80 underline">
                Kembali ke peta
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      <Toaster position="top-center" richColors />
      {scene}
      {stereo && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-black" />}
      {student && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white/90 ring-1 ring-white/20">
          {student.name} • Lv {student.level} • {student.points} poin
        </div>
      )}
      {status?.nearest && (
        <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-white/25">
          {status.nearest.title} • {Math.round(status.nearest.distance)} m
        </div>
      )}
      {error && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 max-w-[80%] -translate-x-1/2 rounded-lg bg-red-600/85 px-3 py-1 text-center text-[11px] text-white">
          {error}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-white/85">
        <span className="flex items-center gap-1">
          <Compass className="h-3 w-3" />
          {Math.round(status?.heading ?? 0)}°
        </span>
        <span>
          {status?.trackingMode === "webxr" ? "AR penuh (WebXR)" : "AR kompatibilitas (GPS + sensor)"}
          {status?.accuracy ? ` • ±${Math.round(status.accuracy)} m` : " • GPS…"}
        </span>
      </div>
      <button
        onClick={() => {
          document.exitFullscreen?.().catch(() => {});
          navigate({ to: "/student" });
        }}
        className="absolute right-2 top-2 z-50 rounded-full bg-black/60 p-2 text-white"
        aria-label="Keluar mode AR"
      >
        <X className="h-4 w-4" />
      </button>
      <button
        onClick={() => setStereo((s) => !s)}
        className="absolute left-2 bottom-6 z-50 rounded-full bg-black/60 px-3 py-2 text-[11px] text-white"
      >
        {stereo ? "1 layar" : "Cardboard"}
      </button>
    </div>
  );
}

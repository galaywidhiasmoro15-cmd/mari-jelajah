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
import {
  DWELL_REQUIRED_MS,
  addDwellMs,
  formatCountdown,
  getDwellMs,
  markDwellComplete,
} from "@/lib/dwell";

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
  const [dwell, setDwell] = useState<Record<string, number>>({});
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const inRangeRef = useRef<string[]>([]);
  const earnedRef = useRef<Set<string>>(new Set());
  earnedRef.current = earned;
  const studentIdRef = useRef<string | null>(null);
  studentIdRef.current = student?.id ?? null;

  // Titik yang poinnya sudah pernah didapat siswa ini
  useEffect(() => {
    if (!student) return;
    void supabase
      .from("activities")
      .select("location_id, action, is_correct")
      .eq("student_id", student.id)
      .then(({ data }) => {
        const set = new Set<string>();
        (data || []).forEach((a: { location_id: string; action: string; is_correct: boolean | null }) => {
          if (a.action === "award_materi" || a.is_correct === true) set.add(a.location_id);
        });
        set.forEach((id) => markDwellComplete(student.id, id));
        setEarned(set);
      });
  }, [student?.id]);

  // Hitung mundur 2 menit selama siswa berada di dalam radius
  useEffect(() => {
    const tick = 1000;
    const id = window.setInterval(() => {
      const sid = studentIdRef.current;
      if (!sid) return;
      setDwell((prev) => {
        const next = { ...prev };
        inRangeRef.current.forEach((locId) => {
          if (earnedRef.current.has(locId)) return;
          if ((next[locId] ?? getDwellMs(sid, locId)) >= DWELL_REQUIRED_MS) return;
          next[locId] = addDwellMs(sid, locId, tick);
        });
        return next;
      });
    }, tick);
    return () => window.clearInterval(id);
  }, []);

  const remainingFor = useCallback(
    (locId: string) => {
      if (!student || earned.has(locId)) return 0;
      const ms = dwell[locId] ?? getDwellMs(student.id, locId);
      return Math.max(0, DWELL_REQUIRED_MS - ms);
    },
    [student, dwell, earned],
  );

  async function lockLandscape() {
    try {
      const s = screen as unknown as {
        orientation?: { lock?: (o: string) => Promise<void>; unlock?: () => void };
        lockOrientation?: (o: string) => boolean;
        mozLockOrientation?: (o: string) => boolean;
      };
      if (s.orientation?.lock) {
        await s.orientation.lock("landscape");
      } else if (s.lockOrientation) {
        s.lockOrientation("landscape");
      } else if (s.mozLockOrientation) {
        s.mozLockOrientation("landscape");
      }
    } catch {
      /* beberapa perangkat memerlukan fullscreen dulu */
    }
  }

  function unlockOrientation() {
    try {
      const s = screen as unknown as {
        orientation?: { unlock?: () => void };
        unlockOrientation?: () => void;
        mozUnlockOrientation?: () => void;
      };
      if (s.orientation?.unlock) s.orientation.unlock();
      else if (s.unlockOrientation) s.unlockOrientation();
      else if (s.mozUnlockOrientation) s.mozUnlockOrientation();
    } catch {
      /* abaikan */
    }
  }

  useEffect(() => {
    void detectARCapabilities().then(setCaps);
    void lockLandscape();
    return () => unlockOrientation();
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
      if (earned.has(loc.id)) {
        toast.info("Poin titik ini sudah kamu dapatkan.");
        setAnswered("done");
        return;
      }
      const remaining = Math.max(0, DWELL_REQUIRED_MS - (dwell[loc.id] ?? getDwellMs(student.id, loc.id)));
      if (remaining > 0) {
        toast.error(`Bertahan ${formatCountdown(remaining)} lagi di titik ini untuk mendapat poin.`);
        return;
      }
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
      setEarned((s2) => new Set(s2).add(loc.id));
      setAnswered("done");
    },
    [student, dwell, earned],
  );

  const answerSoal = useCallback(
    async (loc: Location, choice: string) => {
      if (!student) return;
      const remainingSoal = earned.has(loc.id)
        ? 0
        : Math.max(0, DWELL_REQUIRED_MS - (dwell[loc.id] ?? getDwellMs(student.id, loc.id)));
      if (remainingSoal > 0) {
        toast.error(`Pelajari dulu — ${formatCountdown(remainingSoal)} lagi sebelum menjawab.`);
        return;
      }
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
      if (correct) {
        setEarned((s2) => new Set(s2).add(loc.id));
        toast.success(earned > 0 ? `Benar! +${earned} poin` : "Benar!");
      } else toast.error("Belum tepat, coba lagi.");
    },
    [student, dwell, earned],
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
    inRangeRef.current = s.inRange.map((r) => r.id);
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
      await lockLandscape();
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
      {(() => {
        const activeId = openId ?? status?.inRange?.[0]?.id ?? null;
        if (!activeId || !student) return null;
        const done = earned.has(activeId);
        const remaining = remainingFor(activeId);
        return (
          <div
            className={`pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-xl px-3 py-1.5 text-center ring-1 ${
              done || remaining === 0 ? "bg-emerald-600/80 ring-emerald-200/40" : "bg-black/60 ring-white/25"
            }`}
          >
            <div className="text-[9px] uppercase tracking-wide text-white/80">
              {done ? "Poin sudah didapat" : remaining === 0 ? "Waktu terpenuhi" : "Waktu belajar tersisa"}
            </div>
            {!done && <div className="text-lg font-black tabular-nums text-white">{formatCountdown(remaining)}</div>}
          </div>
        );
      })()}
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
          unlockOrientation();
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStudentId } from "@/lib/session";
import { haversineMeters, levelFromPoints, bearingDeg, angleDelta } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Eye, Glasses, X, Compass, ChevronLeft, ChevronRight, Navigation } from "lucide-react";

export const Route = createFileRoute("/ar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mode VR Cardboard — GoBio Explorer" },
      {
        name: "description",
        content:
          "Jelajahi titik Biologi lewat kamera ponsel dalam mode VR Cardboard: berjalan, lihat marker melayang, dan jawab soal dengan pandangan.",
      },
      { property: "og:title", content: "Mode VR Cardboard — GoBio Explorer" },
      {
        property: "og:description",
        content: "AR/VR berbasis kamera & GPS untuk belajar Biologi di dunia nyata.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ARPage,
});

type Student = { id: string; name: string; class: string; points: number; level: number };
type Location = {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  lat: number;
  lng: number;
  radius_meters: number;
  kind: "materi" | "soal";
  question: string | null;
  choices: string[] | null;
  correct_answer: string | null;
  points: number;
};

const H_FOV = 70; // derajat, horizontal per mata
const DWELL_MS = 1800;
const MAX_GPS_TOLERANCE_METERS = 20;

function ARPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sensorOk = useRef(false);
  const [needCalib, setNeedCalib] = useState(false);

  const [started, setStarted] = useState(false);
  const [stereo, setStereo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [open, setOpen] = useState<Location | null>(null);
  const [gaze, setGaze] = useState<{ id: string; progress: number } | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);

  // data
  useEffect(() => {
    const id = getStudentId();
    if (id) {
      supabase.from("students").select("*").eq("id", id).maybeSingle().then(({ data }) => {
        if (data) setStudent(data as Student);
      });
    }
    supabase.from("locations").select("*").then(({ data }) => setLocations((data as Location[]) || []));
  }, []);

  // GPS
  useEffect(() => {
    if (!started || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => setError("GPS: " + err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [started]);

  // Orientasi kepala — nilai mentah disimpan di ref, lalu di-smoothing di rAF loop
  // supaya marker tidak jitter / hilang-muncul karena noise sensor kompas.
  const rawHeading = useRef(0);
  const rawPitch = useRef(0);
  const smoothHeading = useRef(0);
  const smoothPitch = useRef(0);
  const hasOrient = useRef(false);

  useEffect(() => {
    if (!started) return;
    const onOrient = (e: any) => {
      const compass = typeof e.webkitCompassHeading === "number" ? e.webkitCompassHeading : null;
      if (compass !== null) rawHeading.current = compass;
      else if (typeof e.alpha === "number") rawHeading.current = (360 - e.alpha) % 360;
      // Pitch: saat landscape sumbu berputar — gunakan gamma; saat portrait gunakan beta-90
      const landscape = Math.abs((window.orientation as number) ?? 0) === 90 ||
        (typeof screen !== "undefined" && (screen.orientation?.type ?? "").startsWith("landscape"));
      const raw = landscape
        ? (typeof e.gamma === "number" ? e.gamma : 0)
        : (typeof e.beta === "number" ? e.beta - 90 : 0);
      rawPitch.current = Math.max(-60, Math.min(60, raw));
      sensorOk.current = true;
      hasOrient.current = true;
    };
    window.addEventListener("deviceorientationabsolute", onOrient, true);
    window.addEventListener("deviceorientation", onOrient, true);

    // Smoothing loop: lerp sudut terpendek agar gerakan halus & stabil
    let raf = 0;
    const SMOOTH = 0.12; // makin kecil makin halus
    const tick = () => {
      if (hasOrient.current) {
        smoothHeading.current =
          (smoothHeading.current + angleDelta(rawHeading.current, smoothHeading.current) * SMOOTH + 360) % 360;
        smoothPitch.current += (rawPitch.current - smoothPitch.current) * SMOOTH;
        setHeading((h) => (Math.abs(angleDelta(smoothHeading.current, h)) > 0.15 ? smoothHeading.current : h));
        setPitch((p) => (Math.abs(smoothPitch.current - p) > 0.15 ? smoothPitch.current : p));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Jika sensor tak pernah mengirim data, tampilkan petunjuk kalibrasi
    const timer = setTimeout(() => { if (!sensorOk.current) setNeedCalib(true); }, 4000);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrient, true);
      window.removeEventListener("deviceorientation", onOrient, true);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [started]);

  useEffect(() => { if (sensorOk.current) setNeedCalib(false); }, [heading]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const DOE: any = (window as any).DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === "function") {
        try { await DOE.requestPermission(); } catch { /* ditolak, tetap lanjut */ }
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setStarted(true);
      // pasang stream setelah render
      setTimeout(() => {
        [videoRef.current, video2Ref.current].forEach((v) => {
          if (v) { v.srcObject = stream; v.play().catch(() => {}); }
        });
      }, 50);
      try { await (document.documentElement as any).requestFullscreen?.(); } catch { /* opsional */ }
      try { (screen.orientation as any)?.lock?.("landscape").catch(() => {}); } catch { /* opsional */ }
    } catch (e: any) {
      setError("Tidak bisa mengakses kamera: " + (e?.message ?? e));
    }
  }, []);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  // Pasang ulang stream saat mode stereo berubah
  useEffect(() => {
    const s = streamRef.current;
    if (!s) return;
    [videoRef.current, video2Ref.current].forEach((v) => {
      if (v && v.srcObject !== s) { v.srcObject = s; v.play().catch(() => {}); }
    });
  }, [stereo, started]);

  const enriched = useMemo(
    () =>
      locations.map((l) => {
        const dist = pos ? haversineMeters(pos, { lat: l.lat, lng: l.lng }) : Infinity;
        const brg = pos ? bearingDeg(pos, { lat: l.lat, lng: l.lng }) : 0;
        // GPS ponsel sering meleset beberapa meter. Tambahkan toleransi berdasarkan
        // akurasi aktual agar titik tidak gagal terbuka saat siswa sudah tiba.
        const gpsTolerance = pos ? Math.min(Math.max(pos.accuracy, 0), MAX_GPS_TOLERANCE_METERS) : 0;
        const unlockDistance = Math.max(1, Number(l.radius_meters) || 0) + gpsTolerance;
        return { ...l, dist, brg, unlockDistance, inRange: dist <= unlockDistance };
      }),
    [locations, pos],
  );

  // Objek dunia yang bisa dipandang
  type WorldItem = {
    id: string;
    bearing: number;
    elev: number;
    node: React.ReactNode;
    onActivate?: () => void;
    width?: number;
    headLocked?: boolean; // item mengikuti arah pandang (tanpa parallax antar-mata)
  };

  const awardMateri = useCallback(async (loc: Location) => {
    if (!student) return;
    const { data: prev } = await supabase.from("activities").select("id")
      .eq("student_id", student.id).eq("location_id", loc.id).eq("action", "award_materi").limit(1);
    await supabase.from("activities").insert({ student_id: student.id, location_id: loc.id, action: "open_materi" });
    if (!prev || prev.length === 0) {
      const np = student.points + loc.points;
      await supabase.from("students").update({ points: np, level: levelFromPoints(np) }).eq("id", student.id);
      await supabase.from("activities").insert({ student_id: student.id, location_id: loc.id, action: "award_materi", points_earned: loc.points });
      setStudent({ ...student, points: np, level: levelFromPoints(np) });
      toast.success(`+${loc.points} poin!`);
    }
    setAnswered("done");
  }, [student]);

  const answerSoal = useCallback(async (loc: Location, choice: string) => {
    if (!student) return;
    const correct = choice === loc.correct_answer;
    let earned = 0;
    if (correct) {
      const { data: prev } = await supabase.from("activities").select("id")
        .eq("student_id", student.id).eq("location_id", loc.id).eq("is_correct", true).limit(1);
      if (!prev || prev.length === 0) {
        earned = loc.points;
        const np = student.points + earned;
        await supabase.from("students").update({ points: np, level: levelFromPoints(np) }).eq("id", student.id);
        setStudent({ ...student, points: np, level: levelFromPoints(np) });
      }
    }
    await supabase.from("activities").insert({
      student_id: student.id, location_id: loc.id, action: "answer",
      answer: choice, is_correct: correct, points_earned: earned,
    });
    setAnswered(correct ? "correct" : "wrong");
    if (correct) toast.success(earned > 0 ? `Benar! +${earned} poin` : "Benar!");
    else toast.error("Belum tepat, coba lagi.");
  }, [student]);

  // Auto-buka materi/soal begitu siswa masuk radius (tanpa klik),
  // dan auto-tutup begitu siswa keluar radius (panel hanya muncul di dalam radius).
  useEffect(() => {
    if (!open) {
      const near = enriched
        .filter((l) => l.inRange)
        .sort((a, b) => a.dist - b.dist)[0];
      if (near) {
        setOpen(near as Location);
        setAnswered(null);
      }
      return;
    }
    // Panel yang terbuka: tutup saat siswa menjauh keluar radius.
    // Histeresis +6 m agar noise GPS di pinggir radius tidak bikin panel buka-tutup.
    const current = enriched.find((l) => l.id === open.id);
    if (current && current.dist > current.unlockDistance + 6) {
      setOpen(null);
      setAnswered(null);
    }
  }, [enriched, open]);

  const items: WorldItem[] = useMemo(() => {
    if (open) {
      // Panel mengikuti arah pandang (head-locked) agar selalu terlihat melayang.
      // Ukuran kecil (~1/4 layar) & tersusun rapat di tengah agar nyaman dilihat
      // dari jarak dekat di Cardboard. Pilihan jawaban disusun 2 kolom supaya
      // tidak memanjang ke bawah sampai keluar layar.
      const panelBearing = heading;
      const list: WorldItem[] = [
        {
          id: "panel",
          bearing: panelBearing,
          elev: 11,
          width: 210,
          headLocked: true,
          node: (
            <div className="rounded-xl bg-emerald-950/85 p-2 text-white ring-1 ring-emerald-400/70 backdrop-blur">
              <div className="text-[11px] font-bold leading-tight">{open.title}</div>
              <div className="mt-1 max-h-16 overflow-hidden text-[9px] leading-snug text-emerald-50/90">
                {open.kind === "soal" ? open.question : open.content || open.description}
              </div>
            </div>
          ),
        },
      ];
      if (open.kind === "soal" && !answered) {
        (open.choices || []).slice(0, 5).forEach((c, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          list.push({
            id: "c" + i,
            bearing: panelBearing + (col === 0 ? -8 : 8),
            elev: 2 - row * 8,
            width: 150,
            headLocked: true,
            onActivate: () => answerSoal(open, c),
            node: (
              <div className="rounded-lg bg-white/90 px-2 py-1 text-center text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-500/60">
                {c}
              </div>
            ),
          });
        });
      }
      if (open.kind === "materi" && !answered) {
        list.push({
          id: "selesai",
          bearing: panelBearing,
          elev: -3,
          width: 170,
          headLocked: true,
          onActivate: () => awardMateri(open),
          node: (
            <div className="rounded-lg bg-emerald-500/90 px-2 py-1 text-center text-[10px] font-bold text-white ring-1 ring-white/70">
              Selesai baca (+{open.points} poin)
            </div>
          ),
        });
      }
      if (answered) {
        list.push({
          id: "lanjut",
          bearing: panelBearing,
          elev: -3,
          width: 160,
          headLocked: true,
          onActivate: () => { setOpen(null); setAnswered(null); },
          node: (
            <div className="rounded-lg bg-slate-900/80 px-2 py-1 text-center text-[9px] font-semibold text-white ring-1 ring-white/40">
              Lanjut cari titik lain
            </div>
          ),
        });
      }
      return list;
    }

    return enriched.map((l) => {
      const isSoal = l.kind === "soal";
      // Beacon melayang: biru = materi, merah = soal
      const glow = isSoal ? "drop-shadow(0 0 14px rgba(239,68,68,.95))" : "drop-shadow(0 0 14px rgba(59,130,246,.95))";
      const arrowColor = isSoal ? "text-red-500" : "text-blue-500";
      const labelBg = isSoal ? "bg-red-600/85 ring-red-300/70" : "bg-blue-600/85 ring-blue-300/70";
      // Ketinggian mengikuti jarak: jauh = melayang tinggi di langit (+24°),
      // makin dekat makin turun hingga menempel di "tanah" (-8°) saat di dalam radius
      const far = !isFinite(l.dist);
      const closeness = far ? 1 : Math.max(0, Math.min(1, (l.dist - l.radius_meters) / 50));
      const elev = -8 + closeness * 32;
      // Ukuran marker juga mengecil saat jauh
      const width = Math.round(150 + (1 - closeness) * 60);
      return {
        id: l.id,
        bearing: l.brg,
        elev,
        width,
        onActivate: l.inRange ? () => { setOpen(l); setAnswered(null); } : undefined,
        node: (
          <div className="flex flex-col items-center">
            {/* Panah beacon melayang dengan animasi naik-turun */}
            <div className="animate-bounce" style={{ filter: glow }}>
              <svg width="64" height="72" viewBox="0 0 64 72" className={arrowColor} fill="currentColor">
                <polygon points="20,4 44,4 44,30 60,30 32,62 4,30 20,30" stroke="white" strokeWidth="3" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Tiang cahaya ke titik di "tanah" */}
            <div className={`h-10 w-1.5 rounded-full ${isSoal ? "bg-red-400/70" : "bg-blue-400/70"}`} style={{ filter: glow }} />
            {/* Label titik */}
            <div className={`mt-1 rounded-full px-3 py-1 text-center ring-2 backdrop-blur ${l.inRange ? labelBg + " text-white" : "bg-slate-900/65 ring-white/30 text-white/85"}`}>
              <div className="text-[11px] font-bold leading-tight">{l.title}</div>
              <div className="text-[10px] opacity-90">
                {isFinite(l.dist) ? `${Math.round(l.dist)} m` : "—"} {l.inRange ? "• terbuka!" : ""}
              </div>
            </div>
          </div>
        ),
      };
    });
  }, [enriched, open, heading, answered, answerSoal, awardMateri]);

  const nearest = useMemo(() => {
    const list = enriched.filter((l) => isFinite(l.dist)).sort((a, b) => a.dist - b.dist);
    return list[0] ?? null;
  }, [enriched]);

  // Gaze / dwell
  const gazeStart = useRef<{ id: string; t: number } | null>(null);
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const tick = () => {
      const target = items.find((it) => {
        if (!it.onActivate) return false;
        const dx = Math.abs(angleDelta(it.bearing, heading));
        const dy = Math.abs(it.elev - pitch);
        // Pilihan jawaban disusun 2 kolom (±8°) sehingga ambang horizontal
        // lebih longgar; ambang vertikal lebih ketat agar baris tidak tertukar.
        return dx < 10 && dy < 6;
      });
      if (!target) {
        gazeStart.current = null;
        setGaze((g) => (g ? null : g));
      } else {
        if (!gazeStart.current || gazeStart.current.id !== target.id) {
          gazeStart.current = { id: target.id, t: performance.now() };
        }
        const p = Math.min(1, (performance.now() - gazeStart.current.t) / DWELL_MS);
        setGaze({ id: target.id, progress: p });
        if (p >= 1) {
          gazeStart.current = null;
          setGaze(null);
          target.onActivate?.();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items, heading, pitch, started]);

  if (!started) {
    return (
      <div className="merapi-bg min-h-screen text-white">
        <Toaster position="top-center" richColors />
        <div className="min-h-screen bg-emerald-950/70 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-5 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/15 ring-4 ring-white/20">
              <Glasses className="h-10 w-10" />
            </div>
            <h1 className="text-2xl font-black">Mode VR Cardboard</h1>
            <p className="text-sm text-emerald-50/90">
              Kamera belakang jadi latar nyata, marker titik melayang sesuai arah kompas.
              Pasang HP di Cardboard, jalan mencari titik, lalu <b>pandang</b> marker/pilihan
              jawaban selama ±2 detik untuk memilih.
            </p>
            <ul className="text-left text-xs text-emerald-50/80 space-y-1">
              <li>• Izinkan akses <b>kamera</b>, <b>lokasi</b>, dan <b>sensor gerak</b>.</li>
              <li>• Gunakan HP dalam posisi <b>landscape</b>.</li>
              <li>• Kalibrasi kompas: gerakkan HP membentuk angka 8.</li>
            </ul>
            {error && <div className="rounded-lg bg-red-500/90 p-2 text-xs">{error}</div>}
            <Button onClick={start} className="w-full bg-emerald-500 hover:bg-emerald-600">
              <Eye className="mr-2 h-4 w-4" /> Mulai Mode VR
            </Button>
            <div className="flex items-center justify-center gap-2 text-xs">
              <button onClick={() => setStereo((s) => !s)} className="underline">
                Tampilan: {stereo ? "Stereo (Cardboard)" : "Layar penuh (AR biasa)"}
              </button>
            </div>
            <button onClick={() => navigate({ to: "/student" })} className="text-xs text-emerald-100/80 underline">
              Kembali ke peta
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderEye = (eye: 0 | 1, videoEl: React.RefObject<HTMLVideoElement | null>) => (
    <div className="relative h-full flex-1 overflow-hidden bg-black">
      <video
        ref={videoEl}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Objek dunia */}
      {items.map((it) => {
        const dx = angleDelta(it.bearing, heading);
        const dy = it.elev - pitch;
        // Parallax hanya untuk objek dunia (beacon). Item head-locked (panel
        // soal/materi) harus identik di kedua mata supaya terbaca jelas & center
        // di mode stereo maupun layar penuh.
        const parallax = stereo && !it.headLocked ? (eye === 0 ? 1.2 : -1.2) : 0;
        const offscreen = Math.abs(dx) > H_FOV / 2;
        // Jangan mengganti beacon dengan ikon kecil saat keluar FOV. Beacon utuh tetap
        // dijepit di tepi layar sehingga panah tidak pernah hilang ketika kompas bergeser.
        const x = it.headLocked
          ? Math.max(10, Math.min(90, 50 + (dx / H_FOV) * 100))
          : Math.max(12, Math.min(88, 50 + (dx / H_FOV) * 100 + parallax));
        const y = Math.max(10, Math.min(88, 50 - (dy / (H_FOV * 0.75)) * 100));
        const active = gaze?.id === it.id;
        return (
          <div
            key={it.id}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top,transform] duration-150"
            style={{ left: `${x}%`, top: `${y}%`, width: it.width ?? 200, transform: `translate(-50%,-50%) scale(${active ? 1.08 : 1})` }}
          >
            {offscreen && (
              <div className="mb-1 flex justify-center text-white drop-shadow">
                {dx > 0 ? <ChevronRight className="h-6 w-6" /> : <ChevronLeft className="h-6 w-6" />}
              </div>
            )}
            {it.node}
            {active && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded bg-white/30">
                <div className="h-full bg-white" style={{ width: `${(gaze?.progress ?? 0) * 100}%` }} />
              </div>
            )}
          </div>
        );
      })}
      {/* Petunjuk kalibrasi kompas */}
      {needCalib && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1 text-[11px] font-semibold text-white">
          Kompas belum aktif — gerakkan HP membentuk angka 8
        </div>
      )}
      {/* Kompas penunjuk titik terdekat */}
      {nearest && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-white/25">
          <Navigation
            className="h-4 w-4 text-emerald-300"
            style={{ transform: `rotate(${angleDelta(nearest.brg, heading)}deg)` }}
          />
          <span>{nearest.title}</span>
          <span className="text-emerald-200">{Math.round(nearest.dist)} m</span>
        </div>
      )}
      {/* Crosshair */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={`h-6 w-6 rounded-full border-2 ${gaze ? "border-emerald-300" : "border-white/70"}`}>
          <div className="m-[9px] h-1.5 w-1.5 rounded-full bg-white" />
        </div>
      </div>
      {/* Chip poin kecil di pojok kiri atas agar tidak menutupi soal/materi */}
      {student && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-semibold text-white/90 ring-1 ring-white/20">
          {student.name} • Lv {student.level} • {student.points} poin
        </div>
      )}
      {/* HUD kecil */}
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-white/85">
        <span className="flex items-center gap-1"><Compass className="h-3 w-3" />{Math.round(heading)}°</span>
        <span>{pos ? `±${Math.round(pos.accuracy)} m` : "GPS…"}</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black">
      <Toaster position="top-center" richColors />
      <div className="flex h-full w-full">
        {renderEye(0, videoRef)}
        {stereo && <div className="w-[2px] bg-black" />}
        {stereo && renderEye(1, video2Ref)}
      </div>
      <button
        onClick={() => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          document.exitFullscreen?.().catch(() => {});
          navigate({ to: "/student" });
        }}
        className="absolute right-2 top-2 z-50 rounded-full bg-black/60 p-2 text-white"
        aria-label="Keluar mode VR"
      >
        <X className="h-4 w-4" />
      </button>
      <button
        onClick={() => setStereo((s) => !s)}
        className="absolute left-2 top-2 z-50 rounded-full bg-black/60 px-3 py-2 text-[11px] text-white"
      >
        {stereo ? "1 layar" : "Cardboard"}
      </button>
    </div>
  );
}

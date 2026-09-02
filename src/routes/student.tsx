import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStudentId, setStudentId, clearStudent } from "@/lib/session";
import { haversineMeters, levelFromPoints } from "@/lib/geo";
import {
  DWELL_REQUIRED_MS,
  addDwellMs,
  formatCountdown,
  getDwellMs,
  markDwellComplete,
} from "@/lib/dwell";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { MapPin, LogOut, Trophy, Zap, Lock, BookOpen, HelpCircle, Navigation, Glasses } from "lucide-react";
import { RichText } from "@/lib/rich-text";

export const Route = createFileRoute("/student")({
  head: () => ({
    meta: [
      { title: "Siswa — GoBio Explorer" },
      { name: "description", content: "Jelajahi titik Biologi di sekitarmu dan naik level." },
      { property: "og:title", content: "Siswa — GoBio Explorer" },
      { property: "og:description", content: "Peta lokasi belajar Biologi berbasis GPS." },
    ],
  }),
  component: StudentPage,
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
  street_view_enabled: boolean;
};

function StudentPage() {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = getStudentId();
    if (!id) { setLoading(false); return; }
    supabase.from("students").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) setStudent(data as Student);
      else clearStudent();
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="min-h-screen grid place-items-center bg-emerald-50">Memuat…</div>;
  return (
    <>
      <Toaster position="top-center" richColors />
      {student ? <Explorer student={student} onLogout={() => { clearStudent(); setStudent(null); }} onUpdate={setStudent}/> : <LoginForm onLogin={setStudent} />}
    </>
  );
}

function LoginForm({ onLogin }: { onLogin: (s: Student) => void }) {
  const [name, setName] = useState("");
  const [kelas, setKelas] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !kelas.trim()) return;
    setBusy(true);
    const nm = name.trim(); const cl = kelas.trim();
    const { data: existing } = await supabase.from("students").select("*").eq("name", nm).eq("class", cl).maybeSingle();
    let student = existing as Student | null;
    if (!student) {
      const { data, error } = await supabase.from("students").insert({ name: nm, class: cl }).select("*").single();
      if (error) { toast.error("Gagal masuk: " + error.message); setBusy(false); return; }
      student = data as Student;
    }
    setStudentId(student.id);
    onLogin(student);
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-500 to-emerald-800 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2 text-emerald-700"><MapPin/> <span className="font-bold">GoBio Explorer</span></div>
          <CardTitle>Masuk sebagai Siswa</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" required />
            </div>
            <div>
              <Label>Kelas</Label>
              <Input value={kelas} onChange={(e) => setKelas(e.target.value)} placeholder="Mis. 10 IPA 1" required />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {busy ? "Memproses…" : "Mulai Menjelajah"}
            </Button>
            <button type="button" onClick={() => navigate({ to: "/" })} className="w-full text-xs text-muted-foreground">Kembali</button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Explorer({ student, onLogout, onUpdate }: { student: Student; onLogout: () => void; onUpdate: (s: Student) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Location | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const circlesRef = useRef<any[]>([]);
  const meMarkerRef = useRef<any>(null);
  const meCircleRef = useRef<any>(null);
  const didFitRef = useRef(false);
  const [dwell, setDwell] = useState<Record<string, number>>({});
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const posRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const locRef = useRef<Location[]>([]);
  const earnedRef = useRef<Set<string>>(new Set());
  posRef.current = pos;
  locRef.current = locations;
  earnedRef.current = earned;

  // Fetch locations
  useEffect(() => {
    supabase.from("locations").select("*").then(({ data }) => setLocations((data as Location[]) || []));
  }, []);

  // Titik yang poinnya sudah pernah didapat -> tidak bisa dapat poin lagi
  useEffect(() => {
    supabase
      .from("activities")
      .select("location_id, action, is_correct")
      .eq("student_id", student.id)
      .then(({ data }) => {
        const set = new Set<string>();
        (data || []).forEach((a: any) => {
          if (a.action === "award_materi" || a.is_correct === true) set.add(a.location_id);
        });
        set.forEach((id) => markDwellComplete(student.id, id));
        setEarned(set);
      });
  }, [student.id]);

  // Hitung mundur: akumulasi waktu selama siswa berada di dalam radius
  useEffect(() => {
    const tick = 1000;
    const id = window.setInterval(() => {
      const p = posRef.current;
      if (!p) return;
      const next: Record<string, number> = {};
      let changed = false;
      locRef.current.forEach((l) => {
        const inside = haversineMeters(p, { lat: l.lat, lng: l.lng }) <= l.radius_meters;
        const prev = getDwellMs(student.id, l.id);
        if (inside && !earnedRef.current.has(l.id) && prev < DWELL_REQUIRED_MS) {
          next[l.id] = addDwellMs(student.id, l.id, tick);
          changed = true;
        } else {
          next[l.id] = prev;
        }
      });
      if (changed || Object.keys(next).length) setDwell(next);
    }, tick);
    return () => window.clearInterval(id);
  }, [student.id]);


  // GPS watch
  useEffect(() => {
    if (!("geolocation" in navigator)) { setGpsError("Perangkat tidak mendukung GPS"); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Init map
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !mapRef.current) return;
      mapInstance.current = new g.maps.Map(mapRef.current, {
        center: { lat: -6.2, lng: 106.816666 },
        zoom: 17,
        disableDefaultUI: true,
        zoomControl: true,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
        ],
      });
      setMapReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Render location markers + radius circles
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapInstance.current || !mapReady) return;
    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];

    locations.forEach((loc) => {
      const color = loc.kind === "soal" ? "#f59e0b" : "#10b981";
      const marker = new g.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapInstance.current,
        title: loc.title,
        label: { text: loc.kind === "soal" ? "?" : "M", color: "#fff", fontWeight: "bold", fontSize: "12px" },
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
      });
      marker.addListener("click", () => {
        mapInstance.current.panTo({ lat: loc.lat, lng: loc.lng });
        setSelected(loc);
      });
      markersRef.current.push(marker);

      const circle = new g.maps.Circle({
        map: mapInstance.current,
        center: { lat: loc.lat, lng: loc.lng },
        radius: loc.radius_meters,
        strokeColor: color,
        strokeOpacity: 0.7,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.15,
        clickable: false,
      });
      circlesRef.current.push(circle);
    });

    // Fit bounds once so all points are visible
    if (!didFitRef.current && locations.length > 0) {
      const bounds = new g.maps.LatLngBounds();
      locations.forEach((l) => bounds.extend({ lat: l.lat, lng: l.lng }));
      if (pos) bounds.extend({ lat: pos.lat, lng: pos.lng });
      mapInstance.current.fitBounds(bounds, 60);
      if (locations.length === 1) mapInstance.current.setZoom(18);
      didFitRef.current = true;
    }
  }, [locations, mapReady, pos]);

  // Update user marker
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapInstance.current || !pos) return;
    const p = { lat: pos.lat, lng: pos.lng };
    if (!meMarkerRef.current) {
      meMarkerRef.current = new g.maps.Marker({
        position: p, map: mapInstance.current, zIndex: 999,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#2563eb", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
      });
      meCircleRef.current = new g.maps.Circle({
        map: mapInstance.current, center: p, radius: pos.accuracy,
        strokeColor: "#2563eb", strokeOpacity: 0.4, strokeWeight: 1,
        fillColor: "#3b82f6", fillOpacity: 0.15,
      });
      mapInstance.current.panTo(p);
    } else {
      meMarkerRef.current.setPosition(p);
      meCircleRef.current.setCenter(p);
      meCircleRef.current.setRadius(pos.accuracy);
    }
  }, [pos]);

  const enriched = useMemo(() => {
    return locations.map((l) => {
      const dist = pos ? haversineMeters(pos, { lat: l.lat, lng: l.lng }) : Infinity;
      const dwellMs = dwell[l.id] ?? 0;
      const done = earned.has(l.id);
      return {
        ...l,
        distance: dist,
        inRange: dist <= l.radius_meters,
        dwellMs,
        remainingMs: done ? 0 : Math.max(0, DWELL_REQUIRED_MS - dwellMs),
        earned: done,
      };
    }).sort((a, b) => a.distance - b.distance);
  }, [locations, pos, dwell, earned]);


  async function refreshStudent() {
    const { data } = await supabase.from("students").select("*").eq("id", student.id).single();
    if (data) onUpdate(data as Student);
  }

  // Coba kunci layar ke landscape setelah interaksi pertama (fullscreen diperlukan)
  useEffect(() => {
    const lock = () => {
      const so: any = screen.orientation;
      if (!so?.lock) return;
      try {
        document.documentElement.requestFullscreen?.().then(() => {
          try { so.lock("landscape").catch(() => {}); } catch { /* abaikan */ }
        }).catch(() => {});
      } catch { /* abaikan */ }
    };
    document.addEventListener("click", lock, { once: true });
    document.addEventListener("touchend", lock, { once: true });
    return () => {
      document.removeEventListener("click", lock);
      document.removeEventListener("touchend", lock);
    };
  }, []);

  return (
    <div className="min-h-screen bg-emerald-50">
      {/* HUD */}
      <div className="sticky top-0 z-30 bg-emerald-700 text-white shadow-lg">
        <div className="mx-auto max-w-3xl px-4 py-3 landscape:py-1.5 flex items-center gap-3">
          <div className="h-10 w-10 landscape:h-8 landscape:w-8 rounded-full bg-white/20 grid place-items-center font-bold">
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{student.name}</div>
            <div className="text-xs text-emerald-100">{student.class}</div>
          </div>
          <Badge className="bg-yellow-400 text-yellow-950 hover:bg-yellow-400"><Trophy className="h-3 w-3 mr-1"/>Lv {student.level}</Badge>
          <Badge className="bg-white text-emerald-800 hover:bg-white"><Zap className="h-3 w-3 mr-1"/>{student.points}</Badge>
          <button onClick={onLogout} className="p-2 rounded hover:bg-white/10" title="Keluar"><LogOut className="h-4 w-4"/></button>
        </div>
        {gpsError && <div className="bg-red-500 text-white text-xs text-center py-1">GPS: {gpsError}</div>}
        {!gpsError && !pos && <div className="bg-yellow-500 text-yellow-950 text-xs text-center py-1">Menunggu sinyal GPS…</div>}
        {pos && <div className="bg-emerald-600 text-white text-[11px] text-center py-1">Akurasi GPS ±{Math.round(pos.accuracy)} m</div>}
      </div>

      <div className="mx-auto max-w-3xl landscape:max-w-none p-4 landscape:p-2 space-y-4 landscape:grid landscape:grid-cols-2 landscape:gap-3 landscape:space-y-0">
        <div className="space-y-4 landscape:space-y-3">
          <div ref={mapRef} className="w-full h-[45vh] landscape:h-[calc(100vh-140px)] rounded-2xl overflow-hidden shadow-lg bg-emerald-100" />

          <a
            href="/ar"
            className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-800 p-4 landscape:p-3 text-white shadow-lg"
          >
            <Glasses className="h-6 w-6" />
            <div className="flex-1 min-w-0">
              <div className="font-bold">Mode VR Cardboard</div>
              <div className="text-xs text-emerald-50/90">Cari titik lewat kamera & pandangan mata</div>
            </div>
            <span className="text-xl">→</span>
          </a>
        </div>

        <div className="space-y-2 landscape:max-h-[calc(100vh-140px)] landscape:overflow-y-auto">
          <h2 className="font-bold text-emerald-900 flex items-center gap-2"><Navigation className="h-4 w-4"/>Titik Terdekat</h2>
        <div className="space-y-2">
          {enriched.length === 0 && <p className="text-sm text-muted-foreground">Belum ada lokasi. Minta gurumu menambahkan.</p>}
          {enriched.map((l) => (
            <button
              key={l.id}
              onClick={() => setSelected(l)}
              className="w-full text-left bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition flex items-center gap-3"
            >
              <div className={`h-11 w-11 rounded-full grid place-items-center text-white ${l.kind === "soal" ? "bg-amber-500" : "bg-emerald-500"}`}>
                {l.kind === "soal" ? <HelpCircle className="h-5 w-5"/> : <BookOpen className="h-5 w-5"/>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{l.title}</div>
                <div className="text-xs text-muted-foreground truncate">{l.description}</div>
                {l.earned ? (
                  <div className="text-[11px] font-semibold text-emerald-600">✓ Poin sudah didapat</div>
                ) : l.inRange ? (
                  <div className="text-[11px] font-semibold text-amber-600">
                    {l.remainingMs > 0 ? `⏳ Sisa ${formatCountdown(l.remainingMs)} untuk dapat poin` : "✓ Waktu terpenuhi, poin siap diambil"}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">Butuh 2 menit di dalam radius</div>
                )}
              </div>
              <div className="text-right">
                <div className={`text-sm font-bold ${l.inRange ? "text-emerald-600" : "text-slate-500"}`}>
                  {isFinite(l.distance) ? `${Math.round(l.distance)} m` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">radius {l.radius_meters} m</div>
              </div>
              {!l.inRange && <Lock className="h-4 w-4 text-slate-400"/>}
            </button>
          ))}
          </div>
        </div>
      </div>

      <LocationDialog
        location={selected}
        onClose={() => setSelected(null)}
        pos={pos}
        student={student}
        dwellMs={selected ? (dwell[selected.id] ?? 0) : 0}
        alreadyEarned={selected ? earned.has(selected.id) : false}
        onCompleted={(id) => {
          setEarned((prev) => new Set(prev).add(id));
          void refreshStudent();
        }}
      />

    </div>
  );
}

function LocationDialog({
  location, onClose, pos, student, dwellMs, alreadyEarned, onCompleted,
}: {
  location: Location | null;
  onClose: () => void;
  pos: { lat: number; lng: number; accuracy: number } | null;
  student: Student;
  dwellMs: number;
  alreadyEarned: boolean;
  onCompleted: (locationId: string) => void;
}) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { setAnswer(null); setDone(false); }, [location?.id]);

  if (!location) return null;
  const dist = pos ? haversineMeters(pos, { lat: location.lat, lng: location.lng }) : Infinity;
  const inRange = dist <= location.radius_meters;
  const remainingMs = alreadyEarned ? 0 : Math.max(0, DWELL_REQUIRED_MS - dwellMs);
  const dwellDone = remainingMs <= 0;

  async function logActivity(action: string, extra: Partial<{ answer: string; is_correct: boolean; points_earned: number }> = {}) {
    await supabase.from("activities").insert({
      student_id: student.id,
      location_id: location!.id,
      action,
      distance_meters: isFinite(dist) ? dist : null,
      ...extra,
    });
  }

  async function openContent() {
    if (!inRange) return;
    if (!dwellDone) {
      toast.error(`Tetap di titik ini ${formatCountdown(remainingMs)} lagi untuk mendapatkan poin.`);
      return;
    }
    await logActivity("open_materi");
    // award points (once per location for materi)
    const { data: prev } = await supabase.from("activities").select("id")
      .eq("student_id", student.id).eq("location_id", location!.id).eq("action", "award_materi").limit(1);
    if (!prev || prev.length === 0) {
      const newPoints = student.points + location!.points;
      await supabase.from("students").update({ points: newPoints, level: levelFromPoints(newPoints) }).eq("id", student.id);
      await logActivity("award_materi", { points_earned: location!.points });
      toast.success(`+${location!.points} poin! Materi dibuka.`);
    } else {
      toast.info("Poin untuk titik ini sudah pernah kamu dapatkan.");
    }
    markDwellComplete(student.id, location!.id);
    onCompleted(location!.id);
    setDone(true);
  }

  async function submitAnswer() {
    if (!inRange || !answer) return;
    if (!dwellDone) {
      toast.error(`Tetap di titik ini ${formatCountdown(remainingMs)} lagi sebelum menjawab.`);
      return;
    }
    setSubmitting(true);
    const correct = answer === location!.correct_answer;
    let earned = 0;
    if (correct) {
      // award once
      const { data: prev } = await supabase.from("activities").select("id")
        .eq("student_id", student.id).eq("location_id", location!.id).eq("is_correct", true).limit(1);
      if (!prev || prev.length === 0) {
        earned = location!.points;
        const newPoints = student.points + earned;
        await supabase.from("students").update({ points: newPoints, level: levelFromPoints(newPoints) }).eq("id", student.id);
      }
    }
    await logActivity("answer", { answer: answer!, is_correct: correct, points_earned: earned });
    if (correct) toast.success(earned > 0 ? `Benar! +${earned} poin` : "Benar! (poin sudah didapat sebelumnya)");
    else toast.error("Jawaban belum tepat. Coba lagi.");
    setSubmitting(false);
    if (correct) {
      markDwellComplete(student.id, location!.id);
      setDone(true);
      onCompleted(location!.id);
    }
  }


  const streetViewUrl = location.street_view_enabled
    ? `https://www.google.com/maps/embed/v1/streetview?key=${import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY}&location=${location.lat},${location.lng}&heading=0&pitch=0&fov=90`
    : null;

  return (
    <Dialog open={!!location} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {location.kind === "soal" ? <HelpCircle className="text-amber-500"/> : <BookOpen className="text-emerald-600"/>}
            {location.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className={`p-3 rounded-lg text-sm ${inRange ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            {inRange ? (
              <>✅ Kamu berada dalam radius. Konten terbuka.</>
            ) : (
              <>🔒 Konten terkunci. Jarakmu {isFinite(dist) ? Math.round(dist) : "—"} m. Dekati hingga ≤ {location.radius_meters} m.</>
            )}
          </div>

          {location.description && (
            <RichText text={location.description} className="text-sm text-muted-foreground" />
          )}

          {streetViewUrl && (
            <iframe
              title="Street View"
              src={streetViewUrl}
              className="w-full h-56 rounded-lg border"
              allow="accelerometer; gyroscope"
            />
          )}

          {!inRange ? (
            <p className="text-xs text-muted-foreground">Bergeraklah lebih dekat ke titik lokasi untuk membuka konten.</p>
          ) : location.kind === "materi" ? (
            <div className="space-y-3">
              <RichText
                text={location.content ?? ""}
                className="prose prose-sm max-w-none rounded-lg bg-slate-50 p-3 leading-relaxed"
              />
              {!done && <Button onClick={openContent} className="w-full bg-emerald-600 hover:bg-emerald-700">Selesai baca (+{location.points} poin)</Button>}
              {done && <div className="text-center text-emerald-600 font-semibold">✓ Selesai</div>}
            </div>
          ) : (
            <div className="space-y-3">
              <RichText text={location.question ?? ""} className="font-semibold leading-relaxed" />
              <div className="grid gap-2">
                {(location.choices || []).map((c) => (
                  <button
                    key={c}
                    onClick={() => setAnswer(c)}
                    className={`text-left px-3 py-2 rounded-lg border-2 transition ${answer === c ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-300"}`}
                  >{c}</button>
                ))}
              </div>
              <Button onClick={submitAnswer} disabled={!answer || submitting} className="w-full bg-amber-500 hover:bg-amber-600">
                {submitting ? "Mengirim…" : `Kirim jawaban (+${location.points} poin bila benar)`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

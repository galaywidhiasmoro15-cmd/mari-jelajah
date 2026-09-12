import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStudentId, setStudentId, clearStudent } from "@/lib/session";
import { haversineMeters } from "@/lib/geo";
import {
  activityLabel,
  formatRange,
  formatSeconds,
  hasGambar,
  hasMateri,
  hasSoal,
  hasVideo,
  scheduleStatus,
  scheduleWindow,
  statusLabel,
  type ScheduleStatus,
} from "@/lib/activity";
import { claimActivity, fetchProgress, tickDwell, useServerClock, type ProgressRow } from "@/lib/progress";
import { MateriText, SmartImage, SmartVideo } from "@/components/learning/ActivityContent";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { MapPin, LogOut, Trophy, Zap, Lock, BookOpen, HelpCircle, Navigation, Glasses, Clock } from "lucide-react";
import { RichText } from "@/lib/rich-text";

export const Route = createFileRoute("/student")({
  head: () => ({
    meta: [
      { title: "Siswa — GoBio Explorer" },
      { name: "description", content: "Jelajahi titik Biologi sesuai jadwal, penuhi waktu belajar, kumpulkan poin." },
      { property: "og:title", content: "Siswa — GoBio Explorer" },
      { property: "og:description", content: "Peta lokasi belajar Biologi berbasis GPS dan jadwal kegiatan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentPage,
});

type Student = { id: string; name: string; class: string; points: number; level: number };
export type Location = {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  lat: number;
  lng: number;
  radius_meters: number;
  kind: "materi" | "soal";
  activity_type: string;
  media_image_url: string | null;
  media_video_url: string | null;
  schedule_date: string | null;
  start_time: string | null;
  end_time: string | null;
  dwell_seconds: number;
  award_points: boolean;
  question: string | null;
  choices: string[] | null;
  correct_answer: string | null;
  points: number;
  street_view_enabled: boolean;
};

type EventSettings = {
  name: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
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
  const [event, setEvent] = useState<EventSettings | null>(null);
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
  const [progress, setProgress] = useState<Record<string, ProgressRow>>({});
  const [dwellLocal, setDwellLocal] = useState<Record<string, number>>({});
  const nowMs = useServerClock();
  const nowRef = useRef(nowMs);
  nowRef.current = nowMs;
  const posRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const locRef = useRef<Location[]>([]);
  posRef.current = pos;
  locRef.current = locations;

  // Data awal
  useEffect(() => {
    supabase.from("locations").select("*").order("sort_order").order("start_time", { nullsFirst: false })
      .then(({ data }) => setLocations((data as unknown as Location[]) || []));
    supabase.from("event_settings").select("name, event_date, start_time, end_time").maybeSingle()
      .then(({ data }) => setEvent((data as EventSettings) || null));
    void fetchProgress(student.id).then(setProgress);
  }, [student.id]);

  const applyProgress = useCallback((locId: string, dwellSeconds: number, completed: boolean, pointsAwarded: number) => {
    setProgress((prev) => ({
      ...prev,
      [locId]: {
        location_id: locId,
        dwell_seconds: dwellSeconds,
        status: completed ? "selesai" : "sedang_belajar",
        answered_correct: prev[locId]?.answered_correct ?? null,
        points_awarded: pointsAwarded,
        completed_at: completed ? new Date().toISOString() : (prev[locId]?.completed_at ?? null),
      },
    }));
    setDwellLocal((prev) => ({ ...prev, [locId]: dwellSeconds }));
  }, []);

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

  // Hitungan lokal per detik (tampilan) selama siswa di radius & titik aktif
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = posRef.current;
      if (!p) return;
      setDwellLocal((prev) => {
        const next = { ...prev };
        locRef.current.forEach((l) => {
          const inside = haversineMeters(p, { lat: l.lat, lng: l.lng }) <= l.radius_meters;
          const active = scheduleStatus(l, nowRef.current) !== "belum_aktif" && scheduleStatus(l, nowRef.current) !== "selesai";
          const cur = next[l.id] ?? 0;
          if (inside && active && cur < l.dwell_seconds) next[l.id] = cur + 1;
        });
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Sinkronisasi dwell ke server tiap 5 detik (server = sumber kebenaran)
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = posRef.current;
      if (!p) return;
      locRef.current.forEach((l) => {
        const inside = haversineMeters(p, { lat: l.lat, lng: l.lng }) <= l.radius_meters;
        const st = scheduleStatus(l, nowRef.current);
        if (!inside || st === "belum_aktif" || st === "selesai") return;
        void tickDwell(student.id, l.id).then((r) => {
          if (!r) return;
          applyProgress(l.id, r.dwell_seconds, r.completed, r.points_awarded);
        });
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [student.id, applyProgress]);

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
        styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
      });
      setMapReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Marker lokasi + lingkaran radius
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapInstance.current || !mapReady) return;
    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];

    locations.forEach((loc) => {
      const st = scheduleStatus(loc, nowMs);
      const done = !!progress[loc.id]?.completed_at;
      const color = done ? "#64748b" : st === "belum_aktif" ? "#94a3b8" : st === "selesai" ? "#ef4444" : hasSoal(loc.activity_type) ? "#f59e0b" : "#10b981";
      const marker = new g.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapInstance.current,
        title: loc.title,
        label: { text: done ? "✓" : hasSoal(loc.activity_type) ? "?" : "M", color: "#fff", fontWeight: "bold", fontSize: "12px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 14, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
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
        strokeColor: color, strokeOpacity: 0.7, strokeWeight: 2,
        fillColor: color, fillOpacity: 0.15, clickable: false,
      });
      circlesRef.current.push(circle);
    });

    if (!didFitRef.current && locations.length > 0) {
      const bounds = new g.maps.LatLngBounds();
      locations.forEach((l) => bounds.extend({ lat: l.lat, lng: l.lng }));
      if (pos) bounds.extend({ lat: pos.lat, lng: pos.lng });
      mapInstance.current.fitBounds(bounds, 60);
      if (locations.length === 1) mapInstance.current.setZoom(18);
      didFitRef.current = true;
    }
  }, [locations, mapReady, pos, progress, nowMs]);

  // Marker posisi siswa
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
      const pr = progress[l.id];
      const serverDwell = pr?.dwell_seconds ?? 0;
      const dwellSec = Math.min(l.dwell_seconds, Math.max(serverDwell, dwellLocal[l.id] ?? 0));
      const status = scheduleStatus(l, nowMs);
      const { endMs } = scheduleWindow(l);
      return {
        ...l,
        distance: dist,
        inRange: dist <= l.radius_meters,
        dwellSec,
        remainingSec: Math.max(0, l.dwell_seconds - dwellSec),
        completed: !!pr?.completed_at,
        status,
        timeLeftMs: endMs ? Math.max(0, endMs - nowMs) : null,
      };
    }).sort((a, b) => a.distance - b.distance);
  }, [locations, pos, progress, dwellLocal, nowMs]);

  const eventStatus: ScheduleStatus = event
    ? scheduleStatus({ schedule_date: event.event_date, start_time: event.start_time, end_time: event.end_time }, nowMs)
    : "tanpa_jadwal";

  const doneCount = enriched.filter((l) => l.completed).length;
  const activePoint = enriched.find((l) => l.status === "aktif" && !l.completed);

  async function refreshStudent() {
    const { data } = await supabase.from("students").select("*").eq("id", student.id).single();
    if (data) onUpdate(data as Student);
  }

  const selectedRow = selected ? enriched.find((l) => l.id === selected.id) ?? null : null;

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
        {event && (
          <div className={`text-[11px] text-center py-1 ${eventStatus === "aktif" ? "bg-emerald-600" : eventStatus === "belum_aktif" ? "bg-slate-600" : eventStatus === "selesai" ? "bg-red-600" : "bg-emerald-800"}`}>
            {event.name}
            {event.event_date && <> · {event.start_time?.slice(0, 5)}–{event.end_time?.slice(0, 5)}</>}
            {" · "}
            {eventStatus === "belum_aktif" ? "Kegiatan belum dimulai" : eventStatus === "aktif" ? "Kegiatan sedang berlangsung" : eventStatus === "selesai" ? "Kegiatan telah berakhir" : "Tanpa jadwal"}
          </div>
        )}
        <div className="bg-emerald-800 text-[11px] text-center py-1">
          Progres: {doneCount}/{enriched.length} titik selesai
          {activePoint && <> · Titik aktif: {activePoint.title}</>}
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
                <div className={`h-11 w-11 rounded-full grid place-items-center text-white ${l.completed ? "bg-slate-400" : hasSoal(l.activity_type) ? "bg-amber-500" : "bg-emerald-500"}`}>
                  {hasSoal(l.activity_type) ? <HelpCircle className="h-5 w-5"/> : <BookOpen className="h-5 w-5"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{l.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {activityLabel(l.activity_type)} · {formatRange(l)} · {formatSeconds(l.dwell_seconds)} · {l.points} poin
                  </div>
                  {l.completed ? (
                    <div className="text-[11px] font-semibold text-emerald-600">✓ Selesai · poin sudah didapat</div>
                  ) : l.status === "belum_aktif" ? (
                    <div className="text-[11px] font-semibold text-slate-500">Belum aktif · mulai pukul {l.start_time?.slice(0, 5)}</div>
                  ) : l.status === "selesai" ? (
                    <div className="text-[11px] font-semibold text-red-500">Waktu titik ini sudah berakhir</div>
                  ) : l.inRange ? (
                    <div className="text-[11px] font-semibold text-amber-600">
                      {l.remainingSec > 0
                        ? `⏳ Belajar ${formatSeconds(l.dwellSec)} / ${formatSeconds(l.dwell_seconds)}`
                        : "✓ Waktu belajar terpenuhi"}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400">Masuk radius lalu bertahan {formatSeconds(l.dwell_seconds)}</div>
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
        row={selectedRow}
        onClose={() => setSelected(null)}
        student={student}
        onClaimed={(locId, dwellSec, completed, points) => {
          applyProgress(locId, dwellSec, completed, points);
          void refreshStudent();
        }}
      />
    </div>
  );
}

type EnrichedLocation = Location & {
  distance: number;
  inRange: boolean;
  dwellSec: number;
  remainingSec: number;
  completed: boolean;
  status: ScheduleStatus;
  timeLeftMs: number | null;
};

function LocationDialog({
  row, onClose, student, onClaimed,
}: {
  row: EnrichedLocation | null;
  onClose: () => void;
  student: Student;
  onClaimed: (locationId: string, dwellSec: number, completed: boolean, points: number) => void;
}) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setAnswer(null); }, [row?.id]);

  if (!row) return null;

  const soal = hasSoal(row.activity_type);
  const dwellDone = row.remainingSec <= 0;
  const scheduleOk = row.status === "aktif" || row.status === "tanpa_jadwal";
  const canClaim = row.inRange && dwellDone && scheduleOk && !row.completed;

  async function claim() {
    if (!row) return;
    setSubmitting(true);
    const res = await claimActivity(student.id, row.id, soal ? answer : null);
    setSubmitting(false);
    if (res.error) { toast.error(res.error); return; }
    if (soal && res.correct === false) { toast.error("Jawaban belum tepat. Coba lagi."); return; }
    if (res.already) { toast.info("Poin titik ini sudah pernah kamu dapatkan."); onClaimed(row.id, row.dwell_seconds, true, 0); return; }
    const pts = res.points_earned ?? 0;
    toast.success(pts > 0 ? `✓ Aktivitas selesai — +${pts} poin` : "✓ Aktivitas selesai");
    onClaimed(row.id, row.dwell_seconds, true, pts);
  }

  const streetViewUrl = row.street_view_enabled
    ? `https://www.google.com/maps/embed/v1/streetview?key=${import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY}&location=${row.lat},${row.lng}&heading=0&pitch=0&fov=90`
    : null;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {soal ? <HelpCircle className="text-amber-500"/> : <BookOpen className="text-emerald-600"/>}
            {row.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <Badge variant="secondary">{activityLabel(row.activity_type)}</Badge>
            <Badge variant="outline"><Clock className="mr-1 h-3 w-3" />{formatRange(row)}</Badge>
            <Badge variant="outline">{statusLabel(row.status)}</Badge>
            <Badge variant="outline">{row.points} poin</Badge>
            {row.timeLeftMs !== null && row.status === "aktif" && (
              <Badge className="bg-amber-500">Sisa waktu titik {formatSeconds(row.timeLeftMs / 1000)}</Badge>
            )}
          </div>

          <div className={`p-3 rounded-lg text-sm ${row.inRange ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            {row.inRange
              ? "✅ Kamu berada dalam radius titik ini."
              : `🔒 Jarakmu ${isFinite(row.distance) ? Math.round(row.distance) : "—"} m. Dekati hingga ≤ ${row.radius_meters} m.`}
          </div>

          {row.status === "belum_aktif" && (
            <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
              Titik ini belum aktif. Mulai pukul <b>{row.start_time?.slice(0, 5)}</b> pada {row.schedule_date}.
            </div>
          )}
          {row.status === "selesai" && !row.completed && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              Waktu titik ini sudah berakhir, aktivitas tidak dapat diselesaikan lagi.
            </div>
          )}

          {row.completed ? (
            <div className="rounded-lg bg-emerald-100 p-3 text-sm font-semibold text-emerald-800">
              ✓ Aktivitas selesai. Poin titik ini sudah kamu dapatkan dan tidak bertambah lagi.
            </div>
          ) : (
            <div className={`rounded-lg p-3 text-center ${dwellDone ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
              <div className="text-[11px] uppercase tracking-wide">Progres belajar</div>
              <div className="text-3xl font-black tabular-nums">
                {formatSeconds(row.dwellSec)} / {formatSeconds(row.dwell_seconds)}
              </div>
              <div className="text-[11px]">
                {dwellDone
                  ? soal ? "✓ Waktu belajar terpenuhi — silakan jawab soal." : "✓ Waktu belajar terpenuhi."
                  : row.inRange && scheduleOk
                    ? "Waktu berjalan selama kamu berada di dalam radius."
                    : "Waktu berhenti. Masuk ke radius saat titik aktif untuk melanjutkan."}
              </div>
            </div>
          )}

          {row.description && <RichText text={row.description} className="text-sm text-muted-foreground" />}

          {!row.inRange ? (
            <p className="text-xs text-muted-foreground">Bergeraklah lebih dekat ke titik lokasi untuk membuka konten.</p>
          ) : (
            <div className="space-y-3">
              {hasMateri(row.activity_type) && row.content && <MateriText text={row.content} />}
              {hasGambar(row.activity_type) && row.media_image_url && (
                <SmartImage src={row.media_image_url} alt={row.title} />
              )}
              {hasVideo(row.activity_type) && row.media_video_url && <SmartVideo src={row.media_video_url} />}

              {streetViewUrl && (
                <iframe title="Street View" src={streetViewUrl} className="w-full h-56 rounded-lg border" allow="accelerometer; gyroscope" />
              )}

              {soal ? (
                <div className="space-y-3">
                  <RichText text={row.question ?? ""} className="font-semibold leading-relaxed" />
                  <div className="grid gap-2">
                    {(row.choices || []).map((c) => (
                      <button
                        key={c}
                        onClick={() => setAnswer(c)}
                        disabled={row.completed}
                        className={`text-left px-3 py-2 rounded-lg border-2 transition ${answer === c ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-300"}`}
                      >{c}</button>
                    ))}
                  </div>
                  {!row.completed && (
                    <Button onClick={claim} disabled={!answer || submitting || !canClaim} className="w-full bg-amber-500 hover:bg-amber-600">
                      {!dwellDone
                        ? `Tunggu ${formatSeconds(row.remainingSec)} lagi`
                        : submitting ? "Mengirim…" : `Kirim jawaban${row.award_points ? ` (+${row.points} poin bila benar)` : ""}`}
                    </Button>
                  )}
                </div>
              ) : (
                !row.completed && (
                  <Button onClick={claim} disabled={submitting || !canClaim} className="w-full bg-emerald-600 hover:bg-emerald-700">
                    {!dwellDone
                      ? `Tunggu ${formatSeconds(row.remainingSec)} lagi`
                      : submitting ? "Menyimpan…" : row.award_points ? `Selesaikan aktivitas (+${row.points} poin)` : "Selesaikan aktivitas"}
                  </Button>
                )
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

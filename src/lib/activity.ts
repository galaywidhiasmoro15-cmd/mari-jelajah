/**
 * Jenis aktivitas titik pembelajaran + status jadwal berbasis jam aktual.
 */

export const ACTIVITY_TYPES = [
  { value: "materi", label: "Materi" },
  { value: "gambar", label: "Gambar" },
  { value: "video", label: "Video" },
  { value: "soal", label: "Soal" },
  { value: "materi_gambar", label: "Materi + Gambar" },
  { value: "materi_video", label: "Materi + Video" },
  { value: "materi_soal", label: "Materi + Soal" },
  { value: "gambar_soal", label: "Gambar + Soal" },
  { value: "video_soal", label: "Video + Soal" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

export function activityLabel(t: string | null | undefined): string {
  return ACTIVITY_TYPES.find((a) => a.value === t)?.label ?? "Materi";
}

export function hasMateri(t: string | null | undefined) {
  return !t || t.includes("materi");
}
export function hasGambar(t: string | null | undefined) {
  return !!t && t.includes("gambar");
}
export function hasVideo(t: string | null | undefined) {
  return !!t && t.includes("video");
}
export function hasSoal(t: string | null | undefined) {
  return !!t && t.includes("soal");
}

/** Titik dengan jadwal (opsional). Semua waktu memakai zona kegiatan. */
export type Schedulable = {
  schedule_date: string | null;
  start_time: string | null;
  end_time: string | null;
};

export type ScheduleStatus = "tanpa_jadwal" | "belum_aktif" | "aktif" | "selesai";

function toMs(date: string, time: string, tzOffsetMinutes: number): number {
  const [h, m, s] = time.split(":").map((v) => parseInt(v, 10) || 0);
  const [y, mo, d] = date.split("-").map((v) => parseInt(v, 10));
  // Waktu lokal kegiatan -> epoch UTC
  return Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, m || 0, s || 0) - tzOffsetMinutes * 60_000;
}

/** Zona kegiatan default WIB (UTC+7) dalam menit. */
export const DEFAULT_TZ_OFFSET_MINUTES = 7 * 60;

export function scheduleWindow(
  loc: Schedulable,
  tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES,
): { startMs: number | null; endMs: number | null } {
  if (!loc.schedule_date) return { startMs: null, endMs: null };
  return {
    startMs: loc.start_time ? toMs(loc.schedule_date, loc.start_time, tzOffsetMinutes) : null,
    endMs: loc.end_time ? toMs(loc.schedule_date, loc.end_time, tzOffsetMinutes) : null,
  };
}

export function scheduleStatus(
  loc: Schedulable,
  nowMs: number,
  tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES,
): ScheduleStatus {
  const { startMs, endMs } = scheduleWindow(loc, tzOffsetMinutes);
  if (startMs === null && endMs === null) return "tanpa_jadwal";
  if (startMs !== null && nowMs < startMs) return "belum_aktif";
  if (endMs !== null && nowMs > endMs) return "selesai";
  return "aktif";
}

export function statusLabel(s: ScheduleStatus): string {
  switch (s) {
    case "belum_aktif":
      return "Belum aktif";
    case "aktif":
      return "Aktif";
    case "selesai":
      return "Waktu berakhir";
    default:
      return "Tanpa jadwal";
  }
}

/** "07:30" dari "07:30:00". */
export function shortTime(t: string | null | undefined): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

/** mm:ss dari detik. */
export function formatSeconds(sec: number): string {
  const total = Math.max(0, Math.ceil(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatRange(loc: Schedulable): string {
  if (!loc.schedule_date) return "Tanpa jadwal";
  return `${shortTime(loc.start_time)} – ${shortTime(loc.end_time)}`;
}

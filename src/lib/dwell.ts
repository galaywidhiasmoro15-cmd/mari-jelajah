/**
 * Aturan "durasi tinggal" (dwell) di dalam radius titik.
 *
 * Siswa baru berhak mendapat poin setelah berada di dalam radius sebuah titik
 * selama minimal DWELL_REQUIRED_MS (2 menit), dengan asumsi mereka membaca
 * materi atau soal yang ditampilkan.
 *
 * Akumulasi waktu disimpan di localStorage per siswa + per lokasi, sehingga
 * tetap bertahan meski halaman dimuat ulang atau siswa sempat keluar radius.
 */

export const DWELL_REQUIRED_MS = 2 * 60 * 1000;

const KEY = "gobio_dwell_v1";

type DwellMap = Record<string, number>;

function read(): DwellMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as DwellMap;
  } catch {
    return {};
  }
}

function write(map: DwellMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* penyimpanan penuh: abaikan */
  }
}

function keyOf(studentId: string, locationId: string) {
  return `${studentId}:${locationId}`;
}

/** Total waktu (ms) siswa berada di radius sebuah titik. */
export function getDwellMs(studentId: string, locationId: string): number {
  return read()[keyOf(studentId, locationId)] ?? 0;
}

/** Tambah waktu tinggal; mengembalikan total terbaru (ms). */
export function addDwellMs(studentId: string, locationId: string, deltaMs: number): number {
  const map = read();
  const k = keyOf(studentId, locationId);
  const next = Math.min(DWELL_REQUIRED_MS, (map[k] ?? 0) + Math.max(0, deltaMs));
  map[k] = next;
  write(map);
  return next;
}

/** Sisa waktu hitung mundur (ms) sebelum poin bisa diperoleh. */
export function remainingDwellMs(studentId: string, locationId: string): number {
  return Math.max(0, DWELL_REQUIRED_MS - getDwellMs(studentId, locationId));
}

export function isDwellComplete(studentId: string, locationId: string): boolean {
  return remainingDwellMs(studentId, locationId) <= 0;
}

/** Tandai selesai (mis. saat poin sudah pernah didapat sebelumnya). */
export function markDwellComplete(studentId: string, locationId: string) {
  const map = read();
  map[keyOf(studentId, locationId)] = DWELL_REQUIRED_MS;
  write(map);
}

/** Format mm:ss untuk tampilan hitung mundur. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

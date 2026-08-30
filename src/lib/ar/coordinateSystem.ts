/**
 * Sistem koordinat lokal ENU (East / North / Up) untuk BioWes AR.
 *
 * Semua objek edukasi disimpan sebagai posisi 3D dunia (meter) relatif terhadap
 * satu titik origin (referensi AR siswa), BUKAN sebagai bearing + pitch.
 *
 * Pemetaan ke ruang Three.js:
 *   x = East  (timur positif)
 *   y = Up    (ketinggian positif)
 *   z = -North (utara = -z, mengikuti konvensi kamera Three.js yang melihat ke -z)
 */

export type LatLng = { lat: number; lng: number };
export type Vec3 = { x: number; y: number; z: number };

const METERS_PER_DEG_LAT = 111320;

/** Konversi selisih lat/lng menjadi koordinat lokal ENU (meter). */
export function enuFromGeodetic(origin: LatLng, target: LatLng, up = 0): Vec3 {
  const latRad = (origin.lat * Math.PI) / 180;
  const east = (target.lng - origin.lng) * METERS_PER_DEG_LAT * Math.cos(latRad);
  const north = (target.lat - origin.lat) * METERS_PER_DEG_LAT;
  return { x: east, y: up, z: -north };
}

/** Kebalikan dari enuFromGeodetic (dipakai untuk debug / koreksi drift). */
export function geodeticFromEnu(origin: LatLng, enu: Vec3): LatLng {
  const latRad = (origin.lat * Math.PI) / 180;
  return {
    lat: origin.lat + -enu.z / METERS_PER_DEG_LAT,
    lng: origin.lng + enu.x / (METERS_PER_DEG_LAT * Math.cos(latRad)),
  };
}

export function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Interpolasi linear sederhana untuk penghalusan posisi. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Selisih sudut terpendek (derajat, -180..180). */
export function shortestAngleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

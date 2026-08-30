import { enuFromGeodetic, lerp, type LatLng, type Vec3 } from "./coordinateSystem";

/**
 * Siklus hidup world anchor.
 *
 * - Origin referensi AR dibuat SEKALI dari fix GPS pertama yang layak.
 * - Anchor lokasi edukasi dibuat sekali lalu dipertahankan (tidak dibangun ulang
 *   setiap update GPS / setiap frame).
 * - Update GPS hanya mengoreksi posisi kamera (siswa) secara perlahan.
 * - Saat GPS memburuk, posisi terakhir yang andal dipertahankan.
 */

export type GpsFix = { lat: number; lng: number; accuracy: number };

export type WorldAnchor = {
  id: string;
  /** posisi dunia lokal (meter) - x timur, y atas, z -utara */
  position: Vec3;
  latLng: LatLng;
};

const POOR_ACCURACY_METERS = 45;

export class WorldAnchorSystem {
  origin: LatLng | null = null;
  /** posisi siswa hasil smoothing (meter, ruang lokal) */
  readonly userPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private userTarget: Vec3 = { x: 0, y: 0, z: 0 };
  private anchors = new Map<string, WorldAnchor>();
  lastGoodAccuracy = Infinity;
  hasFix = false;

  /** Update dari watchPosition. Mengembalikan true bila fix dipakai. */
  applyGpsFix(fix: GpsFix): boolean {
    if (!this.origin) {
      this.origin = { lat: fix.lat, lng: fix.lng };
      this.hasFix = true;
      this.lastGoodAccuracy = fix.accuracy;
      return true;
    }
    // GPS jelek: jangan rusak world anchor, pertahankan posisi terakhir.
    if (fix.accuracy > POOR_ACCURACY_METERS && this.hasFix) return false;
    const enu = enuFromGeodetic(this.origin, fix);
    this.userTarget = { x: enu.x, y: 0, z: enu.z };
    this.hasFix = true;
    this.lastGoodAccuracy = fix.accuracy;
    return true;
  }

  /** Buat anchor sekali saja; anchor lama dipakai ulang. */
  ensureAnchor(id: string, latLng: LatLng, up: number): WorldAnchor | null {
    if (!this.origin) return null;
    const existing = this.anchors.get(id);
    if (existing) {
      existing.position.y = up;
      return existing;
    }
    const enu = enuFromGeodetic(this.origin, latLng, up);
    const anchor: WorldAnchor = { id, position: enu, latLng };
    this.anchors.set(id, anchor);
    return anchor;
  }

  removeAnchor(id: string) {
    this.anchors.delete(id);
  }

  /** Koreksi drift GPS secara halus (dipanggil tiap frame). */
  update(alpha = 0.06) {
    this.userPosition.x = lerp(this.userPosition.x, this.userTarget.x, alpha);
    this.userPosition.z = lerp(this.userPosition.z, this.userTarget.z, alpha);
  }
}

/** Histeresis radius agar jitter GPS tidak membuka/menutup konten berulang. */
export function isInsideRadius(
  distance: number,
  radiusMeters: number,
  accuracy: number,
  wasInside: boolean,
): boolean {
  const tolerance = Math.min(Math.max(accuracy, 0), 20);
  const enter = Math.max(1, radiusMeters) + tolerance;
  const exit = enter + 6;
  return distance <= (wasInside ? exit : enter);
}

/** Deteksi kemampuan perangkat untuk AR (dipisah: GPS, orientasi, kamera, WebXR). */

export type ARCapabilities = {
  secureContext: boolean;
  camera: boolean;
  gps: boolean;
  orientation: boolean;
  webxrAR: boolean;
  /** ringkasan mode yang dipakai */
  mode: "webxr" | "fallback" | "unavailable";
  message: string | null;
};

export async function detectARCapabilities(): Promise<ARCapabilities> {
  const secureContext = typeof window !== "undefined" && window.isSecureContext;
  const camera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const gps = typeof navigator !== "undefined" && "geolocation" in navigator;
  const orientation = typeof window !== "undefined" && "DeviceOrientationEvent" in window;

  let webxrAR = false;
  try {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported?: (m: string) => Promise<boolean> } }).xr;
    if (secureContext && xr?.isSessionSupported) {
      webxrAR = await xr.isSessionSupported("immersive-ar");
    }
  } catch {
    webxrAR = false;
  }

  let mode: ARCapabilities["mode"] = "fallback";
  let message: string | null = null;

  if (!secureContext) {
    mode = "unavailable";
    message = "AR memerlukan koneksi aman (HTTPS). Buka BioWes lewat tautan https.";
  } else if (!camera) {
    mode = "unavailable";
    message = "Kamera tidak tersedia di perangkat/browser ini, sehingga AR tidak dapat dijalankan.";
  } else if (webxrAR) {
    mode = "webxr";
    message = "AR penuh (WebXR) tersedia: pelacakan kamera perangkat digunakan.";
  } else {
    mode = "fallback";
    message =
      "Perangkat ini tidak mendukung AR penuh. BioWes menggunakan mode AR kompatibilitas dengan GPS dan sensor.";
  }

  if (mode === "fallback" && !orientation) {
    message =
      "Sensor orientasi tidak terdeteksi. Marker mungkin tidak mengikuti arah pandang — gunakan indikator navigasi di layar.";
  }
  if (mode === "fallback" && !gps) {
    message = "Izin lokasi (GPS) tidak tersedia. Titik pembelajaran tidak dapat ditempatkan di dunia nyata.";
  }

  return { secureContext, camera, gps, orientation, webxrAR, mode, message };
}

export function describeError(kind: string): string {
  switch (kind) {
    case "camera-denied":
      return "Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser lalu muat ulang.";
    case "gps-denied":
      return "Izin lokasi ditolak. BioWes membutuhkan GPS untuk menempatkan titik pembelajaran.";
    case "motion-denied":
      return "Izin sensor gerak ditolak. Mode AR berjalan terbatas tanpa mengikuti arah pandang.";
    case "gps-poor":
      return "Akurasi GPS sedang buruk. Posisi marker dipertahankan dari data terakhir yang andal.";
    case "webxr-unavailable":
      return "AR penuh tidak tersedia di perangkat ini. BioWes menggunakan mode kompatibilitas GPS + sensor.";
    default:
      return "Terjadi kendala pada mode AR.";
  }
}

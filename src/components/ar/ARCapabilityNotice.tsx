import type { ARCapabilities } from "@/lib/ar/webxr";

/** Pesan kemampuan perangkat (Bahasa Indonesia, ramah pengguna). */
export function ARCapabilityNotice({ caps, error }: { caps: ARCapabilities | null; error: string | null }) {
  if (!caps && !error) return null;
  return (
    <div className="space-y-2 text-left text-xs">
      {caps && (
        <div className="rounded-lg bg-black/30 p-3 ring-1 ring-white/15">
          <div className="font-semibold">
            {caps.mode === "webxr"
              ? "Mode: AR penuh (WebXR)"
              : caps.mode === "fallback"
                ? "Mode: AR kompatibilitas (GPS + sensor)"
                : "Mode: AR tidak tersedia"}
          </div>
          <p className="mt-1 text-emerald-50/85">{caps.message}</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-emerald-50/80">
            <li>Kamera: {caps.camera ? "tersedia" : "tidak tersedia"}</li>
            <li>GPS: {caps.gps ? "tersedia" : "tidak tersedia"}</li>
            <li>Sensor gerak: {caps.orientation ? "tersedia" : "tidak tersedia"}</li>
            <li>WebXR AR: {caps.webxrAR ? "didukung" : "tidak didukung"}</li>
          </ul>
          {caps.mode === "fallback" && (
            <p className="mt-2 text-[11px] text-amber-200/90">
              Catatan: mode kompatibilitas memakai GPS dan kompas, bukan pelacakan ruangan (SLAM), sehingga
              posisi marker bisa meleset beberapa meter.
            </p>
          )}
        </div>
      )}
      {error && <div className="rounded-lg bg-red-500/90 p-2 text-white">{error}</div>}
    </div>
  );
}

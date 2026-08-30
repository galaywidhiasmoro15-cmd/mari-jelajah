let loadPromise: Promise<any> | null = null;

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (loadPromise) return loadPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;

  loadPromise = new Promise((resolve, reject) => {
    (window as any).__gobioInitMap = () => resolve((window as any).google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__gobioInitMap&libraries=marker&channel=${channel}`;
    s.async = true;
    s.onerror = () => reject(new Error("Gagal memuat Google Maps"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

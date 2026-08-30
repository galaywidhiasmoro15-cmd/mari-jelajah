import * as THREE from "three";

/**
 * Pelacakan orientasi perangkat (fallback, bukan SLAM).
 *
 * Menghasilkan quaternion kamera langsung dari sensor orientasi perangkat
 * (alpha/beta/gamma + orientasi layar), sehingga tidak ada lagi konversi
 * heading/pitch -> koordinat CSS. Nilai disimpan dalam ref internal dan
 * di-smoothing dengan slerp supaya tidak jitter tanpa menambah lag berlebihan.
 */
export class DeviceOrientationPose {
  readonly quaternion = new THREE.Quaternion();

  private target = new THREE.Quaternion();
  private alpha = 0;
  private beta = 0;
  private gamma = 0;
  private screenAngle = 0;
  private compassHeading: number | null = null;

  hasData = false;
  headingDeg = 0;

  private readonly zee = new THREE.Vector3(0, 0, 1);
  private readonly euler = new THREE.Euler();
  private readonly q0 = new THREE.Quaternion();
  private readonly q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

  private onOrientation = (e: DeviceOrientationEvent) => {
    const anyEvent = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    if (typeof anyEvent.webkitCompassHeading === "number" && !Number.isNaN(anyEvent.webkitCompassHeading)) {
      this.compassHeading = anyEvent.webkitCompassHeading;
      this.alpha = ((360 - anyEvent.webkitCompassHeading) * Math.PI) / 180;
    } else if (typeof e.alpha === "number") {
      this.compassHeading = (360 - e.alpha) % 360;
      this.alpha = (e.alpha * Math.PI) / 180;
    }
    if (typeof e.beta === "number") this.beta = (e.beta * Math.PI) / 180;
    if (typeof e.gamma === "number") this.gamma = (e.gamma * Math.PI) / 180;
    this.hasData = true;
  };

  private onScreenOrientation = () => {
    const angle =
      (typeof screen !== "undefined" && screen.orientation && typeof screen.orientation.angle === "number"
        ? screen.orientation.angle
        : ((window as unknown as { orientation?: number }).orientation ?? 0)) || 0;
    this.screenAngle = (angle * Math.PI) / 180;
  };

  start() {
    this.onScreenOrientation();
    window.addEventListener("orientationchange", this.onScreenOrientation);
    screen.orientation?.addEventListener?.("change", this.onScreenOrientation);
    window.addEventListener("deviceorientationabsolute", this.onOrientation as EventListener, true);
    window.addEventListener("deviceorientation", this.onOrientation as EventListener, true);
  }

  stop() {
    window.removeEventListener("orientationchange", this.onScreenOrientation);
    screen.orientation?.removeEventListener?.("change", this.onScreenOrientation);
    window.removeEventListener("deviceorientationabsolute", this.onOrientation as EventListener, true);
    window.removeEventListener("deviceorientation", this.onOrientation as EventListener, true);
  }

  /** Hitung quaternion target lalu slerp menuju target (smoothing pendek). */
  update(smoothing = 0.35) {
    if (!this.hasData) return;
    this.euler.set(this.beta, this.alpha, -this.gamma, "YXZ");
    this.target.setFromEuler(this.euler);
    this.target.multiply(this.q1);
    this.target.multiply(this.q0.setFromAxisAngle(this.zee, -this.screenAngle));
    this.quaternion.slerp(this.target, Math.min(1, Math.max(0.05, smoothing)));
    if (this.compassHeading !== null) this.headingDeg = this.compassHeading;
  }

  /** Minta izin sensor gerak (iOS 13+). */
  static async requestPermission(): Promise<"granted" | "denied" | "unsupported"> {
    const DOE = (window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
    }).DeviceOrientationEvent;
    if (!DOE) return "unsupported";
    if (typeof DOE.requestPermission !== "function") return "granted";
    try {
      const res = await DOE.requestPermission();
      return res === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
}

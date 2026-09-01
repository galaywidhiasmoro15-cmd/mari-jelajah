import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DeviceOrientationPose } from "@/lib/ar/devicePose";
import { WorldAnchorSystem, isInsideRadius } from "@/lib/ar/gpsAnchor";
import { projectObject, screenSpaceBearingDelta } from "@/lib/ar/projection";
import { makeButtonTexture, makeLabelTexture, makePanelTexture } from "@/lib/ar/textures";
import { extractARMedia } from "@/lib/ar/media";

export type ARWorldLocation = {
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
  anchor_height_meters: number | null;
  ar_scale: number | null;
  ar_offset_x: number | null;
  ar_offset_y: number | null;
  ar_offset_z: number | null;
};

export type ARActivation =
  | { type: "open"; locationId: string }
  | { type: "choice"; locationId: string; choice: string }
  | { type: "finish"; locationId: string }
  | { type: "next"; locationId: string };

export type ARStatus = {
  heading: number;
  accuracy: number | null;
  trackingMode: "webxr" | "sensor";
  nearest: { id: string; title: string; distance: number } | null;
  inRange: { id: string; distance: number }[];
};

type Props = {
  locations: ARWorldLocation[];
  openId: string | null;
  answered: string | null;
  stereo: boolean;
  preferWebXR: boolean;
  dwellMs?: number;
  onActivate: (a: ARActivation) => void;
  onStatus: (s: ARStatus) => void;
  onError: (message: string) => void;
};

const EYE_HEIGHT = 1.55;
const IPD = 0.064;
const PANEL_DEFAULT_Y = 1.35;
// Mode stereo memakai separuh lebar layar per mata → panel diperbesar agar terbaca.
const STEREO_PANEL_SCALE = 1.8;

type Interactive = {
  object: THREE.Object3D;
  radius: number;
  action: ARActivation;
};

export function ARScene(props: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const dwellRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const dirtyRef = useRef(0);
  // Rebuild objek dunia hanya bila daftar lokasi / panel yang terbuka berubah.
  const signature =
    props.locations.map((l) => `${l.id}:${l.ar_scale}:${l.anchor_height_meters}`).join("|") +
    `#${props.openId}#${props.answered}#${props.stereo}`;
  useEffect(() => {
    dirtyRef.current += 1;
  }, [signature]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.autoClear = false;
    renderer.xr.enabled = true;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    const worldRoot = new THREE.Group();
    scene.add(worldRoot);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x224433, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(4, 8, 2);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 2000);
    camera.position.set(0, EYE_HEIGHT, 0);

    // ---- latar kamera (video) ----
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    let videoTexture: THREE.VideoTexture | null = null;
    let stream: MediaStream | null = null;

    const bgScene = new THREE.Scene();
    const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const bgMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
    bgScene.add(bgMesh);

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        if (disposed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        void video.play().catch(() => {});
        videoTexture = new THREE.VideoTexture(video);
        videoTexture.colorSpace = THREE.SRGBColorSpace;
        bgMaterial.map = videoTexture;
        bgMaterial.color.set(0xffffff);
        bgMaterial.needsUpdate = true;
      })
      .catch(() => {
        propsRef.current.onError("Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser lalu muat ulang.");
      });

    // ---- pose & anchor ----
    const pose = new DeviceOrientationPose();
    pose.start();
    const anchors = new WorldAnchorSystem();
    const inRangeState = new Map<string, boolean>();
    let gpsAccuracy: number | null = null;
    let watchId: number | null = null;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (p) => {
          gpsAccuracy = p.coords.accuracy;
          const created = anchors.applyGpsFix({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
          });
          if (created) dirtyRef.current += 1;
        },
        (err) => {
          propsRef.current.onError(
            err.code === err.PERMISSION_DENIED
              ? "Izin lokasi ditolak. BioWes membutuhkan GPS untuk menempatkan titik pembelajaran."
              : "GPS: " + err.message,
          );
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
      );
    }

    // ---- objek dunia ----
    const interactives: Interactive[] = [];
    const markerRefs: { id: string; group: THREE.Group; bob: THREE.Object3D; billboards: THREE.Object3D[] }[] = [];
    const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
    let builtSignature = -1;
    let buildToken = 0;

    function clearWorld() {
      buildToken += 1;
      worldRoot.clear();
      interactives.length = 0;
      markerRefs.length = 0;
      disposables.forEach((d) => d.dispose());
      disposables.length = 0;
    }

    function planeMesh(texture: THREE.Texture, width: number, height: number) {
      const geo = new THREE.PlaneGeometry(width, height);
      const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
      disposables.push(geo, mat, texture);
      return new THREE.Mesh(geo, mat);
    }

    function buildWorld() {
      const p = propsRef.current;
      if (!anchors.origin) return;
      clearWorld();

      for (const loc of p.locations) {
        const anchorHeight = loc.anchor_height_meters ?? 1.5;
        const anchor = anchors.ensureAnchor(loc.id, { lat: loc.lat, lng: loc.lng }, anchorHeight);
        if (!anchor) continue;
        const scale = Math.max(0.3, loc.ar_scale ?? 1);
        const isSoal = loc.kind === "soal";
        const accent = isSoal ? "#ef4444" : "#3b82f6";
        const color = new THREE.Color(accent);

        const group = new THREE.Group();
        group.position.set(
          anchor.position.x + (loc.ar_offset_x ?? 0),
          anchor.position.y + (loc.ar_offset_y ?? 0),
          anchor.position.z + (loc.ar_offset_z ?? 0),
        );
        group.scale.setScalar(scale);
        worldRoot.add(group);

        // tiang cahaya dari tanah menuju anchor
        const beamHeight = Math.max(0.2, anchorHeight);
        const beamGeo = new THREE.CylinderGeometry(0.035, 0.035, beamHeight, 8);
        const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 });
        disposables.push(beamGeo, beamMat);
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = -beamHeight / 2;
        group.add(beam);

        // penanda 3D (pin) — animasi sangat halus agar tetap terasa terpaku di dunia
        const bob = new THREE.Group();
        group.add(bob);
        const pinGeo = new THREE.ConeGeometry(0.22, 0.55, 20);
        const pinMat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.55,
          roughness: 0.35,
          metalness: 0.1,
        });
        disposables.push(pinGeo, pinMat);
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.rotation.x = Math.PI;
        bob.add(pin);

        const haloGeo = new THREE.RingGeometry(0.3, 0.42, 32);
        const haloMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        });
        disposables.push(haloGeo, haloMat);
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = -beamHeight + 0.02;
        group.add(halo);

        const distance = Math.hypot(
          anchor.position.x - anchors.userPosition.x,
          anchor.position.z - anchors.userPosition.z,
        );
        const label = planeMesh(
          makeLabelTexture(loc.title, `${Math.round(distance)} m`, accent),
          1.2,
          0.35,
        );
        label.position.y = 0.75;
        group.add(label);

        markerRefs.push({ id: loc.id, group, bob, billboards: [label] });

        if (p.openId !== loc.id) {
          interactives.push({ object: bob, radius: 0.45, action: { type: "open", locationId: loc.id } });
        }
      }

      // panel materi/soal — objek dunia pada anchor yang sama
      const open = p.locations.find((l) => l.id === p.openId);
      if (open) {
        const anchor = anchors.ensureAnchor(
          open.id,
          { lat: open.lat, lng: open.lng },
          open.anchor_height_meters ?? 1.5,
        );
        if (anchor) {
          const isSoal = open.kind === "soal";
          const accent = isSoal ? "#ef4444" : "#3b82f6";
          const panelGroup = new THREE.Group();
          panelGroup.position.set(
            anchor.position.x + (open.ar_offset_x ?? 0),
            anchor.position.y + (open.ar_offset_y ?? 0) + PANEL_DEFAULT_Y,
            anchor.position.z + (open.ar_offset_z ?? 0),
          );
          // Di mode stereo tiap mata hanya memakai separuh layar, jadi panel diperbesar
          // agar teks materi/soal tetap terbaca.
          const stereoBoost = p.stereo ? STEREO_PANEL_SCALE : 1;
          panelGroup.scale.setScalar(Math.max(0.3, open.ar_scale ?? 1) * stereoBoost);
          worldRoot.add(panelGroup);

          const rawBody =
            p.answered === "correct"
              ? "Jawaban benar. Bagus!"
              : p.answered === "wrong"
                ? "Belum tepat. Pandang pilihan lain untuk mencoba lagi."
                : p.answered === "done"
                  ? "Materi selesai dibaca."
                  : isSoal
                    ? (open.question ?? "")
                    : (open.content || open.description || "");
          const media = extractARMedia(rawBody);
          const footerBase = isSoal ? "Pandang salah satu jawaban ±1,8 detik" : `Nilai: ${open.points} poin`;
          const { texture } = makePanelTexture({
            title: open.title,
            body: media.text,
            accent,
            footer: media.links.length
              ? `${footerBase} • Tautan: ${media.links[0].replace(/^https?:\/\//, "").slice(0, 40)}`
              : footerBase,
          });
          const panel = planeMesh(texture, 1.6, 1.0);
          panelGroup.add(panel);

          // ---- media dari tautan di dalam materi/soal ----
          const token = buildToken;
          media.images.slice(0, 2).forEach((url, i) => {
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin("anonymous");
            loader.load(
              url,
              (tex) => {
                if (token !== buildToken) {
                  tex.dispose();
                  return;
                }
                tex.colorSpace = THREE.SRGBColorSpace;
                const img = tex.image as { width?: number; height?: number } | undefined;
                const aspect = (img?.width || 1) / (img?.height || 1);
                const w = 1.15;
                const h = w / Math.max(0.35, Math.min(3, aspect));
                const mesh = planeMesh(tex, w, h);
                mesh.position.set(1.45, 0.35 - i * (h + 0.12), 0.01);
                panelGroup.add(mesh);
              },
              undefined,
              () => {
                propsRef.current.onError("Gambar pada materi gagal dimuat (periksa tautan/izin server gambar).");
              },
            );
          });

          media.models.slice(0, 1).forEach((url) => {
            void import("three/examples/jsm/loaders/GLTFLoader.js")
              .then(({ GLTFLoader }) => {
                new GLTFLoader().load(
                  url,
                  (gltf) => {
                    if (token !== buildToken) return;
                    const model = gltf.scene;
                    const box = new THREE.Box3().setFromObject(model);
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z) || 1;
                    const s = 0.9 / maxDim;
                    model.scale.setScalar(s);
                    const center = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
                    model.position.set(-1.5 - center.x, 0.35 - center.y, -center.z);
                    panelGroup.add(model);
                  },
                  undefined,
                  () => {
                    propsRef.current.onError("Model 3D pada materi gagal dimuat.");
                  },
                );
              })
              .catch(() => {
                /* abaikan */
              });
          });

          const billboards: THREE.Object3D[] = [panelGroup];

          if (isSoal && !p.answered) {
            (open.choices || []).slice(0, 6).forEach((choice, i) => {
              const col = i % 2;
              const row = Math.floor(i / 2);
              const btn = planeMesh(makeButtonTexture(choice, "choice"), 0.74, 0.19);
              btn.position.set(col === 0 ? -0.41 : 0.41, -0.62 - row * 0.24, 0.01);
              panelGroup.add(btn);
              interactives.push({
                object: btn,
                radius: 0.2,
                action: { type: "choice", locationId: open.id, choice },
              });
            });
          }
          if (!isSoal && !p.answered) {
            const btn = planeMesh(makeButtonTexture(`Selesai baca (+${open.points})`, "primary"), 0.9, 0.22);
            btn.position.set(0, -0.66, 0.01);
            panelGroup.add(btn);
            interactives.push({ object: btn, radius: 0.24, action: { type: "finish", locationId: open.id } });
          }
          if (p.answered) {
            const btn = planeMesh(makeButtonTexture("Lanjut cari titik lain", "neutral"), 0.9, 0.22);
            btn.position.set(0, -0.66, 0.01);
            panelGroup.add(btn);
            interactives.push({ object: btn, radius: 0.24, action: { type: "next", locationId: open.id } });
          }

          markerRefs.push({ id: `panel:${open.id}`, group: panelGroup, bob: panelGroup, billboards });
        }
      }
    }

    // ---- WebXR ----
    let xrSession: XRSession | null = null;
    let xrAlignY = 0;
    const startXR = async () => {
      const xr = (navigator as Navigator & {
        xr?: {
          isSessionSupported?: (m: string) => Promise<boolean>;
          requestSession?: (m: string, o?: XRSessionInit) => Promise<XRSession>;
        };
      }).xr;
      if (!xr?.requestSession) return;
      try {
        const session = await xr.requestSession("immersive-ar", { optionalFeatures: ["local-floor", "dom-overlay"] });
        xrSession = session;
        xrAlignY = (-pose.headingDeg * Math.PI) / 180;
        await renderer.xr.setSession(session);
        session.addEventListener("end", () => {
          xrSession = null;
        });
      } catch {
        propsRef.current.onError(
          "AR penuh tidak tersedia di perangkat ini. BioWes menggunakan mode kompatibilitas GPS + sensor.",
        );
      }
    };
    if (props.preferWebXR) void startXR();

    // ---- loop ----
    const dwellState = { id: null as string | null, start: 0 };
    let lastStatus = 0;
    const tmpRight = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    const camWorldPos = new THREE.Vector3();
    const clock = new THREE.Clock();

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = props.stereo ? w / 2 / h : w / h;
      camera.updateProjectionMatrix();
      // "cover" untuk latar video
      if (videoTexture && video.videoWidth) {
        const eyeAspect = (props.stereo ? w / 2 : w) / h;
        const videoAspect = video.videoWidth / video.videoHeight;
        const s = eyeAspect > videoAspect ? [1, videoAspect / eyeAspect] : [eyeAspect / videoAspect, 1];
        videoTexture.repeat.set(s[0], s[1]);
        videoTexture.offset.set((1 - s[0]) / 2, (1 - s[1]) / 2);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const renderBackground = () => {
      if (!videoTexture) return;
      renderer.render(bgScene, bgCamera);
    };

    const drawEye = (x: number, y: number, w: number, h: number, offset: number) => {
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      renderer.setScissorTest(true);
      renderBackground();
      if (offset !== 0) {
        camera.getWorldDirection(tmpDir);
        tmpRight.crossVectors(tmpDir, camera.up).normalize();
        camera.position.addScaledVector(tmpRight, offset);
        camera.updateMatrixWorld();
      }
      renderer.render(scene, camera);
      if (offset !== 0) {
        camera.position.addScaledVector(tmpRight, -offset);
        camera.updateMatrixWorld();
      }
    };

    const animate = () => {
      const p = propsRef.current;
      const dt = clock.getDelta();
      const t = performance.now();

      if (dirtyRef.current !== builtSignature) {
        builtSignature = dirtyRef.current;
        buildWorld();
      }

      pose.update(Math.min(1, 8 * dt));
      anchors.update(0.06);

      const inXR = !!xrSession && renderer.xr.isPresenting;
      if (inXR) {
        // Kamera dikendalikan WebXR; dunia digeser agar anchor ENU sejajar sesi AR.
        worldRoot.rotation.y = xrAlignY;
        const u = new THREE.Vector3(-anchors.userPosition.x, -EYE_HEIGHT, -anchors.userPosition.z);
        u.applyAxisAngle(new THREE.Vector3(0, 1, 0), xrAlignY);
        worldRoot.position.copy(u);
        const xrCam = renderer.xr.getCamera();
        xrCam.getWorldPosition(camWorldPos);
        camera.position.copy(camWorldPos);
        camera.quaternion.copy(xrCam.quaternion);
        camera.updateMatrixWorld();
      } else {
        worldRoot.rotation.y = 0;
        worldRoot.position.set(0, 0, 0);
        camera.position.set(anchors.userPosition.x, EYE_HEIGHT, anchors.userPosition.z);
        camera.quaternion.copy(pose.quaternion);
        camera.updateMatrixWorld();
      }

      // animasi halus + billboard sumbu-Y (posisi dunia tidak berubah)
      for (const m of markerRefs) {
        m.bob.position.y = Math.sin(t / 900) * 0.03;
        for (const b of m.billboards) {
          const target = b === m.group ? m.group : b;
          const world = new THREE.Vector3();
          target.getWorldPosition(world);
          const angle = Math.atan2(camera.position.x - world.x, camera.position.z - world.z);
          if (b === m.group) m.group.rotation.y = angle;
          else b.rotation.y = angle - m.group.rotation.y;
        }
      }

      // ---- gaze / dwell dari proyeksi layar sebenarnya ----
      const width = renderer.domElement.clientWidth;
      const height = renderer.domElement.clientHeight;
      const eyeWidth = p.stereo ? width / 2 : width;
      const cx = eyeWidth / 2;
      const cy = height / 2;
      let hit: Interactive | null = null;
      let hitDistance = Infinity;
      for (const it of interactives) {
        const proj = projectObject(it.object, it.radius, camera, eyeWidth, height);
        if (!proj.inFront) continue;
        const d = Math.hypot(proj.x - cx, proj.y - cy);
        if (d <= proj.radius * 1.15 && proj.distance < hitDistance) {
          hit = it;
          hitDistance = proj.distance;
        }
      }
      const dwellMs = p.dwellMs ?? 1800;
      let progress = 0;
      if (hit) {
        const id = JSON.stringify(hit.action);
        if (dwellState.id !== id) {
          dwellState.id = id;
          dwellState.start = t;
        }
        progress = Math.min(1, (t - dwellState.start) / dwellMs);
        if (progress >= 1) {
          dwellState.id = null;
          const action = hit.action;
          hit = null;
          progress = 0;
          p.onActivate(action);
        }
      } else {
        dwellState.id = null;
      }
      if (dwellRef.current) {
        dwellRef.current.style.opacity = hit ? "1" : "0.55";
        dwellRef.current.style.background = `conic-gradient(#34d399 ${progress * 360}deg, rgba(255,255,255,0.25) 0deg)`;
      }

      // ---- HUD navigasi (screen-space, sengaja berbeda dari marker dunia) ----
      let nearest: ARStatus["nearest"] = null;
      let nearestDelta = 0;
      const inRange: ARStatus["inRange"] = [];
      for (const loc of p.locations) {
        const m = markerRefs.find((x) => x.id === loc.id);
        if (!m) continue;
        const world = new THREE.Vector3();
        m.group.getWorldPosition(world);
        const dist = Math.hypot(world.x - camera.position.x, world.z - camera.position.z);
        const was = inRangeState.get(loc.id) ?? false;
        const inside = isInsideRadius(dist, loc.radius_meters, gpsAccuracy ?? 15, was);
        inRangeState.set(loc.id, inside);
        if (inside) inRange.push({ id: loc.id, distance: dist });
        if (!nearest || dist < nearest.distance) {
          nearest = { id: loc.id, title: loc.title, distance: dist };
          nearestDelta = screenSpaceBearingDelta(m.group, camera);
        }
      }
      if (navRef.current) {
        navRef.current.style.transform = `rotate(${nearestDelta}deg)`;
      }

      if (t - lastStatus > 400) {
        lastStatus = t;
        p.onStatus({
          heading: pose.headingDeg,
          accuracy: gpsAccuracy,
          trackingMode: inXR ? "webxr" : "sensor",
          nearest,
          inRange,
        });
      }

      // ---- render ----
      renderer.clear();
      if (inXR) {
        renderer.render(scene, camera);
      } else if (p.stereo) {
        drawEye(0, 0, width / 2, height, -IPD / 2);
        drawEye(width / 2, 0, width / 2, height, IPD / 2);
        renderer.setScissorTest(false);
      } else {
        renderer.setViewport(0, 0, width, height);
        renderer.setScissorTest(false);
        renderBackground();
        renderer.render(scene, camera);
      }
    };

    renderer.setAnimationLoop(animate);

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      pose.stop();
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      stream?.getTracks().forEach((t) => t.stop());
      xrSession?.end?.().catch(() => {});
      clearWorld();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // Scene dibangun sekali; props terbaru dibaca lewat propsRef agar tidak
    // membangun ulang Three.js / world anchor setiap render React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // aspek kamera mengikuti mode stereo
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [props.stereo]);

  return (
    <div ref={mountRef} className="absolute inset-0 overflow-hidden bg-black">
      {/* kursor dwell (screen-space, hanya alat bidik) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          ref={dwellRef}
          className="h-9 w-9 rounded-full transition-opacity"
          style={{ background: "rgba(255,255,255,0.25)", padding: 3 }}
        >
          <div className="h-full w-full rounded-full bg-black/25 ring-1 ring-white/60" />
        </div>
      </div>
      {/* indikator navigasi (bukan marker AR) */}
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
        <div
          ref={navRef}
          className="h-6 w-6 text-emerald-300"
          style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,.7))" }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2 L18 20 L12 16 L6 20 Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

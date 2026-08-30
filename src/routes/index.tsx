import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, GraduationCap, Shield } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GoBio Explorer — Belajar Biologi Berbasis Lokasi" },
      {
        name: "description",
        content:
          "Jelajahi materi & kuis Biologi di dunia nyata. Buka konten dengan mendekati titik lokasi seperti di Pokémon GO.",
      },
      { property: "og:title", content: "GoBio Explorer" },
      {
        property: "og:description",
        content: "Belajar Biologi berbasis lokasi. Bergerak, jelajahi, dan naik level.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="merapi-bg min-h-screen text-white">
      <div className="min-h-screen w-full bg-gradient-to-b from-emerald-900/50 via-emerald-800/30 to-emerald-950/70">
        <div className="mx-auto max-w-md px-6 py-14">


        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/15 backdrop-blur ring-4 ring-white/20">
            <MapPin className="h-12 w-12" />
          </div>
          <h1 className="text-4xl font-black tracking-tight drop-shadow">
            GoBio Explorer
          </h1>
          <p className="mt-3 text-emerald-50/90">
            Belajar Biologi sambil berpetualang. Dekati titik lokasi untuk membuka
            materi & soal.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          <Link
            to="/student"
            className="flex items-center gap-4 rounded-2xl bg-white p-5 text-emerald-900 shadow-xl transition hover:scale-[1.02]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
              <GraduationCap className="h-6 w-6 text-emerald-700" />
            </div>
            <div className="text-left">
              <div className="text-lg font-bold">Masuk sebagai Siswa</div>
              <div className="text-sm text-emerald-700/80">
                Nama & kelas, langsung main
              </div>
            </div>
          </Link>


          <Link
            to="/admin"
            className="flex items-center gap-4 rounded-2xl bg-emerald-900/40 p-5 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-emerald-900/60"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <Shield className="h-6 w-6" />
            </div>
            <div className="text-left">
              <div className="text-lg font-bold">Dashboard Guru / Admin</div>
              <div className="text-sm text-emerald-50/80">
                Kelola lokasi, materi, & soal
              </div>
            </div>
          </Link>
        </div>

        <p className="mt-10 text-center text-xs text-emerald-50/70">
          Aktifkan GPS di perangkatmu untuk pengalaman terbaik.
        </p>
        </div>
      </div>
    </div>
  );
}

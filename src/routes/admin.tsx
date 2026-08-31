import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, setAdmin } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Trash2, Plus, MapPin, Shield, LogOut, Users, Activity as ActivityIcon, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { syncLocationsFn } from "@/lib/sheets-sync.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — GoBio Explorer" },
      { name: "description", content: "Kelola lokasi, materi, dan soal GoBio Explorer." },
      { property: "og:title", content: "Admin — GoBio Explorer" },
      { property: "og:description", content: "Panel guru: kelola titik pembelajaran." },
    ],
  }),
  component: AdminPage,
});

const ADMIN_PASSWORD = "123";

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => setAuthed(isAdmin()), []);
  return (
    <>
      <Toaster position="top-center" richColors />
      {authed ? <AdminDash onLogout={() => { setAdmin(false); setAuthed(false); }} /> : <AdminLogin onOk={() => { setAdmin(true); setAuthed(true); }} />}
    </>
  );
}

function AdminLogin({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState("");
  const navigate = useNavigate();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) onOk();
    else toast.error("Password salah");
  }
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-800 to-slate-950 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2 text-slate-700"><Shield/><span className="font-bold">Admin GoBio</span></div>
          <CardTitle>Masuk Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required/></div>
            <Button type="submit" className="w-full">Masuk</Button>
            <button type="button" onClick={() => navigate({ to: "/" })} className="w-full text-xs text-muted-foreground">Kembali</button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

type Loc = {
  id: string; title: string; description: string | null; content: string | null;
  lat: number; lng: number; radius_meters: number; kind: "materi" | "soal";
  question: string | null; choices: string[] | null; correct_answer: string | null;
  points: number; street_view_enabled: boolean;
};

function AdminDash({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-slate-900 text-white shadow">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <Shield className="h-5 w-5"/>
          <div className="font-bold flex-1">GoBio — Panel Admin</div>
          <button onClick={onLogout} className="text-xs flex items-center gap-1 opacity-80 hover:opacity-100"><LogOut className="h-4 w-4"/>Keluar</button>
        </div>
      </div>
      <div className="mx-auto max-w-5xl p-4">
        <Tabs defaultValue="locations">
          <TabsList>
            <TabsTrigger value="locations"><MapPin className="h-4 w-4 mr-1"/>Lokasi</TabsTrigger>
            <TabsTrigger value="students"><Users className="h-4 w-4 mr-1"/>Siswa</TabsTrigger>
            <TabsTrigger value="activities"><ActivityIcon className="h-4 w-4 mr-1"/>Aktivitas</TabsTrigger>
          </TabsList>
          <TabsContent value="locations"><LocationsPanel/></TabsContent>
          <TabsContent value="students"><StudentsPanel/></TabsContent>
          <TabsContent value="activities"><ActivitiesPanel/></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function LocationsPanel() {
  const [items, setItems] = useState<Loc[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Loc | null>(null);

  async function load() {
    const { data } = await supabase.from("locations").select("*").order("created_at", { ascending: false });
    setItems((data as Loc[]) || []);
  }
  useEffect(() => { load(); }, []);

  async function del(id: string) {
    if (!confirm("Hapus lokasi ini?")) return;
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Dihapus"); load(); }
  }

  const sync = useServerFn(syncLocationsFn);
  const [syncing, setSyncing] = useState(false);
  async function doSync() {
    setSyncing(true);
    try {
      const r: any = await sync();
      if (r?.error) toast.error(r.error);
      else toast.success(r?.message || "Sinkronisasi selesai");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Gagal sinkronisasi");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-3 pt-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h2 className="font-bold text-lg">Daftar Lokasi ({items.length})</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={doSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`}/>
            {syncing ? "Sinkronisasi..." : "Sync Google Sheets"}
          </Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1"/>Tambah</Button>
        </div>
      </div>
      <div className="grid gap-2">
        {items.map((l) => (
          <Card key={l.id}>
            <CardContent className="p-4 flex items-center gap-3">
              <Badge className={l.kind === "soal" ? "bg-amber-500" : "bg-emerald-500"}>{l.kind}</Badge>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{l.title}</div>
                <div className="text-xs text-muted-foreground">
                  {l.lat.toFixed(6)}, {l.lng.toFixed(6)} · radius {l.radius_meters} m · {l.points} pts
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setEditing(l); setOpen(true); }}>Edit</Button>
              <Button variant="ghost" size="sm" onClick={() => del(l.id)}><Trash2 className="h-4 w-4 text-red-500"/></Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <LocationEditor open={open} onOpenChange={setOpen} initial={editing} onSaved={() => { setOpen(false); load(); }}/>
    </div>
  );
}

function LocationEditor({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: Loc | null; onSaved: () => void;
}) {
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    setForm(initial ? {
      ...initial,
      choices_text: (initial.choices || []).join("\n"),
    } : {
      title: "", description: "", content: "", lat: -6.2, lng: 106.816666,
      radius_meters: 10, kind: "materi", question: "", choices_text: "", correct_answer: "",
      points: 10, street_view_enabled: true,
      anchor_height_meters: 1.5, ar_scale: 1, ar_offset_x: 0, ar_offset_y: 0, ar_offset_z: 0,
    });

  }, [initial, open]);

  function useMyLoc() {
    if (!navigator.geolocation) return toast.error("GPS tidak tersedia");
    navigator.geolocation.getCurrentPosition(
      (p) => setForm((f: any) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude })),
      (e) => toast.error(e.message),
      { enableHighAccuracy: true },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const choices = form.kind === "soal"
      ? String(form.choices_text || "").split("\n").map((s: string) => s.trim()).filter(Boolean)
      : null;
    const payload = {
      title: form.title, description: form.description, content: form.content,
      lat: Number(form.lat), lng: Number(form.lng),
      radius_meters: Number(form.radius_meters) || 10,
      kind: form.kind,
      question: form.kind === "soal" ? form.question : null,
      choices,
      correct_answer: form.kind === "soal" ? form.correct_answer : null,
      points: Number(form.points) || 10,
      street_view_enabled: !!form.street_view_enabled,
      anchor_height_meters: form.anchor_height_meters === "" || form.anchor_height_meters == null ? 1.5 : Number(form.anchor_height_meters),
      ar_scale: form.ar_scale === "" || form.ar_scale == null ? 1 : Number(form.ar_scale),
      ar_offset_x: Number(form.ar_offset_x) || 0,
      ar_offset_y: Number(form.ar_offset_y) || 0,
      ar_offset_z: Number(form.ar_offset_z) || 0,
    };

    const q = initial
      ? supabase.from("locations").update(payload).eq("id", initial.id)
      : supabase.from("locations").insert(payload);
    const { error } = await q;
    if (error) toast.error(error.message); else { toast.success("Tersimpan"); onSaved(); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? "Edit Lokasi" : "Tambah Lokasi"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div><Label>Judul</Label><Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} required/></div>
          <div><Label>Deskripsi singkat</Label><Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })}/></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Latitude</Label><Input type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} required/></div>
            <div><Label>Longitude</Label><Input type="number" step="any" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} required/></div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={useMyLoc}>Pakai lokasi saya</Button>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Radius (m)</Label><Input type="number" min={1} value={form.radius_meters} onChange={(e) => setForm({ ...form, radius_meters: e.target.value })}/></div>
            <div><Label>Poin</Label><Input type="number" min={0} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })}/></div>
          </div>
          <div className="rounded-lg border p-3 space-y-2">
            <Label className="text-sm font-semibold">Pengaturan AR (opsional)</Label>
            <p className="text-xs text-muted-foreground">
              Menentukan posisi objek 3D di dunia nyata. Kosongkan untuk memakai nilai bawaan.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Tinggi anchor (m)</Label><Input type="number" step="0.1" value={form.anchor_height_meters ?? 1.5} onChange={(e) => setForm({ ...form, anchor_height_meters: e.target.value })}/></div>
              <div><Label>Skala AR</Label><Input type="number" step="0.1" min={0.3} value={form.ar_scale ?? 1} onChange={(e) => setForm({ ...form, ar_scale: e.target.value })}/></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Offset X (m)</Label><Input type="number" step="0.1" value={form.ar_offset_x ?? 0} onChange={(e) => setForm({ ...form, ar_offset_x: e.target.value })}/></div>
              <div><Label>Offset Y (m)</Label><Input type="number" step="0.1" value={form.ar_offset_y ?? 0} onChange={(e) => setForm({ ...form, ar_offset_y: e.target.value })}/></div>
              <div><Label>Offset Z (m)</Label><Input type="number" step="0.1" value={form.ar_offset_z ?? 0} onChange={(e) => setForm({ ...form, ar_offset_z: e.target.value })}/></div>
            </div>
          </div>

          <div>
            <Label>Tipe</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="materi">Materi</SelectItem>
                <SelectItem value="soal">Soal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.kind === "materi" ? (
            <div>
              <Label>Isi materi</Label>
              <Textarea rows={6} value={form.content || ""} onChange={(e) => setForm({ ...form, content: e.target.value })}/>
              <p className="text-xs text-muted-foreground mt-1">
                Tempel link langsung (mis. https://youtu.be/xxx) — otomatis dapat diklik. Format lain: <code>[teks](url)</code> untuk link berlabel, <code>![alt](url)</code> untuk gambar.
              </p>
            </div>
          ) : (
            <>
              <div>
                <Label>Pertanyaan</Label>
                <Textarea rows={2} value={form.question || ""} onChange={(e) => setForm({ ...form, question: e.target.value })} required/>
                <p className="text-xs text-muted-foreground mt-1">
                  Boleh sisipkan link/gambar: <code>[teks](url)</code> atau <code>![alt](url)</code>.
                </p>
              </div>
              <div><Label>Pilihan jawaban (satu per baris)</Label><Textarea rows={4} value={form.choices_text || ""} onChange={(e) => setForm({ ...form, choices_text: e.target.value })} required/></div>
              <div><Label>Jawaban benar (harus sama persis salah satu pilihan)</Label><Input value={form.correct_answer || ""} onChange={(e) => setForm({ ...form, correct_answer: e.target.value })} required/></div>
            </>
          )}
          <Button type="submit" className="w-full">Simpan</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StudentsPanel() {
  const [items, setItems] = useState<any[]>([]);
  async function load() {
    const { data } = await supabase.from("students").select("*").order("points", { ascending: false });
    setItems(data || []);
  }
  useEffect(() => { load(); }, []);

  async function delOne(id: string, name: string) {
    if (!confirm(`Hapus siswa "${name}" beserta seluruh aktivitasnya? Tindakan ini tidak bisa dibatalkan.`)) return;
    const a = await supabase.from("activities").delete().eq("student_id", id);
    if (a.error) return toast.error(a.error.message);
    const s = await supabase.from("students").delete().eq("id", id);
    if (s.error) toast.error(s.error.message);
    else { toast.success("Siswa dihapus"); load(); }
  }

  async function delAll() {
    if (items.length === 0) return;
    if (!confirm(`Hapus SEMUA ${items.length} siswa dan aktivitasnya? Tindakan ini tidak bisa dibatalkan.`)) return;
    if (!confirm("Yakin? Konfirmasi terakhir.")) return;
    const a = await supabase.from("activities").delete().not("id", "is", null);
    if (a.error) return toast.error(a.error.message);
    const s = await supabase.from("students").delete().not("id", "is", null);
    if (s.error) toast.error(s.error.message);
    else { toast.success("Semua siswa dihapus"); load(); }
  }

  async function delInactive() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase.from("activities").select("student_id").gte("created_at", cutoff);
    const activeIds = new Set((recent || []).map((r: any) => r.student_id));
    const targets = items.filter((s) => !activeIds.has(s.id));
    if (targets.length === 0) return toast.info("Tidak ada siswa non-aktif (30 hari terakhir).");
    if (!confirm(`Hapus ${targets.length} siswa yang tidak aktif selama 30 hari terakhir?`)) return;
    const ids = targets.map((t) => t.id);
    const a = await supabase.from("activities").delete().in("student_id", ids);
    if (a.error) return toast.error(a.error.message);
    const s = await supabase.from("students").delete().in("id", ids);
    if (s.error) toast.error(s.error.message);
    else { toast.success(`${targets.length} siswa non-aktif dihapus`); load(); }
  }

  return (
    <div className="pt-4 space-y-2">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h2 className="font-bold text-lg">Papan Peringkat ({items.length})</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={delInactive}>
            <Trash2 className="h-4 w-4 mr-1"/>Hapus non-aktif (30 hari)
          </Button>
          <Button variant="destructive" size="sm" onClick={delAll} disabled={items.length === 0}>
            <Trash2 className="h-4 w-4 mr-1"/>Hapus semua
          </Button>
        </div>
      </div>
      {items.map((s, i) => (
        <Card key={s.id}><CardContent className="p-3 flex items-center gap-3">
          <div className="w-8 text-center font-bold text-slate-500">#{i + 1}</div>
          <div className="flex-1"><div className="font-semibold">{s.name}</div><div className="text-xs text-muted-foreground">{s.class}</div></div>
          <Badge>Lv {s.level}</Badge>
          <Badge className="bg-emerald-500">{s.points} pts</Badge>
          <Button variant="ghost" size="sm" onClick={() => delOne(s.id, s.name)}>
            <Trash2 className="h-4 w-4 text-red-500"/>
          </Button>
        </CardContent></Card>
      ))}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Belum ada siswa.</p>}
    </div>
  );
}

function ActivitiesPanel() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("activities")
      .select("*, students(name,class), locations(title,kind)")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setItems(data || []));
  }, []);
  return (
    <div className="pt-4 space-y-2">
      <h2 className="font-bold text-lg">Riwayat Aktivitas Terakhir</h2>
      {items.map((a) => (
        <Card key={a.id}><CardContent className="p-3 text-sm flex items-center gap-3">
          <div className="flex-1">
            <div><span className="font-semibold">{a.students?.name}</span> <span className="text-muted-foreground">({a.students?.class})</span> — {a.action} · <span className="text-emerald-700">{a.locations?.title}</span></div>
            <div className="text-xs text-muted-foreground">
              {new Date(a.created_at).toLocaleString("id-ID")}
              {a.answer && <> · jawab: "{a.answer}" {a.is_correct ? "✓" : "✗"}</>}
              {a.distance_meters != null && <> · {Math.round(a.distance_meters)} m</>}
            </div>
          </div>
          {a.points_earned > 0 && <Badge className="bg-yellow-400 text-yellow-950">+{a.points_earned}</Badge>}
        </CardContent></Card>
      ))}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>}
    </div>
  );
}

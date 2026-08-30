// Server-only helper: sync Google Sheet → locations table.
const SPREADSHEET_ID = "1QLNpeWilpSwH9lm5kkAaPKHyAynmrO3AVliXZD9S7oc";
const RANGE = "Sheet1!A1:Z1000";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets";

type Row = Record<string, string>;

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseNum(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function syncLocationsFromSheet() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey || !sheetsKey) throw new Error("Missing connector credentials");

  const url = `${GATEWAY}/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values ?? [];
  if (values.length < 2) return { synced: 0, skipped: 0, message: "Tidak ada baris data pada spreadsheet." };

  const headers = values[0].map(norm);
  const rows: Row[] = values.slice(1).map((r) => {
    const obj: Row = {};
    headers.forEach((h, i) => (obj[h] = (r[i] ?? "").toString().trim()));
    return obj;
  });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [idx, row] of rows.entries()) {
    const title = row.judul || row.title;
    const lat = parseNum(row.latitude);
    const lng = parseNum(row.longitude);
    if (!title || lat == null || lng == null) {
      skipped++;
      continue;
    }
    const kindRaw = (row.tipe || row.kind || "materi").toLowerCase();
    const kind = kindRaw.startsWith("soal") ? "soal" : "materi";
    const konten = row.konten || row.content || "";
    const gambar = row.link_gambar || row.image || "";
    const video = row.link_video || row.video || "";
    const jawaban = row.jawaban || row.correct_answer || "";
    const external_id = row.id || `sheet-row-${idx + 2}`;

    // Compose materi content with media links
    const contentParts: string[] = [];
    if (kind === "materi" && konten) contentParts.push(konten);
    if (gambar) contentParts.push(`![gambar](${gambar})`);
    if (video) contentParts.push(`Video: ${video}`);
    const content = contentParts.join("\n\n") || null;

    const payload = {
      external_id,
      title,
      lat,
      lng,
      kind,
      content: kind === "materi" ? content : null,
      question: kind === "soal" ? (konten || title) : null,
      correct_answer: kind === "soal" ? (jawaban || null) : null,
      radius_meters: parseNum(row.radius) ?? 10,
      points: parseNum(row.poin) ?? parseNum(row.points) ?? 10,
      street_view_enabled: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("locations")
      .upsert(payload, { onConflict: "external_id" });
    if (error) {
      errors.push(`Baris ${idx + 2}: ${error.message}`);
      skipped++;
    } else {
      synced++;
    }
  }

  return {
    synced,
    skipped,
    message: `Berhasil ${synced} · Dilewati ${skipped}${errors.length ? " · " + errors.slice(0, 3).join("; ") : ""}`,
  };
}

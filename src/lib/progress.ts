/**
 * Progres belajar siswa: dwell time & klaim poin.
 * Sumber kebenaran ada di database (fungsi tick_dwell & claim_activity),
 * sehingga waktu tidak bisa dimanipulasi dari perangkat siswa.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProgressRow = {
  location_id: string;
  dwell_seconds: number;
  status: string;
  answered_correct: boolean | null;
  points_awarded: number;
  completed_at: string | null;
};

export type TickResult = {
  dwell_seconds: number;
  required_seconds: number;
  status: string;
  active: boolean;
  points_awarded: number;
  completed: boolean;
  error?: string;
};

export type ClaimResult = {
  correct?: boolean | null;
  points_earned?: number;
  total_points?: number;
  completed?: boolean;
  already?: boolean;
  error?: string;
};

export async function fetchProgress(studentId: string): Promise<Record<string, ProgressRow>> {
  const { data } = await supabase
    .from("student_progress")
    .select("location_id, dwell_seconds, status, answered_correct, points_awarded, completed_at")
    .eq("student_id", studentId);
  const map: Record<string, ProgressRow> = {};
  (data || []).forEach((r) => {
    map[r.location_id] = r as ProgressRow;
  });
  return map;
}

export async function tickDwell(studentId: string, locationId: string): Promise<TickResult | null> {
  const { data, error } = await supabase.rpc("tick_dwell", {
    p_student: studentId,
    p_location: locationId,
  });
  if (error) return null;
  return data as unknown as TickResult;
}

export async function claimActivity(
  studentId: string,
  locationId: string,
  answer?: string | null,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_activity", {
    p_student: studentId,
    p_location: locationId,
    p_answer: answer ?? null,
  });
  if (error) return { error: error.message };
  return data as unknown as ClaimResult;
}

/**
 * Jam berbasis waktu server: sekali sinkron, lalu berjalan lokal dengan koreksi
 * selisih. Dipakai untuk menilai apakah jadwal titik sedang aktif.
 */
export function useServerClock(intervalMs = 1000): number {
  const offsetRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const { data } = await supabase.rpc("server_now");
      if (!alive || !data) return;
      offsetRef.current = new Date(data as unknown as string).getTime() - Date.now();
      setNow(Date.now() + offsetRef.current);
    };
    void sync();
    const resync = window.setInterval(() => void sync(), 5 * 60 * 1000);
    const id = window.setInterval(() => setNow(Date.now() + offsetRef.current), intervalMs);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.clearInterval(resync);
    };
  }, [intervalMs]);

  return now;
}

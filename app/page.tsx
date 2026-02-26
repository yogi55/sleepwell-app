"use client";

import { useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const WAKE_WINDOWS_MIN = [90, 105, 120, 135] as const;

type BabyState = "awake" | "asleep";

type SleepSessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
};

let supabaseSingleton: SupabaseClient | null = null;
function getSupabase() {
  if (supabaseSingleton) return supabaseSingleton;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Keep the page functional even if envs are missing in dev.
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  supabaseSingleton = createClient(url, anonKey);
  return supabaseSingleton;
}

function formatDuration(ms: number) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");

  return { hh, mm, ss };
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function Home() {
  const [babyState, setBabyState] = useState<BabyState>("awake");
  const [wakeStart, setWakeStart] = useState<number>(() => Date.now());
  const [tick, setTick] = useState<number>(() => Date.now());
  const [windowIndex, setWindowIndex] = useState<number>(0); // 0..3 for 4‑місячної дитини
  const [activeSleepSessionId, setActiveSleepSessionId] = useState<
    string | null
  >(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1‑секундний тік для оновлення таймера
  useEffect(() => {
    const id = setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const currentWindowMinutes = WAKE_WINDOWS_MIN[windowIndex] ?? WAKE_WINDOWS_MIN[WAKE_WINDOWS_MIN.length - 1];

  // Restore an active sleep session id across refreshes (optional but useful for reliability).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sleepwell_active_session_id");
      if (saved) setActiveSleepSessionId(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      if (activeSleepSessionId) {
        window.localStorage.setItem(
          "sleepwell_active_session_id",
          activeSleepSessionId,
        );
      } else {
        window.localStorage.removeItem("sleepwell_active_session_id");
      }
    } catch {
      // ignore
    }
  }, [activeSleepSessionId]);

  const { elapsedMs, nextNapTime, timeUntilNextNapMs } = useMemo(() => {
    if (!wakeStart) {
      return {
        elapsedMs: 0,
        nextNapTime: null as Date | null,
        timeUntilNextNapMs: null as number | null,
      };
    }

    const now = tick;
    const elapsed = babyState === "awake" ? now - wakeStart : 0;
    const nextNap = new Date(wakeStart + currentWindowMinutes * 60 * 1000);
    const untilNextNap =
      babyState === "awake" ? nextNap.getTime() - now : null;

    return {
      elapsedMs: elapsed,
      nextNapTime: nextNap,
      timeUntilNextNapMs: untilNextNap,
    };
  }, [babyState, wakeStart, tick, currentWindowMinutes]);

  const { hh, mm, ss } = formatDuration(elapsedMs);

  const handleToggle = async () => {
    setSyncError(null);

    // Prevent double-taps while we sync to Supabase (especially on mobile).
    if (isSyncing) return;

    const now = new Date();

    if (babyState === "awake") {
      // -> asleep: create a new sleep session with start_time
      setIsSyncing(true);
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("sleep_sessions")
          .insert({ start_time: now.toISOString(), end_time: null })
          .select("id,start_time,end_time")
          .single<SleepSessionRow>();

        if (error) throw error;
        setActiveSleepSessionId(data.id);
        setBabyState("asleep");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Supabase error";
        setSyncError(msg);
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    // -> awake: close the active sleep session with end_time, and start new wake window
    setIsSyncing(true);
    try {
      const supabase = getSupabase();
      const sessionId = activeSleepSessionId;

      if (sessionId) {
        const { error } = await supabase
          .from("sleep_sessions")
          .update({ end_time: now.toISOString() })
          .eq("id", sessionId);
        if (error) throw error;
      } else {
        // No local session id (e.g. local storage cleared). We still allow the UX flow.
        setSyncError(
          "Не знайдено активну сесію сну для оновлення (продовжую без синку).",
        );
      }

      setActiveSleepSessionId(null);
      setWakeStart(now.getTime());
      setWindowIndex((prevIndex) =>
        Math.min(prevIndex + 1, WAKE_WINDOWS_MIN.length - 1),
      );
      setBabyState("awake");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Supabase error";
      setSyncError(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const isAwake = babyState === "awake";

  const windowLabel = `${windowIndex + 1}-е вікно • ${currentWindowMinutes} хв`;

  let nextNapLabel = "—";
  if (nextNapTime) {
    nextNapLabel = formatTime(nextNapTime);
  }

  let untilLabel = "Почніть відлік з моменту пробудження";
  if (timeUntilNextNapMs != null) {
    const overdue = timeUntilNextNapMs < 0;
    const ms = Math.abs(timeUntilNextNapMs);
    const mins = Math.round(ms / 60000);
    if (overdue) {
      untilLabel = `Перебране вікно на ~${mins} хв`;
    } else {
      untilLabel = `До наступного сну ~${mins} хв`;
    }
  }

  return (
    <div className="flex min-h-screen w-full items-stretch justify-center bg-zinc-950 text-zinc-50">
      <main className="relative flex w-full max-w-md flex-col justify-between px-4 pb-6 pt-4">
        {/* Header */}
        <header className="mb-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Sleepwell
            </span>
            <span className="text-sm text-zinc-400">
              Трекінг сну немовляти (4 міс)
            </span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[11px] text-zinc-400">
            <Moon className="h-3 w-3" />
            <span>Night mode</span>
          </div>
        </header>

        {/* Центр: великий таймер і прогноз */}
        <section className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-3">
            <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              В ЧАСІ НЕСПАННЯ
            </span>
            <div className="rounded-full border border-zinc-800 bg-zinc-900/60 px-5 py-3 text-center">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                Статус
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-100">
                {isAwake ? "Дитина НЕ спить" : "Дитина спить"}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="font-mono text-[52px] leading-none tabular-nums sm:text-[64px]">
              {hh}:{mm}:{ss}
            </div>
            <p className="text-xs text-zinc-500">
              Скільки дитина вже не спить
            </p>
          </div>

          <div className="mt-4 w-full space-y-3">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                    Наступне вкладання
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-50">
                    {nextNapLabel}
                  </p>
                </div>
                <div className="rounded-full bg-zinc-800/80 px-3 py-1 text-[11px] text-zinc-200">
                  {windowLabel}
                </div>
              </div>
              <p className="mt-3 text-xs text-zinc-500">{untilLabel}</p>
            </div>

            {syncError ? (
              <div className="rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-xs text-red-200">
                {syncError}
              </div>
            ) : null}

            <div className="rounded-2xl border border-dashed border-zinc-800/80 px-4 py-3 text-xs text-zinc-500">
              Алгоритм: час пробудження + поточне вікно неспання (4 міс:{" "}
              {WAKE_WINDOWS_MIN.join(" / ")} хв) = час наступного сну.
            </div>
          </div>
        </section>

        {/* Фіксована велика кнопка керування знизу */}
        <section className="pointer-events-none sticky bottom-2 left-0 right-0 mt-6 flex justify-center">
          <div className="pointer-events-auto w-full max-w-md">
            <button
              onClick={handleToggle}
              disabled={isSyncing}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-3xl bg-zinc-50 text-zinc-950 transition active:scale-[0.98] active:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-100">
                {isAwake ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Sun className="h-5 w-5" />
                )}
              </span>
              <div className="flex flex-col items-start">
                <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                  {isSyncing ? "SYNC…" : isAwake ? "SLEEP" : "AWAKE"}
                </span>
                <span className="text-sm">
                  {isAwake
                    ? "Позначити: дитина лягла спати"
                    : "Позначити: дитина прокинулась"}
                </span>
              </div>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

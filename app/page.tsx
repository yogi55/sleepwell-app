"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Milk,
  Moon,
  Sun,
  Timer,
} from "lucide-react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const WAKE_WINDOWS_MIN = [90, 105, 120, 135] as const;

type BabyState = "awake" | "asleep";
type FeedingSide = "left" | "right";

type SleepSessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
};

type BabyLogRow = {
  id: string;
  category: string;
  side: FeedingSide | null;
  ml: number | null;
  is_active: boolean;
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

function formatCompactDuration(ms: number) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

  // Feeding
  const [feedingMl, setFeedingMl] = useState<string>("");
  const [feedingError, setFeedingError] = useState<string | null>(null);
  const [isFeedingSyncing, setIsFeedingSyncing] = useState(false);
  const [activeFeedingId, setActiveFeedingId] = useState<string | null>(null);
  const [activeFeedingSide, setActiveFeedingSide] = useState<
    FeedingSide | null
  >(null);
  const [lastFeedingSide, setLastFeedingSide] = useState<FeedingSide | null>(
    null,
  );

  // Timeline
  const [timeline, setTimeline] = useState<BabyLogRow[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);

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

  // Restore last feeding side (UX hint)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sleepwell_last_feeding_side");
      if (saved === "left" || saved === "right") setLastFeedingSide(saved);
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

  useEffect(() => {
    try {
      if (lastFeedingSide) {
        window.localStorage.setItem("sleepwell_last_feeding_side", lastFeedingSide);
      }
    } catch {
      // ignore
    }
  }, [lastFeedingSide]);

  const fetchTimeline = async () => {
    setIsTimelineLoading(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("baby_logs")
        .select("id,category,side,ml,is_active,start_time,end_time")
        .order("start_time", { ascending: false })
        .limit(10)
        .returns<BabyLogRow[]>();
      if (error) throw error;

      setTimeline(data ?? []);

      // Derive feeding state from timeline (active + last used side)
      const active = (data ?? []).find(
        (r) => r.category === "feeding" && r.is_active,
      );
      if (active) {
        setActiveFeedingId(active.id);
        setActiveFeedingSide(active.side);
      } else {
        setActiveFeedingId(null);
        setActiveFeedingSide(null);
      }

      const lastFeed = (data ?? []).find((r) => r.category === "feeding" && r.side);
      if (lastFeed?.side) setLastFeedingSide(lastFeed.side);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Supabase error";
      setFeedingError(msg);
    } finally {
      setIsTimelineLoading(false);
    }
  };

  // Initial timeline fetch + realtime subscription
  useEffect(() => {
    fetchTimeline();

    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    try {
      const supabase = getSupabase();
      channel = supabase
        .channel("baby_logs_timeline")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "baby_logs" },
          () => {
            fetchTimeline();
          },
        )
        .subscribe();
    } catch {
      // If env vars are missing, keep UI usable without realtime.
    }

    return () => {
      if (channel) {
        try {
          const supabase = getSupabase();
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleFeeding = async (side: FeedingSide) => {
    setFeedingError(null);
    if (isFeedingSyncing) return;

    const now = new Date();
    setIsFeedingSyncing(true);
    try {
      const supabase = getSupabase();

      // If tapping the currently active side -> stop it
      if (activeFeedingId && activeFeedingSide === side) {
        const { error } = await supabase
          .from("baby_logs")
          .update({
            end_time: now.toISOString(),
            is_active: false,
          })
          .eq("id", activeFeedingId);
        if (error) throw error;

        setActiveFeedingId(null);
        setActiveFeedingSide(null);
        await fetchTimeline();
        return;
      }

      // If there is an active feeding on the other side -> end it first
      const otherSide: FeedingSide = side === "left" ? "right" : "left";
      const { data: otherActive, error: otherErr } = await supabase
        .from("baby_logs")
        .select("id")
        .eq("category", "feeding")
        .eq("is_active", true)
        .eq("side", otherSide)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (otherErr) throw otherErr;

      if (otherActive?.id) {
        const { error: endErr } = await supabase
          .from("baby_logs")
          .update({
            end_time: now.toISOString(),
            is_active: false,
          })
          .eq("id", otherActive.id);
        if (endErr) throw endErr;
      }

      const mlValue =
        feedingMl.trim() === "" ? null : Number.parseFloat(feedingMl.trim());
      const ml =
        mlValue != null && Number.isFinite(mlValue) && mlValue >= 0
          ? mlValue
          : null;

      const { data: inserted, error: insErr } = await supabase
        .from("baby_logs")
        .insert({
          category: "feeding",
          side,
          ml,
          is_active: true,
          start_time: now.toISOString(),
          end_time: null,
        })
        .select("id,category,side,ml,is_active,start_time,end_time")
        .single<BabyLogRow>();
      if (insErr) throw insErr;

      setActiveFeedingId(inserted.id);
      setActiveFeedingSide(side);
      setLastFeedingSide(side);
      await fetchTimeline();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Supabase error";
      setFeedingError(msg);
    } finally {
      setIsFeedingSyncing(false);
    }
  };

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

        {/* Feeding + Timeline */}
        <section className="mt-4 w-full space-y-4">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                  Feeding
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Натисни сторону — старт. Повторний клік на активну — стоп.
                </p>
              </div>
              <div className="rounded-full border border-zinc-800 bg-zinc-950/30 px-3 py-1 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  {activeFeedingSide
                    ? `Активно: ${activeFeedingSide.toUpperCase()}`
                    : "Не активно"}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => handleFeeding("left")}
                disabled={isFeedingSyncing}
                className={[
                  "flex h-16 items-center justify-center gap-3 rounded-3xl border transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70",
                  activeFeedingSide === "left"
                    ? "border-emerald-700 bg-emerald-950/40"
                    : "border-zinc-800 bg-zinc-950/30",
                  lastFeedingSide === "left" && activeFeedingSide !== "left"
                    ? "text-emerald-200"
                    : "text-zinc-100",
                ].join(" ")}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-100">
                  <ArrowLeft className="h-5 w-5" />
                </span>
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                    Left
                  </span>
                  <span className="text-sm text-zinc-300">
                    {activeFeedingSide === "left" ? "Stop" : "Start"}
                  </span>
                </div>
              </button>

              <button
                onClick={() => handleFeeding("right")}
                disabled={isFeedingSyncing}
                className={[
                  "flex h-16 items-center justify-center gap-3 rounded-3xl border transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70",
                  activeFeedingSide === "right"
                    ? "border-emerald-700 bg-emerald-950/40"
                    : "border-zinc-800 bg-zinc-950/30",
                  lastFeedingSide === "right" && activeFeedingSide !== "right"
                    ? "text-emerald-200"
                    : "text-zinc-100",
                ].join(" ")}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-100">
                  <ArrowRight className="h-5 w-5" />
                </span>
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                    Right
                  </span>
                  <span className="text-sm text-zinc-300">
                    {activeFeedingSide === "right" ? "Stop" : "Start"}
                  </span>
                </div>
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/30 px-3 py-2">
                <Milk className="h-4 w-4 text-zinc-400" />
                <input
                  value={feedingMl}
                  onChange={(e) => setFeedingMl(e.target.value)}
                  inputMode="decimal"
                  placeholder="ml (пляшечка, опц.)"
                  className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                />
              </div>
              <div className="text-xs text-zinc-500">
                {isFeedingSyncing ? "sync…" : " "}
              </div>
            </div>

            {feedingError ? (
              <div className="mt-3 rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-xs text-red-200">
                {feedingError}
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                Timeline
              </p>
              <p className="text-[11px] text-zinc-500">
                {isTimelineLoading ? "оновлення…" : "останні 10 подій"}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {timeline.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-800/80 px-4 py-6 text-center text-sm text-zinc-500">
                  Поки що немає подій
                </div>
              ) : (
                timeline.map((e) => {
                  const start = new Date(e.start_time);
                  const end = e.end_time ? new Date(e.end_time) : null;
                  const durMs = end
                    ? end.getTime() - start.getTime()
                    : tick - start.getTime();
                  const isActive = e.is_active && !e.end_time;

                  const icon =
                    e.category === "feeding" ? (
                      e.side === "left" ? (
                        <ArrowLeft className="h-4 w-4" />
                      ) : e.side === "right" ? (
                        <ArrowRight className="h-4 w-4" />
                      ) : (
                        <Milk className="h-4 w-4" />
                      )
                    ) : (
                      <Moon className="h-4 w-4" />
                    );

                  const title =
                    e.category === "feeding"
                      ? `Feeding • ${e.side ? e.side.toUpperCase() : "—"}`
                      : e.category;

                  return (
                    <div
                      key={e.id}
                      className="relative flex items-start gap-3"
                    >
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/30 text-zinc-200">
                        {icon}
                      </div>
                      <div className="flex flex-1 flex-col">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-zinc-100">{title}</p>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                            <span>{formatTime(start)}</span>
                            <span className="text-zinc-700">•</span>
                            <span
                              className={
                                isActive ? "text-emerald-300" : "text-zinc-500"
                              }
                            >
                              {formatCompactDuration(durMs)}
                            </span>
                          </div>
                        </div>
                        {e.category === "feeding" && e.ml != null ? (
                          <p className="mt-1 text-xs text-zinc-500">
                            Bottle: {e.ml} ml
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
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

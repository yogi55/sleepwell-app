"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CupSoda,
  History,
  Milk,
  Moon,
  MoonStar,
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

const glassCard =
  "rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-md";

function glowClass(color: "indigo" | "rose") {
  if (color === "indigo") {
    return "shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_0_28px_rgba(99,102,241,0.22)]";
  }
  return "shadow-[0_0_0_1px_rgba(244,63,94,0.35),0_0_28px_rgba(244,63,94,0.22)]";
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
  const isSleepActive = babyState === "asleep";

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
    <div className="flex min-h-screen w-full items-stretch justify-center bg-slate-950 text-slate-50">
      <main className="relative flex w-full max-w-md flex-col px-4 pb-40 pt-6">
        {/* Header */}
        <header className="mb-6 flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
              Sleepwell
            </span>
            <span className="text-sm text-slate-400">4 months • Wake windows</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/40 px-3 py-1 text-[11px] text-slate-400">
            <Moon size={20} strokeWidth={1.5} className="h-4 w-4" />
            <span>Dark</span>
          </div>
        </header>

        {/* Центр: великий таймер і прогноз */}
        <section className="space-y-4">
          <div className={`${glassCard} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
                  Status
                </span>
                <span className="mt-1 text-sm text-slate-50">
                  {isAwake ? "Awake" : "Asleep"}
                </span>
              </div>
              <div
                className={[
                  "rounded-full px-3 py-1 text-[11px]",
                  isSleepActive
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "bg-slate-800/50 text-slate-400",
                ].join(" ")}
              >
                {isSleepActive ? "Sleep active" : windowLabel}
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center gap-2">
              <div className="font-mono text-[64px] leading-none tabular-nums tracking-tight">
                {hh}:{mm}:{ss}
              </div>
              <p className="text-xs text-slate-400">
                {isAwake ? "Time awake" : "Time awake (paused)"}
              </p>
            </div>
          </div>

          <div className={`${glassCard} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
                  Next sleep
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-50">
                  {nextNapLabel}
                </p>
                <p className="mt-2 text-sm text-slate-400">{untilLabel}</p>
              </div>
              <div className="rounded-full bg-indigo-500/20 px-3 py-1 text-[11px] text-indigo-400">
                {currentWindowMinutes}m
              </div>
            </div>
          </div>

          {syncError ? (
            <div className={`${glassCard} border-red-500/20 bg-red-950/20 p-4 text-sm text-red-200`}>
              {syncError}
            </div>
          ) : null}
        </section>

        {/* Timeline (read-only content can live above thumb zone) */}
        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-slate-400">
              <History size={20} strokeWidth={1.5} />
              <span className="text-[11px] font-medium uppercase tracking-[0.28em]">
                Timeline
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              {isTimelineLoading ? "Updating…" : "Last 10"}
            </span>
          </div>

          <div className="space-y-3">
            {timeline.length === 0 ? (
              <div className={`${glassCard} p-6 text-center text-sm text-slate-400`}>
                No events yet
              </div>
            ) : (
              timeline.map((e) => {
                const start = new Date(e.start_time);
                const end = e.end_time ? new Date(e.end_time) : null;
                const durMs = end
                  ? end.getTime() - start.getTime()
                  : tick - start.getTime();
                const isActive = e.is_active && !e.end_time;

                const isFeeding = e.category === "feeding";
                const isBottle = isFeeding && e.ml != null;

                const icon = isFeeding ? (
                  isBottle ? (
                    <CupSoda size={20} strokeWidth={1.5} />
                  ) : (
                    <Milk size={20} strokeWidth={1.5} />
                  )
                ) : (
                  <MoonStar size={20} strokeWidth={1.5} />
                );

                const title = isFeeding
                  ? `Feeding • ${e.side ? e.side.toUpperCase() : "—"}`
                  : e.category;

                const accent =
                  isFeeding ? "rose" : e.category === "sleep" ? "indigo" : "amber";

                const accentText =
                  accent === "rose"
                    ? "text-rose-400"
                    : accent === "indigo"
                      ? "text-indigo-400"
                      : "text-amber-400";
                const accentBg =
                  accent === "rose"
                    ? "bg-rose-500/20"
                    : accent === "indigo"
                      ? "bg-indigo-500/20"
                      : "bg-amber-500/20";

                return (
                  <div key={e.id} className={`${glassCard} p-4`}>
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${accentBg} ${accentText}`}>
                        {icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-sm text-slate-50">{title}</p>
                          <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400 tabular-nums">
                            <span>{formatTime(start)}</span>
                            <span className="text-white/10">•</span>
                            <span className={isActive ? accentText : "text-slate-400"}>
                              {formatCompactDuration(durMs)}
                            </span>
                          </div>
                        </div>
                        {isBottle && e.ml != null ? (
                          <p className="mt-1 text-xs text-slate-400">
                            {e.ml} ml
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Golden thumb zone actions */}
        <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-10 flex justify-center px-4 pb-4 pt-3">
          <div className="pointer-events-auto w-full max-w-md space-y-3">
            <div className={`${glassCard} p-3`}>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleFeeding("left")}
                  disabled={isFeedingSyncing}
                  className={[
                    "flex h-20 items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-950/30 px-4 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-70",
                    activeFeedingSide === "left"
                      ? `bg-rose-500/10 text-rose-400 ${glowClass("rose")} animate-pulse`
                      : "text-slate-50",
                  ].join(" ")}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5">
                    <ArrowLeft size={20} strokeWidth={1.5} />
                  </span>
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] font-medium uppercase tracking-[0.28em]">
                      Left
                    </span>
                    <span className="text-sm text-slate-400">
                      {activeFeedingSide === "left" ? "Stop" : "Start"}
                    </span>
                  </div>
                  {lastFeedingSide === "left" && activeFeedingSide !== "left" ? (
                    <span className="ml-auto h-2 w-2 rounded-full bg-rose-400" />
                  ) : null}
                </button>

                <button
                  onClick={() => handleFeeding("right")}
                  disabled={isFeedingSyncing}
                  className={[
                    "flex h-20 items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-950/30 px-4 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-70",
                    activeFeedingSide === "right"
                      ? `bg-rose-500/10 text-rose-400 ${glowClass("rose")} animate-pulse`
                      : "text-slate-50",
                  ].join(" ")}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5">
                    <ArrowRight size={20} strokeWidth={1.5} />
                  </span>
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] font-medium uppercase tracking-[0.28em]">
                      Right
                    </span>
                    <span className="text-sm text-slate-400">
                      {activeFeedingSide === "right" ? "Stop" : "Start"}
                    </span>
                  </div>
                  {lastFeedingSide === "right" && activeFeedingSide !== "right" ? (
                    <span className="ml-auto h-2 w-2 rounded-full bg-rose-400" />
                  ) : null}
                </button>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="flex flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                  <CupSoda size={20} strokeWidth={1.5} className="text-slate-400" />
                  <input
                    value={feedingMl}
                    onChange={(e) => setFeedingMl(e.target.value)}
                    inputMode="decimal"
                    placeholder="ml (bottle, optional)"
                    className="w-full bg-transparent text-sm text-slate-50 placeholder:text-slate-600 focus:outline-none"
                  />
                </div>
                <div className="text-[11px] text-slate-400">
                  {isFeedingSyncing ? "sync…" : " "}
                </div>
              </div>

              {feedingError ? (
                <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
                  {feedingError}
                </div>
              ) : null}
            </div>

            <button
              onClick={handleToggle}
              disabled={isSyncing}
              className={[
                "flex h-20 w-full items-center justify-between gap-4 rounded-3xl border border-white/10 bg-slate-900/50 px-5 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-70",
                isSleepActive
                  ? `bg-indigo-500/10 text-indigo-400 ${glowClass("indigo")} animate-pulse`
                  : "text-slate-50",
              ].join(" ")}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5">
                {isSleepActive ? (
                  <Moon size={20} strokeWidth={1.5} />
                ) : (
                  <MoonStar size={20} strokeWidth={1.5} />
                )}
              </span>
              <div className="flex flex-1 flex-col items-start">
                <span className="text-[11px] font-medium uppercase tracking-[0.28em]">
                  {isSyncing ? "Sync…" : isAwake ? "Sleep" : "Awake"}
                </span>
                <span className="text-sm text-slate-400">
                  {isAwake ? "Start sleep session" : "End sleep session"}
                </span>
              </div>
              <span
                className={[
                  "rounded-full px-3 py-1 text-[11px]",
                  isSleepActive
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "bg-slate-800/50 text-slate-400",
                ].join(" ")}
              >
                {isAwake ? "MoonStar" : "Moon"}
              </span>
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

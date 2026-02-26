"use client";

import { useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";

const WAKE_WINDOWS_MIN = [90, 105, 120, 135] as const;

type BabyState = "awake" | "asleep";

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

  // 1‑секундний тік для оновлення таймера
  useEffect(() => {
    const id = setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const currentWindowMinutes = WAKE_WINDOWS_MIN[windowIndex] ?? WAKE_WINDOWS_MIN[WAKE_WINDOWS_MIN.length - 1];

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

  const handleToggle = () => {
    setBabyState((prev) => {
      if (prev === "awake") {
        // Перемикаємо в "сон" — таймер зупиняється
        return "asleep";
      }

      // Перемикаємо в "неспання" — нове вікно неспання
      setWakeStart(Date.now());
      setWindowIndex((prevIndex) =>
        Math.min(prevIndex + 1, WAKE_WINDOWS_MIN.length - 1),
      );
      return "awake";
    });
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
              className="flex h-16 w-full items-center justify-center gap-3 rounded-3xl bg-zinc-50 text-zinc-950 transition active:scale-[0.98] active:bg-zinc-200"
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
                  {isAwake ? "SLEEP" : "AWAKE"}
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

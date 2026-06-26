import type { CalendarEvent, ExpandedRange, ExpandedDay } from "./calendar-expand";

// Eine freie Luecke an einem Tag.
export type FreeSlot = {
  date: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  minutes: number;
};

export type FreeSlotOptions = {
  dayStart: string; // HH:MM, untere Fenstergrenze
  dayEnd: string; // HH:MM, obere Fenstergrenze
  minMinutes: number; // kuerzere Luecken werden ignoriert
};

export const DEFAULT_FREE_SLOT_OPTIONS: FreeSlotOptions = {
  dayStart: "06:00",
  dayEnd: "22:00",
  minMinutes: 15,
};

export type ExpandedDayWithFree = ExpandedDay & { freeSlots: FreeSlot[] };
export type ExpandedRangeWithFree = Omit<ExpandedRange, "days"> & {
  days: ExpandedDayWithFree[];
};

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Belegt der Event die Timeline? cancelled-Schulstunden NICHT (= freie Luecke).
function isBusy(e: CalendarEvent): boolean {
  if (e.source === "school" && e.status === "cancelled") return false;
  return true;
}

export function freeSlotsForDay(
  events: CalendarEvent[],
  date: string,
  opt: FreeSlotOptions = DEFAULT_FREE_SLOT_OPTIONS,
): FreeSlot[] {
  const dayStart = toMin(opt.dayStart);
  const dayEnd = toMin(opt.dayEnd);

  // Busy-Intervalle einsammeln + auf das Fenster clippen.
  const busy: [number, number][] = [];
  for (const e of events) {
    if (!isBusy(e)) continue;
    const start = toMin(e.startTime);
    // offenes Ende (Routine) -> bis Tagesende belegt.
    const end = e.endTime ? toMin(e.endTime) : dayEnd;
    const cs = Math.max(start, dayStart);
    const ce = Math.min(end, dayEnd);
    if (ce > cs) busy.push([cs, ce]);
  }
  busy.sort((a, b) => a[0] - b[0]);

  // Ueberlappende/anliegende Intervalle mergen.
  const merged: [number, number][] = [];
  for (const [s, e] of busy) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  // Luecken zwischen den Busy-Bloecken innerhalb des Fensters.
  const slots: FreeSlot[] = [];
  let cursor = dayStart;
  const push = (s: number, e: number) => {
    if (e - s >= opt.minMinutes) {
      slots.push({ date, startTime: toHHMM(s), endTime: toHHMM(e), minutes: e - s });
    }
  };
  for (const [s, e] of merged) {
    push(cursor, s);
    cursor = Math.max(cursor, e);
  }
  push(cursor, dayEnd);

  return slots;
}

// Haengt FreeSlots an jeden Tag eines bereits expandierten Bereichs (pure, kein DB-Hit).
export function attachFreeSlots(
  range: ExpandedRange,
  opt: FreeSlotOptions = DEFAULT_FREE_SLOT_OPTIONS,
): ExpandedRangeWithFree {
  return {
    ...range,
    days: range.days.map((d) => ({
      ...d,
      freeSlots: freeSlotsForDay(d.events, d.date, opt),
    })),
  };
}

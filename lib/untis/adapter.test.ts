import { describe, expect, it } from "vitest";
import { lessonToSchoolBlock, type UntisLesson } from "./adapter";

const base: UntisLesson = {
  id: 42,
  date: 20260619,
  startTime: 750, // 07:50
  endTime: 835, // 08:35
  su: [{ name: "E", longname: "Englisch" }],
  ro: [{ name: "A120" }],
  te: [{ name: "Mu" }],
};

describe("lessonToSchoolBlock", () => {
  it("mappt Datum, Zeit und Felder", () => {
    const b = lessonToSchoolBlock(base);
    expect(b.untisLessonId).toBe("42");
    expect(b.date).toBe("2026-06-19");
    expect(b.startTime).toBe("07:50");
    expect(b.endTime).toBe("08:35");
    expect(b.subject).toBe("E");
    expect(b.room).toBe("A120");
    expect(b.teacher).toBe("Mu");
  });

  it("Entfall -> status cancelled", () => {
    expect(lessonToSchoolBlock({ ...base, code: "cancelled" }).status).toBe("cancelled");
  });

  it("Vertretung (irregular) -> status substituted", () => {
    expect(lessonToSchoolBlock({ ...base, code: "irregular" }).status).toBe("substituted");
  });

  it("ohne code -> status regular", () => {
    expect(lessonToSchoolBlock(base).status).toBe("regular");
  });

  it("Fach-Fallback auf longname, dann '?'", () => {
    expect(lessonToSchoolBlock({ ...base, su: [{ longname: "Englisch" }] }).subject).toBe("Englisch");
    expect(lessonToSchoolBlock({ ...base, su: [] }).subject).toBe("?");
  });

  it("fehlender Raum/Lehrer -> null", () => {
    const b = lessonToSchoolBlock({ ...base, ro: [], te: [] });
    expect(b.room).toBeNull();
    expect(b.teacher).toBeNull();
  });
});

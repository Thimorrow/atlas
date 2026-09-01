# M003 Contract (verbindlich fuer alle parallelen Schritte)

Fundament steht bereits im Repo und wird NICHT mehr geaendert:

- `lib/db/schema.ts` -- Tabellen `subjects`, `subject_notes`, `assignments`,
  `subject_files`, Enum `assignment_type`. Typen: `Subject`, `NewSubject`,
  `SubjectNote`, `NewSubjectNote`, `Assignment`, `NewAssignment`,
  `SubjectFile`, `NewSubjectFile`. Migration `drizzle/0005_deep_nuke.sql` ist
  bereits auf der Neon-DB angewendet.
- `lib/assignments-view.ts` -- `AssignmentDTO`, `AssignmentType`,
  `TYPE_LABEL`, `ASSIGNMENT_TYPES`, `isExam`, `localISO`, `addDays`,
  `weekdayOf`, `daysBetween`, `endOfWeek`, `groupOf`, `groupAssignments`,
  `GROUP_ORDER`, `GROUP_LABEL`, `compareInGroup`, `overdueLabel`, `dueLabel`,
  `recentlyCompleted`.
- `lib/subject-colors.ts` -- `SUBJECT_COLORS` (token/label/value),
  `colorValue(token)`, `NEUTRAL_COLOR`, `defaultColorFor(name)`.
- `components/toast.tsx` -- `useToast()` gibt `(message: string) => void`.
  Provider haengt bereits in `app/layout.tsx`.
- Sidebar- und Mobile-Header-Eintraege fuer `/aufgaben` und `/faecher` sind
  bereits gesetzt.
- `marked` ist als Dependency installiert.

## DTOs

```ts
type SubjectDTO = {
  id: string;
  name: string;
  untisSubject: string | null;
  teacher: string | null;
  room: string | null;
  color: string | null;          // Token aus SUBJECT_COLORS
  archivedAt: string | null;     // ISO
  openAssignments: number;
  noteCount: number;
};

type NoteDTO = {
  id: string; subjectId: string; title: string; body: string;
  createdAt: string; updatedAt: string;   // ISO
};

type LessonDTO = {
  id: string; date: string; startTime: string; endTime: string | null;
  room: string | null; teacher: string | null;
  status: "regular" | "cancelled" | "substituted";
  substitutionText: string | null;
};

type FileDTO = {
  id: string; name: string; url: string; pathname: string;
  size: number; contentType: string; createdAt: string;
};
```

`AssignmentDTO` kommt aus `lib/assignments-view.ts` und traegt zusaetzlich zu
den Spaltenwerten die gejointen Felder `subjectName` und `subjectColor`
(Token, nicht Hex).

## API (owner: Agent A, ausser wo anders vermerkt)

| Methode + Pfad | Body / Query | Antwort |
|---|---|---|
| `GET /api/subjects` | `?archived=1` fuer archivierte, `?all=1` fuer beide | `200 { subjects: SubjectDTO[] }` |
| `GET /api/subjects/candidates` | -- | `200 { candidates: string[], hasBlocks: boolean }` distinct `school_blocks.subject`, alphabetisch |
| `POST /api/subjects/setup` | `{ selected: string[], all: string[] }` | `201 { subjects: SubjectDTO[] }` -- `selected` aktiv anlegen, `all \ selected` mit gesetztem `archivedAt` anlegen. Idempotent ueber `untis_subject`. |
| `POST /api/subjects` | `{ name, teacher?, room?, color?, untisSubject? }` | `201 { subject }`, ohne `name` -> `400 { error }` |
| `GET /api/subjects/[id]` | -- | `200 { subject: SubjectDTO, notes: NoteDTO[], assignments: AssignmentDTO[], upcoming: LessonDTO[] }`, unbekannte id -> `404` |
| `PATCH /api/subjects/[id]` | Teilmenge von `{name,teacher,room,color,archivedAt}` (`archivedAt: null` = reaktivieren, `"now"` = archivieren) | `200 { subject }` |
| `DELETE /api/subjects/[id]` | -- | `200 { ok: true }` |
| `GET /api/subjects/[id]/notes` | -- | `200 { notes: NoteDTO[] }` neueste zuerst |
| `POST /api/subjects/[id]/notes` | `{ title, body? }` | `201 { note }`, ohne `title` -> `400` |
| `GET/PATCH/DELETE /api/notes/[id]` | `{ title?, body? }` | `200 { note }` bzw. `200 { ok: true }` |
| `GET /api/assignments` | `?completed=1` haengt zusaetzlich die Erledigten der letzten 30 Tage an; `?subjectId=` filtert | `200 { assignments: AssignmentDTO[] }` |
| `POST /api/assignments` | `{ title, type?, subjectId?, untisSubject?, dueDate?, notes? }` | `201 { assignment }`; fehlender/leerer `title` -> `400 { error }`; `untisSubject` legt das Fach still an, falls es keins gibt |
| `PATCH /api/assignments/[id]` | Teilmenge | `200 { assignment }` |
| `DELETE /api/assignments/[id]` | -- | `200 { ok: true }` |
| `POST /api/assignments/[id]/complete` | -- | `200 { assignment }`, zweiter Aufruf ist idempotent (kein Fehler) |
| `DELETE /api/assignments/[id]/complete` | -- | `200 { assignment }` mit `completedAt: null` |
| `GET /api/subjects/[id]/files` | -- | `200 { enabled: boolean, files: FileDTO[] }` (owner: Agent F) |
| `POST /api/subjects/[id]/files` | multipart `file` | `201 { file }` / `400` / `503` wenn kein Token (owner: Agent F) |
| `DELETE /api/files/[id]` | -- | `200 { ok: true }` (owner: Agent F) |

Alle Routen: `export const runtime = "nodejs"` und `export const dynamic = "force-dynamic"`,
wie `app/api/calendar/route.ts`. In Next 16 sind Route-Params ein Promise:
`{ params }: { params: Promise<{ id: string }> }`.
Validierungsfehler ergeben **400 mit `{ error: "..." }`**, niemals 500.

## Komponenten-Contract (fuer die querverdrahteten Schritte)

```ts
// components/assignment-list.tsx  (owner: Agent C)
export function AssignmentList(props: {
  assignments: AssignmentDTO[];        // roh, ungruppiert
  onChange: (next: AssignmentDTO[]) => void;  // nach Abhaken/Loeschen
  grouped?: boolean;                   // true = Gruppen (/aufgaben), false = flache Liste (Fach-Seite)
  emptyLabel?: string;
  showSubject?: boolean;               // default true
}): JSX.Element;

// components/assignment-composer.tsx  (owner: Agent C)
export function AssignmentComposer(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: { id: string; name: string; color: string | null }[];
  initial?: Partial<{ id: string; title: string; type: AssignmentType;
                      subjectId: string | null; untisSubject: string | null;
                      dueDate: string | null; notes: string | null }>;
  onSaved: (a: AssignmentDTO) => void;
}): JSX.Element;

// components/subject-notes.tsx  (owner: Agent E)
export function SubjectNotes(props: { subjectId: string; initialNotes: NoteDTO[] }): JSX.Element;

// components/subject-files.tsx  (owner: Agent F)
export function SubjectFiles(props: { subjectId: string }): JSX.Element;
```

## Stil

Deutsch in der Oberflaeche, keine Em-Dashes im User-facing Text. Bestehende
Muster uebernehmen: `cn` aus `@/lib/utils`, `Button` aus `@/components/ui/button`,
`Stagger`/`StaggerItem`, Atlas-Kurve `[0.22, 1, 0.36, 1]`, `useReducedMotion()`
explizit gaten. Mindest-Trefferflaeche 44px (Muster: `before:absolute
before:-inset-1`), sichtbarer Fokusring (`focus-visible:ring-2
focus-visible:ring-ring focus-visible:ring-offset-2`).

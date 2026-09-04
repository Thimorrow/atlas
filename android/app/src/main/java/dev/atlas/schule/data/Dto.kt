package dev.atlas.schule.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.LocalDate

// Die Namen der Felder bleiben englisch, weil sie im JSON so heissen und jede
// Umbenennung eine zweite Wahrheit schafft. Deutsch wird ab der Oberflaeche
// gesprochen.

@Serializable
data class SubjectDTO(
    val id: String,
    val name: String,
    val untisSubject: String? = null,
    /** Nachname, so wie Untis ihn liefert -- ohne Anrede. */
    val teacher: String? = null,
    /** "Herr Schulze", vom Server aus Anrede und Nachname zusammengesetzt. */
    val teacherLabel: String? = null,
    val room: String? = null,
    /** Farbtoken, kein Farbwert. Aufloesen ueber Fachfarbe.vonToken(). */
    val color: String? = null,
    @Serializable(with = InstantSerialisierer::class) val archivedAt: Instant? = null,
    val openAssignments: Int = 0,
    val noteCount: Int = 0,
    val oralWeight: Int = 50,
    val onenoteSectionId: String? = null,
    val onenoteSectionName: String? = null,
)

@Serializable
data class AssignmentDTO(
    val id: String,
    val subjectId: String? = null,
    val subjectName: String? = null,
    val subjectColor: String? = null,
    /** homework, exam, test, presentation, other */
    val type: String,
    val title: String,
    val notes: String? = null,
    /** Reines Datum, gegen das lokale Geraetedatum vergleichen, nicht gegen UTC. */
    @Serializable(with = LocalDateSerialisierer::class) val dueDate: LocalDate? = null,
    @Serializable(with = InstantSerialisierer::class) val completedAt: Instant? = null,
)

@Serializable
data class NoteDTO(
    val id: String,
    val subjectId: String,
    val title: String,
    /** Roher Markdown. Ein nativer Renderer fehlt noch, siehe API.md. */
    val body: String,
    @Serializable(with = InstantSerialisierer::class) val createdAt: Instant,
    @Serializable(with = InstantSerialisierer::class) val updatedAt: Instant,
)

@Serializable
data class CalendarEvent(
    val source: String,
    val refId: String,
    @Serializable(with = LocalDateSerialisierer::class) val date: LocalDate,
    /** HH:MM, ohne Zeitzone. Bleibt Text, weil es reine Anzeige ist. */
    val startTime: String,
    val endTime: String? = null,
    val title: String,
    /** regular, cancelled, substituted */
    val status: String,
    val room: String? = null,
    val teacher: String? = null,
)

@Serializable
data class ExpandedDay(
    @Serializable(with = LocalDateSerialisierer::class) val date: LocalDate,
    /** 0 = Montag ... 6 = Sonntag, so wie lib/calendar-expand.ts es liefert. */
    val weekday: Int,
    val events: List<CalendarEvent> = emptyList(),
)

@Serializable
data class ExpandedRange(
    @Serializable(with = LocalDateSerialisierer::class) val start: LocalDate,
    @Serializable(with = LocalDateSerialisierer::class) val end: LocalDate,
    val days: List<ExpandedDay> = emptyList(),
)

@Serializable
data class FileDTO(
    val id: String,
    val name: String,
    val pathname: String,
    val size: Long,
    val contentType: String,
    @Serializable(with = InstantSerialisierer::class) val createdAt: Instant,
)

// Die API packt Listen in ein Objekt statt sie nackt zu liefern.

@Serializable
data class SubjectsAntwort(val subjects: List<SubjectDTO> = emptyList())

/** GET /api/subjects/candidates. Die distinct Fachnamen aus allen geladenen Stundenplan-Bloecken. */
@Serializable
data class CandidatesAntwort(
    val candidates: List<String> = emptyList(),
    val hasBlocks: Boolean = false,
)

/**
 * Rumpf fuer POST /api/subjects/setup. [selected] wird aktiv, der Rest von
 * [all] wird archiviert. Idempotent ueber untisSubject.
 */
@Serializable
data class SubjectsSetupAnfrage(
    val selected: List<String>,
    val all: List<String>,
)

@Serializable
data class FehlerAntwort(val error: String? = null)

@Serializable
data class LoginAnfrage(val password: String)

@Serializable
data class LessonDTO(
    val id: String,
    @Serializable(with = LocalDateSerialisierer::class) val date: LocalDate,
    val startTime: String,
    val endTime: String? = null,
    val room: String? = null,
    val teacher: String? = null,
    /** regular, cancelled, substituted */
    val status: String = "regular",
    val substitutionText: String? = null,
)

@Serializable
data class SyncDTO(
    @Serializable(with = InstantSerialisierer::class) val lastSyncedAt: Instant? = null,
    val blockCount: Int = 0,
    val lastError: String? = null,
)

/**
 * GET /api/home. Eine Antwort statt vier: im Mobilfunknetz sind vier
 * Roundtrips vor dem ersten sichtbaren Inhalt zu viel.
 */
@Serializable
data class HomeAntwort(
    val week: ExpandedRange,
    val assignments: List<AssignmentDTO> = emptyList(),
    val subjects: List<SubjectDTO> = emptyList(),
    val sync: SyncDTO? = null,
)

/** GET /api/subjects/{id}. */
@Serializable
data class FachDetailAntwort(
    val subject: SubjectDTO,
    val notes: List<NoteDTO> = emptyList(),
    val assignments: List<AssignmentDTO> = emptyList(),
    val upcoming: List<LessonDTO> = emptyList(),
    val grades: List<GradeDTO> = emptyList(),
    val gradeSummary: GradeSummaryDTO? = null,
    val lessonNotes: List<LessonNoteDTO> = emptyList(),
    val participation: ParticipationDTO? = null,
)

@Serializable
data class LessonNoteDTO(
    val lessonId: String,
    @Serializable(with = LocalDateSerialisierer::class) val date: LocalDate,
    val startTime: String,
    val body: String,
)

@Serializable
data class ParticipationDTO(
    val average: Double? = null,
    val ratedCount: Int = 0,
    val totalCount: Int = 0,
    val best: Int? = null,
    val recent: List<ParticipationEntryDTO> = emptyList(),
)

@Serializable
data class ParticipationEntryDTO(
    val lessonId: String,
    @Serializable(with = LocalDateSerialisierer::class) val date: LocalDate,
    val points: Int? = null,
)

@Serializable
data class LessonNoteAntwort(val note: LessonNoteBodyDTO? = null)

@Serializable
data class LessonNoteBodyDTO(
    val id: String,
    val body: String,
    val updatedAt: String? = null,
)

@Serializable
data class ParticipationAntwort(val points: Int? = null)

@Serializable
data class NextDueAntwort(
    @Serializable(with = LocalDateSerialisierer::class) val dueDate: LocalDate? = null,
)

@Serializable
data class NoteAntwort(val note: NoteDTO)

@Serializable
data class SubjectAntwort(val subject: SubjectDTO)

@Serializable
data class AssignmentAntwort(val assignment: AssignmentDTO)

/**
 * GET /api/assignments?completed=1. Der Server liefert Offene und Erledigte
 * gemischt (nur Erledigte der letzten 30 Tage), gefiltert wird auf dem Client.
 */
@Serializable
data class AssignmentsAntwort(val assignments: List<AssignmentDTO> = emptyList())

@Serializable
data class GradeDTO(
    val id: String,
    val subjectId: String,
    /** oral oder written */
    val kind: String,
    /** 0-15 */
    val points: Int,
    /** Vom Server abgeleitet, etwa "2+". Wird nie selbst berechnet oder gesendet. */
    val grade: String,
    val label: String,
    @Serializable(with = LocalDateSerialisierer::class) val date: LocalDate,
    val weight: Double,
    @Serializable(with = InstantSerialisierer::class) val createdAt: Instant,
    @Serializable(with = InstantSerialisierer::class) val updatedAt: Instant,
)

@Serializable
data class GradeAverageDTO(
    val points: Double,
    val label: String,
)

@Serializable
data class GradeSummaryDTO(
    val average: GradeAverageDTO? = null,
    val oral: GradeAverageDTO? = null,
    val written: GradeAverageDTO? = null,
    val count: Int = 0,
    /** Anteil muendlich am Fachschnitt, in Prozent. */
    val oralWeight: Int = 50,
)

@Serializable
data class GradeOverviewEntryDTO(
    val id: String,
    val name: String,
    val color: String? = null,
    val summary: GradeSummaryDTO,
)

/** GET /api/grades. */
@Serializable
data class GradeOverviewAntwort(
    val overall: GradeAverageDTO? = null,
    val subjects: List<GradeOverviewEntryDTO> = emptyList(),
)

/** GET /api/subjects/{id}/grades. */
@Serializable
data class GradesAntwort(
    val grades: List<GradeDTO> = emptyList(),
    val summary: GradeSummaryDTO,
)

/** Antwort auf POST /api/subjects/{id}/grades. */
@Serializable
data class GradeAntwort(
    val grade: GradeDTO,
    val summary: GradeSummaryDTO,
)

/**
 * Rumpf fuer POST /api/subjects/{id}/grades. [weight] darf fehlen, der Server
 * setzt dann seinen eigenen Standardwert.
 */
@Serializable
data class NeueNoteAnfrage(
    val points: Int,
    val label: String,
    val kind: String,
    @Serializable(with = LocalDateSerialisierer::class) val date: LocalDate,
    val weight: Double? = null,
)

/** Zeitraum eines Untis-Abgleichs, "start" und "end" als JJJJ-MM-TT. */
@Serializable
data class SyncFensterDTO(
    @Serializable(with = LocalDateSerialisierer::class) val start: LocalDate,
    @Serializable(with = LocalDateSerialisierer::class) val end: LocalDate,
)

/** Erfolgsantwort von POST /api/sync/untis. */
@Serializable
data class SyncUntisAntwort(
    val fetched: Int = 0,
    val upserted: Int = 0,
    val window: SyncFensterDTO,
)

/** GET /api/microsoft/status. */
@Serializable
data class MicrosoftStatusAntwort(
    val enabled: Boolean,
    val connected: Boolean,
    val account: MicrosoftAccountDTO? = null,
)

@Serializable
data class MicrosoftAccountDTO(
    val displayName: String? = null,
    val email: String? = null,
)

/**
 * Rumpf fuer POST /api/assignments. Nur "title" ist Pflicht; die uebrigen
 * Felder duerfen fehlen, deshalb sind sie nullbar und explicitNulls = false
 * laesst sie im JSON weg statt sie als null zu senden.
 */
@Serializable
data class NeueAufgabeAnfrage(
    val title: String,
    val type: String,
    @Serializable(with = LocalDateSerialisierer::class) val dueDate: LocalDate? = null,
    val subjectId: String? = null,
    /**
     * Der Fachname aus Untis. Der Server legt daraus still ein Fach an, wenn
     * [subjectId] leer bleibt, und ignoriert das Feld sonst. So endet eine
     * Aufgabe aus einer Stunde nie unter "Allgemein", nur weil das Fach in der
     * Liste noch fehlt.
     */
    val untisSubject: String? = null,
    val notes: String? = null,
)

@Serializable
data class AufgabePatchAnfrage(
    val title: String? = null,
    val type: String? = null,
    @Serializable(with = LocalDateSerialisierer::class) val dueDate: LocalDate? = null,
    val subjectId: String? = null,
    val notes: String? = null,
    /** true = entkoppeln zu Allgemein, false/null = unverändert */
    val clearSubject: Boolean? = null,
    /** true = Fälligkeit entfernen */
    val clearDueDate: Boolean? = null,
)

@Serializable
data class NeueNotizAnfrage(val title: String, val body: String = "")

@Serializable
data class NotizPatchAnfrage(val title: String? = null, val body: String? = null)

@Serializable
data class NeuesFachAnfrage(
    val name: String,
    val teacher: String? = null,
    val room: String? = null,
    val color: String? = null,
    val untisSubject: String? = null,
)

@Serializable
data class FachPatchAnfrage(
    val name: String? = null,
    val teacher: String? = null,
    val room: String? = null,
    val color: String? = null,
    val oralWeight: Int? = null,
    val archivedAt: String? = null,
)

@Serializable
data class SectionsAntwort(val sections: List<OneNoteSectionDTO> = emptyList())

@Serializable
data class OneNoteSectionDTO(val id: String, val displayName: String)

@Serializable
data class ReconcileAntwort(
    val created: Int = 0,
    val updated: Int = 0,
    val archived: Int = 0,
    val deleted: Int = 0,
    val skipped: Int = 0,
)

// --- Morgen / Fokus ----------------------------------------------------------

@Serializable
data class MorgenLessonDTO(
    val refId: String,
    val startTime: String,
    val endTime: String? = null,
    val title: String,
    val status: String = "regular",
    val room: String? = null,
    val teacher: String? = null,
    val hasNote: Boolean = false,
    val hasAssignment: Boolean = false,
    val subjectId: String? = null,
    val subjectColor: String? = null,
)

@Serializable
data class MorgenMaterialDTO(
    val subjectId: String,
    val subjectName: String,
    val subjectColor: String? = null,
    val files: List<FileDTO> = emptyList(),
    val notes: List<MorgenNotizRefDTO> = emptyList(),
)

@Serializable
data class MorgenNotizRefDTO(val id: String, val title: String)

@Serializable
data class MorgenAntwort(
    val today: String = "",
    val target: MorgenTargetDTO? = null,
    val day: MorgenDayDTO? = null,
    val due: List<AssignmentDTO> = emptyList(),
    val exams: List<AssignmentDTO> = emptyList(),
    val materials: List<MorgenMaterialDTO> = emptyList(),
)

@Serializable
data class MorgenTargetDTO(
    val date: String = "",
    val isTomorrow: Boolean = false,
    val label: String? = null,
)

@Serializable
data class MorgenDayDTO(
    val date: String = "",
    val weekday: Int = 0,
    val events: List<MorgenLessonDTO> = emptyList(),
)

// --- Bot ---------------------------------------------------------------------

@Serializable
data class BotStartAntwort(
    val enabled: Boolean,
    val greeting: String = "",
    val suggestions: List<String> = emptyList(),
    val conversationId: String? = null,
)

@Serializable
data class BotVerlaufEintragDTO(
    val id: String,
    val title: String = "",
    val updatedAt: String? = null,
    val hasCreated: Boolean = false,
)

@Serializable
data class BotVerlaufAntwort(val conversations: List<BotVerlaufEintragDTO> = emptyList())

@Serializable
data class BotTurnDTO(
    val role: String,
    val content: String = "",
    val createdAt: String? = null,
)

@Serializable
data class BotVerlaufDetailAntwort(
    val id: String = "",
    val title: String = "",
    val turns: List<BotTurnDTO> = emptyList(),
)

@Serializable
data class FilesAntwort(val files: List<FileDTO> = emptyList())

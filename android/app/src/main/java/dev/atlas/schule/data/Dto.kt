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
    val teacher: String? = null,
    val room: String? = null,
    /** Farbtoken, kein Farbwert. Aufloesen ueber Fachfarbe.vonToken(). */
    val color: String? = null,
    @Serializable(with = InstantSerialisierer::class) val archivedAt: Instant? = null,
    val openAssignments: Int = 0,
    val noteCount: Int = 0,
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
)

@Serializable
data class AssignmentAntwort(val assignment: AssignmentDTO)

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
)

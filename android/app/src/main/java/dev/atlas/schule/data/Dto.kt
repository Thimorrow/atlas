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

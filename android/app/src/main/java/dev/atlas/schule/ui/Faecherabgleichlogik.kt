package dev.atlas.schule.ui

import dev.atlas.schule.data.SubjectDTO
import java.text.Collator
import java.util.Locale

// Die reine Logik hinter dem Faecher-Abschnitt der Einstellungen: welche
// Namen zur Auswahl stehen, was jede Zeile bedeutet und wie die
// Zusammenfassungszeile ueber dem Knopf lautet. Bleibt frei von Compose,
// genau wie AufgabenGruppen.kt, damit die Regeln ohne Geraet pruefbar sind.

private val deutsch: Collator = Collator.getInstance(Locale.GERMAN)

/** Was eine Zeile ueber ein Fach sagt: neu, schon bekannt oder aus der Liste gefallen. */
enum class FachStatus {
    /** Kandidat aus dem Stundenplan, es gibt dazu schon ein Fach. */
    IM_STUNDENPLAN,

    /** Fach existiert, kommt im geladenen Stundenplan-Zeitraum aber nicht vor. */
    NICHT_IM_STUNDENPLAN,

    /** Kandidat aus dem Stundenplan, dafuer gibt es noch kein Fach. */
    NEU,
}

/** Eine Zeile der Abgleich-Liste: der Name und alles, was die Oberflaeche dazu zeigen muss. */
data class FaecherZeile(
    val name: String,
    val status: FachStatus,
    /**
     * true, wenn das Fach offene Aufgaben oder Notizen traegt -- Warnung vorm
     * Abwaehlen. Noten zaehlen hier nicht mit, das Fach-DTO fuehrt sie nicht.
     * Verloren geht ohnehin nichts: Archivieren laesst alles stehen.
     */
    val hatInhalt: Boolean,
    /**
     * true, wenn es das Fach zwar gibt, es aber archiviert ist. Ohne diesen
     * Hinweis sah ein archiviertes Fach, das im Stundenplan vorkommt, genauso
     * aus wie ein aktives, und die Zeile ueber dem Knopf zaehlte es als
     * Zugang, ohne dass die Liste sagte warum.
     */
    val archiviert: Boolean,
)

/**
 * Die Namen aus [kandidaten] und den vorhandenen untisSubject-Werten aus
 * [bestand] vereinigt und alphabetisch sortiert, dazu je Name der Status und
 * ob es dort etwas zu verlieren gibt.
 */
fun faecherZeilen(kandidaten: List<String>, bestand: List<SubjectDTO>): List<FaecherZeile> {
    val kandidatenSet = kandidaten.toSet()
    val fachJeName = bestand.filter { it.untisSubject != null }.associateBy { it.untisSubject }
    val namen = kandidatenSet + fachJeName.keys.filterNotNull()

    return namen.sortedWith { a, b -> deutsch.compare(a, b) }.map { name ->
        val fach = fachJeName[name]
        val kandidat = name in kandidatenSet
        val status = when {
            kandidat && fach != null -> FachStatus.IM_STUNDENPLAN
            kandidat -> FachStatus.NEU
            else -> FachStatus.NICHT_IM_STUNDENPLAN
        }
        FaecherZeile(
            name = name,
            status = status,
            hatInhalt = fach != null && (fach.openAssignments > 0 || fach.noteCount > 0),
            archiviert = fach != null && fach.archivedAt != null,
        )
    }
}

/** Die Namen der aktuell aktiven (nicht archivierten) Faecher aus [bestand], soweit sie ein untisSubject tragen. */
fun aktiveFachNamen(bestand: List<SubjectDTO>): Set<String> =
    bestand.filter { it.archivedAt == null }.mapNotNull { it.untisSubject }.toSet()

/**
 * Die Zusammenfassungszeile ueber dem Knopf: was ein Abgleich mit
 * [ausgewaehlt] gegenueber den [bisherAktiv]en Faechern aendern wuerde.
 * Aendert sich nichts, ist das die eine Zeile, die auch den Knopf sperrt.
 */
fun faecherAbgleichZusammenfassung(bisherAktiv: Set<String>, ausgewaehlt: Set<String>): String {
    val dazu = (ausgewaehlt - bisherAktiv).size
    val archiviert = (bisherAktiv - ausgewaehlt).size
    if (dazu == 0 && archiviert == 0) return "Deine Fächer passen zum Stundenplan."

    val teile = mutableListOf<String>()
    if (dazu > 0) teile += if (dazu == 1) "1 kommt dazu" else "$dazu kommen dazu"
    if (archiviert > 0) teile += if (archiviert == 1) "1 wird archiviert" else "$archiviert werden archiviert"
    return teile.joinToString(", ") + "."
}

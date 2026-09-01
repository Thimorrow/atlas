package dev.atlas.schule.ui

import dev.atlas.schule.data.AssignmentDTO
import java.text.Collator
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale

// Nachbau von lib/assignments-view.ts. Der Server liefert die Aufgaben flach,
// die Gruppierung ist Anzeige und liegt bewusst im Client (siehe API.md).
// Damit Browser und Telefon dieselbe Liste zeigen, muessen die Regeln hier
// Zeile fuer Zeile dieselben sein; die Tests vergleichen genau das.
//
// Diese Datei bleibt frei von Compose, sonst waeren die Regeln nur mit einem
// Geraet zu pruefen.

/** homework, exam, test, presentation, other -- alles andere faellt auf "Sonstiges". */
fun aufgabentypBezeichnung(typ: String): String = when (typ) {
    "homework" -> "Hausaufgabe"
    "exam" -> "Klassenarbeit"
    "test" -> "Test"
    "presentation" -> "Referat"
    else -> "Sonstiges"
}

/** exam und test sind Pruefungen: sie stehen innerhalb ihrer Gruppe vorn. */
fun istPruefung(typ: String): Boolean = typ == "exam" || typ == "test"

/**
 * Die sechs Gruppen in genau der Reihenfolge, in der sie erscheinen. Die
 * Reihenfolge ist Teil des Vertrags, sie entspricht GROUP_ORDER im Web.
 */
enum class Aufgabengruppe(val schluessel: String, val bezeichnung: String) {
    UEBERFAELLIG("overdue", "Überfällig"),
    HEUTE("today", "Heute"),
    MORGEN("tomorrow", "Morgen"),
    DIESE_WOCHE("week", "Diese Woche"),
    SPAETER("later", "Später"),
    OHNE_DATUM("undated", "Ohne Datum"),
}

data class Aufgabenblock(val gruppe: Aufgabengruppe, val eintraege: List<AssignmentDTO>)

/** Sonntag der laufenden Woche, einschliesslich. Die Woche laeuft Montag bis Sonntag. */
fun wochenende(heute: LocalDate): LocalDate = heute.plusDays(7L - heute.dayOfWeek.value)

fun gruppeVon(faellig: LocalDate?, heute: LocalDate): Aufgabengruppe = when {
    faellig == null -> Aufgabengruppe.OHNE_DATUM
    faellig < heute -> Aufgabengruppe.UEBERFAELLIG
    faellig == heute -> Aufgabengruppe.HEUTE
    faellig == heute.plusDays(1) -> Aufgabengruppe.MORGEN
    faellig <= wochenende(heute) -> Aufgabengruppe.DIESE_WOCHE
    else -> Aufgabengruppe.SPAETER
}

// Postgres sortiert ohne deutsche Locale, der Browser mit ("de"). Maszgeblich
// ist die Anzeige, also der Collator -- sonst stuende "Ökologie" hinter "Physik".
private val deutsch: Collator = Collator.getInstance(Locale.GERMAN)

/**
 * Innerhalb einer Gruppe: Pruefungen zuerst, dann nach Fach, dann nach Titel.
 * Eine Aufgabe ohne Fach ("Allgemein") steht hinten; im Web uebernimmt das der
 * Platzhalter "￿", hier steht es ausgeschrieben da.
 */
fun vergleicheInGruppe(a: AssignmentDTO, b: AssignmentDTO): Int {
    val pruefung = istPruefung(b.type).compareTo(istPruefung(a.type))
    if (pruefung != 0) return pruefung

    val fachA = a.subjectName
    val fachB = b.subjectName
    val fach = when {
        fachA == null && fachB == null -> 0
        fachA == null -> 1
        fachB == null -> -1
        else -> deutsch.compare(fachA, fachB)
    }
    if (fach != 0) return fach

    return deutsch.compare(a.title, b.title)
}

/**
 * Offene Aufgaben in die sechs Gruppen einsortieren. Leere Gruppen fallen weg,
 * die Reihenfolge ist immer die der [Aufgabengruppe]-Eintraege.
 */
fun gruppiereAufgaben(
    eintraege: List<AssignmentDTO>,
    heute: LocalDate,
): List<Aufgabenblock> {
    val koerbe = eintraege
        .filter { it.completedAt == null }
        .groupBy { gruppeVon(it.dueDate, heute) }

    return Aufgabengruppe.entries.mapNotNull { gruppe ->
        val liste = koerbe[gruppe] ?: return@mapNotNull null
        // Drei Gruppen umfassen mehrere Tage und laufen deshalb zuerst
        // chronologisch. Die uebrigen haben ohnehin nur einen Tag (oder gar
        // kein Datum) und sortieren rein inhaltlich.
        val mehrtaegig = gruppe == Aufgabengruppe.UEBERFAELLIG ||
            gruppe == Aufgabengruppe.DIESE_WOCHE ||
            gruppe == Aufgabengruppe.SPAETER
        val inhaltlich = Comparator<AssignmentDTO> { a, b -> vergleicheInGruppe(a, b) }
        val sortiert = if (mehrtaegig) {
            liste.sortedWith(compareBy<AssignmentDTO> { it.dueDate }.then(inhaltlich))
        } else {
            liste.sortedWith(inhaltlich)
        }
        Aufgabenblock(gruppe, sortiert)
    }
}

/** "seit gestern" / "3 Tage überfällig" -- nur fuer den Ueberfaellig-Block. */
fun ueberfaelligLabel(faellig: LocalDate, heute: LocalDate): String {
    val tage = ChronoUnit.DAYS.between(faellig, heute)
    return when {
        tage <= 0L -> "überfällig"
        tage == 1L -> "seit gestern"
        else -> "$tage Tage überfällig"
    }
}

private val WOCHENTAGE_KURZ = listOf("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")

val MONATE = listOf(
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
)

/** Datums-Label an der Zeile: "heute" / "morgen" / "Di., 15. Juli". */
fun faelligLabel(faellig: LocalDate?, heute: LocalDate): String? = when {
    faellig == null -> null
    faellig == heute -> "heute"
    faellig == heute.plusDays(1) -> "morgen"
    faellig == heute.minusDays(1) -> "gestern"
    else -> "${WOCHENTAGE_KURZ[faellig.dayOfWeek.value - 1]}., " +
        "${faellig.dayOfMonth}. ${MONATE[faellig.monthValue - 1]}"
}

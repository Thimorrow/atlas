package dev.atlas.schule.ui

import dev.atlas.schule.data.CalendarEvent
import java.time.LocalDate

// Nachbau von mergeSchool und packDay aus app/page.tsx. Wie bei der
// Aufgaben-Gruppierung ist das Anzeigelogik und liegt im Client; ohne Compose,
// damit sie ohne Geraet pruefbar bleibt.

/**
 * Untis liefert eine Doppelstunde als zwei Perioden mit kurzer Pause dazwischen.
 * Bis zu dieser Luecke gelten zwei Stunden desselben Fachs als eine.
 */
const val LUECKE_VERSCHMELZEN_MIN = 25

/** "HH:MM" in Minuten seit Mitternacht. Reine Anzeigezeit, keine Zeitzone. */
fun minuten(zeit: String): Int {
    val teile = zeit.split(":")
    return teile[0].toInt() * 60 + teile[1].toInt()
}

/**
 * Aufeinanderfolgende Stunden desselben Fachs mit demselben Status zu einem
 * Block zusammenfassen. Ohne das stuende eine Doppelstunde als zwei Kaesten mit
 * einer Fuge dazwischen, und das Auge liest zwei Stunden statt einer.
 */
fun verschmelzeStunden(ereignisse: List<CalendarEvent>): List<CalendarEvent> {
    val sortiert = ereignisse.sortedBy { it.startTime }
    val zusammen = mutableListOf<CalendarEvent>()
    for (ereignis in sortiert) {
        val letzter = zusammen.lastOrNull()
        val passt = letzter != null &&
            letzter.title == ereignis.title &&
            letzter.status == ereignis.status &&
            letzter.endTime != null &&
            minuten(ereignis.startTime) - minuten(letzter.endTime) <= LUECKE_VERSCHMELZEN_MIN
        if (passt) {
            // endTime des Nachfolgers gewinnt; fehlt sie, bleibt die bisherige stehen.
            zusammen[zusammen.lastIndex] = letzter.copy(endTime = ereignis.endTime ?: letzter.endTime)
        } else {
            zusammen.add(ereignis)
        }
    }
    return zusammen
}

/**
 * Der Tag, an dem [fach] nach [nach] das naechste Mal wieder stattfindet.
 * Nachbau von nextLessonDate aus app/page.tsx: eine Hausaufgabe wird auf die
 * naechste Stunde desselben Fachs aufgegeben, und genau die soll das Blatt
 * vorschlagen. Entfallene Stunden zaehlen nicht, dort wird nichts abgegeben.
 *
 * Gesucht wird nur in [ereignisse], also in der gerade geladenen Woche. Findet
 * sich nichts, gibt es kein Datum: ein geratenes waere schlechter als keins.
 */
fun naechsteStundeDesFachs(
    ereignisse: List<CalendarEvent>,
    fach: String,
    nach: LocalDate,
): LocalDate? = ereignisse
    .filter { it.date > nach && it.title == fach && it.status != "cancelled" }
    .minOfOrNull { it.date }

/**
 * Ein Block im Raster: [start] und [ende] in Minuten, [spur] von [spuren] fuer
 * den Fall, dass sich zwei Stunden ueberlappen. Ohne Spuren laegen zwei
 * gleichzeitige Termine exakt uebereinander und der hintere waere unsichtbar.
 */
data class Rasterblock(
    val ereignis: CalendarEvent,
    val start: Int,
    val ende: Int,
    val spur: Int,
    val spuren: Int,
)

/**
 * Termine eines Tages auf Spuren verteilen. Ueberlappende Termine bilden eine
 * Gruppe, und alle Termine einer Gruppe teilen sich die Breite gleichmaessig.
 * [tagStart] und [tagEnde] sind volle Stunden und klemmen die Raender ab.
 */
fun packeTag(ereignisse: List<CalendarEvent>, tagStart: Int, tagEnde: Int): List<Rasterblock> {
    val untenMin = tagStart * 60
    val obenMin = tagEnde * 60

    data class Kasten(val ereignis: CalendarEvent, val s: Int, val e: Int, var spur: Int = 0, var spuren: Int = 1)

    val kaesten = ereignisse
        .map { ereignis ->
            val s = maxOf(minuten(ereignis.startTime), untenMin)
            val roh = ereignis.endTime?.let { minuten(it) } ?: obenMin
            // Mindestens fuenf Minuten, sonst hat ein Block ohne Endzeit die Hoehe null.
            Kasten(ereignis, s, minOf(maxOf(roh, s + 5), obenMin))
        }
        .sortedWith(compareBy({ it.s }, { it.e }))

    var gruppe = mutableListOf<Kasten>()
    var gruppenEnde = -1

    fun abschliessen() {
        val enden = mutableListOf<Int>()
        for (kasten in gruppe) {
            val frei = enden.indexOfFirst { kasten.s >= it }
            if (frei >= 0) {
                kasten.spur = frei
                enden[frei] = kasten.e
            } else {
                kasten.spur = enden.size
                enden.add(kasten.e)
            }
        }
        val anzahl = enden.size.coerceAtLeast(1)
        for (kasten in gruppe) kasten.spuren = anzahl
        gruppe = mutableListOf()
    }

    for (kasten in kaesten) {
        if (gruppe.isNotEmpty() && kasten.s >= gruppenEnde) abschliessen()
        gruppe.add(kasten)
        gruppenEnde = if (gruppe.size == 1) kasten.e else maxOf(gruppenEnde, kasten.e)
    }
    abschliessen()

    return kaesten.map { Rasterblock(it.ereignis, it.s, it.e, it.spur, it.spuren) }
}

/**
 * Von wann bis wann das Raster reicht, in vollen Stunden. Eine feste Achse von
 * 0 bis 24 Uhr waere auf einem Telefon fast nur Leerraum, deshalb gibt der
 * Inhalt die Grenzen vor. [MINDEST_STUNDEN] verhindert, dass ein Tag mit einer
 * einzigen Stunde zu einem einzigen riesigen Kasten wird.
 */
const val MINDEST_STUNDEN = 6

fun tagesgrenzen(ereignisse: List<CalendarEvent>): Pair<Int, Int> {
    if (ereignisse.isEmpty()) return 8 to 16
    val frueheste = ereignisse.minOf { minuten(it.startTime) } / 60
    val spaeteste = ereignisse.maxOf { ev ->
        val ende = ev.endTime?.let { minuten(it) } ?: (minuten(ev.startTime) + 45)
        // Aufrunden, sonst wird eine Stunde bis 15:45 bei einer Achse bis 15 Uhr abgeschnitten.
        (ende + 59) / 60
    }
    val start = frueheste.coerceIn(0, 23)
    val ende = spaeteste.coerceIn(start + 1, 24)
    if (ende - start >= MINDEST_STUNDEN) return start to ende
    // Fehlende Stunden nach unten anhaengen, damit die erste Stunde oben bleibt.
    return start to minOf(24, start + MINDEST_STUNDEN)
}

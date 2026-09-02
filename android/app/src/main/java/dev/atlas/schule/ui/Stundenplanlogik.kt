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
 * [tagStart] und [tagEnde] sind Minuten seit Mitternacht und klemmen die Raender ab.
 */
fun packeTag(ereignisse: List<CalendarEvent>, tagStart: Int, tagEnde: Int): List<Rasterblock> {
    val untenMin = tagStart
    val obenMin = tagEnde

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
 * Von wann bis wann das Raster reicht, minutenexakt. Eine feste Achse von 0
 * bis 24 Uhr waere auf einem Telefon fast nur Leerraum, deshalb gibt der
 * Inhalt die Grenzen vor. Keine Stunden-Rundung mehr: eine auf volle Stunden
 * gerundete Achse liesse bis zu 59 Minuten toten Raum an den Raendern stehen,
 * und der saehe wie ein stauchbares Leerband aus, ohne eins sein zu duerfen
 * ([findeLeerbaender] zaehlt nur Luecken zwischen Intervallen, nie am Rand).
 * [MINDEST_MINUTEN] verhindert, dass ein Tag mit einer einzigen Stunde zu
 * einem einzigen riesigen Kasten wird.
 */
const val MINDEST_MINUTEN = 360

fun tagesgrenzen(ereignisse: List<CalendarEvent>): Pair<Int, Int> {
    if (ereignisse.isEmpty()) return 480 to 960
    val frueheste = ereignisse.minOf { minuten(it.startTime) }
    val spaeteste = ereignisse.maxOf { ev ->
        ev.endTime?.let { minuten(it) } ?: (minuten(ev.startTime) + 45)
    }
    val start = frueheste.coerceIn(0, 1439)
    val ende = spaeteste.coerceIn(start + 1, 1440)
    if (ende - start >= MINDEST_MINUTEN) return start to ende
    // Fehlende Minuten nach unten anhaengen, damit die erste Stunde oben bleibt.
    return start to minOf(1440, start + MINDEST_MINUTEN)
}

/**
 * Ein zusammenhaengender Zeitraum, in dem an keinem der sichtbaren Tage
 * Unterricht liegt. [start]/[ende] in Minuten seit Mitternacht.
 */
data class Leerband(val start: Int, val ende: Int) {
    val dauer: Int get() = ende - start
}

/**
 * Mindestlaenge einer Luecke, damit sie als Leerband gestaucht wird. Eine
 * kuerzere Luecke (z.B. eine Fuenf-Minuten-Pause zwischen zwei Faechern) ist
 * normaler Teil des Schultags und soll proportional bleiben, nicht gestaucht
 * werden -- nur ein wirklich freier Zeitraum wie eine ausgefallene
 * Mittagsstunde soll dem Raster nicht seine Hoehe diktieren.
 */
const val LEERBAND_MINDEST_MIN = 45

/**
 * Leerbaender ueber alle sichtbaren Tage der Woche hinweg finden. Belegte
 * Intervalle aller Tage werden auf die Tageszeit projiziert, auf
 * [tagStart]/[tagEnde] geklemmt und zu einer Union verschmolzen (beruehrende
 * oder ueberlappende Intervalle werden eins). Die Luecken STRIKT zwischen den
 * verschmolzenen Intervallen sind die Kandidaten -- am Rand, vor dem ersten
 * oder nach dem letzten Intervall, entsteht per Definition kein Leerband,
 * weil [tagesgrenzen] die Achse dort schon exakt beschnitten hat.
 */
fun findeLeerbaender(ereignisse: List<CalendarEvent>, tagStart: Int, tagEnde: Int): List<Leerband> {
    if (tagEnde <= tagStart) return emptyList()

    val intervalle = ereignisse
        .map { ev ->
            val s = minuten(ev.startTime).coerceIn(tagStart, tagEnde)
            val roh = ev.endTime?.let { minuten(it) } ?: (minuten(ev.startTime) + 45)
            s to roh.coerceIn(s, tagEnde)
        }
        .filter { it.second > it.first }
        .sortedBy { it.first }

    val verschmolzen = mutableListOf<Pair<Int, Int>>()
    for ((s, e) in intervalle) {
        val letzter = verschmolzen.lastOrNull()
        if (letzter != null && s <= letzter.second) {
            verschmolzen[verschmolzen.lastIndex] = letzter.first to maxOf(letzter.second, e)
        } else {
            verschmolzen.add(s to e)
        }
    }

    val luecken = mutableListOf<Leerband>()
    for (i in 0 until verschmolzen.size - 1) {
        val luecke = verschmolzen[i].second to verschmolzen[i + 1].first
        if (luecke.second - luecke.first >= LEERBAND_MINDEST_MIN) {
            luecken.add(Leerband(luecke.first, luecke.second))
        }
    }
    return luecken
}

/**
 * Feste Hoehe eines gestauchten Leerbands, in Einheiten -- in normalen
 * Abschnitten entspricht eine Minute genau einer Einheit, siehe
 * [Rasterachse]. 24 Einheiten (= 24 "Minuten" Bauhoehe) sind klein genug, dass
 * ein gestauchtes Band gegenueber einer echten 45-Minuten-Stunde sofort als
 * gestaucht auffaellt, aber gross genug fuer eine einzeilige Beschriftung wie
 * "1 Std 45 Min" in der ueblichen Blockschrift.
 */
const val LEERBAND_EINHEITEN = 24f

/**
 * Bildet eine Minute des Tages auf eine Rasterposition ("Einheiten") ab.
 * Normale Abschnitte bleiben linear (1 Einheit pro Minute), ein Leerband
 * bekommt statt seiner echten Dauer die feste Hoehe [LEERBAND_EINHEITEN].
 * Stuetzstellen liegen an [tagStart], jedem Leerband-Rand und [tagEnde];
 * dazwischen wird linear interpoliert.
 */
class Rasterachse(ereignisse: List<CalendarEvent>, tagStart: Int, tagEnde: Int) {
    val leerbaender: List<Leerband> = findeLeerbaender(ereignisse, tagStart, tagEnde)

    private val minutenStuetzstellen: List<Int>
    private val einheitenStuetzstellen: List<Float>

    val gesamtEinheiten: Float

    init {
        val minutenListe = mutableListOf(tagStart)
        val einheitenListe = mutableListOf(0f)
        var minute = tagStart
        var einheiten = 0f
        for (band in leerbaender.sortedBy { it.start }) {
            einheiten += (band.start - minute)
            minutenListe.add(band.start)
            einheitenListe.add(einheiten)
            einheiten += LEERBAND_EINHEITEN
            minutenListe.add(band.ende)
            einheitenListe.add(einheiten)
            minute = band.ende
        }
        einheiten += (tagEnde - minute)
        minutenListe.add(tagEnde)
        einheitenListe.add(einheiten)

        minutenStuetzstellen = minutenListe
        einheitenStuetzstellen = einheitenListe
        gesamtEinheiten = einheiten
    }

    fun position(minute: Int): Float {
        val m = minute.coerceIn(minutenStuetzstellen.first(), minutenStuetzstellen.last())
        for (i in 0 until minutenStuetzstellen.size - 1) {
            val m0 = minutenStuetzstellen[i]
            val m1 = minutenStuetzstellen[i + 1]
            if (m <= m1) {
                val e0 = einheitenStuetzstellen[i]
                if (m1 == m0) return e0
                val anteil = (m - m0).toFloat() / (m1 - m0)
                return e0 + anteil * (einheitenStuetzstellen[i + 1] - e0)
            }
        }
        return gesamtEinheiten
    }
}

/** "45 Min", "1 Std", "1 Std 45 Min" -- kein "0 Std" oder "0 Min" fuer einen leeren Teil. */
fun formatiereDauer(minuten: Int): String {
    val stunden = minuten / 60
    val rest = minuten % 60
    return buildString {
        if (stunden > 0) append("$stunden Std")
        if (rest > 0) {
            if (isNotEmpty()) append(" ")
            append("$rest Min")
        }
    }.ifEmpty { "0 Min" }
}

/**
 * Mindestabstand zwischen zwei beschrifteten Rastergrenzen, in Minuten. Bei
 * weniger ueberlappt der Text zweier Uhrzeiten -- das Beispiel aus der
 * Aufgabenstellung ist eine Stunde, die um 09:20 endet, waehrend die naechste
 * um 09:35 beginnt: nur 15 Minuten auseinander. Der Wert liegt bewusst unter
 * [LUECKE_VERSCHMELZEN_MIN]=25: eine Luecke, die schon als Pause innerhalb
 * einer Doppelstunde verschmilzt, kann nie zwei getrennt beschriftete Grenzen
 * erzeugen, aber knapp darunter (z.B. die 15 Minuten oben) sollen beide
 * Uhrzeiten noch lesbar bleiben, wo Platz ist.
 */
const val GRENZE_MINDESTABSTAND_MIN = 20

/** Eine Rasterlinie bei [minute]; [beschriftet] ist false, wenn sie zu dicht an der vorigen liegt. */
data class Rastergrenze(val minute: Int, val beschriftet: Boolean)

/**
 * Die tatsaechlich vorkommenden Stundenanfaenge und -enden der Woche
 * innerhalb von [tagStart]/[tagEnde], dedupliziert und sortiert. Grenzen, die
 * naeher als [GRENZE_MINDESTABSTAND_MIN] an der vorigen beschrifteten Grenze
 * liegen, verlieren nur ihre Beschriftung -- die Linie selbst bleibt, damit
 * sie weiter mit der Blockkante uebereinstimmt.
 */
fun rastergrenzen(ereignisse: List<CalendarEvent>, tagStart: Int, tagEnde: Int): List<Rastergrenze> {
    val punkte = mutableSetOf<Int>()
    for (ev in ereignisse) {
        val s = minuten(ev.startTime)
        if (s in tagStart..tagEnde) punkte.add(s)
        val e = ev.endTime?.let { minuten(it) } ?: (s + 45)
        if (e in tagStart..tagEnde) punkte.add(e)
    }
    val sortiert = punkte.sorted()
    var letzteBeschriftete = Int.MIN_VALUE / 2
    return sortiert.map { minute ->
        val beschriftet = minute - letzteBeschriftete >= GRENZE_MINDESTABSTAND_MIN
        if (beschriftet) letzteBeschriftete = minute
        Rastergrenze(minute, beschriftet)
    }
}

/** "7:50" statt "07:50" -- kein fuehrendes Nullpolster bei der Stunde. */
fun formatiereUhrzeit(minute: Int): String {
    val stunde = minute / 60
    val rest = minute % 60
    return "$stunde:${rest.toString().padStart(2, '0')}"
}

package dev.atlas.schule

import dev.atlas.schule.data.CalendarEvent
import dev.atlas.schule.ui.Rasterachse
import dev.atlas.schule.ui.findeLeerbaender
import dev.atlas.schule.ui.formatiereDauer
import dev.atlas.schule.ui.formatiereUhrzeit
import dev.atlas.schule.ui.naechsteStundeDesFachs
import dev.atlas.schule.ui.packeTag
import dev.atlas.schule.ui.rastergrenzen
import dev.atlas.schule.ui.tagesgrenzen
import dev.atlas.schule.ui.verschmelzeStunden
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Der Vertrag mit mergeSchool und packDay aus app/page.tsx. */
class StundenplanlogikTest {

    private val tag: LocalDate = LocalDate.parse("2026-03-11")

    private fun stunde(
        titel: String,
        von: String,
        bis: String?,
        status: String = "regular",
    ) = CalendarEvent(
        source = "school",
        refId = "$titel-$von",
        date = tag,
        startTime = von,
        endTime = bis,
        title = titel,
        status = status,
    )

    private fun kurz(liste: List<CalendarEvent>) =
        liste.map { "${it.title} ${it.startTime}-${it.endTime}" }

    @Test
    fun `eine Doppelstunde wird ein Block`() {
        val stunden = listOf(
            stunde("Mathematik", "08:00", "08:45"),
            stunde("Mathematik", "08:50", "09:35"),
        )
        assertEquals(listOf("Mathematik 08:00-09:35"), kurz(verschmelzeStunden(stunden)))
    }

    @Test
    fun `eine grosse Pause trennt zwei Stunden desselben Fachs`() {
        // 30 Minuten liegen ueber der Schwelle von 25.
        val stunden = listOf(
            stunde("Mathematik", "08:00", "08:45"),
            stunde("Mathematik", "09:15", "10:00"),
        )
        assertEquals(
            listOf("Mathematik 08:00-08:45", "Mathematik 09:15-10:00"),
            kurz(verschmelzeStunden(stunden)),
        )
    }

    @Test
    fun `genau 25 Minuten Luecke verschmelzen noch`() {
        val stunden = listOf(
            stunde("Physik", "08:00", "08:45"),
            stunde("Physik", "09:10", "09:55"),
        )
        assertEquals(listOf("Physik 08:00-09:55"), kurz(verschmelzeStunden(stunden)))
    }

    @Test
    fun `verschiedene Faecher verschmelzen nie`() {
        val stunden = listOf(
            stunde("Mathematik", "08:00", "08:45"),
            stunde("Deutsch", "08:50", "09:35"),
        )
        assertEquals(
            listOf("Mathematik 08:00-08:45", "Deutsch 08:50-09:35"),
            kurz(verschmelzeStunden(stunden)),
        )
    }

    @Test
    fun `ein Ausfall verschmilzt nicht mit der regulaeren Stunde davor`() {
        val stunden = listOf(
            stunde("Chemie", "08:00", "08:45"),
            stunde("Chemie", "08:50", "09:35", status = "cancelled"),
        )
        assertEquals(2, verschmelzeStunden(stunden).size)
    }

    @Test
    fun `unsortierte Eingabe wird vorher nach Startzeit sortiert`() {
        val stunden = listOf(
            stunde("Sport", "10:00", "10:45"),
            stunde("Sport", "09:10", "09:55"),
        )
        assertEquals(listOf("Sport 09:10-10:45"), kurz(verschmelzeStunden(stunden)))
    }

    @Test
    fun `ueberlappende Stunden bekommen eigene Spuren`() {
        val bloecke = packeTag(
            listOf(
                stunde("Mathematik", "08:00", "09:30"),
                stunde("Vertiefung", "08:30", "09:00"),
            ),
            480,
            960,
        )
        assertEquals(listOf(0, 1), bloecke.map { it.spur })
        assertEquals(listOf(2, 2), bloecke.map { it.spuren })
    }

    @Test
    fun `Stunden ohne Ueberlappung teilen sich keine Breite`() {
        val bloecke = packeTag(
            listOf(
                stunde("Mathematik", "08:00", "08:45"),
                stunde("Deutsch", "09:00", "09:45"),
            ),
            480,
            960,
        )
        assertEquals(listOf(1, 1), bloecke.map { it.spuren })
    }

    @Test
    fun `eine Stunde ohne Endzeit laeuft bis zum Rand des Rasters`() {
        val bloecke = packeTag(listOf(stunde("Ausflug", "10:00", null)), 480, 960)
        assertEquals(960, bloecke.single().ende)
    }

    @Test
    fun `die Tagesgrenzen umschliessen die Stunden minutenexakt`() {
        val grenzen = tagesgrenzen(
            listOf(
                stunde("Mathematik", "07:50", "08:35"),
                stunde("Sport", "13:10", "13:55"),
            ),
        )
        // 07:50 = 470, 13:55 = 835. Spanne 365min >= MINDEST_MINUTEN, keine Rundung mehr.
        assertEquals(470 to 835, grenzen)
    }

    @Test
    fun `ein einzelner Termin bekommt trotzdem die Mindestlaenge der Achse`() {
        // 09:00 = 540, 09:45 = 585, Spanne 45min < 360min: nach unten auf 360 verlaengert.
        assertEquals(540 to 900, tagesgrenzen(listOf(stunde("Mathematik", "09:00", "09:45"))))
    }

    @Test
    fun `ein leerer Tag bekommt die Standardachse`() {
        assertEquals(480 to 960, tagesgrenzen(emptyList()))
    }

    // --- Leerbaender: dichte Blocks bleiben proportional, echte Luecken werden gestaucht ---

    @Test
    fun `eine dichte Woche hat kein Leerband`() {
        val woche = listOf(
            stunde("Mathematik", "07:50", "09:20"),
            stunde("Deutsch", "09:35", "11:05"),
            stunde("Englisch", "11:20", "13:00"),
        )
        val (start, ende) = tagesgrenzen(woche)
        assertTrue(findeLeerbaender(woche, start, ende).isEmpty())
    }

    @Test
    fun `eine Luecke in der Mitte der Woche wird ein Leerband`() {
        val woche = listOf(
            stunde("Mathematik", "07:50", "09:20"),
            // 09:20 bis 11:00: 100 Minuten Luecke, weit ueber 45.
            stunde("Deutsch", "11:00", "12:30"),
        )
        val (start, ende) = tagesgrenzen(woche)
        val baender = findeLeerbaender(woche, start, ende)
        assertEquals(listOf(560 to 660), baender.map { it.start to it.ende })
    }

    @Test
    fun `zwei getrennte Luecken werden zwei Leerbaender`() {
        val woche = listOf(
            stunde("Mathematik", "07:50", "08:35"),
            stunde("Deutsch", "10:00", "10:45"),
            stunde("Sport", "13:00", "13:45"),
        )
        val (start, ende) = tagesgrenzen(woche)
        val baender = findeLeerbaender(woche, start, ende)
        assertEquals(2, baender.size)
    }

    @Test
    fun `am Rand entsteht nie ein Leerband weil die Achse dort schon beschnitten ist`() {
        // Nur ein Termin: tagesgrenzen verlaengert die Achse nach unten (Mindestlaenge),
        // der zusaetzliche Raum liegt NACH dem letzten Intervall, nicht dazwischen.
        val woche = listOf(stunde("Mathematik", "09:00", "09:45"))
        val (start, ende) = tagesgrenzen(woche)
        assertTrue(findeLeerbaender(woche, start, ende).isEmpty())
    }

    @Test
    fun `eine Luecke knapp unter 45 Minuten bleibt proportional`() {
        val woche = listOf(
            stunde("Mathematik", "07:50", "08:35"),
            // 08:35 bis 09:19: 44 Minuten, knapp unter der Schwelle.
            stunde("Deutsch", "09:19", "10:04"),
        )
        val (start, ende) = tagesgrenzen(woche)
        assertTrue(findeLeerbaender(woche, start, ende).isEmpty())
    }

    @Test
    fun `ein Tag ohne Stunden geht ohne eigenes Sonderverhalten in die Wochen-Union ein`() {
        // Montag und Mittwoch haben Unterricht, Dienstag ist komplett leer --
        // aus Sicht von findeLeerbaender gibt es nur die Ereignisliste der Woche,
        // welcher Tag welche Stunde traegt spielt keine Rolle.
        val montag = stunde("Mathematik", "07:50", "09:20")
        val mittwoch = stunde("Deutsch", "09:35", "11:05")
        val (start, ende) = tagesgrenzen(listOf(montag, mittwoch))
        assertTrue(findeLeerbaender(listOf(montag, mittwoch), start, ende).isEmpty())
    }

    @Test
    fun `die Rasterachse haelt normale Abschnitte proportional und staucht ein Leerband`() {
        val woche = listOf(
            stunde("Mathematik", "07:50", "09:20"),
            stunde("Deutsch", "11:00", "12:30"),
        )
        val (start, ende) = tagesgrenzen(woche)
        val achse = Rasterachse(woche, start, ende)
        // Vor dem Leerband ist die Abbildung linear: 470 bis 560 sind 90 Minuten.
        assertEquals(90f, achse.position(560) - achse.position(470), 0f)
        // Das Leerband (560 bis 660, 100 Minuten) hat eine feste Hoehe von 24 Einheiten.
        assertEquals(24f, achse.position(660) - achse.position(560), 0f)
    }

    @Test
    fun `formatiereDauer laesst leere Anteile weg`() {
        assertEquals("45 Min", formatiereDauer(45))
        assertEquals("1 Std", formatiereDauer(60))
        assertEquals("1 Std 45 Min", formatiereDauer(105))
    }

    @Test
    fun `formatiereUhrzeit polstert die Stunde nicht mit einer fuehrenden Null`() {
        assertEquals("7:50", formatiereUhrzeit(470))
        assertEquals("13:05", formatiereUhrzeit(785))
    }

    @Test
    fun `dicht beieinanderliegende Grenzen unterdruecken nur die zweite Beschriftung`() {
        val woche = listOf(
            stunde("Mathematik", "07:50", "09:20"),
            // 09:20 Ende, 09:35 Anfang: nur 15 Minuten auseinander.
            stunde("Deutsch", "09:35", "11:05"),
        )
        val (start, ende) = tagesgrenzen(woche)
        val grenzen = rastergrenzen(woche, start, ende)
        val beschriftete = grenzen.filter { it.beschriftet }.map { it.minute }
        assertTrue(560 in beschriftete)
        assertTrue(575 !in beschriftete)
    }

    // --- naechste Stunde desselben Fachs, der Vertrag mit nextLessonDate ------

    private fun stundeAm(datum: String, titel: String, status: String = "regular") =
        stunde(titel, "08:00", "08:45", status).copy(date = LocalDate.parse(datum))

    @Test
    fun `die naechste Stunde desselben Fachs liegt nach dem angetippten Tag`() {
        val woche = listOf(
            stundeAm("2026-03-09", "Mathematik"),
            stundeAm("2026-03-11", "Deutsch"),
            stundeAm("2026-03-12", "Mathematik"),
            stundeAm("2026-03-13", "Mathematik"),
        )
        assertEquals(
            LocalDate.parse("2026-03-12"),
            naechsteStundeDesFachs(woche, "Mathematik", LocalDate.parse("2026-03-09")),
        )
    }

    @Test
    fun `eine entfallene Stunde zaehlt nicht als naechste`() {
        val woche = listOf(
            stundeAm("2026-03-11", "Mathematik", status = "cancelled"),
            stundeAm("2026-03-13", "Mathematik"),
        )
        assertEquals(
            LocalDate.parse("2026-03-13"),
            naechsteStundeDesFachs(woche, "Mathematik", LocalDate.parse("2026-03-09")),
        )
    }

    @Test
    fun `ohne weitere Stunde in der Woche gibt es kein Datum`() {
        val woche = listOf(stundeAm("2026-03-13", "Mathematik"))
        assertNull(naechsteStundeDesFachs(woche, "Mathematik", LocalDate.parse("2026-03-13")))
    }
}

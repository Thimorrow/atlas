package dev.atlas.schule

import dev.atlas.schule.data.CalendarEvent
import dev.atlas.schule.ui.packeTag
import dev.atlas.schule.ui.tagesgrenzen
import dev.atlas.schule.ui.verschmelzeStunden
import org.junit.Assert.assertEquals
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
            8,
            16,
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
            8,
            16,
        )
        assertEquals(listOf(1, 1), bloecke.map { it.spuren })
    }

    @Test
    fun `eine Stunde ohne Endzeit laeuft bis zum Rand des Rasters`() {
        val bloecke = packeTag(listOf(stunde("Ausflug", "10:00", null)), 8, 16)
        assertEquals(16 * 60, bloecke.single().ende)
    }

    @Test
    fun `die Tagesgrenzen umschliessen die Stunden und halten die Mindesthoehe`() {
        val grenzen = tagesgrenzen(
            listOf(
                stunde("Mathematik", "07:50", "08:35"),
                stunde("Sport", "13:10", "13:55"),
            ),
        )
        // Abgerundeter Beginn, aufgerundetes Ende: 13:55 darf nicht abgeschnitten werden.
        assertEquals(7 to 14, grenzen)
    }

    @Test
    fun `ein einzelner Termin bekommt trotzdem sechs Stunden Achse`() {
        assertEquals(9 to 15, tagesgrenzen(listOf(stunde("Mathematik", "09:00", "09:45"))))
    }

    @Test
    fun `ein leerer Tag bekommt die Standardachse`() {
        assertEquals(8 to 16, tagesgrenzen(emptyList()))
    }
}

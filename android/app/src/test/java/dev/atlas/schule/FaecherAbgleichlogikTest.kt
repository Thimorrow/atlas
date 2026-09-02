package dev.atlas.schule

import dev.atlas.schule.data.SubjectDTO
import dev.atlas.schule.ui.FachStatus
import dev.atlas.schule.ui.aktiveFachNamen
import dev.atlas.schule.ui.faecherAbgleichZusammenfassung
import dev.atlas.schule.ui.faecherZeilen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * Der Faecher-Abgleich: welche Namen aus Kandidaten und Fachbestand
 * hervorgehen, was jede Zeile bedeutet, und wie die Zusammenfassungszeile
 * ueber dem Knopf bei 0/1/mehreren Aenderungen lautet.
 */
class FaecherAbgleichlogikTest {

    private fun fach(
        id: String,
        untisSubject: String?,
        archiviert: Boolean = false,
        offeneAufgaben: Int = 0,
        notizen: Int = 0,
    ) = SubjectDTO(
        id = id,
        name = untisSubject ?: id,
        untisSubject = untisSubject,
        archivedAt = if (archiviert) Instant.parse("2026-01-01T00:00:00Z") else null,
        openAssignments = offeneAufgaben,
        noteCount = notizen,
    )

    @Test
    fun `ohne Kandidaten und ohne Bestand bleibt die Liste leer`() {
        assertEquals(emptyList<String>(), faecherZeilen(emptyList(), emptyList()).map { it.name })
    }

    @Test
    fun `ein Kandidat ohne Fach ist neu`() {
        val zeilen = faecherZeilen(listOf("Biologie"), emptyList())
        assertEquals(1, zeilen.size)
        assertEquals("Biologie", zeilen[0].name)
        assertEquals(FachStatus.NEU, zeilen[0].status)
        assertEquals(false, zeilen[0].hatInhalt)
    }

    @Test
    fun `ein Fach ohne Kandidat ist nicht im Stundenplan`() {
        val zeilen = faecherZeilen(emptyList(), listOf(fach("1", "Latein")))
        assertEquals(1, zeilen.size)
        assertEquals("Latein", zeilen[0].name)
        assertEquals(FachStatus.NICHT_IM_STUNDENPLAN, zeilen[0].status)
    }

    @Test
    fun `ein Kandidat mit passendem Fach ist im Stundenplan`() {
        val zeilen = faecherZeilen(listOf("Mathematik"), listOf(fach("1", "Mathematik")))
        assertEquals(1, zeilen.size)
        assertEquals(FachStatus.IM_STUNDENPLAN, zeilen[0].status)
    }

    @Test
    fun `ein Fach ohne untisSubject faellt aus der Liste`() {
        val zeilen = faecherZeilen(listOf("Mathematik"), listOf(fach("1", null)))
        assertEquals(listOf("Mathematik"), zeilen.map { it.name })
    }

    @Test
    fun `Inhalt an offenen Aufgaben oder Noten wird gemeldet`() {
        val mitAufgabe = faecherZeilen(emptyList(), listOf(fach("1", "Kunst", archiviert = true, offeneAufgaben = 2)))
        val mitNote = faecherZeilen(emptyList(), listOf(fach("2", "Musik", archiviert = true, notizen = 1)))
        val ohne = faecherZeilen(emptyList(), listOf(fach("3", "Sport", archiviert = true)))
        assertEquals(true, mitAufgabe.single().hatInhalt)
        assertEquals(true, mitNote.single().hatInhalt)
        assertEquals(false, ohne.single().hatInhalt)
    }

    @Test
    fun `die Liste sortiert alphabetisch nach deutscher Regel`() {
        val zeilen = faecherZeilen(listOf("Zoologie", "Ökologie", "Physik"), emptyList())
        assertEquals(listOf("Ökologie", "Physik", "Zoologie"), zeilen.map { it.name })
    }

    @Test
    fun `aktive Fachnamen zaehlen nur nicht archivierte mit untisSubject`() {
        val bestand = listOf(
            fach("1", "Deutsch"),
            fach("2", "Latein", archiviert = true),
            fach("3", null),
        )
        assertEquals(setOf("Deutsch"), aktiveFachNamen(bestand))
    }

    @Test
    fun `Zusammenfassung ohne Aenderung sagt, dass alles passt`() {
        val namen = setOf("Deutsch", "Mathematik")
        assertEquals(
            "Deine Fächer passen zum Stundenplan.",
            faecherAbgleichZusammenfassung(bisherAktiv = namen, ausgewaehlt = namen),
        )
    }

    @Test
    fun `Zusammenfassung im Singular fuer je eine Aenderung`() {
        assertEquals(
            "1 kommt dazu, 1 wird archiviert.",
            faecherAbgleichZusammenfassung(
                bisherAktiv = setOf("Latein"),
                ausgewaehlt = setOf("Erdkunde"),
            ),
        )
    }

    @Test
    fun `Zusammenfassung im Plural fuer mehrere Aenderungen`() {
        assertEquals(
            "2 kommen dazu, 4 werden archiviert.",
            faecherAbgleichZusammenfassung(
                bisherAktiv = setOf("Latein", "Deutsch", "Musik", "Evangelische Religionslehre"),
                ausgewaehlt = setOf("Erdkunde", "Wirtschaft/Politik"),
            ),
        )
    }

    @Test
    fun `Zusammenfassung nennt nur die Seite, auf der sich etwas tut`() {
        assertEquals(
            "1 kommt dazu.",
            faecherAbgleichZusammenfassung(bisherAktiv = emptySet(), ausgewaehlt = setOf("Erdkunde")),
        )
        assertEquals(
            "1 wird archiviert.",
            faecherAbgleichZusammenfassung(bisherAktiv = setOf("Latein"), ausgewaehlt = emptySet()),
        )
    }
    @Test
    fun `ein archiviertes Fach im Stundenplan ist als archiviert markiert`() {
        val zeilen = faecherZeilen(
            listOf("Kunst", "Sport"),
            listOf(fach("1", "Kunst", archiviert = true), fach("2", "Sport")),
        )
        val kunst = zeilen.first { it.name == "Kunst" }
        val sport = zeilen.first { it.name == "Sport" }
        // Beide kommen im Stundenplan vor, nur eines ist archiviert. Ohne die
        // Unterscheidung sahen sie in der Liste gleich aus, obwohl das eine als
        // Zugang zaehlt und das andere nicht.
        assertEquals(FachStatus.IM_STUNDENPLAN, kunst.status)
        assertTrue(kunst.archiviert)
        assertFalse(sport.archiviert)
    }

    @Test
    fun `ein Name ohne vorhandenes Fach gilt nicht als archiviert`() {
        val zeilen = faecherZeilen(listOf("Erdkunde"), emptyList())
        assertEquals(FachStatus.NEU, zeilen.single().status)
        assertFalse(zeilen.single().archiviert)
    }

}

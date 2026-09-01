package dev.atlas.schule

import dev.atlas.schule.ui.theme.Fachfarbe
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Die Erwartungswerte stammen nicht aus dem Kopf, sondern aus einem Lauf von
 * defaultColorFor() in lib/subject-colors.ts ueber genau diese Namen. Weicht
 * die Kotlin-Seite ab, bekaeme dasselbe Fach im Browser und auf dem Telefon
 * zwei Farben.
 */
class FachfarbenTest {

    @Test
    fun `Vorbelegung trifft die Wunschfarben`() {
        val erwartet = mapOf(
            "Mathematik" to Fachfarbe.BLUE,
            "Mathe" to Fachfarbe.BLUE,
            "Biologie" to Fachfarbe.GREEN,
            "Deutsch" to Fachfarbe.ROSE,
            "Englisch" to Fachfarbe.YELLOW,
            "Religion" to Fachfarbe.WHITE,
            "Chemie" to Fachfarbe.ORANGE,
            "Informatik" to Fachfarbe.SLATE,
            "Geschichte" to Fachfarbe.VIOLET,
        )
        for ((name, farbe) in erwartet) {
            assertEquals("Vorbelegung fuer $name", farbe, Fachfarbe.standardFuer(name))
        }
    }

    @Test
    fun `Vorbelegung greift auch bei Teiltreffern und Grossschreibung`() {
        // Der Web-Code prueft kleingeschrieben als Teilstring, damit auch
        // Untis-Varianten treffen.
        assertEquals(Fachfarbe.BLUE, Fachfarbe.standardFuer("MATHEMATIK LK"))
        assertEquals(Fachfarbe.GREEN, Fachfarbe.standardFuer("Biologie Leistungskurs"))
        assertEquals(Fachfarbe.VIOLET, Fachfarbe.standardFuer("Geschichte bilingual"))
    }

    @Test
    fun `Hash-Rueckfall liefert dieselben Farben wie JavaScript`() {
        // Ausgabe von defaultColorFor() fuer Faecher ohne Vorbelegung.
        val erwartet = mapOf(
            "Physik" to Fachfarbe.SLATE,
            "Kunst" to Fachfarbe.YELLOW,
            "Sport" to Fachfarbe.AMBER,
            "Musik" to Fachfarbe.ROSE,
            "Latein" to Fachfarbe.BLUE,
            // Umlaut als Probe: charCodeAt liefert eine UTF-16-Einheit, die
            // Kotlin-Seite muss mit Char.code dasselbe rechnen.
            "Französisch" to Fachfarbe.ORANGE,
            "Erdkunde" to Fachfarbe.AMBER,
            "Philosophie" to Fachfarbe.ORANGE,
            "Spanisch" to Fachfarbe.LIME,
            "Politik" to Fachfarbe.GREEN,
            "Wirtschaft" to Fachfarbe.BLUE,
            "Ethik" to Fachfarbe.TEAL,
            "" to Fachfarbe.SLATE,
        )
        for ((name, farbe) in erwartet) {
            assertEquals("Hash fuer '$name'", farbe, Fachfarbe.standardFuer(name))
        }
    }

    @Test
    fun `Reihenfolge und Tokens entsprechen SUBJECT_COLORS`() {
        // Der Hash indiziert in diese Liste. Wer sie umsortiert, faerbt still
        // die halbe App um.
        assertEquals(
            listOf(
                "slate", "white", "blue", "sky", "teal", "green", "yellow",
                "amber", "orange", "rose", "violet", "lime", "pink",
            ),
            Fachfarbe.entries.map { it.token },
        )
    }

    @Test
    fun `Unbekanntes Token ergibt keine Fachfarbe`() {
        assertEquals(null, Fachfarbe.vonToken("gibtesnicht"))
        assertEquals(null, Fachfarbe.vonToken(null))
        assertEquals(Fachfarbe.BLUE, Fachfarbe.vonToken("blue"))
    }
}

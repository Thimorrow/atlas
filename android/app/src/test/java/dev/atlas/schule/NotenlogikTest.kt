package dev.atlas.schule

import dev.atlas.schule.ui.Notenlogik
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Prueft gegen dieselben Ergebnisse wie lib/grades.ts: pointsToGradeLabel und
 * der gewichtete Fachschnitt aus subjectAverage.
 */
class NotenlogikTest {

    @Test
    fun `null punkte ergeben die note 6 ohne tendenz`() {
        assertEquals("6", Notenlogik.punkteZuNote(0))
    }

    @Test
    fun `ein punkt ergibt 5 minus`() {
        // stufe = 16 - 1 = 15, note = (15 + 2) / 3 = 5, 15 % 3 == 0 -> "-"
        assertEquals("5-", Notenlogik.punkteZuNote(1))
    }

    @Test
    fun `fuenfzehn punkte ergeben 1 plus`() {
        // stufe = 16 - 15 = 1, note = (1 + 2) / 3 = 1, 1 % 3 == 1 -> "+"
        assertEquals("1+", Notenlogik.punkteZuNote(15))
    }

    @Test
    fun `nur muendliche noten zaehlen allein`() {
        val noten = listOf(
            Notenlogik.NotenEingabe(art = "oral", punkte = 12, gewicht = 1.0),
            Notenlogik.NotenEingabe(art = "oral", punkte = 10, gewicht = 1.0),
        )
        assertEquals(11.0, Notenlogik.fachschnittPunkte(noten)!!, 0.0001)
    }

    @Test
    fun `nur schriftliche noten zaehlen allein`() {
        val noten = listOf(
            Notenlogik.NotenEingabe(art = "written", punkte = 9, gewicht = 1.0),
            Notenlogik.NotenEingabe(art = "written", punkte = 7, gewicht = 1.0),
        )
        assertEquals(8.0, Notenlogik.fachschnittPunkte(noten)!!, 0.0001)
    }

    @Test
    fun `beide seiten zusammen bei 50 zu 50`() {
        val noten = listOf(
            Notenlogik.NotenEingabe(art = "oral", punkte = 12, gewicht = 1.0),
            Notenlogik.NotenEingabe(art = "written", punkte = 8, gewicht = 1.0),
        )
        // muendlich = 12, schriftlich = 8, 50:50 -> 10.0
        assertEquals(10.0, Notenlogik.fachschnittPunkte(noten, muendlichAnteilProzent = 50)!!, 0.0001)
    }

    @Test
    fun `beide seiten zusammen bei 40 zu 60`() {
        val noten = listOf(
            Notenlogik.NotenEingabe(art = "oral", punkte = 12, gewicht = 1.0),
            Notenlogik.NotenEingabe(art = "written", punkte = 8, gewicht = 1.0),
        )
        // muendlich = 12, schriftlich = 8, 40:60 -> 12*0.4 + 8*0.6 = 4.8 + 4.8 = 9.6
        assertEquals(9.6, Notenlogik.fachschnittPunkte(noten, muendlichAnteilProzent = 40)!!, 0.0001)
    }

    @Test
    fun `ohne noten gibt es keinen schnitt`() {
        assertNull(Notenlogik.fachschnittPunkte(emptyList()))
    }
}

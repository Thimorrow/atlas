package dev.atlas.schule

import dev.atlas.schule.ui.standText
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Die Standzeile nennt den Grund, statt immer "keine Verbindung" zu behaupten.
 * Ein 500 oder eine unlesbare Antwort kommt vom erreichbaren Server; wer dann
 * nach seinem Empfang sucht, sucht an der falschen Stelle.
 */
class StandTextTest {

    private val heute = LocalDate.of(2026, 9, 2)

    private fun zeit(tag: Int, stunde: Int, minute: Int) =
        LocalDateTime.of(2026, 9, tag, stunde, minute).atZone(ZoneId.systemDefault()).toInstant()

    @Test
    fun `ohne netz nennt die zeile die verbindung`() {
        assertEquals(
            "Stand von 08:05 Uhr, keine Verbindung",
            standText(zeit(2, 8, 5), heute, ohneVerbindung = true),
        )
    }

    @Test
    fun `bei einer antwort des servers nennt die zeile den server`() {
        assertEquals(
            "Stand von 14:32 Uhr, der Server antwortet gerade nicht",
            standText(zeit(2, 14, 32), heute, ohneVerbindung = false),
        )
    }

    @Test
    fun `ein stand von gestern bekommt das datum dazu`() {
        assertEquals(
            "Stand vom 1.9., 21:07 Uhr, der Server antwortet gerade nicht",
            standText(zeit(1, 21, 7), heute, ohneVerbindung = false),
        )
    }
}

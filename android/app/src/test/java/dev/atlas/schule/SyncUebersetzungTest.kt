package dev.atlas.schule

import dev.atlas.schule.ui.friendlySyncMessage
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * friendlySyncMessage() uebersetzt, was vom Server oder vom Netz kommt, in
 * einen Satz, den ein Schueler versteht -- Portierung von
 * app/settings/page.tsx's gleichnamiger Funktion. Die Faelle hier sind genau
 * die, die im Betrieb schon aufgetreten sind: Untis' eigene Codes fuer
 * Zeitraum-Probleme (-8507, -8509, -7004) landen absichtlich NICHT in einer
 * eigenen festen Meldung, sondern im allgemeinen Satz -- eine feste Meldung
 * je Code waere falsch, sobald derselbe Code aus einem anderen Grund kommt.
 */
class SyncUebersetzungTest {

    @Test
    fun `keine Verbindung ergibt die Netzwerk-Meldung, unabhaengig vom Text`() {
        assertEquals(
            "Keine Verbindung zum Server. Prüf dein WLAN und versuch es dann noch einmal.",
            friendlySyncMessage("fetch failed", ohneVerbindung = true),
        )
    }

    @Test
    fun `abgelehnte Zugangsdaten werden erkannt`() {
        assertEquals(
            "WebUntis hat die Zugangsdaten abgelehnt. Server, Schule, Benutzer oder Passwort stimmen nicht.",
            friendlySyncMessage("Anmeldung bei WebUntis fehlgeschlagen: 401 Unauthorized", ohneVerbindung = false),
        )
    }

    @Test
    fun `nicht erreichbarer Untis-Dienst wird erkannt`() {
        assertEquals(
            "WebUntis antwortet nicht. Oft liegt das an der Schule, etwa weil der Dienst dort gerade " +
                "abgeschaltet ist. Versuch es später erneut.",
            friendlySyncMessage("connect ECONNREFUSED 1.2.3.4:443", ohneVerbindung = false),
        )
    }

    @Test
    fun `Untis-Code -8507 -- Zeitraum ueber Schuljahresgrenze -- faellt in den allgemeinen Satz`() {
        assertEquals(
            "Der Abgleich hat nicht geklappt. Versuch es später erneut.",
            friendlySyncMessage(
                "Stundenplan konnte nicht geladen werden: startDate and endDate are not within a " +
                    "single school year, Code -8507",
                ohneVerbindung = false,
            ),
        )
    }

    @Test
    fun `Untis-Code -8509 -- Zeitraum noch nicht freigegeben -- faellt in den allgemeinen Satz`() {
        assertEquals(
            "Der Abgleich hat nicht geklappt. Versuch es später erneut.",
            friendlySyncMessage("no right for user, Code -8509", ohneVerbindung = false),
        )
    }

    @Test
    fun `Untis-Code -7004 -- Datum ausserhalb des erlaubten Bereichs -- faellt in den allgemeinen Satz`() {
        assertEquals(
            "Der Abgleich hat nicht geklappt. Versuch es später erneut.",
            friendlySyncMessage("no allowed date, Code -7004", ohneVerbindung = false),
        )
    }

    @Test
    fun `unbekannter Code faellt ebenfalls in den allgemeinen Satz`() {
        assertEquals(
            "Der Abgleich hat nicht geklappt. Versuch es später erneut.",
            friendlySyncMessage("etwas ganz anderes ist schiefgelaufen, Code -9999", ohneVerbindung = false),
        )
    }
}

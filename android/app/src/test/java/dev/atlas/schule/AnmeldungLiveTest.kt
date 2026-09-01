package dev.atlas.schule

import dev.atlas.schule.data.AtlasApi
import dev.atlas.schule.data.AtlasErgebnis
import dev.atlas.schule.data.FluechtigerCookieSpeicher
import dev.atlas.schule.data.STATUS_NICHT_ANGEMELDET
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeNotNull
import org.junit.Test

/**
 * Spricht mit der echten Bereitstellung. Das Passwort steht nicht im Code,
 * sondern kommt aus der Umgebung:
 *
 *     ATLAS_PASSWORD='...' ./gradlew testDebugUnitTest --tests '*AnmeldungLiveTest'
 *
 * Ohne die Variable ueberspringt der Test sich selbst, damit ein Build ohne
 * Netz oder ohne Geheimnis nicht rot wird.
 */
class AnmeldungLiveTest {
    private val passwort: String? = System.getenv("ATLAS_PASSWORD")

    @Test
    fun `falsches Passwort ergibt 401 mit deutscher Meldung`() = runBlocking {
        assumeNotNull(passwort)
        val api = AtlasApi(FluechtigerCookieSpeicher())
        val ergebnis = api.anmelden("ganz-sicher-nicht-das-passwort")
        assertTrue("erwartet Fehler, bekam $ergebnis", ergebnis is AtlasErgebnis.Fehler)
        ergebnis as AtlasErgebnis.Fehler
        assertEquals(STATUS_NICHT_ANGEMELDET, ergebnis.status)
        assertEquals("Passwort stimmt nicht.", ergebnis.meldung)
    }

    @Test
    fun `richtiges Passwort setzt das Gate-Cookie und oeffnet gesperrte Routen`() = runBlocking {
        assumeNotNull(passwort)
        val speicher = FluechtigerCookieSpeicher()
        val api = AtlasApi(speicher)

        // Vor der Anmeldung ist die Route zu.
        val vorher = api.faecher()
        assertTrue("ungesperrt vor der Anmeldung", vorher is AtlasErgebnis.Fehler)
        assertEquals(STATUS_NICHT_ANGEMELDET, (vorher as AtlasErgebnis.Fehler).status)

        assertTrue("Anmeldung fehlgeschlagen", api.anmelden(passwort!!) is AtlasErgebnis.Erfolg)

        val cookie = speicher.gateCookie()
        assertNotNull("atlas-gate wurde nicht gesetzt", cookie)
        assertTrue("atlas-gate sollte HttpOnly sein", cookie!!.httpOnly)
        // Max-Age ein Jahr. Etwas Puffer, weil die Uhren nicht exakt gleich gehen.
        val tage = (cookie.expiresAt - System.currentTimeMillis()) / 86_400_000.0
        assertTrue("Laufzeit war $tage Tage, erwartet rund 365", tage > 360 && tage < 370)

        val faecher = api.faecher()
        assertTrue("Faecher nicht ladbar: $faecher", faecher is AtlasErgebnis.Erfolg)
        println("Faecher: ${(faecher as AtlasErgebnis.Erfolg).wert.size}")
        faecher.wert.take(3).forEach { println("  ${it.name} (${it.color}), ${it.openAssignments} offen") }
    }
}

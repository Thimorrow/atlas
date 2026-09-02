package dev.atlas.schule

import dev.atlas.schule.data.AntwortSpeicher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Der Speicher darf nie eine halbe Datei hinterlassen. Ein abgeschnittener
 * Rumpf laesst sich nicht einlesen, und dann ist der Startbildschirm ohne Netz
 * still leer -- genau die Lage, fuer die er gebaut wurde.
 */
class AntwortSpeicherTest {

    private fun speicherInNeuemOrdner(): Pair<AntwortSpeicher, File> {
        val ordner = File.createTempFile("antworten", "").let {
            it.delete()
            File(it.parentFile, it.name + "-dir")
        }
        return AntwortSpeicher(ordner) to ordner
    }

    @Test
    fun `geschriebenes kommt unveraendert zurueck`() {
        val (speicher, _) = speicherInNeuemOrdner()
        speicher.schreibe("home", """{"a":1}""")
        assertEquals("""{"a":1}""", speicher.lies("home")?.wert)
    }

    /**
     * Der eigentliche Punkt: viele gleichzeitige Schreiber auf denselben
     * Schluessel. Wer die Zieldatei zuerst kuerzt und dann fuellt, laesst hier
     * einen abgeschnittenen Rumpf zurueck; wer daneben schreibt und umbenennt,
     * nicht.
     */
    @Test
    fun `gleichzeitige schreiber hinterlassen nie eine halbe datei`() {
        val (speicher, ordner) = speicherInNeuemOrdner()
        val kurz = "k".repeat(16)
        val lang = "l".repeat(400_000)
        val pool = Executors.newFixedThreadPool(8)
        val start = CountDownLatch(1)
        repeat(64) { i ->
            pool.execute {
                start.await()
                speicher.schreibe("home", if (i % 2 == 0) kurz else lang)
            }
        }
        start.countDown()
        pool.shutdown()
        assertTrue(pool.awaitTermination(30, TimeUnit.SECONDS))

        val gelesen = speicher.lies("home")
        assertNotNull(gelesen)
        // Ganz oder gar nicht: es ist immer einer der beiden vollstaendigen
        // Rumpfe, nie ein Anfang davon.
        assertTrue("Laenge ${gelesen!!.wert.length}", gelesen.wert == kurz || gelesen.wert == lang)
        // Und es bleibt nichts liegen: nur die eine Zieldatei.
        assertEquals(listOf("home.json"), ordner.list()!!.sorted())
    }
}

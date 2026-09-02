package dev.atlas.schule

import org.junit.Assert.assertTrue
import java.io.File
import org.junit.Test

/**
 * Kommentare im Projekt werden bewusst ohne Umlaute geschrieben. Sichtbarer
 * Text nicht: dort gehoert "für" hin, nicht "fuer". Beim Schreiben rutscht die
 * Kommentar-Gewohnheit aber gern in einen String, und im Emulator faellt das
 * erst auf, wenn man genau den Bildschirm oeffnet.
 *
 * Dieser Waechter liest die Quellen selbst und bricht ab, sobald ein
 * Zeichenkettenliteral eines dieser Woerter ohne Umlaut enthaelt. Er ersetzt
 * keine Durchsicht, er faengt nur den einen Fehler, der schon zweimal
 * passiert ist.
 */
class UmlautWaechterTest {

    // Nur Woerter, die in einem sichtbaren Text nie ohne Umlaut richtig sind.
    // Interne Namen wie der Zeichnungsname "zurueck" in Symbole.kt sollen
    // nicht anschlagen, deshalb steht "zurueck" hier bewusst nicht.
    private val verdaechtig = listOf(
        "fuer", "ueber", "naechst", "koenn", "moecht", "muess", "waehl",
        "Uebung", "uebung", "Faecher", "faecher", "groesse", "hoehe",
        "loesch", "aendern", "gruen", "spaeter", "waehrend", "zaehl",
    )

    private val literal = Regex("\"([^\"\\\\]|\\\\.)*\"")

    // Was in ${...} steht, ist Kotlin-Code und kein Text: dort heisst eine
    // Variable voellig zu Recht "faecher".
    private val schablone = Regex("""\$\{[^}]*}""")

    // Namen, die nie jemand liest: Bezeichner von Zeichnungen, Schluessel im
    // Antwortspeicher, Pfadstuecke. Sie folgen der Kommentarschreibweise.
    private val interneNamen = setOf("\"faecher\"", "\"zurueck\"", "\"schliessen\"")

    @Test
    fun `sichtbare Texte tragen ihre Umlaute`() {
        val wurzel = File("src/main/java")
        assertTrue(
            "Quellordner nicht gefunden, Arbeitsverzeichnis ist ${File(".").absolutePath}",
            wurzel.isDirectory,
        )

        val funde = mutableListOf<String>()
        wurzel.walkTopDown().filter { it.extension == "kt" }.forEach { datei ->
            datei.readLines().forEachIndexed { index, zeile ->
                val getrimmt = zeile.trimStart()
                // Zeilenkommentar, Blockkommentar und KDoc scheiden aus: dort
                // ist die Schreibweise ohne Umlaute genau die Vorgabe.
                if (getrimmt.startsWith("*") || getrimmt.startsWith("/*")) return@forEachIndexed
                val ohneKommentar = zeile.substringBefore("//")
                if (ohneKommentar.isBlank()) return@forEachIndexed
                literal.findAll(ohneKommentar).forEach { treffer ->
                    if (treffer.value in interneNamen) return@forEach
                    val text = schablone.replace(treffer.value, "")
                    val wort = verdaechtig.firstOrNull { text.contains(it) }
                    if (wort != null) {
                        funde += "${datei.name}:${index + 1}  $wort  in  ${treffer.value}"
                    }
                }
            }
        }

        assertTrue(
            "Sichtbarer Text ohne Umlaut:\n" + funde.joinToString("\n"),
            funde.isEmpty(),
        )
    }
}

package dev.atlas.schule.data

import android.content.Context
import java.io.File
import java.time.Instant

/** Eine gespeicherte Antwort mit dem Zeitpunkt, zu dem sie vom Server kam. */
data class Zwischenstand<T>(val wert: T, val stand: Instant)

/**
 * Legt die zuletzt erfolgreiche Antwort einer Anfrage als Datei ab, damit die
 * App im Schulgebaeude ohne Netz nicht leer dasteht.
 *
 * Bewusst nur Dateien: es gibt keine lokalen Aenderungen, die zum Server
 * zurueckfliessen muessten, also gibt es auch nichts abzugleichen. Eine
 * Datenbank haette hier nur Schema, Migrationen und eine Abhaengigkeit mehr
 * gebracht. Der rohe JSON-Text wird gespeichert, nicht das geparste Objekt:
 * so bleibt der Speicher unabhaengig davon, welche DTOs es gerade gibt.
 */
class AntwortSpeicher(context: Context) {
    private val ordner = File(context.applicationContext.filesDir, "antworten")

    /** Erste Zeile ist der Zeitstempel, der Rest der Rumpf. */
    fun schreibe(schluessel: String, rumpf: String) {
        runCatching {
            ordner.mkdirs()
            datei(schluessel).writeText("${System.currentTimeMillis()}\n$rumpf")
        }
        // Ein voller oder gesperrter Speicher darf nie einen erfolgreichen
        // Abruf in einen Absturz verwandeln. Ohne Datei gibt es beim naechsten
        // Start eben nichts vorzuzeigen, mehr passiert nicht.
    }

    fun lies(schluessel: String): Zwischenstand<String>? = runCatching {
        val text = datei(schluessel).readText()
        val umbruch = text.indexOf('\n')
        if (umbruch <= 0) return@runCatching null
        val millis = text.substring(0, umbruch).toLongOrNull() ?: return@runCatching null
        Zwischenstand(text.substring(umbruch + 1), Instant.ofEpochMilli(millis))
    }.getOrNull()

    /** Nach dem Abmelden und nach einem 401: die Daten gehoeren zu einer Anmeldung, die nicht mehr gilt. */
    fun leeren() {
        runCatching { ordner.deleteRecursively() }
    }

    // Fach-IDs kommen vom Server. Alles, was kein Buchstabe oder keine Ziffer
    // ist, wird ersetzt, damit aus einem Schluessel nie ein Pfad wird.
    private fun datei(schluessel: String) =
        File(ordner, schluessel.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".json")
}

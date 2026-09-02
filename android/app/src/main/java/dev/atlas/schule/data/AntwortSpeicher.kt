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
class AntwortSpeicher(private val ordner: File) {
    // Der Ordner steckt im Hauptkonstruktor, damit ein Test ihn setzen kann.
    // Ohne das braeuchte schon der Speichertest einen Android-Kontext.
    constructor(context: Context) : this(File(context.applicationContext.filesDir, "antworten"))

    /** Erste Zeile ist der Zeitstempel, der Rest der Rumpf. */
    fun schreibe(schluessel: String, rumpf: String) {
        runCatching {
            ordner.mkdirs()
            // Erst daneben schreiben, dann umbenennen. writeText kuerzt die
            // Datei zuerst: ein zweiter Schreiber auf denselben Schluessel oder
            // ein Prozesstod mittendrin hinterliesse sonst eine halbe Datei,
            // und die ist beim naechsten Start ohne Netz genauso wertlos wie
            // gar keine. Das Umbenennen ist der eine Schritt, den es entweder
            // ganz oder nicht gab.
            val ziel = datei(schluessel)
            // Eigener Name je Schreibvorgang: zwei gleichzeitige Abrufe
            // desselben Schluessels wuerden sich sonst in derselben
            // Zwischendatei begegnen.
            val zwischen = File.createTempFile("neu-${ziel.nameWithoutExtension}", ".tmp", ordner)
            try {
                zwischen.writeText("${System.currentTimeMillis()}\n$rumpf")
                if (!zwischen.renameTo(ziel)) error("Umbenennen von ${zwischen.name} fehlgeschlagen")
            } finally {
                // Nach dem Umbenennen gibt es sie nicht mehr, davor darf sie
                // nicht liegenbleiben: lies() wuerde sie zwar nie oeffnen, aber
                // aufraeumen wuerde sie sonst auch niemand.
                zwischen.delete()
            }
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

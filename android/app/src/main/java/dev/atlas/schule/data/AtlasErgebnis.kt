package dev.atlas.schule.data

/**
 * Alles, was die Netzwerkschicht verlaesst, kommt als Ergebnis, nie als
 * Ausnahme. Die Oberflaeche soll entscheiden, was sie anzeigt, und nicht
 * abstuerzen, weil im Zug das Netz weg war.
 */
sealed interface AtlasErgebnis<out T> {
    data class Erfolg<T>(val wert: T) : AtlasErgebnis<T>

    /**
     * [meldung] ist immer ein fertiger deutscher Satz, den die Oberflaeche
     * ungeprueft anzeigen darf. Der Server liefert seine Fehler schon so
     * ({"error": "..."}); alles andere setzt diese Schicht selbst.
     * [status] ist der HTTP-Code, sofern es einen gab.
     */
    data class Fehler(val meldung: String, val status: Int? = null) : AtlasErgebnis<Nothing>
}

/** Nicht angemeldet. Der einzige Fehler, auf den die App mit einem Bildschirmwechsel reagiert. */
const val STATUS_NICHT_ANGEMELDET = 401

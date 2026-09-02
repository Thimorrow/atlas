package dev.atlas.schule.ui

/**
 * Portierung von lib/grades.ts nach Kotlin. Die eigentliche Berechnung liefert
 * der Server im GradeSummaryDTO (average/oral/written), diese Datei dient der
 * Testbarkeit und als Referenz, falls die Oberflaeche vor dem Server-Roundtrip
 * doch einmal selbst eine Note aus Punkten ableiten muss -- etwa die
 * Live-Vorschau beim Anlegen einer neuen Note. Eine Note wird nie gespeichert
 * oder gesendet, nur angezeigt.
 */
object Notenlogik {
    const val PUNKTE_MIN = 0
    const val PUNKTE_MAX = 15

    /** Eine einzelne Note fuer die Gewichtung: mündlich oder schriftlich, mit ihrem Gewicht. */
    data class NotenEingabe(val art: String, val punkte: Int, val gewicht: Double)

    private fun begrenzePunkte(punkte: Int): Int = punkte.coerceIn(PUNKTE_MIN, PUNKTE_MAX)

    /**
     * Die uebliche KMK-Tabelle, geschlossen ausgerechnet statt als 16-Zeilen-
     * Liste: ab 1 Punkt laufen die Stufen in Dreiergruppen (+, glatt, -) von
     * 1+ abwaerts, 0 Punkte sind die einzige Note ohne Tendenz.
     */
    fun punkteZuNote(punkte: Int): String {
        val p = begrenzePunkte(punkte)
        if (p == 0) return "6"
        val stufe = 16 - p // 1 fuer 15 Punkte ... 15 fuer 1 Punkt
        val note = (stufe + 2) / 3
        val tendenz = when (stufe % 3) {
            1 -> "+"
            0 -> "-"
            else -> ""
        }
        return "$note$tendenz"
    }

    /**
     * Gewichtetes Mittel einer Notengruppe. Summiert sich die Gewichtung auf
     * 0, gibt es nichts zu mitteln -- die Gruppe zaehlt dann wie gar nicht
     * vorhanden, statt eine Division durch null zu riskieren.
     */
    private fun gewichtetesMittel(noten: List<NotenEingabe>): Double? {
        if (noten.isEmpty()) return null
        var gewichtSumme = 0.0
        var punkteSumme = 0.0
        for (note in noten) {
            val gewicht = if (note.gewicht.isFinite() && note.gewicht > 0) note.gewicht else 0.0
            gewichtSumme += gewicht
            punkteSumme += begrenzePunkte(note.punkte) * gewicht
        }
        if (gewichtSumme == 0.0) return null
        return punkteSumme / gewichtSumme
    }

    /**
     * Fachschnitt aus muendlichem und schriftlichem Teil, in Punkten.
     *
     * Fehlt eine der beiden Seiten, zaehlt die andere allein: wer noch keine
     * Klausur geschrieben hat, soll den Schnitt seiner muendlichen Noten sehen
     * und nicht 60 Prozent Nichts eingerechnet bekommen. Sind beide Seiten
     * vorhanden, zaehlt [muendlichAnteilProzent] fuer mündlich, der Rest fuer
     * schriftlich.
     */
    fun fachschnittPunkte(noten: List<NotenEingabe>, muendlichAnteilProzent: Int = 50): Double? {
        val muendlich = gewichtetesMittel(noten.filter { it.art == "oral" })
        val schriftlich = gewichtetesMittel(noten.filter { it.art == "written" })
        return if (muendlich != null && schriftlich != null) {
            val anteil = muendlichAnteilProzent.coerceIn(0, 100) / 100.0
            muendlich * anteil + schriftlich * (1 - anteil)
        } else {
            muendlich ?: schriftlich
        }
    }
}

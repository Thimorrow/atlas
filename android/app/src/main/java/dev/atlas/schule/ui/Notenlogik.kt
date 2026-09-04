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

    sealed interface ZielErgebnis {
        data class Erreicht(val schnitt: Double) : ZielErgebnis
        data class Unerreichbar(val max: Double) : ZielErgebnis
        data class Machbar(val punkte: Int) : ZielErgebnis
    }

    /**
     * Portierung von requiredPointsForGoal aus lib/grades.ts: was braucht die
     * nächste Note (Art + Gewicht), um [ziel] zu erreichen.
     */
    fun punkteFuersZiel(
        noten: List<NotenEingabe>,
        ziel: Int,
        naechsteArt: String,
        naechstesGewicht: Double,
        muendlichAnteilProzent: Int = 50,
    ): ZielErgebnis {
        val t = begrenzePunkte(ziel)
        val w = if (naechstesGewicht.isFinite() && naechstesGewicht > 0) naechstesGewicht else 0.0
        val anteil = muendlichAnteilProzent.coerceIn(0, 100) / 100.0
        val schnitt = fachschnittPunkte(noten, muendlichAnteilProzent)
        if (schnitt != null && schnitt >= t - 1e-9) return ZielErgebnis.Erreicht(schnitt)
        if (w == 0.0) return ZielErgebnis.Unerreichbar(schnitt ?: 0.0)
        val gleich = noten.filter { it.art == naechsteArt }
        var gewSumme = 0.0
        var pktSumme = 0.0
        for (g in gleich) {
            val gw = if (g.gewicht.isFinite() && g.gewicht > 0) g.gewicht else 0.0
            gewSumme += gw
            pktSumme += begrenzePunkte(g.punkte) * gw
        }
        val andererSchnitt = gewichtetesMittel(noten.filter { it.art != naechsteArt })
        val eigenAnteil = if (andererSchnitt == null) 1.0 else if (naechsteArt == "oral") anteil else 1 - anteil
        val fremdAnteil = if (andererSchnitt == null) 0.0 else if (naechsteArt == "oral") 1 - anteil else anteil
        if (eigenAnteil == 0.0) return ZielErgebnis.Unerreichbar(andererSchnitt ?: 0.0)
        val m = if (andererSchnitt != null) fremdAnteil * andererSchnitt else 0.0
        val zielEigen = (t - m) / eigenAnteil
        val p = (zielEigen * (gewSumme + w) - pktSumme) / w
        if (p > PUNKTE_MAX + 1e-9) {
            val max = eigenAnteil * ((pktSumme + PUNKTE_MAX * w) / (gewSumme + w)) + m
            return ZielErgebnis.Unerreichbar(max.coerceIn(0.0, 15.0))
        }
        return ZielErgebnis.Machbar(p.coerceAtLeast(PUNKTE_MIN.toDouble()).let { kotlin.math.ceil(it - 1e-9).toInt() })
    }
}

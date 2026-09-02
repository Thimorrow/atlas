package dev.atlas.schule.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Gegenstueck zu lib/subject-colors.ts. Reihenfolge, Token-Namen und
 * Vorbelegung muessen mit der Web-App uebereinstimmen, sonst bekommt dasselbe
 * Fach im Browser und auf dem Telefon zwei verschiedene Farben. Die
 * Reihenfolge ist Teil des Vertrags, weil der Hash-Fallback ueber den Index
 * greift.
 */
enum class Fachfarbe(val token: String, val bezeichnung: String) {
    SLATE("slate", "Grau"),
    WHITE("white", "Weiß"),
    BLUE("blue", "Blau"),
    SKY("sky", "Hellblau"),
    TEAL("teal", "Türkis"),
    GREEN("green", "Grün"),
    YELLOW("yellow", "Gelb"),
    AMBER("amber", "Bernstein"),
    ORANGE("orange", "Orange"),
    ROSE("rose", "Rot"),
    VIOLET("violet", "Violett"),
    LIME("lime", "Hellgrün"),
    PINK("pink", "Pink");

    /**
     * "Weiss" ist die einzige Farbe, die vom Modus abhaengt: ein reinweisser
     * Punkt waere auf dem fast weissen Hintergrund des Hellmodus unsichtbar.
     * Das Web loest das ueber --subject-white, hier ueber diesen Parameter.
     */
    fun farbe(dunkel: Boolean): Color = when (this) {
        // --subject-white, hell oklch(0.84 0 0), dunkel oklch(1 0 0)
        WHITE -> if (dunkel) Color(0xFFFFFFFF) else Color(0xFFCACACA)
        SLATE -> Color(0xFF677284) // oklch(0.55 0.03 260)
        BLUE -> Color(0xFF2B7AD6) // oklch(0.58 0.16 255)
        SKY -> Color(0xFF3BACDA) // oklch(0.7 0.12 230)
        TEAL -> Color(0xFF009494) // oklch(0.6 0.11 195), ausserhalb sRGB, geklemmt
        GREEN -> Color(0xFF319751) // oklch(0.6 0.14 150)
        YELLOW -> Color(0xFFD9B92E) // oklch(0.79 0.15 95)
        AMBER -> Color(0xFFCD8800) // oklch(0.68 0.15 75), ausserhalb sRGB, geklemmt
        ORANGE -> Color(0xFFE06623) // oklch(0.65 0.17 45)
        ROSE -> Color(0xFFDA404E) // oklch(0.6 0.19 20)
        VIOLET -> Color(0xFF8654CC) // oklch(0.56 0.18 300)
        LIME -> Color(0xFF83B83F) // oklch(0.72 0.16 130)
        PINK -> Color(0xFFDF539F) // oklch(0.65 0.19 350)
    }

    companion object {
        private val nachToken = entries.associateBy { it.token }

        /**
         * Wunschfarben von Sid, als Teilstring geprueft, damit auch
         * Untis-Kuerzel und Varianten treffen ("Mathematik", "Mathe", "MA").
         * Reihenfolge entspricht PRESETS in lib/subject-colors.ts, weil beim
         * ersten Treffer abgebrochen wird.
         */
        private val vorbelegung = listOf(
            "mathe" to BLUE,
            "biolog" to GREEN,
            "deutsch" to ROSE,
            "englisch" to YELLOW,
            "religion" to WHITE,
            "chemie" to ORANGE,
            "informatik" to SLATE,
            "geschichte" to VIOLET,
        )

        /** Unbekanntes Token faellt auf null zurueck, der Aufrufer nimmt dann [neutral]. */
        fun vonToken(token: String?): Fachfarbe? = token?.let { nachToken[it] }

        /**
         * Stabile Default-Farbe: gleicher Name ergibt immer dieselbe Farbe,
         * ohne dass irgendwo ein Zaehler mitgefuehrt werden muss. Der Hash
         * bildet `h = (h * 31 + charCode) >>> 0` aus JavaScript nach, deshalb
         * die Rechnung auf Long mit 32-Bit-Maske statt auf Int.
         */
        fun standardFuer(name: String): Fachfarbe {
            val schluessel = name.lowercase()
            for ((nadel, farbe) in vorbelegung) {
                if (schluessel.contains(nadel)) return farbe
            }
            var h = 0L
            for (zeichen in name) h = (h * 31 + zeichen.code) and 0xFFFFFFFFL
            return auslosbar[(h % auslosbar.size).toInt()]
        }

        /**
         * Aus der Auslosung genommen: [WHITE] ist im Hellmodus bewusst ein
         * sehr helles Grau, damit ein reinweisser Punkt nicht verschwindet.
         * Wer die Farbe selbst waehlt, will sie so. Ein Fach, dem der Hash
         * sie zuteilt, sieht dagegen einfach aus wie ein Loch -- genau das
         * passierte "Wirtschaft/Politik", das als einzige blasse Karte
         * zwischen elf farbigen stand, ohne dass jemand das entschieden
         * haette. Gleiche Liste wie AUSLOSBARE_FARBEN in lib/subject-colors.ts:
         * beide muessen dieselbe Farbe ableiten.
         */
        private val auslosbar = entries.filter { it != WHITE }

        /**
         * Neutrales Grau fuer "Allgemein" (Aufgabe ohne Fach) und unbekannte
         * Tokens. Im Web ist das color-mix(in oklab, var(--foreground) 34%,
         * transparent), also schlicht der Vordergrund mit 34 Prozent Deckung.
         */
        fun neutral(vordergrund: Color): Color = vordergrund.copy(alpha = 0.34f)
    }
}

/**
 * Farbe fuer ein Fach ohne hinterlegtes Token: faellt auf die stabile
 * Namensableitung zurueck, dieselbe wie bei einer Stunde ohne Fach in
 * fachfarbeFuerStunde (StundenplanBildschirm.kt), statt grau zu bleiben.
 */
@Composable
fun fachfarbeFuerFach(token: String?, name: String): Color {
    val farbe = Fachfarbe.vonToken(token) ?: Fachfarbe.standardFuer(name)
    return farbe.farbe(LocalDunkelmodus.current)
}

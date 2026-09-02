package dev.atlas.schule

import dev.atlas.schule.ui.theme.Fachfarbe
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * Die Erwartungswerte stammen nicht aus dem Kopf, sondern aus einem Lauf von
 * defaultColorFor() in lib/subject-colors.ts ueber genau diese Namen. Weicht
 * die Kotlin-Seite ab, bekaeme dasselbe Fach im Browser und auf dem Telefon
 * zwei Farben.
 */
class FachfarbenTest {

    @Test
    fun `Vorbelegung trifft die Wunschfarben`() {
        val erwartet = mapOf(
            "Mathematik" to Fachfarbe.BLUE,
            "Mathe" to Fachfarbe.BLUE,
            "Biologie" to Fachfarbe.GREEN,
            "Deutsch" to Fachfarbe.ROSE,
            "Englisch" to Fachfarbe.YELLOW,
            "Religion" to Fachfarbe.WHITE,
            "Chemie" to Fachfarbe.ORANGE,
            "Informatik" to Fachfarbe.SLATE,
            "Geschichte" to Fachfarbe.VIOLET,
        )
        for ((name, farbe) in erwartet) {
            assertEquals("Vorbelegung fuer $name", farbe, Fachfarbe.standardFuer(name))
        }
    }

    @Test
    fun `Vorbelegung greift auch bei Teiltreffern und Grossschreibung`() {
        // Der Web-Code prueft kleingeschrieben als Teilstring, damit auch
        // Untis-Varianten treffen.
        assertEquals(Fachfarbe.BLUE, Fachfarbe.standardFuer("MATHEMATIK LK"))
        assertEquals(Fachfarbe.GREEN, Fachfarbe.standardFuer("Biologie Leistungskurs"))
        assertEquals(Fachfarbe.VIOLET, Fachfarbe.standardFuer("Geschichte bilingual"))
    }

    @Test
    fun `Hash-Rueckfall liefert dieselben Farben wie JavaScript`() {
        // Ausgabe von defaultColorFor() fuer Faecher ohne Vorbelegung,
        // abgenommen aus einem echten Lauf der TypeScript-Fassung, nicht
        // aus einem dritten Nachbau -- sonst pruefte der Test nur, ob zwei
        // Kopien derselben Annahme uebereinstimmen.
        val erwartet = mapOf(
            "Physik" to Fachfarbe.ROSE,
            "Kunst" to Fachfarbe.YELLOW,
            "Sport" to Fachfarbe.ROSE,
            "Musik" to Fachfarbe.YELLOW,
            "Latein" to Fachfarbe.PINK,
            // Umlaut als Probe: charCodeAt liefert eine UTF-16-Einheit, die
            // Kotlin-Seite muss mit Char.code dasselbe rechnen.
            "Französisch" to Fachfarbe.YELLOW,
            "Erdkunde" to Fachfarbe.LIME,
            "Philosophie" to Fachfarbe.SLATE,
            "Spanisch" to Fachfarbe.VIOLET,
            "Politik" to Fachfarbe.LIME,
            "Wirtschaft" to Fachfarbe.ORANGE,
            "Ethik" to Fachfarbe.TEAL,
            "" to Fachfarbe.SLATE,
            // Der Anlass fuer den Ausschluss von Weiss: dieses Fach zog es
            // per Zufall und stand als einzige blasse Karte im Plan.
            "Wirtschaft/Politik" to Fachfarbe.SKY,
        )
        for ((name, farbe) in erwartet) {
            assertEquals("Hash fuer '$name'", farbe, Fachfarbe.standardFuer(name))
        }
    }

    @Test
    fun `Reihenfolge und Tokens entsprechen SUBJECT_COLORS`() {
        // Der Hash indiziert in diese Liste. Wer sie umsortiert, faerbt still
        // die halbe App um.
        assertEquals(
            listOf(
                "slate", "white", "blue", "sky", "teal", "green", "yellow",
                "amber", "orange", "rose", "violet", "lime", "pink",
            ),
            Fachfarbe.entries.map { it.token },
        )
    }

    @Test
    fun `Unbekanntes Token ergibt keine Fachfarbe`() {
        assertEquals(null, Fachfarbe.vonToken("gibtesnicht"))
        assertEquals(null, Fachfarbe.vonToken(null))
        assertEquals(Fachfarbe.BLUE, Fachfarbe.vonToken("blue"))
    }

    /**
     * Fach ohne hinterlegte Farbe (leeres oder fehlendes Token): der Aufrufer
     * (fachfarbeFuerFach in Fachfarben.kt) faellt dann auf standardFuer()
     * zurueck, genau wie fachfarbeFuerStunde es fuer Stunden ohne Fach schon
     * tut. Diese Farbe darf nie SLATE/neutral-grau sein und muss fuer
     * verschiedene Namen unterschiedlich ausfallen.
     */
    @Test
    fun `Fach ohne Farbe bekommt stabile, nicht-graue Farbe je nach Name`() {
        val religion = Fachfarbe.standardFuer("Evangelische Religionslehre")
        // Zwei Namen, deren Hash-Faecher laut obigem Test garantiert
        // auseinanderliegen (Kunst -> YELLOW, Sport -> AMBER); zwei beliebige
        // Namen koennen sonst zufaellig im selben von 13 Faechern landen.
        val kunst = Fachfarbe.standardFuer("Kunst")
        val sport = Fachfarbe.standardFuer("Sport")

        // Stabil: derselbe Name ergibt immer dieselbe Farbe.
        assertEquals(religion, Fachfarbe.standardFuer("Evangelische Religionslehre"))

        // Unterschiedliche Namen ergeben unterschiedliche Farben.
        assertEquals(false, kunst == sport)

        // Nicht grau: SLATE ist die einzige Grau-Farbe im Enum.
        assertEquals(false, religion == Fachfarbe.SLATE)
    }

    @Test
    fun `Abgeleitete Farbe ist in Hell- und Dunkelmodus nicht neutral`() {
        val farbe = Fachfarbe.standardFuer("Wirtschaft/Politik")
        val hell = farbe.farbe(dunkel = false)
        val dunkel = farbe.farbe(dunkel = true)

        // neutral() liefert immer Alpha 0.34, die vergebenen Fachfarben sind
        // deckend (Alpha 1.0) -- so unterscheidet sich echte Farbe von Grau.
        assertEquals(1f, hell.alpha)
        assertEquals(1f, dunkel.alpha)
    }

    /**
     * "Wirtschaft/Politik" landete per Hash-Zufall auf WHITE und stand
     * dadurch als einzige blasse Karte zwischen elf farbigen. Weiss ist eine
     * gueltige Wahl, wenn ein Mensch sie trifft, aber nie ein gutes Los.
     */
    @Test
    fun `die Ableitung teilt niemals Weiss zu`() {
        val namen = listOf(
            "Wirtschaft/Politik", "Sozialwissenschaften", "Kunst", "Erdkunde",
            "Philosophie", "Spanisch", "Franzoesisch", "Paedagogik",
        )
        for (name in namen) {
            assertNotEquals(
                "Fuer \"$name\" wurde Weiss ausgelost",
                Fachfarbe.WHITE,
                Fachfarbe.standardFuer(name),
            )
        }
    }

    /**
     * Ein Mensch darf Weiss weiter waehlen, und die Vorbelegung von Sid fuer
     * Religion ist genau so eine Wahl. Nur der Zufall darf es nicht ziehen.
     */
    @Test
    fun `die Vorbelegung darf weiterhin Weiss setzen`() {
        assertEquals(Fachfarbe.WHITE, Fachfarbe.standardFuer("Evangelische Religionslehre"))
    }
}

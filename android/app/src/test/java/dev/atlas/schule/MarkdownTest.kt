package dev.atlas.schule

import dev.atlas.schule.data.ATLAS_BASIS_URL
import dev.atlas.schule.ui.MdBlock
import dev.atlas.schule.ui.MdSpanne
import dev.atlas.schule.ui.istSicheresZiel
import dev.atlas.schule.ui.markdownLesen
import dev.atlas.schule.ui.spannenLesen
import dev.atlas.schule.ui.vollesZiel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Der Vertrag des Notiz-Renderers. Wichtigster Punkt ist nicht die Optik,
 * sondern dass aus einer Notiz nie ein Link mit einem anderen Schema als http,
 * https oder mailto entsteht -- dieselbe Regel wie isSafeUrl() im Web.
 */
class MarkdownTest {

    @Test
    fun `ueberschriften nach stufe`() {
        val bloecke = markdownLesen("# Titel\n### Klein")
        assertEquals(
            listOf(
                MdBlock.Ueberschrift(1, listOf(MdSpanne("Titel"))),
                MdBlock.Ueberschrift(3, listOf(MdSpanne("Klein"))),
            ),
            bloecke,
        )
    }

    @Test
    fun `aufzaehlung und nummerierte liste`() {
        val bloecke = markdownLesen("- eins\n* zwei\n\n1. erstens\n2) zweitens")
        assertEquals(
            listOf(
                MdBlock.Punkt(null, listOf(MdSpanne("eins"))),
                MdBlock.Punkt(null, listOf(MdSpanne("zwei"))),
                MdBlock.Punkt(1, listOf(MdSpanne("erstens"))),
                MdBlock.Punkt(2, listOf(MdSpanne("zweitens"))),
            ),
            bloecke,
        )
    }

    @Test
    fun `fett kursiv und code im fliesstext`() {
        assertEquals(
            listOf(
                MdSpanne("ganz "),
                MdSpanne("wichtig", fett = true),
                MdSpanne(" und "),
                MdSpanne("schraeg", kursiv = true),
                MdSpanne(", dazu "),
                MdSpanne("x = 1", code = true),
            ),
            spannenLesen("ganz **wichtig** und _schraeg_, dazu `x = 1`"),
        )
    }

    @Test
    fun `code am stueck wird nicht ausgezeichnet`() {
        assertEquals(
            listOf(MdBlock.CodeBlock("val a = **kein fett**")),
            markdownLesen("```\nval a = **kein fett**\n```"),
        )
    }

    @Test
    fun `absatz haelt mehrere zeilen zusammen`() {
        assertEquals(
            listOf(MdBlock.Absatz(listOf(MdSpanne("erste\nzweite")))),
            markdownLesen("erste\nzweite"),
        )
    }

    @Test
    fun `link mit http bekommt ein ziel`() {
        assertEquals(
            listOf(MdSpanne("Atlas", ziel = "https://example.org/x")),
            spannenLesen("[Atlas](https://example.org/x)"),
        )
    }

    @Test
    fun `mailto ist erlaubt`() {
        assertEquals(
            listOf(MdSpanne("Mail", ziel = "mailto:wer@example.org")),
            spannenLesen("[Mail](mailto:wer@example.org)"),
        )
    }

    /** Das eigentliche Sicherheitsversprechen. */
    @Test
    fun `javascript-link wird nicht als link gerendert`() {
        val spannen = spannenLesen("[Klick mich](javascript:alert(1))")
        // Der Linktext bleibt als gewoehnlicher Satz stehen, klickbar ist
        // nichts davon. Genau das macht auch lib/markdown.ts im Web.
        // Klammern im Ziel zaehlen mit, es bleibt also auch kein Rest stehen.
        assertEquals(listOf(MdSpanne("Klick mich")), spannen)
    }

    @Test
    fun `getarnte schemata kommen nicht durch`() {
        listOf(
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            "java&#115;cript:alert(1)",
            "java\tscript:alert(1)",
            " javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "vbscript:msgbox(1)",
        ).forEach { ziel ->
            assertFalse(ziel, istSicheresZiel(ziel))
            assertTrue(ziel, spannenLesen("[t]($ziel)").none { it.ziel != null })
        }
    }

    @Test
    fun `sichere und relative ziele bleiben ziele`() {
        listOf("https://a.de", "http://a.de", "HTTPS://a.de", "mailto:a@b.de", "/subjects/1")
            .forEach { assertTrue(it, istSicheresZiel(it)) }
    }

    /**
     * Das zweite Versprechen, und zwar ein plattformeigenes: was ohne Schema
     * an AndroidUriHandler.openUri geht, findet keine App -- der Start geht
     * still ins Leere oder wirft, je nach Android-Version. Nach [vollesZiel]
     * darf deshalb kein Ziel mehr ohne Schema uebrig sein.
     */
    @Test
    fun `schemalose ziele werden vervollstaendigt`() {
        // Nicht nur "faengt mit der Basis an": vercel.appnotes/2024.pdf taete
        // das auch, und genau dahin fuehrt ein naiv aufgeloester relativer Pfad.
        assertEquals("$ATLAS_BASIS_URL/subjects/1", vollesZiel("/subjects/1"))
        assertEquals("$ATLAS_BASIS_URL/#kapitel-3", vollesZiel("#kapitel-3"))
        assertEquals("$ATLAS_BASIS_URL/notes/2024.pdf", vollesZiel("notes/2024.pdf"))

        // Und in jedem Fall bleibt der Host der eigene, samt Schema.
        listOf("/subjects/1", "#kapitel-3", "notes/2024.pdf", "?q=1", "../oben")
            .forEach { ziel ->
                val voll = vollesZiel(ziel)
                assertTrue("$ziel -> $voll", voll.startsWith("$ATLAS_BASIS_URL/"))
            }
    }

    @Test
    fun `sichere ziele mit schema bleiben unveraendert`() {
        listOf("https://a.de/x", "http://a.de", "mailto:a@b.de").forEach {
            assertEquals(it, vollesZiel(it))
        }
    }

    /**
     * `[t](<javascript:alert(1)>)`: die spitzen Klammern gehoeren fuer den
     * Leser zum Ziel, also greift das Schema-Muster nicht und es entsteht ein
     * Link. Ausgefuehrt wird nichts, es gibt keinen WebView -- aber ohne
     * Schema waere es derselbe tote Link wie oben. URI.resolve wirft an den
     * Klammern, uebrig bleibt die Startseite.
     */
    @Test
    fun `kaputtes ziel faellt auf die startseite zurueck`() {
        val spannen = spannenLesen("[t](<javascript:alert(1)>)")
        val ziel = spannen.firstNotNullOfOrNull { it.ziel }
        assertEquals("<javascript:alert(1)>", ziel)
        assertEquals(ATLAS_BASIS_URL, vollesZiel(ziel!!))
    }

    @Test
    fun `fett innerhalb einer ueberschrift und eines punktes`() {
        assertEquals(
            listOf(
                MdBlock.Ueberschrift(2, listOf(MdSpanne("Kapitel "), MdSpanne("drei", fett = true))),
                MdBlock.Punkt(null, listOf(MdSpanne("Seite "), MdSpanne("12", fett = true))),
            ),
            markdownLesen("## Kapitel **drei**\n- Seite **12**"),
        )
    }

    @Test
    fun `unpaarige zeichen bleiben stehen`() {
        assertEquals(listOf(MdSpanne("2 * 3 = 6")), spannenLesen("2 * 3 = 6"))
        assertEquals(listOf(MdSpanne("ein [Rest")), spannenLesen("ein [Rest"))
    }

    @Test
    fun `leere quelle ergibt keine bloecke`() {
        assertEquals(emptyList<MdBlock>(), markdownLesen(""))
        assertEquals(emptyList<MdBlock>(), markdownLesen("\n\n   \n"))
    }
}

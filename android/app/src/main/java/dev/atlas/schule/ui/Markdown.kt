package dev.atlas.schule.ui

// Ein kleiner Markdown-Leser fuer Fach-Notizen. Keine Bibliothek: gebraucht
// werden Ueberschriften, Fett, Kursiv, Code, Listen und Links, und genau das
// steht hier auf zwei Bildschirmseiten. Eine Bibliothek waere eine weitere
// Abhaengigkeit mit einem eigenen Sicherheitsverhalten, das wir dann gegen
// lib/markdown.ts angleichen muessten.
//
// Das Ergebnis ist ein Datenmodell, kein AnnotatedString. So laesst sich das
// Verhalten ohne Compose-Laufzeit testen, und die Darstellung bleibt an einer
// Stelle (NotizText.kt).

/** Ein Stueck Fliesstext mit seiner Auszeichnung. */
data class MdSpanne(
    val text: String,
    val fett: Boolean = false,
    val kursiv: Boolean = false,
    val code: Boolean = false,
    /** Linkziel. Nur gesetzt, wenn es [istSicheresZiel] besteht. */
    val ziel: String? = null,
)

sealed interface MdBlock {
    /** [stufe] 1 bis 6, so wie die Anzahl der Rauten. */
    data class Ueberschrift(val stufe: Int, val spannen: List<MdSpanne>) : MdBlock

    data class Absatz(val spannen: List<MdSpanne>) : MdBlock

    /** [nummer] null heisst Aufzaehlungspunkt, sonst nummerierte Liste. */
    data class Punkt(val nummer: Int?, val spannen: List<MdSpanne>) : MdBlock

    /** Code am Stueck zwischen ``` und ```. Innen wird nichts ausgezeichnet. */
    data class CodeBlock(val text: String) : MdBlock
}

private val UEBERSCHRIFT = Regex("^(#{1,6})\\s+(.*)$")
private val AUFZAEHLUNG = Regex("^\\s{0,3}[-*+]\\s+(.*)$")
private val NUMMERIERT = Regex("^\\s{0,3}(\\d{1,9})[.)]\\s+(.*)$")

/**
 * Zerlegt Markdown in Bloecke. Unbekannte Syntax bleibt sichtbarer Text statt
 * zu verschwinden: eine Notiz, aus der beim Anzeigen etwas fehlt, ist
 * schlimmer als eine, in der ein Sternchen zu viel steht.
 */
fun markdownLesen(quelle: String): List<MdBlock> {
    val zeilen = quelle.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    val bloecke = mutableListOf<MdBlock>()
    var i = 0

    while (i < zeilen.size) {
        val zeile = zeilen[i]

        if (zeile.trimStart().startsWith("```")) {
            val inhalt = mutableListOf<String>()
            i++
            while (i < zeilen.size && !zeilen[i].trimStart().startsWith("```")) {
                inhalt += zeilen[i]
                i++
            }
            // Eine nicht geschlossene Klammer laeuft bis zum Ende, so wie in
            // jedem Markdown-Leser. i steht dann schon hinter der letzten Zeile.
            i++
            bloecke += MdBlock.CodeBlock(inhalt.joinToString("\n"))
            continue
        }

        if (zeile.isBlank()) {
            i++
            continue
        }

        val ueberschrift = UEBERSCHRIFT.matchEntire(zeile)
        val nummeriert = NUMMERIERT.matchEntire(zeile)
        val aufzaehlung = AUFZAEHLUNG.matchEntire(zeile)

        when {
            ueberschrift != null -> {
                bloecke += MdBlock.Ueberschrift(
                    stufe = ueberschrift.groupValues[1].length,
                    // Schliessende Rauten sind erlaubt und gehoeren nicht zum Text.
                    spannen = spannenLesen(ueberschrift.groupValues[2].trimEnd().trimEnd('#').trimEnd()),
                )
                i++
            }

            nummeriert != null -> {
                bloecke += MdBlock.Punkt(
                    nummer = nummeriert.groupValues[1].toIntOrNull(),
                    spannen = spannenLesen(nummeriert.groupValues[2]),
                )
                i++
            }

            aufzaehlung != null -> {
                bloecke += MdBlock.Punkt(nummer = null, spannen = spannenLesen(aufzaehlung.groupValues[1]))
                i++
            }

            else -> {
                // Absatz: alle Folgezeilen mitnehmen, bis eine leer ist oder
                // einen eigenen Block beginnt. Ein einfacher Umbruch bleibt
                // ein Umbruch, so wie breaks: true im Web.
                val teile = mutableListOf<String>()
                while (i < zeilen.size && zeilen[i].isNotBlank() && !beginntBlock(zeilen[i])) {
                    teile += zeilen[i].trim()
                    i++
                }
                bloecke += MdBlock.Absatz(spannenLesen(teile.joinToString("\n")))
            }
        }
    }
    return bloecke
}

private fun beginntBlock(zeile: String): Boolean =
    zeile.trimStart().startsWith("```") ||
        UEBERSCHRIFT.matches(zeile) ||
        AUFZAEHLUNG.matches(zeile) ||
        NUMMERIERT.matches(zeile)

/**
 * Zerlegt eine Zeile in ausgezeichnete Stuecke. Der Leser laeuft einmal von
 * links nach rechts; findet er zu einem Zeichen keinen Partner, bleibt das
 * Zeichen einfach stehen.
 */
fun spannenLesen(text: String, basis: MdSpanne = MdSpanne("")): List<MdSpanne> {
    val ergebnis = mutableListOf<MdSpanne>()
    val puffer = StringBuilder()
    var i = 0

    fun leerePuffer() {
        if (puffer.isNotEmpty()) {
            ergebnis += basis.copy(text = puffer.toString())
            puffer.clear()
        }
    }

    while (i < text.length) {
        val c = text[i]

        // Ein Backslash macht das naechste Zeichen zu reinem Text.
        if (c == '\\' && i + 1 < text.length) {
            puffer.append(text[i + 1])
            i += 2
            continue
        }

        if (c == '`') {
            val ende = text.indexOf('`', i + 1)
            if (ende > i + 1) {
                leerePuffer()
                ergebnis += basis.copy(text = text.substring(i + 1, ende), code = true)
                i = ende + 1
                continue
            }
        }

        if (c == '[') {
            val link = linkLesen(text, i)
            if (link != null) {
                leerePuffer()
                // Ein unsicheres Ziel verschwindet samt Klammern; uebrig
                // bleibt der Linktext als gewoehnlicher Satz. Genauso macht es
                // lib/markdown.ts, dort entsteht dann gar kein <a>.
                val ziel = link.ziel.takeIf { istSicheresZiel(it) }
                ergebnis += spannenLesen(link.text, basis.copy(ziel = ziel))
                i = link.ende
                continue
            }
        }

        if (c == '*' || c == '_') {
            val doppelt = i + 1 < text.length && text[i + 1] == c
            val marke = if (doppelt) "$c$c" else "$c"
            val ende = text.indexOf(marke, i + marke.length)
            // Leere Auszeichnung (`**` direkt gefolgt von `**`) ist keine.
            if (ende > i + marke.length) {
                leerePuffer()
                val innen = text.substring(i + marke.length, ende)
                val neu = if (doppelt) basis.copy(fett = true) else basis.copy(kursiv = true)
                ergebnis += spannenLesen(innen, neu)
                i = ende + marke.length
                continue
            }
        }

        puffer.append(c)
        i++
    }
    leerePuffer()
    return ergebnis
}

private class Linkfund(val text: String, val ziel: String, val ende: Int)

/** Liest `[text](ziel)` ab Position [start]. Null, wenn die Form nicht stimmt. */
private fun linkLesen(text: String, start: Int): Linkfund? {
    var tiefe = 0
    var i = start
    while (i < text.length) {
        when (text[i]) {
            '\\' -> i++
            '[' -> tiefe++
            ']' -> {
                tiefe--
                if (tiefe == 0) break
            }
        }
        i++
    }
    if (i >= text.length || text[i] != ']') return null
    if (i + 1 >= text.length || text[i + 1] != '(') return null

    // Klammern im Ziel mitzaehlen. Sonst bliebe von `(javascript:alert(1))`
    // eine einzelne Klammer als sichtbarer Rest im Text stehen.
    var klammern = 0
    var j = i + 1
    while (j < text.length) {
        when (text[j]) {
            '(' -> klammern++
            ')' -> {
                klammern--
                if (klammern == 0) break
            }
        }
        j++
    }
    if (j >= text.length || text[j] != ')') return null
    val ziel = text.substring(i + 2, j).trim()
        // Ein optionaler Titel hinter dem Ziel gehoert nicht zur Adresse.
        .substringBefore(' ')
    return Linkfund(text.substring(start + 1, i), ziel, j + 1)
}

// Dieselbe Regel wie isSafeUrl() in lib/markdown.ts: nur http, https und
// mailto duerfen ein klickbares Ziel werden. Ein Link ist die einzige Stelle,
// an der eine Notiz etwas ausloesen koennte, deshalb steht die Pruefung hier
// und nicht in der Darstellung.
private val SICHERES_SCHEMA = Regex("^(https?:|mailto:)", RegexOption.IGNORE_CASE)
internal val HAT_SCHEMA = Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE)

fun istSicheresZiel(ziel: String): Boolean {
    // Entities und Steuerzeichen zuerst aufloesen, sonst schmuggelt sich
    // `java&#115;cript:` oder `java\tscript:` an der Pruefung vorbei.
    val roh = ziel
        .replace(Regex("&#(\\d+);?")) { it.groupValues[1].toIntOrNull()?.let { code -> Char(code).toString() } ?: "" }
        .replace(Regex("&#x([0-9a-fA-F]+);?")) {
            it.groupValues[1].toIntOrNull(16)?.let { code -> Char(code).toString() } ?: ""
        }
        .replace(Regex("&amp;", RegexOption.IGNORE_CASE), "&")
        .replace(Regex("&colon;", RegexOption.IGNORE_CASE), ":")
        .replace(Regex("[\\u0000-\\u0020]"), "")
        .trim()
    if (roh.isEmpty()) return false
    // Ziele ohne Schema sind Adressen auf dem eigenen Server, also unbedenklich.
    if (!HAT_SCHEMA.containsMatchIn(roh)) return true
    return SICHERES_SCHEMA.containsMatchIn(roh)
}

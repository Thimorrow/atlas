package dev.atlas.schule.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.ATLAS_BASIS_URL
import dev.atlas.schule.ui.theme.Abstand

/**
 * Zeigt den Markdown-Text einer Notiz gerendert an. Der Nutzer schreibt dort
 * Ueberschriften, Listen und fetten Text; als Quelltext in Monospace war das
 * zwar ehrlich, aber muehsam zu lesen.
 *
 * Was gerendert wird, entscheidet [markdownLesen]; hier steht nur, wie es
 * aussieht. Insbesondere entsteht ein anklickbarer Link ausschliesslich dort,
 * wo der Leser bereits ein sicheres Ziel durchgelassen hat.
 */
@Composable
fun NotizText(quelle: String, modifier: Modifier = Modifier) {
    val bloecke = markdownLesen(quelle)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Abstand.normal)) {
        bloecke.forEach { block ->
            when (block) {
                is MdBlock.Ueberschrift -> Text(
                    text = annotiert(block.spannen),
                    // Nur drei Stufen: eine Notiz auf einem Telefon braucht
                    // keine sechs unterscheidbaren Groessen, und zu feine
                    // Abstufungen liest niemand mehr als Hierarchie.
                    style = when (block.stufe) {
                        1 -> MaterialTheme.typography.titleMedium
                        2 -> MaterialTheme.typography.titleSmall
                        else -> MaterialTheme.typography.bodyMedium
                    },
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(top = Abstand.klein),
                )

                is MdBlock.Absatz -> Text(
                    text = annotiert(block.spannen),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                is MdBlock.Punkt -> Row(horizontalArrangement = Arrangement.spacedBy(Abstand.normal)) {
                    Text(
                        text = block.nummer?.let { "$it." } ?: "•",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        // Feste Breite, damit die Texte der Punkte eine Kante bilden.
                        modifier = Modifier.width(18.dp),
                    )
                    Text(
                        text = annotiert(block.spannen),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                is MdBlock.CodeBlock -> Text(
                    text = block.text,
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.onBackground,
                    // Code bricht nicht um, er scrollt. Eine umgebrochene
                    // Zeile Code liest sich falsch.
                    modifier = Modifier
                        .clip(MaterialTheme.shapes.extraSmall)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = Abstand.normal, vertical = Abstand.eng),
                )
            }
        }
    }
}

@Composable
private fun annotiert(spannen: List<MdSpanne>): AnnotatedString {
    val linkfarbe = MaterialTheme.colorScheme.primary
    val codeflaeche = MaterialTheme.colorScheme.surfaceVariant
    return buildAnnotatedString {
        spannen.forEach { spanne ->
            val stil = SpanStyle(
                fontWeight = if (spanne.fett) FontWeight.SemiBold else null,
                fontStyle = if (spanne.kursiv) FontStyle.Italic else null,
                fontFamily = if (spanne.code) FontFamily.Monospace else null,
                background = if (spanne.code) codeflaeche else Color.Unspecified,
            )
            if (spanne.ziel == null) {
                withStyle(stil) { append(spanne.text) }
            } else {
                val linkstil = stil.copy(color = linkfarbe, textDecoration = TextDecoration.Underline)
                withLink(
                    LinkAnnotation.Url(
                        url = vollesZiel(spanne.ziel),
                        styles = TextLinkStyles(style = linkstil),
                    ),
                ) { append(spanne.text) }
            }
        }
    }
}

/**
 * Ein Ziel ohne Schema meint eine Seite der Web-App. Auf dem Telefon gibt es
 * kein "aktuelles Dokument", relativ zu dem der Browser aufloesen koennte,
 * deshalb wird die Adresse hier vervollstaendigt.
 *
 * Das gilt fuer jedes schemalose Ziel, nicht nur fuer die mit fuehrendem
 * Schraegstrich: `#kapitel-3` oder `notes/2024.pdf` bestehen [istSicheresZiel]
 * genauso. Kommt so etwas bei AndroidUriHandler an, findet sich keine App, die
 * es oeffnen koennte; je nach Android-Version geht der Start still ins Leere
 * oder die ActivityNotFoundException wird als IllegalArgumentException
 * weitergereicht. Beides ist falsch, deshalb kommt hier nichts ohne Schema
 * mehr heraus.
 */
internal fun vollesZiel(ziel: String): String {
    if (HAT_SCHEMA.containsMatchIn(ziel)) return ziel
    // resolve() kennt die Regeln fuer /pfad, pfad und #anker. Es wirft
    // allerdings bei allem, was sich nicht als Adresse lesen laesst, etwa bei
    // den spitzen Klammern aus `[t](<javascript:alert(1)>)`. Dann bleibt die
    // Startseite: lieber die falsche Seite der eigenen App als ein Absturz.
    //
    // Der Schraegstrich am Ende der Basis ist keine Kosmetik: ohne ihn ist der
    // Pfad der Basis leer, und java.net.URI haengt `notes/2024.pdf` dann direkt
    // an den Hostnamen. Daraus wird vercel.appnotes, eine Adresse, die es nicht
    // gibt.
    return runCatching { java.net.URI("$ATLAS_BASIS_URL/").resolve(ziel).toString() }
        .getOrDefault(ATLAS_BASIS_URL)
}

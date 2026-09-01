package dev.atlas.schule.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.LocalFokusring

/**
 * Das Eingabefeld von Atlas. Material liefert von Haus aus einen fetten Rahmen
 * mit einer Kerbe, durch die das Etikett faehrt; die Web-App macht es ruhiger
 * und stellt die Beschriftung schlicht ueber das Feld. Weil das Etikett dort
 * ohnehin steht, gibt es hier keine Kerbe und keine Wanderbewegung, und der
 * Rahmen bleibt in jedem Zustand gleich duenn. Nur seine Farbe wechselt.
 *
 * Ein eigener Baustein statt Parameter am Material-Feld, weil sich die
 * Rahmenstaerke dort nicht setzen laesst, ohne den Dekorationsrahmen selbst
 * nachzubauen.
 */
@Composable
fun AtlasTextfeld(
    wert: String,
    beimAendern: (String) -> Unit,
    beschriftung: String,
    modifier: Modifier = Modifier,
    aktiviert: Boolean = true,
    fehlerhaft: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    val quelle = remember { MutableInteractionSource() }
    val fokussiert by quelle.collectIsFocusedAsState()

    val rand = when {
        fehlerhaft -> MaterialTheme.colorScheme.error
        fokussiert -> LocalFokusring.current
        else -> MaterialTheme.colorScheme.outlineVariant
    }

    Column(modifier) {
        Text(
            text = beschriftung,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(bottom = Abstand.eng),
        )
        BasicTextField(
            value = wert,
            onValueChange = beimAendern,
            enabled = aktiviert,
            singleLine = true,
            interactionSource = quelle,
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            textStyle = LocalTextStyle.current.merge(
                MaterialTheme.typography.bodyLarge.copy(
                    color = MaterialTheme.colorScheme.onBackground,
                ),
            ),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.onBackground),
            // Ohne Material-Label hat das Feld keinen Namen. Die sichtbare
            // Beschriftung daneben sieht Talkback nicht als zugehoerig an,
            // deshalb steht sie hier noch einmal als Name des Feldes.
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, rand, MaterialTheme.shapes.small)
                .semantics { contentDescription = beschriftung },
        ) { innen ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = Hoehe.bedienelement)
                    .padding(horizontal = Abstand.mittel),
                contentAlignment = Alignment.CenterStart,
            ) { innen() }
        }
    }
}

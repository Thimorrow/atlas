package dev.atlas.schule.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe

/**
 * Platzhalter. Er belegt nur, dass das Cookie sitzt und eine gesperrte Route
 * antwortet. Die echten Bildschirme kommen in der naechsten Runde, deshalb
 * steht hier bewusst nichts, was spaeter weggeworfen werden muesste.
 */
@Composable
fun UebersichtBildschirm(
    zustand: AtlasZustand.Uebersicht,
    beimErneutLaden: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = Abstand.gross),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Abstand.normal),
        ) {
            when {
                zustand.fehler != null -> {
                    Text(
                        text = zustand.fehler,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                    )
                    TextButton(
                        onClick = beimErneutLaden,
                        modifier = Modifier.height(Hoehe.bedienelement),
                    ) {
                        Text("Erneut versuchen", style = MaterialTheme.typography.labelLarge)
                    }
                }

                zustand.anzahlFaecher == null -> CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                else -> {
                    Text(
                        text = "${zustand.anzahlFaecher}",
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        text = if (zustand.anzahlFaecher == 1) "Fach" else "Fächer",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

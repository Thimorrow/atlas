package dev.atlas.schule.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.runtime.getValue
import dev.atlas.schule.ui.theme.atlasTween
import dev.atlas.schule.ui.theme.Dauer
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
fun AtlasNavigation(auswahl: Reiter, beimWaehlen: (Reiter) -> Unit, ikone: (Reiter) -> ImageVector) {
    Column(Modifier.background(MaterialTheme.colorScheme.background)) {
        Box(Modifier.fillMaxWidth().height(0.5.dp).background(MaterialTheme.colorScheme.outlineVariant))
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 6.dp).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Reiter.entries.forEach { reiter ->
                val aktiv = auswahl == reiter
                val farbe by animateColorAsState(if (aktiv) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant, atlasTween(Dauer.SCHNELL), label = "navigation-color")
                val text = when (reiter) { Reiter.STUNDENPLAN -> "Plan"; Reiter.EINSTELLUNGEN -> "Mehr"; else -> reiter.bezeichnung }
                Column(
                    Modifier.weight(1f).heightIn(min = 52.dp).clip(RoundedCornerShape(10.dp))
                        .selectable(selected = aktiv, role = Role.Tab, onClick = { beimWaehlen(reiter) })
                        .semantics { contentDescription = reiter.bezeichnung }
                        .padding(vertical = 7.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterVertically),
                ) {
                    Box(Modifier.width(22.dp).height(2.dp).clip(RoundedCornerShape(1.dp)).background(if (aktiv) farbe else androidx.compose.ui.graphics.Color.Transparent))
                    Icon(ikone(reiter), null, Modifier.size(21.dp), tint = farbe)
                    Text(text, style = MaterialTheme.typography.labelMedium, color = farbe, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
fun AtlasTabs(labels: List<String>, auswahl: Int, beimWaehlen: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(10.dp)).padding(4.dp).selectableGroup()) {
        labels.forEachIndexed { index, label ->
            val aktiv = index == auswahl
            Box(Modifier.weight(1f).heightIn(min = 44.dp).clip(RoundedCornerShape(6.dp))
                .background(if (aktiv) MaterialTheme.colorScheme.surfaceContainer else MaterialTheme.colorScheme.surfaceVariant)
                .selectable(selected = aktiv, role = Role.Tab, onClick = { beimWaehlen(index) })
                .padding(horizontal = 8.dp, vertical = 10.dp), contentAlignment = Alignment.Center) {
                Text(label, style = MaterialTheme.typography.labelLarge, color = if (aktiv) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

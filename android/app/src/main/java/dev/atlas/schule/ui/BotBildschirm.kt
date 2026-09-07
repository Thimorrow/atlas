package dev.atlas.schule.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.BotVerlaufEintragDTO

@Composable
fun BotBildschirm(
    zustand: BotZustand,
    beimLaden: () -> Unit,
    beimVerlaufOeffnen: (String) -> Unit,
    beimVerlaufSchliessen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(Unit) { if (zustand.start == null) beimLaden() }
    if (zustand.detail != null) {
        BotVerlaufDetail(zustand.detail, beimVerlaufSchliessen, { zustand.detailId?.let(beimVerlaufOeffnen) })
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item { Kopf("Atlas fragen", "Dein Schulalltag. Gemeinsam weiterdenken.") }
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainer,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                        AtlasLogo(MaterialTheme.colorScheme.onPrimary, Modifier.size(25.dp))
                    }
                    when (val s = zustand.start) {
                        null, is Ladung.Laedt -> ListenSkelett()
                        is Ladung.Fehler -> FehlerZustand(s.meldung, beimLaden)
                        is Ladung.Da -> {
                            Text(s.wert.greeting, style = MaterialTheme.typography.titleLarge)
                            if (s.wert.enabled) {
                                Text("Neue Gespräche führst du im Browser. Hier findest du deine bisherigen Antworten.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (s.wert.suggestions.isNotEmpty()) {
                                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                                    Text("IDEEN FÜR DEIN NÄCHSTES GESPRÄCH", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    s.wert.suggestions.forEach { vorschlag ->
                                        Text(vorschlag, style = MaterialTheme.typography.bodyMedium)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        item { Text("Deine Gespräche", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
        when (val v = zustand.verlauf) {
            null, is Ladung.Laedt -> item { ListenSkelett() }
            is Ladung.Fehler -> item { FehlerZustand(v.meldung, beimLaden) }
            is Ladung.Da -> {
                if (v.wert.isEmpty()) {
                    item { LeerZustand("Noch kein Gespräch", "Deine Gespräche mit Atlas erscheinen hier, sobald du im Browser loslegst.") }
                } else {
                    items(v.wert, key = { it.id }) { eintrag: BotVerlaufEintragDTO ->
                        Surface(onClick = { beimVerlaufOeffnen(eintrag.id) }, shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surfaceContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                    Text(eintrag.title.ifBlank { "Gespräch" }, style = MaterialTheme.typography.titleMedium)
                                    eintrag.updatedAt?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    if (eintrag.hasCreated) Text("Mit angelegten Einträgen", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Icon(IkoneWeiter, "Öffnen", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BotVerlaufDetail(
    ladung: Ladung<dev.atlas.schule.data.BotVerlaufDetailAntwort>,
    beimZurueck: () -> Unit,
    beimErneutLaden: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TextButton(onClick = beimZurueck, contentPadding = PaddingValues(0.dp)) { Text("← Verlauf") }
        when (ladung) {
            is Ladung.Laedt -> ListenSkelett()
            is Ladung.Fehler -> FehlerZustand(ladung.meldung, beimErneutLaden)
            is Ladung.Da -> {
                Text(ladung.wert.title.ifBlank { "Gespräch" }, style = MaterialTheme.typography.headlineMedium)
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    items(ladung.wert.turns) { turn ->
                        val nutzer = turn.role == "user"
                        Surface(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp),
                            color = if (nutzer) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surfaceContainer,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text(if (nutzer) "Du" else "Atlas", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                NotizText(turn.content)
                            }
                        }
                    }
                }
            }
        }
    }
}

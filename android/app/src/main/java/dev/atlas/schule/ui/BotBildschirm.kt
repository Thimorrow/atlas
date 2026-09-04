package dev.atlas.schule.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import dev.atlas.schule.data.BotVerlaufEintragDTO
import dev.atlas.schule.ui.theme.Abstand

/**
 * Atlas-Bot — Web-Parität lesend: Begrüßung + Vorschläge + Verlauf nativ.
 * Der Chat selbst (Streaming NDJSON, Werkzeuge) läuft vorerst im Web weiter;
 * die App zeigt Verlauf + Detail + Deep-Link-Hinweis. Das ist ehrlich statt
 * halb: kein kaputter Chat, dafür voller Verlauf.
 */
@Composable
fun BotBildschirm(
    zustand: BotZustand,
    beimLaden: () -> Unit,
    beimVerlaufOeffnen: (String) -> Unit,
    beimVerlaufSchliessen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(Unit) {
        if (zustand.start == null) beimLaden()
    }
    if (zustand.detail != null) {
        BotVerlaufDetail(
            ladung = zustand.detail,
            beimZurueck = beimVerlaufSchliessen,
            beimErneutLaden = { zustand.detailId?.let(beimVerlaufOeffnen) },
        )
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(Abstand.normal),
        verticalArrangement = Arrangement.spacedBy(Abstand.normal),
    ) {
        item {
            Text("Atlas fragen", style = MaterialTheme.typography.headlineSmall)
        }
        item {
            when (val s = zustand.start) {
                null, is Ladung.Laedt -> CircularProgressIndicator()
                is Ladung.Fehler -> {
                    Text(s.meldung, color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = beimLaden) { Text("Erneut laden") }
                }
                is Ladung.Da -> {
                    if (!s.wert.enabled) {
                        Text(s.wert.greeting, style = MaterialTheme.typography.bodyMedium)
                    } else {
                        Text(s.wert.greeting, style = MaterialTheme.typography.bodyMedium)
                        s.wert.suggestions.forEach { vorschlag ->
                            Card(modifier = Modifier.fillMaxWidth().padding(top = Abstand.klein)) {
                                Text(vorschlag, modifier = Modifier.padding(Abstand.normal))
                            }
                        }
                        Text(
                            "Chatte im Browser weiter — den Verlauf findest du unten.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = Abstand.klein),
                        )
                    }
                }
            }
        }
        item {
            Text("Verlauf", style = MaterialTheme.typography.titleMedium)
        }
        when (val v = zustand.verlauf) {
            null, is Ladung.Laedt -> item { CircularProgressIndicator() }
            is Ladung.Fehler -> item {
                Text(v.meldung, color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = beimLaden) { Text("Erneut laden") }
            }
            is Ladung.Da -> {
                if (v.wert.isEmpty()) {
                    item { Text("Noch keine Gespräche.", style = MaterialTheme.typography.bodyMedium) }
                } else {
                    items(v.wert, key = { it.id }) { eintrag: BotVerlaufEintragDTO ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(Abstand.normal)) {
                                Text(eintrag.title.ifBlank { "Gespräch" }, style = MaterialTheme.typography.bodyLarge)
                                Row {
                                    eintrag.updatedAt?.let {
                                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    if (eintrag.hasCreated) {
                                        Text(" · hat etwas angelegt", style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                                TextButton(onClick = { beimVerlaufOeffnen(eintrag.id) }) { Text("Öffnen") }
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
    Column(Modifier.fillMaxSize().padding(Abstand.normal), verticalArrangement = Arrangement.spacedBy(Abstand.normal)) {
        TextButton(onClick = beimZurueck) { Text("← Verlauf") }
        when (ladung) {
            is Ladung.Laedt -> CircularProgressIndicator()
            is Ladung.Fehler -> {
                Text(ladung.meldung, color = MaterialTheme.colorScheme.error)
                Button(onClick = beimErneutLaden) { Text("Erneut laden") }
            }
            is Ladung.Da -> {
                Text(ladung.wert.title.ifBlank { "Gespräch" }, style = MaterialTheme.typography.headlineSmall)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(Abstand.klein)) {
                    items(ladung.wert.turns) { turn ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(Abstand.normal)) {
                                Text(
                                    if (turn.role == "user") "Du" else "Atlas",
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                NotizText(turn.content)
                            }
                        }
                    }
                }
            }
        }
    }
}

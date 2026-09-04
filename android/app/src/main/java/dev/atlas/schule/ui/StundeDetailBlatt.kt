package dev.atlas.schule.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe

/**
 * Stunden-Detail: Notiz + Meldung — Web-Parität zu lesson-note +
 * lesson-participation (lesen/schreiben/löschen).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StundeDetailBlatt(
    zustand: StundeDetailZustand,
    beimSchliessen: () -> Unit,
    beimNotizSpeichern: (String) -> Unit,
    beimMeldungSpeichern: (Int) -> Unit,
    beimMeldungLoeschen: () -> Unit,
) {
    var notizText by remember(zustand.lessonId, zustand.notiz) { mutableStateOf(zustand.notiz ?: "") }
    var meldungAuswahl by remember(zustand.lessonId, zustand.meldung) { mutableStateOf(zustand.meldung) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = beimSchliessen,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(Abstand.gross),
            verticalArrangement = Arrangement.spacedBy(Abstand.normal),
        ) {
            Text(zustand.titel ?: "Stunde", style = MaterialTheme.typography.headlineSmall)
            listOfNotNull(
                zustand.datum?.let {
                    runCatching {
                        java.time.format.DateTimeFormatter.ofPattern("EEEE, d. MMMM", java.util.Locale.GERMAN).format(it)
                    }.getOrNull() ?: it.toString()
                },
                zustand.uhrzeit,
            ).takeIf { it.isNotEmpty() }?.let {
                Text(it.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            zustand.naechsteFaelligkeit?.let {
                val fmt = remember(it) {
                    runCatching {
                        java.time.format.DateTimeFormatter.ofPattern("EEEE, d. MMMM", java.util.Locale.GERMAN).format(it)
                    }.getOrNull() ?: it.toString()
                }
                Text("Nächste Stunde dieses Fachs: $fmt", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (zustand.laeuft && zustand.notiz == null && zustand.meldung == null) {
                CircularProgressIndicator()
            } else {
                Text("Notiz", style = MaterialTheme.typography.labelLarge)
                OutlinedTextField(
                    value = notizText,
                    onValueChange = { notizText = it },
                    placeholder = { Text("Was kam dran?") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                )
                Button(
                    onClick = { beimNotizSpeichern(notizText) },
                    enabled = !zustand.laeuft,
                    modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement),
                ) { Text("Notiz speichern") }

                Text("Meldung", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(Abstand.klein)) {
                    (0..3).forEach { p ->
                        FilterChip(selected = meldungAuswahl == p, onClick = { meldungAuswahl = p }, label = { Text("$p") })
                    }
                    FilterChip(selected = meldungAuswahl == null, onClick = { meldungAuswahl = null }, label = { Text("–") })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(Abstand.klein)) {
                    Button(
                        onClick = { meldungAuswahl?.let(beimMeldungSpeichern) },
                        enabled = meldungAuswahl != null && !zustand.laeuft,
                        modifier = Modifier.weight(1f),
                    ) { Text("Meldung speichern") }
                    OutlinedButton(onClick = beimMeldungLoeschen, modifier = Modifier.weight(1f)) { Text("Löschen") }
                }
            }
            zustand.fehler?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            TextButton(onClick = beimSchliessen) { Text("Schließen") }
        }
    }
}

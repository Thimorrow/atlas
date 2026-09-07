package dev.atlas.schule.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
    var notizText by rememberSaveable(zustand.lessonId, zustand.notiz) { mutableStateOf(zustand.notiz ?: "") }
    var meldungAuswahl by rememberSaveable(zustand.lessonId, zustand.meldung) { mutableStateOf(zustand.meldung) }
    var schliessenBestaetigen by remember { mutableStateOf(false) }
    fun schliessen() {
        if (notizText != zustand.notiz.orEmpty() || meldungAuswahl != zustand.meldung) schliessenBestaetigen = true
        else beimSchliessen()
    }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = ::schliessen,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(Abstand.gross),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(zustand.titel ?: "Stunde", style = MaterialTheme.typography.headlineMedium)
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
                Text("Notiz", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = notizText,
                    onValueChange = { notizText = it },
                    placeholder = { Text("Was kam dran?") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 6,
                    enabled = !zustand.laeuft,
                )
                Button(
                    shape = MaterialTheme.shapes.small,
                    onClick = { beimNotizSpeichern(notizText) },
                    enabled = !zustand.laeuft,
                    modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement),
                ) { Text("Notiz speichern") }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text("Meldungen", style = MaterialTheme.typography.titleMedium)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(
                        shape = MaterialTheme.shapes.small,
                        onClick = { meldungAuswahl = ((meldungAuswahl ?: 0) - 1).coerceAtLeast(0) },
                        enabled = !zustand.laeuft && (meldungAuswahl ?: 0) > 0,
                        modifier = Modifier.heightIn(min = Hoehe.bedienelement).semantics { contentDescription = "Eine Meldung weniger" },
                    ) { Text("−") }
                    Text(meldungAuswahl?.toString() ?: "Nicht erfasst", style = MaterialTheme.typography.titleMedium)
                    OutlinedButton(
                        shape = MaterialTheme.shapes.small,
                        onClick = { meldungAuswahl = ((meldungAuswahl ?: 0) + 1).coerceAtMost(99) },
                        enabled = !zustand.laeuft && (meldungAuswahl ?: 0) < 99,
                        modifier = Modifier.heightIn(min = Hoehe.bedienelement).semantics { contentDescription = "Eine Meldung mehr" },
                    ) { Text("+") }
                }
                OutlinedButton(
                    shape = MaterialTheme.shapes.small,
                    onClick = { beimMeldungSpeichern(meldungAuswahl ?: 0) },
                    enabled = !zustand.laeuft,
                    modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement),
                ) { Text(if (meldungAuswahl == null) "0 Meldungen erfassen" else "Meldung speichern") }
                if (zustand.meldung != null) {
                    TextButton(onClick = beimMeldungLoeschen, enabled = !zustand.laeuft) { Text("Erfassung löschen") }
                }
            }
            zustand.fehler?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            TextButton(onClick = ::schliessen) { Text("Schließen") }
        }
    }
    if (schliessenBestaetigen) {
        AlertDialog(
            onDismissRequest = { schliessenBestaetigen = false },
            title = { Text("Änderungen verwerfen?") },
            text = { Text("Deine Änderungen sind noch nicht gespeichert.") },
            confirmButton = { TextButton(onClick = beimSchliessen) { Text("Verwerfen") } },
            dismissButton = { TextButton(onClick = { schliessenBestaetigen = false }) { Text("Weiter bearbeiten") } },
        )
    }
}

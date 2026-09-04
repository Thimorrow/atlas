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
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.AssignmentDTO
import dev.atlas.schule.data.SubjectDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import java.time.LocalDate

/**
 * Aufgabe bearbeiten / löschen — Web-Parität zu assignment-composer (Titel,
 * Typ, Fälligkeit, Fach, Notiz) + Löschen mit Bestätigung.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AufgabeBearbeitenBlatt(
    aufgabe: AssignmentDTO,
    faecher: List<SubjectDTO>,
    bearbeitung: AufgabenBearbeitung,
    beimSchliessen: () -> Unit,
    beimSpeichern: (String, String, LocalDate?, String?, String?, Boolean, Boolean) -> Unit,
    beimLoeschen: () -> Unit,
) {
    var titel by remember(aufgabe.id) { mutableStateOf(aufgabe.title) }
    var typ by remember(aufgabe.id) { mutableStateOf(aufgabe.type) }
    var faelligText by remember(aufgabe.id) { mutableStateOf(aufgabe.dueDate?.toString() ?: "") }
    var notizen by remember(aufgabe.id) { mutableStateOf(aufgabe.notes ?: "") }
    var fachId by remember(aufgabe.id) { mutableStateOf(aufgabe.subjectId) }
    var loeschenBestaetigen by remember { mutableStateOf(false) }
    var datumsFehler by remember(aufgabe.id) { mutableStateOf<String?>(null) }
    var faelligEntfernen by remember(aufgabe.id) { mutableStateOf(false) }
    var fachEntfernen by remember(aufgabe.id) { mutableStateOf(false) }
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
            Text("Aufgabe bearbeiten", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(
                value = titel,
                onValueChange = { titel = it },
                label = { Text("Titel") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            androidx.compose.foundation.layout.FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf("homework" to "Hausaufgabe", "exam" to "Prüfung", "test" to "Test", "presentation" to "Referat", "other" to "Sonstiges").forEach { (wert, label) ->
                    FilterChip(
                        selected = typ == wert,
                        onClick = { typ = wert },
                        label = { Text(label) },
                    )
                }
            }
            OutlinedTextField(
                value = faelligText,
                onValueChange = {
                    faelligText = it
                    datumsFehler = null
                    if (it.isNotBlank()) faelligEntfernen = false
                },
                label = { Text("Fällig (JJJJ-MM-TT, leer = ohne)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                isError = datumsFehler != null,
                supportingText = datumsFehler?.let { { Text(it) } },
            )
            if (aufgabe.dueDate != null) {
                TextButton(onClick = {
                    faelligText = ""
                    faelligEntfernen = true
                    datumsFehler = null
                }) { Text("Fälligkeit entfernen") }
            }
            OutlinedTextField(
                value = notizen,
                onValueChange = { notizen = it },
                label = { Text("Notiz (optional)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
            Text("Fach", style = MaterialTheme.typography.labelLarge)
            androidx.compose.foundation.layout.FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(selected = fachId == null, onClick = { fachId = null; fachEntfernen = aufgabe.subjectId != null }, label = { Text("Allgemein") })
                faecher.forEach { fach ->
                    FilterChip(selected = fachId == fach.id, onClick = { fachId = fach.id; fachEntfernen = false }, label = { Text(fach.name) })
                }
            }
            bearbeitung.fehler?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = {
                    val roh = faelligText.trim()
                    if (roh.isEmpty()) {
                        beimSpeichern(titel, typ, null, notizen.ifBlank { null }, if (fachEntfernen) null else fachId, faelligEntfernen, fachEntfernen)
                    } else {
                        val datum = runCatching { LocalDate.parse(roh) }.getOrNull()
                        if (datum == null) {
                            datumsFehler = "Bitte JJJJ-MM-TT eingeben, z. B. 2026-09-10."
                        } else {
                            beimSpeichern(titel, typ, datum, notizen.ifBlank { null }, if (fachEntfernen) null else fachId, false, fachEntfernen)
                        }
                    }
                },
                enabled = titel.isNotBlank() && !bearbeitung.laeuft,
                modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement),
            ) { Text(if (bearbeitung.laeuft) "Speichert …" else "Speichern") }
            if (!loeschenBestaetigen) {
                OutlinedButton(
                    onClick = { loeschenBestaetigen = true },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Löschen") }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { loeschenBestaetigen = false }, modifier = Modifier.weight(1f)) { Text("Abbrechen") }
                    Button(onClick = beimLoeschen, modifier = Modifier.weight(1f)) { Text("Wirklich löschen") }
                }
            }
            TextButton(onClick = beimSchliessen) { Text("Schließen") }
        }
    }
}

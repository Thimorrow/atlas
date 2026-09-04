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
import dev.atlas.schule.data.SubjectDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.Fachfarbe

/**
 * Fach anlegen / bearbeiten — Web-Parität zu NewSubjectDialog + Stammdaten
 * (Name, Lehrer, Raum, Farbe) + Archivieren/Löschen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FachBlatt(
    bestehend: SubjectDTO?,
    beimSchliessen: () -> Unit,
    beimAnlegen: (String, String?, String?, String?) -> Unit,
    beimSpeichern: ((String, String?, String?, String?, Int?) -> Unit)? = null,
    beimArchivieren: (() -> Unit)? = null,
    beimLoeschen: (() -> Unit)? = null,
) {
    var name by remember(bestehend?.id) { mutableStateOf(bestehend?.name ?: "") }
    var lehrer by remember(bestehend?.id) { mutableStateOf(bestehend?.teacher ?: "") }
    var raum by remember(bestehend?.id) { mutableStateOf(bestehend?.room ?: "") }
    var farbe by remember(bestehend?.id) { mutableStateOf(bestehend?.color) }
    var loeschenBestaetigen by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val farben = remember { Fachfarbe.entries.toList() }

    ModalBottomSheet(
        onDismissRequest = beimSchliessen,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(Abstand.gross),
            verticalArrangement = Arrangement.spacedBy(Abstand.normal),
        ) {
            Text(if (bestehend == null) "Fach anlegen" else "Fach bearbeiten", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = lehrer, onValueChange = { lehrer = it }, label = { Text("Lehrer (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = raum, onValueChange = { raum = it }, label = { Text("Raum (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Text("Farbe", style = MaterialTheme.typography.labelLarge)
            androidx.compose.foundation.layout.FlowRow(
                horizontalArrangement = Arrangement.spacedBy(Abstand.klein),
                verticalArrangement = Arrangement.spacedBy(Abstand.klein),
            ) {
                farben.forEach { f ->
                    FilterChip(selected = farbe == f.token, onClick = { farbe = f.token }, label = { Text(f.token) })
                }
            }
            Button(
                onClick = {
                    if (bestehend == null) beimAnlegen(name, lehrer.ifBlank { null }, raum.ifBlank { null }, farbe)
                    else beimSpeichern?.invoke(name, lehrer.ifBlank { null }, raum.ifBlank { null }, farbe, null)
                },
                enabled = name.isNotBlank(),
                modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement),
            ) { Text("Speichern") }
            bestehend?.let {
                Row(horizontalArrangement = Arrangement.spacedBy(Abstand.klein)) {
                    beimArchivieren?.let { a ->
                        OutlinedButton(onClick = a, modifier = Modifier.weight(1f)) {
                            Text(if (it.archivedAt == null) "Archivieren" else "Reaktivieren")
                        }
                    }
                    beimLoeschen?.let { l ->
                        if (!loeschenBestaetigen) {
                            OutlinedButton(onClick = { loeschenBestaetigen = true }, modifier = Modifier.weight(1f)) { Text("Löschen") }
                        } else {
                            Button(onClick = l, modifier = Modifier.weight(1f)) { Text("Wirklich löschen") }
                        }
                    }
                }
            }
            TextButton(onClick = beimSchliessen) { Text("Schließen") }
        }
    }
}

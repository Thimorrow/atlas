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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import dev.atlas.schule.data.NoteDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe

/**
 * Notiz anlegen / bearbeiten — Web-Parität zu subject-notes (Titel + Body,
 * Cmd+Enter-Verhalten entfällt nativ, Speichern-Button).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotizBlatt(
    bestehend: NoteDTO?,
    laeuft: Boolean,
    fehler: String?,
    beimSchliessen: () -> Unit,
    beimSpeichern: (String, String) -> Unit,
) {
    var titel by remember(bestehend?.id) { mutableStateOf(bestehend?.title ?: "") }
    var body by remember(bestehend?.id) { mutableStateOf(bestehend?.body ?: "") }
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
            Text(if (bestehend == null) "Notiz anlegen" else "Notiz bearbeiten", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(
                value = titel,
                onValueChange = { titel = it },
                label = { Text("Titel") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = body,
                onValueChange = { body = it },
                label = { Text("Text (Markdown)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 5,
            )
            fehler?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = { beimSpeichern(titel, body) },
                enabled = titel.isNotBlank() && !laeuft,
                modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement),
            ) { Text(if (laeuft) "Speichert …" else "Speichern") }
            TextButton(onClick = beimSchliessen) { Text("Schließen") }
        }
    }
}

/** Zeile für Notiz-Auswahl beim Bearbeiten/Löschen — wird im Detail verwendet. */
@Composable
fun NotizAktionsZeile(
    notiz: NoteDTO,
    beimBearbeiten: () -> Unit,
    beimLoeschen: () -> Unit,
    beimOnenote: (() -> Unit)?,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(Abstand.klein)) {
        TextButton(onClick = beimBearbeiten) { Text("Bearbeiten") }
        TextButton(onClick = beimLoeschen) { Text("Löschen") }
        beimOnenote?.let { TextButton(onClick = it) { Text("OneNote") } }
    }
}

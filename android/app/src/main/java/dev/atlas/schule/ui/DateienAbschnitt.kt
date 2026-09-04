package dev.atlas.schule.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import dev.atlas.schule.data.FileDTO
import dev.atlas.schule.ui.theme.Abstand
import kotlinx.coroutines.launch

/**
 * Dateien im Fach — Web-Parität zu subject-files (Liste + Löschen;
 * Upload/Download laufen über Teilen/Web, nativ nur Anzeige + Verweis).
 */
@Composable
fun DateienAbschnitt(
    ladung: Ladung<List<FileDTO>>?,
    beimLaden: () -> Unit,
    beimLoeschen: (String) -> Unit,
    beimOeffnen: (FileDTO) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var loeschId by remember { mutableStateOf<String?>(null) }
    var oeffnetId by remember { mutableStateOf<String?>(null) }
    var oeffnenFehler by remember { mutableStateOf<String?>(null) }
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Abstand.klein)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Dateien", style = MaterialTheme.typography.titleMedium)
            TextButton(onClick = beimLaden) { Text("Aktualisieren") }
        }
        when (ladung) {
            null -> Text("Noch nicht geladen.", style = MaterialTheme.typography.bodyMedium)
            is Ladung.Laedt -> CircularProgressIndicator()
            is Ladung.Fehler -> {
                Text(ladung.meldung, color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = beimLaden) { Text("Erneut laden") }
            }
            is Ladung.Da -> {
                if (ladung.wert.isEmpty()) {
                    Text("Keine Dateien. Lade sie im Browser hoch — hier erscheinen sie automatisch.", style = MaterialTheme.typography.bodyMedium)
                } else {
                    ladung.wert.forEach { datei ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(Abstand.normal)) {
                                Text(datei.name, style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    "${datei.contentType} · ${formatGroesse(datei.size)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(Abstand.klein)) {
                                    TextButton(
                                        onClick = {
                                            if (oeffnetId != null) return@TextButton
                                            oeffnetId = datei.id
                                            oeffnenFehler = null
                                            scope.launch {
                                                val api = dev.atlas.schule.data.AtlasApi.fuer(context)
                                                when (val erg = api.dateiLaden(datei.id)) {
                                                    is dev.atlas.schule.data.AtlasErgebnis.Erfolg -> {
                                                        runCatching {
                                                            val (bytes, typ) = erg.wert
                                                            val dir = java.io.File(context.cacheDir, "dateien").apply { mkdirs() }
                                                            val sicher = datei.name.replace(Regex("[^A-Za-z0-9._-]"), "_").takeIf { it.isNotBlank() } ?: "datei"
                                                            val file = java.io.File(dir, "${datei.id}-$sicher")
                                                            file.writeBytes(bytes)
                                                            val uri = androidx.core.content.FileProvider.getUriForFile(
                                                                context, "dev.atlas.schule.fileprovider", file,
                                                            )
                                                            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                                                                setDataAndType(uri, typ ?: datei.contentType)
                                                                addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                                                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                                                            }
                                                            val chooser = android.content.Intent.createChooser(intent, datei.name).apply {
                                                                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                                                            }
                                                            context.startActivity(chooser)
                                                        }.onFailure {
                                                            oeffnenFehler = "Datei lässt sich nicht öffnen."
                                                        }
                                                        oeffnetId = null
                                                    }
                                                    is dev.atlas.schule.data.AtlasErgebnis.Fehler -> {
                                                        oeffnenFehler = erg.meldung
                                                        oeffnetId = null
                                                    }
                                                }
                                            }
                                        },
                                        enabled = oeffnetId == null,
                                    ) { Text(if (oeffnetId == datei.id) "Öffnet …" else "Öffnen") }
                                    if (loeschId == datei.id) {
                                        TextButton(onClick = { beimLoeschen(datei.id); loeschId = null }) { Text("Wirklich löschen") }
                                    } else {
                                        TextButton(onClick = { loeschId = datei.id }) { Text("Löschen") }
                                    }
                                }
                                oeffnenFehler?.let {
                                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
                Text(
                    "Hochladen geht im Browser (PDF/PNG/JPG/WEBP/HEIC bis 10 MB).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Wie Web formatSize: B unter 1024, KB unter 10 mit einer, sonst ohne Nachkommastelle, MB mit einer. */
internal fun formatGroesse(bytes: Long): String {
    if (bytes < 0) return "–"
    if (bytes < 1024) return "$bytes B"
    val kb = bytes / 1024.0
    if (kb < 1024) {
        val fmt = if (kb < 10) "%.1f" else "%.0f"
        return "${String.format(java.util.Locale.ROOT, fmt, kb).replace(".", ",")} KB"
    }
    val mb = kb / 1024.0
    return "${String.format(java.util.Locale.ROOT, "%.1f", mb).replace(".", ",")} MB"
}

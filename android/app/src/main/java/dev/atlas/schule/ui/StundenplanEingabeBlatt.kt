package dev.atlas.schule.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.SubjectDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import java.time.LocalDate

@Composable
fun StundenplanEingabeBlatt(
    blatt: BlattZustand,
    heute: LocalDate,
    faecher: List<SubjectDTO>,
    beimSchliessen: () -> Unit,
    beimAnlegen: (String, String, LocalDate?, String?, String?) -> Unit,
) {
    var auswahl by remember { mutableStateOf(StundenplanEingabe.AUSWAHL) }
    val vorgabe = blatt.vorbelegung
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
            when (auswahl) {
                StundenplanEingabe.AUSWAHL -> {
                    Text("Was möchtest du eintragen?", style = MaterialTheme.typography.headlineSmall)
                    Text("Wähle eine eigene Eingabemaske für diese Stunde.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = { auswahl = StundenplanEingabe.HAUSAUFGABE }, modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement)) { Text("Hausaufgabe eintragen") }
                    Button(onClick = { auswahl = StundenplanEingabe.TEST }, modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement)) { Text("Test eintragen") }
                    OutlinedButton(onClick = { auswahl = StundenplanEingabe.NOTIZ }, modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement)) { Text("Notiz machen") }
                }
                StundenplanEingabe.HAUSAUFGABE -> NeueAufgabeBlattInhalt(blatt, heute, faecher, "Hausaufgabe eintragen", "homework", beimAnlegen)
                StundenplanEingabe.TEST -> NeueAufgabeBlattInhalt(blatt, heute, faecher, "Test eintragen", "exam", beimAnlegen)
                StundenplanEingabe.NOTIZ -> NeueAufgabeBlattInhalt(blatt, heute, faecher, "Notiz machen", "other", beimAnlegen)
            }
        }
    }
}

@Composable
private fun NeueAufgabeBlattInhalt(
    blatt: BlattZustand,
    heute: LocalDate,
    faecher: List<SubjectDTO>,
    titel: String,
    typ: String,
    beimAnlegen: (String, String, LocalDate?, String?, String?) -> Unit,
) {
    var text by remember { mutableStateOf("") }
    val vorgabe = blatt.vorbelegung
    Text(titel, style = MaterialTheme.typography.headlineSmall)
    Text("${vorgabe?.untisFach ?: "Allgemein"} · ${vorgabe?.faellig ?: heute}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    AtlasTextfeld(wert = text, beimAendern = { text = it }, beschriftung = if (typ == "other") "Notiz" else "Titel", modifier = Modifier.fillMaxWidth())
    Button(
        onClick = { beimAnlegen(text.trim(), typ, vorgabe?.faellig ?: heute.plusDays(1), vorgabe?.fachId, vorgabe?.untisFach) },
        enabled = text.isNotBlank() && !blatt.laeuft,
        modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement),
    ) { Text(if (typ == "other") "Notiz speichern" else titel) }
    blatt.fehler?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
}


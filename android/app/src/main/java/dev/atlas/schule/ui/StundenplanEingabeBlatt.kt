package dev.atlas.schule.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
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

@OptIn(ExperimentalMaterial3Api::class)
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
                StundenplanEingabe.HAUSAUFGABE -> NeueHausaufgabeScreen(blatt, heute, beimAnlegen)
                StundenplanEingabe.TEST -> NeuerTestScreen(blatt, heute, beimAnlegen)
                StundenplanEingabe.NOTIZ -> NeueNotizScreen(blatt, heute, beimAnlegen)
            }
        }
    }
}

@Composable
private fun NeueHausaufgabeScreen(
    blatt: BlattZustand,
    heute: LocalDate,
    beimAnlegen: (String, String, LocalDate?, String?, String?) -> Unit,
) {
    SpezialisierteEingabe(
        blatt = blatt,
        heute = heute,
        typ = "homework",
        ueberschrift = "Hausaufgabe",
        erklaerung = "Was musst du bis zur nächsten Stunde erledigen?",
        feldLabel = "Aufgabe beschreiben",
        buttonLabel = "Hausaufgabe speichern",
        beimAnlegen = beimAnlegen,
    )
}

@Composable
private fun NeuerTestScreen(
    blatt: BlattZustand,
    heute: LocalDate,
    beimAnlegen: (String, String, LocalDate?, String?, String?) -> Unit,
) {
    SpezialisierteEingabe(
        blatt = blatt,
        heute = heute,
        typ = "exam",
        ueberschrift = "Test / Klassenarbeit",
        erklaerung = "Plane den Test mit dem Datum deiner Stunde ein.",
        feldLabel = "Thema des Tests",
        buttonLabel = "Test speichern",
        beimAnlegen = beimAnlegen,
    )
}

@Composable
private fun NeueNotizScreen(
    blatt: BlattZustand,
    heute: LocalDate,
    beimAnlegen: (String, String, LocalDate?, String?, String?) -> Unit,
) {
    SpezialisierteEingabe(
        blatt = blatt,
        heute = heute,
        typ = "other",
        ueberschrift = "Notiz zur Stunde",
        erklaerung = "Halte hier etwas Wichtiges zu dieser Stunde fest.",
        feldLabel = "Notiz schreiben",
        buttonLabel = "Notiz speichern",
        beimAnlegen = beimAnlegen,
    )
}

@Composable
private fun SpezialisierteEingabe(
    blatt: BlattZustand,
    heute: LocalDate,
    typ: String,
    ueberschrift: String,
    erklaerung: String,
    feldLabel: String,
    buttonLabel: String,
    beimAnlegen: (String, String, LocalDate?, String?, String?) -> Unit,
) {
    var text by remember(typ) { mutableStateOf("") }
    val vorgabe = blatt.vorbelegung
    Column(verticalArrangement = Arrangement.spacedBy(Abstand.normal)) {
        Text(ueberschrift, style = MaterialTheme.typography.headlineSmall)
        Text(erklaerung, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            text = "${vorgabe?.untisFach ?: "Allgemein"} · ${vorgabe?.faellig ?: heute}",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
        AtlasTextfeld(
            wert = text,
            beimAendern = { text = it },
            beschriftung = feldLabel,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { beimAnlegen(text.trim(), typ, vorgabe?.faellig ?: heute.plusDays(1), vorgabe?.fachId, vorgabe?.untisFach) },
            enabled = text.isNotBlank() && !blatt.laeuft,
            modifier = Modifier.fillMaxWidth().heightIn(min = Hoehe.bedienelement),
        ) {
            Text(buttonLabel)
        }
        blatt.fehler?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}


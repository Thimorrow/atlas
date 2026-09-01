package dev.atlas.schule.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.SubjectDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.fachfarbe
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

// Die fuenf Typen des Servers, in derselben Reihenfolge wie ASSIGNMENT_TYPES.
private val TYPEN = listOf("homework", "exam", "test", "presentation", "other")

/**
 * Neue Aufgabe, als Blatt von unten. Ein eigener Bildschirm waere fuer vier
 * Felder zu viel Weg, und das Blatt laesst die Liste dahinter stehen, sodass
 * klar bleibt, wohin die Aufgabe faellt.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NeueAufgabeBlatt(
    blatt: BlattZustand,
    heute: LocalDate,
    faecher: List<SubjectDTO>,
    beimSchliessen: () -> Unit,
    beimAnlegen: (String, String, LocalDate?, String?) -> Unit,
) {
    val blattZustand = rememberModalBottomSheetState()
    var titel by remember { mutableStateOf("") }
    var typ by remember { mutableStateOf("homework") }
    var faellig by remember { mutableStateOf<LocalDate?>(heute.plusDays(1)) }
    var fachId by remember { mutableStateOf<String?>(null) }
    var kalenderOffen by remember { mutableStateOf(false) }

    val feld = remember { FocusRequester() }
    // Der Titel ist das einzige Pflichtfeld. Direkt hineinzuspringen spart den
    // ersten Tipp; alles andere hat brauchbare Vorbelegungen.
    LaunchedEffect(Unit) { feld.requestFocus() }

    val gueltig = titel.isNotBlank() && !blatt.laeuft

    fun absenden() {
        if (gueltig) beimAnlegen(titel, typ, faellig, fachId)
    }

    ModalBottomSheet(
        onDismissRequest = beimSchliessen,
        sheetState = blattZustand,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = Abstand.gross)
                .padding(bottom = Abstand.gross)
                .navigationBarsPadding()
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(Abstand.weit),
        ) {
            Text(
                text = "Neue Aufgabe",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
            )

            OutlinedTextField(
                value = titel,
                onValueChange = { titel = it },
                // Beschriftung ueber dem Feld, nicht als Platzhalter: der
                // Platzhalter verschwindet genau dann, wenn man ihn braucht.
                label = { Text("Titel") },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { absenden() }),
                modifier = Modifier.fillMaxWidth().focusRequester(feld),
            )

            Chipreihe("Art") {
                TYPEN.forEach { wert ->
                    FilterChip(
                        selected = typ == wert,
                        onClick = { typ = wert },
                        label = { Text(aufgabentypBezeichnung(wert)) },
                    )
                }
            }

            Chipreihe("Fällig") {
                FilterChip(
                    selected = faellig == heute,
                    onClick = { faellig = heute },
                    label = { Text("Heute") },
                )
                FilterChip(
                    selected = faellig == heute.plusDays(1),
                    onClick = { faellig = heute.plusDays(1) },
                    label = { Text("Morgen") },
                )
                FilterChip(
                    selected = faellig != null && faellig != heute && faellig != heute.plusDays(1),
                    onClick = { kalenderOffen = true },
                    label = {
                        val eigenes = faellig != null && faellig != heute && faellig != heute.plusDays(1)
                        Text(if (eigenes) faelligLabel(faellig, heute)!! else "Datum wählen")
                    },
                )
                FilterChip(
                    selected = faellig == null,
                    onClick = { faellig = null },
                    label = { Text("Ohne Datum") },
                )
            }

            if (faecher.isNotEmpty()) {
                Chipreihe("Fach") {
                    FilterChip(
                        selected = fachId == null,
                        onClick = { fachId = null },
                        label = { Text("Allgemein") },
                    )
                    faecher.forEach { fach ->
                        FilterChip(
                            selected = fachId == fach.id,
                            onClick = { fachId = fach.id },
                            leadingIcon = {
                                Spacer(
                                    Modifier.size(8.dp).clip(CircleShape)
                                        .background(fachfarbe(fach.color)),
                                )
                            },
                            label = { Text(fach.name) },
                        )
                    }
                }
            }

            blatt.fehler?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Button(
                onClick = { absenden() },
                enabled = gueltig,
                modifier = Modifier.fillMaxWidth().height(Hoehe.bedienelement),
            ) {
                if (blatt.laeuft) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    // Sagt, was passiert, nicht "Absenden".
                    Text("Aufgabe anlegen", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }

    if (kalenderOffen) {
        val kalender = rememberDatePickerState(
            initialSelectedDateMillis = (faellig ?: heute)
                .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { kalenderOffen = false },
            confirmButton = {
                TextButton(onClick = {
                    kalender.selectedDateMillis?.let {
                        // Der Kalender arbeitet in UTC-Millisekunden, das Datum
                        // selbst ist zeitzonenlos. Ueber UTC zurueckzurechnen
                        // ist der einzige Weg ohne Tagesversatz.
                        faellig = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                    }
                    kalenderOffen = false
                }) { Text("Übernehmen") }
            },
            dismissButton = {
                TextButton(onClick = { kalenderOffen = false }) { Text("Abbrechen") }
            },
        ) {
            DatePicker(state = kalender)
        }
    }
}

@Composable
private fun Chipreihe(beschriftung: String, inhalt: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Abstand.normal)) {
        Text(
            text = beschriftung,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(Abstand.normal),
            verticalAlignment = Alignment.CenterVertically,
        ) { inhalt() }
    }
}

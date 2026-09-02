package dev.atlas.schule.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Punkte 0-15, absteigend: die hohen Punkte sind die haeufig getippten. */
private val PUNKTE = (Notenlogik.PUNKTE_MAX downTo Notenlogik.PUNKTE_MIN).toList()

/**
 * Neue Note, als Blatt von unten. Gleiches Muster wie NeueAufgabeBlatt: die
 * Fachliste dahinter bleibt sichtbar, sodass klar bleibt, in welches Fach die
 * Note faellt.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NeueNoteBlatt(
    laeuft: Boolean,
    fehler: String?,
    heute: LocalDate,
    beimSchliessen: () -> Unit,
    beimAnlegen: (Int, String, String, LocalDate) -> Unit,
) {
    val blattZustand = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var punkte by remember { mutableStateOf<Int?>(null) }
    var art by remember { mutableStateOf("oral") }
    var bezeichnung by remember { mutableStateOf("") }
    var datum by remember { mutableStateOf(heute) }
    var kalenderOffen by remember { mutableStateOf(false) }

    val gueltig = punkte != null && bezeichnung.isNotBlank() && !laeuft

    fun absenden() {
        val gewaehlt = punkte
        if (gueltig && gewaehlt != null) beimAnlegen(gewaehlt, bezeichnung, art, datum)
    }

    ModalBottomSheet(
        onDismissRequest = beimSchliessen,
        sheetState = blattZustand,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(bottom = Abstand.gross)
                .navigationBarsPadding()
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(Abstand.weit),
        ) {
            Text(
                text = "Neue Note",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.padding(horizontal = Abstand.gross),
            )

            NotenChipreihe("Punkte") {
                PUNKTE.forEach { wert ->
                    NotenChip(
                        ausgewaehlt = punkte == wert,
                        beimKlick = { punkte = wert },
                        beschriftung = wert.toString(),
                    )
                }
            }

            // Die Note zu den gewaehlten Punkten, rein optisch: sie wird nie
            // mitgesendet, der Server leitet sie selbst aus den Punkten ab.
            punkte?.let { gewaehlt ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = Abstand.gross),
                    horizontalArrangement = Arrangement.spacedBy(Abstand.eng),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Text(
                        text = "entspricht Note",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = Notenlogik.punkteZuNote(gewaehlt),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }
            }

            NotenChipreihe("Art") {
                NotenChip(
                    ausgewaehlt = art == "oral",
                    beimKlick = { art = "oral" },
                    beschriftung = "Mündlich",
                )
                NotenChip(
                    ausgewaehlt = art == "written",
                    beimKlick = { art = "written" },
                    beschriftung = "Schriftlich",
                )
            }

            AtlasTextfeld(
                wert = bezeichnung,
                beimAendern = { bezeichnung = it },
                beschriftung = "Bezeichnung",
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { absenden() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Abstand.gross),
            )

            NotenChipreihe("Datum") {
                NotenChip(
                    ausgewaehlt = datum == heute,
                    beimKlick = { datum = heute },
                    beschriftung = "Heute",
                )
                NotenChip(
                    ausgewaehlt = datum != heute,
                    beimKlick = { kalenderOffen = true },
                    beschriftung = if (datum != heute) faelligLabel(datum, heute) ?: "$datum" else "Datum wählen",
                )
            }

            fehler?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = Abstand.gross),
                )
            }

            Button(
                onClick = { absenden() },
                enabled = gueltig,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Abstand.gross)
                    .heightIn(min = Hoehe.bedienelement),
            ) {
                if (laeuft) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text("Note eintragen", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }

    if (kalenderOffen) {
        val kalender = rememberDatePickerState(
            initialSelectedDateMillis = datum.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { kalenderOffen = false },
            confirmButton = {
                TextButton(onClick = {
                    kalender.selectedDateMillis?.let {
                        // Der Kalender arbeitet in UTC-Millisekunden, das Datum
                        // selbst ist zeitzonenlos. Ueber UTC zurueckzurechnen
                        // ist der einzige Weg ohne Tagesversatz.
                        datum = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
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
private fun NotenChipreihe(beschriftung: String, inhalt: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Abstand.normal)) {
        Text(
            text = beschriftung,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = Abstand.gross),
        )
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Abstand.gross),
            horizontalArrangement = Arrangement.spacedBy(Abstand.normal),
            verticalAlignment = Alignment.CenterVertically,
        ) { inhalt() }
    }
}

/**
 * Eigenes Plaettchen statt des gleichnamigen aus NeueAufgabeBlatt.kt: dort ist
 * es file-privat und diese Datei darf jene nicht aendern. Optisch dasselbe
 * Muster wie ueberall sonst in Atlas.
 */
@Composable
private fun NotenChip(
    ausgewaehlt: Boolean,
    beimKlick: () -> Unit,
    beschriftung: String,
) {
    FilterChip(
        selected = ausgewaehlt,
        onClick = beimKlick,
        label = { Text(beschriftung, style = MaterialTheme.typography.bodyMedium) },
        shape = MaterialTheme.shapes.small,
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Color.Transparent,
            labelColor = MaterialTheme.colorScheme.onBackground,
            selectedContainerColor = MaterialTheme.colorScheme.primary,
            selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = ausgewaehlt,
            borderColor = MaterialTheme.colorScheme.outlineVariant,
            selectedBorderColor = Color.Transparent,
        ),
        modifier = Modifier.heightIn(min = Hoehe.plaettchen),
    )
}

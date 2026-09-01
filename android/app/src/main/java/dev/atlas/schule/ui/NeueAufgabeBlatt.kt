package dev.atlas.schule.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
    // Das Blatt kam sonst halb hoch und liess "Aufgabe anlegen" unter dem Rand
    // stehen, obwohl das Formular ganz auf den Schirm passt. Wer eine Aufgabe
    // anlegt, soll den Knopf sehen, ohne erst ziehen zu muessen.
    val blattZustand = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var titel by remember { mutableStateOf("") }
    var typ by remember { mutableStateOf("homework") }
    var faellig by remember { mutableStateOf<LocalDate?>(heute.plusDays(1)) }
    var fachId by remember { mutableStateOf<String?>(null) }
    var kalenderOffen by remember { mutableStateOf(false) }

    // Frueher sprang der Fokus beim Oeffnen in den Titel. Auf dem Telefon
    // schiebt das die Tastatur hoch und drueckt "Aufgabe anlegen" aus dem Bild,
    // bevor man das Blatt ueberhaupt gesehen hat. Wer tippen will, tippt ins
    // Feld; wer nur das Fach wechselt, muss die Tastatur nicht erst wegwischen.
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
                // Der Seitenabstand sitzt jetzt an den einzelnen Zeilen statt
                // hier, weil die Plaettchenreihen darunter bis an den
                // Bildschirmrand scrollen sollen.
                .padding(bottom = Abstand.gross)
                .navigationBarsPadding()
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(Abstand.weit),
        ) {
            Text(
                text = "Neue Aufgabe",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.padding(horizontal = Abstand.gross),
            )

            AtlasTextfeld(
                wert = titel,
                beimAendern = { titel = it },
                beschriftung = "Titel",
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { absenden() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Abstand.gross),
            )

            Chipreihe("Art") {
                TYPEN.forEach { wert ->
                    AtlasChip(
                        ausgewaehlt = typ == wert,
                        beimKlick = { typ = wert },
                        beschriftung = aufgabentypBezeichnung(wert),
                    )
                }
            }

            Chipreihe("Fällig") {
                AtlasChip(
                    ausgewaehlt = faellig == heute,
                    beimKlick = { faellig = heute },
                    beschriftung = "Heute",
                )
                AtlasChip(
                    ausgewaehlt = faellig == heute.plusDays(1),
                    beimKlick = { faellig = heute.plusDays(1) },
                    beschriftung = "Morgen",
                )
                val eigenes = faellig != null && faellig != heute && faellig != heute.plusDays(1)
                AtlasChip(
                    ausgewaehlt = eigenes,
                    beimKlick = { kalenderOffen = true },
                    beschriftung = if (eigenes) faelligLabel(faellig, heute)!! else "Datum wählen",
                )
                AtlasChip(
                    ausgewaehlt = faellig == null,
                    beimKlick = { faellig = null },
                    beschriftung = "Ohne Datum",
                )
            }

            if (faecher.isNotEmpty()) {
                Chipreihe("Fach") {
                    AtlasChip(
                        ausgewaehlt = fachId == null,
                        beimKlick = { fachId = null },
                        beschriftung = "Allgemein",
                    )
                    faecher.forEach { fach ->
                        AtlasChip(
                            ausgewaehlt = fachId == fach.id,
                            beimKlick = { fachId = fach.id },
                            beschriftung = fach.name,
                            symbol = {
                                Spacer(
                                    Modifier.size(8.dp).clip(CircleShape)
                                        .background(fachfarbe(fach.color)),
                                )
                            },
                        )
                    }
                }
            }

            blatt.fehler?.let {
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
                    // Waechst mit der Systemschrift, statt die Beschriftung
                    // in feste 48dp zu zwingen.
                    .heightIn(min = Hoehe.bedienelement),
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
            modifier = Modifier.padding(horizontal = Abstand.gross),
        )
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                // Der Abstand liegt hinter dem Scroll und wandert deshalb mit
                // dem Inhalt. So laeuft das letzte Plaettchen bis an die
                // Bildschirmkante: ein Schnitt am Rand liest sich als "geht
                // weiter", ein Schnitt mitten in der Flaeche als Fehler.
                .padding(horizontal = Abstand.gross),
            horizontalArrangement = Arrangement.spacedBy(Abstand.normal),
            verticalAlignment = Alignment.CenterVertically,
        ) { inhalt() }
    }
}

/**
 * Auswahlplaettchen in der Sprache von Atlas. Material faerbt das gewaehlte
 * Plaettchen sonst mit secondaryContainer ein, das war der Flieder. Gewaehlt
 * heisst hier dasselbe wie in der unteren Leiste und beim Pluszeichen: die
 * Flaeche kippt auf den Vordergrundton um.
 */
@Composable
private fun AtlasChip(
    ausgewaehlt: Boolean,
    beimKlick: () -> Unit,
    beschriftung: String,
    symbol: (@Composable () -> Unit)? = null,
) {
    FilterChip(
        selected = ausgewaehlt,
        onClick = beimKlick,
        label = { Text(beschriftung, style = MaterialTheme.typography.bodyMedium) },
        leadingIcon = symbol,
        shape = MaterialTheme.shapes.small,
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Color.Transparent,
            labelColor = MaterialTheme.colorScheme.onBackground,
            iconColor = MaterialTheme.colorScheme.onBackground,
            selectedContainerColor = MaterialTheme.colorScheme.primary,
            selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
            selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = ausgewaehlt,
            borderColor = MaterialTheme.colorScheme.outlineVariant,
            // Das gewaehlte Plaettchen traegt seine Kante ueber die Fuellung,
            // ein zusaetzlicher Rahmen wuerde sie nur verdoppeln.
            selectedBorderColor = Color.Transparent,
        ),
        // Material stellt Plaettchen 32dp hoch. In einer Reihe, die man
        // seitlich schiebt, ist das zu wenig zum Treffen.
        modifier = Modifier.heightIn(min = Hoehe.plaettchen),
    )
}

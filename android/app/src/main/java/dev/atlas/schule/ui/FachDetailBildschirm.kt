package dev.atlas.schule.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.AssignmentDTO
import dev.atlas.schule.data.FachDetailAntwort
import dev.atlas.schule.data.LessonDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.fachfarbe
import java.time.LocalDate

/**
 * Fachdetail: Stammdaten, naechste Stunden, offene Aufgaben, Notizen.
 *
 * Die Notizen stehen bewusst als roher Markdown da. Ein Renderer mit denselben
 * Regeln wie lib/markdown.ts ist eine eigene Aufgabe; ihn hier nebenbei
 * halbfertig zu bauen hiesse, dass Telefon und Browser denselben Text
 * verschieden auszeichnen. Die Monospace-Schrift sagt dem Leser, dass er
 * Quelltext sieht, statt Sternchen als Fehler zu lesen.
 */
@Composable
fun FachDetailBildschirm(
    ladung: Ladung<FachDetailAntwort>,
    heute: LocalDate,
    beimZurueck: () -> Unit,
    beimHaken: (AssignmentDTO, Boolean) -> Unit,
    beimErneutLaden: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = Abstand.normal, vertical = Abstand.klein),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = beimZurueck, modifier = Modifier.size(Hoehe.bedienelement)) {
                Icon(
                    IkoneZurueck,
                    contentDescription = "Zurück zur Fächerliste",
                    tint = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.size(20.dp),
                )
            }
        }

        when (ladung) {
            is Ladung.Laedt -> Column(Modifier.fillMaxSize().padding(horizontal = Abstand.weit)) {
                Platzhalter(Modifier.height(24.dp).width(160.dp))
                Spacer(Modifier.height(Abstand.gross))
                ListenSkelett()
            }

            is Ladung.Fehler -> MittigerZustand {
                FehlerZustand(ladung.meldung, beimErneutLaden)
            }

            is Ladung.Da -> Inhalt(ladung.wert, heute, beimHaken)
        }
    }
}

@Composable
private fun Inhalt(
    daten: FachDetailAntwort,
    heute: LocalDate,
    beimHaken: (AssignmentDTO, Boolean) -> Unit,
) {
    val fach = daten.subject
    val farbe = fachfarbe(fach.color)
    val offen = daten.assignments.filter { it.completedAt == null }

    LazyColumn(
        contentPadding = PaddingValues(
            start = Abstand.weit,
            end = Abstand.weit,
            bottom = Abstand.sehrGross,
        ),
        verticalArrangement = Arrangement.spacedBy(Abstand.gross),
    ) {
        item("titel") {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Abstand.mittel),
            ) {
                Spacer(Modifier.size(12.dp).clip(CircleShape).background(farbe))
                Text(
                    text = fach.name,
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onBackground,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        item("stammdaten") {
            Abschnitt("Stammdaten") {
                Angabe("Lehrkraft", fach.teacher)
                Angabe("Raum", fach.room)
                Angabe("In Untis", fach.untisSubject)
            }
        }

        item("stunden") {
            Abschnitt("Nächste Stunden") {
                if (daten.upcoming.isEmpty()) {
                    Leerzeile("Für dieses Fach steht keine Stunde mehr im Plan.")
                } else {
                    daten.upcoming.forEach { Stundenzeile(it, heute) }
                }
            }
        }

        item("aufgaben") {
            Abschnitt("Aufgaben", if (offen.isEmpty()) null else "${offen.size} offen") {
                if (offen.isEmpty()) {
                    Leerzeile("Nichts offen in diesem Fach.")
                } else {
                    // Ohne Datum ans Ende: was terminiert ist, draengt zuerst.
                    offen.sortedWith(compareBy(nullsLast<LocalDate>()) { it.dueDate }).forEach { aufgabe ->
                        Aufgabenzeile(
                            aufgabe = aufgabe,
                            heute = heute,
                            gruppe = gruppeVon(aufgabe.dueDate, heute),
                            // Das Fach steht schon in der Ueberschrift.
                            zeigeFach = false,
                            beimHaken = { beimHaken(aufgabe, true) },
                        )
                    }
                }
            }
        }

        item("notizen") {
            Abschnitt("Notizen", if (daten.notes.isEmpty()) null else "${daten.notes.size}") {
                if (daten.notes.isEmpty()) {
                    Leerzeile("Noch keine Notiz. Angelegt werden sie im Browser.")
                } else {
                    daten.notes.forEach { notiz ->
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = Abstand.normal),
                            verticalArrangement = Arrangement.spacedBy(Abstand.eng),
                        ) {
                            Text(
                                text = notiz.title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onBackground,
                            )
                            Text(
                                text = notiz.body,
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Abschnitt(
    titel: String,
    zusatz: String? = null,
    inhalt: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Abstand.normal)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = titel,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            zusatz?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Column(
            Modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.medium)
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .border(1.dp, MaterialTheme.colorScheme.outline, MaterialTheme.shapes.medium)
                // Innenradius = Aussenradius minus Polsterung, sonst klafft in
                // den Ecken eine sichtbare Luecke.
                .padding(horizontal = Abstand.mittel, vertical = Abstand.normal),
        ) { inhalt() }
    }
}

@Composable
private fun Angabe(beschriftung: String, wert: String?) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = Abstand.eng),
        horizontalArrangement = Arrangement.spacedBy(Abstand.weit),
    ) {
        Text(
            text = beschriftung,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(88.dp),
        )
        Text(
            // Ein leeres Feld als leere Zeile zu zeigen liest sich wie ein
            // Ladefehler. "Nicht hinterlegt" sagt, dass nichts fehlt.
            text = wert ?: "Nicht hinterlegt",
            style = MaterialTheme.typography.bodySmall,
            color = if (wert == null) MaterialTheme.colorScheme.onSurfaceVariant
            else MaterialTheme.colorScheme.onBackground,
        )
    }
}

@Composable
private fun Stundenzeile(stunde: LessonDTO, heute: LocalDate) {
    val entfaellt = stunde.status == "cancelled"
    val vertretung = stunde.status == "substituted"
    val wann = faelligLabel(stunde.date, heute) ?: "${stunde.date.dayOfMonth}."

    Row(
        Modifier.fillMaxWidth().padding(vertical = Abstand.eng),
        horizontalArrangement = Arrangement.spacedBy(Abstand.mittel),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = wann,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            // Feste Breite, damit die Uhrzeiten darunter eine Spalte bilden.
            // 88dp waren zu knapp: "Mo., 7. September" wurde zu "Mo., 7. Septe…",
            // obwohl rechts in der Zeile Platz frei stand. 112dp fasst den
            // laengsten Wochentag mit dem laengsten Monat.
            modifier = Modifier.width(112.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = stunde.endTime?.let { "${stunde.startTime}–$it" } ?: stunde.startTime,
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            textDecoration = if (entfaellt) TextDecoration.LineThrough else null,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            text = when {
                entfaellt -> "entfällt"
                vertretung -> stunde.substitutionText ?: "Vertretung"
                else -> stunde.room.orEmpty()
            },
            style = MaterialTheme.typography.bodySmall,
            color = if (entfaellt) MaterialTheme.colorScheme.error
            else MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun Leerzeile(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = Abstand.klein),
    )
}

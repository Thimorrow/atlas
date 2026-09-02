package dev.atlas.schule.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.AssignmentDTO
import dev.atlas.schule.data.FachDetailAntwort
import dev.atlas.schule.data.GradeDTO
import dev.atlas.schule.data.GradeSummaryDTO
import dev.atlas.schule.data.GradesAntwort
import dev.atlas.schule.data.LessonDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.Tabellenziffern
import dev.atlas.schule.ui.theme.fachfarbeFuerFach
import java.time.LocalDate
import java.util.Locale

/**
 * Fachdetail: Stammdaten, naechste Stunden, offene Aufgaben, Notizen.
 *
 * Die Notizen werden gerendert, nach denselben Regeln wie lib/markdown.ts im
 * Web: siehe Markdown.kt und NotizText.kt.
 */
@Composable
fun FachDetailBildschirm(
    ladung: Ladung<FachDetailAntwort>,
    /** Gesetzt, sobald etwas angezeigt wird; sagt, ob es noch aktuell ist. */
    stand: Stand?,
    heute: LocalDate,
    beimZurueck: () -> Unit,
    beimHaken: (AssignmentDTO, Boolean) -> Unit,
    beimErneutLaden: () -> Unit,
    /**
     * Noten und Schnitt dieses Fachs, dazu das Blatt fuer eine neue Note. Ein
     * eigener Parameterblock statt eines Felds auf [ladung], weil die Noten
     * ueber einen eigenen StateFlow im ViewModel laufen (siehe NotenZustand in
     * AtlasViewModel.kt). Vorbelegt mit leerem Zustand, damit bestehende
     * Aufrufstellen ohne Anpassung weiter uebersetzen; angebunden wird der
     * echte Zustand dort, wo dieser Bildschirm aufgerufen wird.
     */
    notenZustand: NotenZustand = NotenZustand(),
    beimNotenErneutLaden: () -> Unit = {},
    beimNoteBlattOeffnen: () -> Unit = {},
    beimNoteBlattSchliessen: () -> Unit = {},
    beimNoteAnlegen: (Int, String, String, LocalDate) -> Unit = { _, _, _, _ -> },
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

        stand?.takeIf { it.veraltet }?.let {
            StandZeile(standText(it.zeit, heute, it.ohneVerbindung))
            Spacer(Modifier.height(Abstand.normal))
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

            is Ladung.Da -> Inhalt(
                daten = ladung.wert,
                heute = heute,
                beimHaken = beimHaken,
                notenLadung = notenZustand.noten ?: Ladung.Laedt,
                beimNotenErneutLaden = beimNotenErneutLaden,
                beimNoteBlattOeffnen = beimNoteBlattOeffnen,
            )
        }
    }

    if (notenZustand.blattOffen) {
        NeueNoteBlatt(
            laeuft = notenZustand.blattLaeuft,
            fehler = notenZustand.blattFehler,
            heute = heute,
            beimSchliessen = beimNoteBlattSchliessen,
            beimAnlegen = beimNoteAnlegen,
        )
    }
}

@Composable
private fun Inhalt(
    daten: FachDetailAntwort,
    heute: LocalDate,
    beimHaken: (AssignmentDTO, Boolean) -> Unit,
    notenLadung: Ladung<GradesAntwort>,
    beimNotenErneutLaden: () -> Unit,
    beimNoteBlattOeffnen: () -> Unit,
) {
    val fach = daten.subject
    val farbe = fachfarbeFuerFach(fach.color, fach.name)
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

        item("noten") {
            Abschnitt(
                titel = "Noten",
                aktion = {
                    IconButton(onClick = beimNoteBlattOeffnen, modifier = Modifier.size(Hoehe.bedienelement)) {
                        Icon(
                            IkonePlus,
                            contentDescription = "Note eintragen",
                            tint = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                },
            ) {
                NotenInhalt(notenLadung, beimNotenErneutLaden, beimNoteBlattOeffnen)
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
                            NotizText(notiz.body)
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
    /** Zusaetzliche Kopfzeilen-Aktion, etwa das Pluszeichen im Notenabschnitt. */
    aktion: (@Composable () -> Unit)? = null,
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
                // Als Ueberschrift ausgezeichnet: Talkback kennt eine Geste,
                // die von Ueberschrift zu Ueberschrift springt. Ohne sie muss
                // man sich vom Fachnamen bis zu den Noten durch jede einzelne
                // Stunde und jede Aufgabe wischen.
                modifier = Modifier.semantics { heading() },
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Abstand.klein)) {
                zusatz?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                aktion?.invoke()
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
    // Die Beschriftungsspalte waechst mit der Systemschrift, sonst brach
    // "Lehrkraft" bei doppelter Schrift mitten im Wort auf zwei Zeilen um.
    // FlowRow schiebt den Wert dann unter die Beschriftung, statt ihn zu
    // quetschen; bei normaler Schrift bleibt beides in einer Zeile.
    val spaltenbreite = 88.dp * LocalDensity.current.fontScale
    FlowRow(
        Modifier
            .fillMaxWidth()
            .padding(vertical = Abstand.eng)
            // Beschriftung und Wert sind eine Aussage, kein Paar von zwei
            // Halten: "Raum" allein vorgelesen sagt nichts.
            .clearAndSetSemantics {
                contentDescription = "$beschriftung: ${wert ?: "Nicht hinterlegt"}"
            },
        horizontalArrangement = Arrangement.spacedBy(Abstand.weit),
        verticalArrangement = Arrangement.spacedBy(Abstand.winzig),
    ) {
        Text(
            text = beschriftung,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(spaltenbreite),
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

    val ansage = buildString {
        append(wann).append(", ").append(stunde.startTime)
        stunde.endTime?.let { append(" bis ").append(it) }
        append(" Uhr")
        when {
            entfaellt -> append(", entfällt")
            vertretung -> append(", ").append(stunde.substitutionText ?: "Vertretung")
            else -> stunde.room?.let { append(", Raum ").append(it) }
        }
    }

    // Drei Spalten passen bei doppelter Systemschrift nicht mehr nebeneinander:
    // dort blieb von "Fr., 4. September" ein "Fr., 4. Se…" und vom Raum ein
    // "B2…". FlowRow laesst die Zeile dann umbrechen, statt zu kuerzen.
    FlowRow(
        Modifier
            .fillMaxWidth()
            .padding(vertical = Abstand.eng)
            // Datum, Uhrzeit und Raum gehoeren zu einer Stunde. Einzeln
            // vorgelesen zerfaellt die Zeile in drei Bruchstuecke.
            .clearAndSetSemantics { contentDescription = ansage },
        horizontalArrangement = Arrangement.spacedBy(Abstand.mittel),
        verticalArrangement = Arrangement.spacedBy(Abstand.winzig),
    ) {
        Text(
            text = wann,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            // Feste Breite, damit die Uhrzeiten darunter eine Spalte bilden.
            // 88dp waren zu knapp: "Mo., 7. September" wurde zu "Mo., 7. Septe…",
            // obwohl rechts in der Zeile Platz frei stand. 112dp fasst den
            // laengsten Wochentag mit dem laengsten Monat, und die Spalte
            // waechst mit der Systemschrift mit.
            modifier = Modifier.width(112.dp * LocalDensity.current.fontScale),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = stunde.endTime?.let { "${stunde.startTime}–$it" } ?: stunde.startTime,
            // Tabellenziffern statt Monospace. Beide halten die Uhrzeiten
            // untereinander in einer Flucht, aber Monospace gibt auch dem
            // Doppelpunkt eine volle Ziffernbreite, und "09:40–10:25" fiel
            // dadurch sichtbar auseinander. Ausserdem wechselte hier mitten
            // auf der Seite die Schriftart.
            style = MaterialTheme.typography.bodySmall.merge(Tabellenziffern),
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

/**
 * Der Notenabschnitt: Ladezustand, Leerzustand mit Einstiegsaktion,
 * Fehlerzustand, oder Schnitt plus Einzelnoten. Die Rechnung selbst kommt
 * fertig vom Server (GradeSummaryDTO), diese Datei zeigt sie nur an -- siehe
 * Notenlogik.kt fuer die Portierung der Rechnung, die nur die Tests brauchen.
 */
@Composable
private fun NotenInhalt(
    ladung: Ladung<GradesAntwort>,
    beimErneutLaden: () -> Unit,
    beimNoteBlattOeffnen: () -> Unit,
) {
    when (ladung) {
        is Ladung.Laedt -> NotenSkelett()

        is Ladung.Fehler -> FehlerZustand(ladung.meldung, beimErneutLaden)

        is Ladung.Da -> {
            val daten = ladung.wert
            val schnitt = daten.summary.average
            if (schnitt == null) {
                LeerZustand(
                    titel = "Noch keine Note eingetragen",
                    text = "Trage die erste Note für dieses Fach ein, um einen Schnitt zu sehen.",
                    aktion = {
                        Button(
                            onClick = beimNoteBlattOeffnen,
                            modifier = Modifier.heightIn(min = Hoehe.bedienelement),
                        ) {
                            Text("Note eintragen", style = MaterialTheme.typography.labelLarge)
                        }
                    },
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(Abstand.gross)) {
                    Schnittzeile(daten.summary)
                    Column {
                        daten.grades.forEach { note -> Notenzeile(note) }
                    }
                }
            }
        }
    }
}

/** Skelett fuer den Notenabschnitt: eine grosse Zeile fuer den Schnitt, drei fuer Einzelnoten. */
@Composable
private fun NotenSkelett() {
    Column(verticalArrangement = Arrangement.spacedBy(Abstand.gross)) {
        Platzhalter(Modifier.height(28.dp).width(96.dp))
        Column(verticalArrangement = Arrangement.spacedBy(Abstand.normal)) {
            repeat(3) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Abstand.mittel),
                    modifier = Modifier.height(Hoehe.bedienelement),
                ) {
                    Platzhalter(Modifier.height(20.dp).width(28.dp))
                    Platzhalter(Modifier.height(13.dp).fillMaxWidth(0.5f))
                }
            }
        }
    }
}

/**
 * Der Schnitt oben im Abschnitt: die Punktzahl gross und ruhig als
 * Leitwaehrung, die Note kleiner daneben -- genau wie bei den Einzelnoten
 * darunter, nie umgekehrt.
 */
@Composable
private fun Schnittzeile(summary: GradeSummaryDTO) {
    val schnitt = summary.average ?: return
    Column(verticalArrangement = Arrangement.spacedBy(Abstand.winzig)) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Abstand.klein)) {
            Text(
                text = formatPunkte(schnitt.points),
                style = MaterialTheme.typography.headlineMedium.copy(fontFeatureSettings = "tnum"),
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                text = "Punkte, Note ${schnitt.label}",
                style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        val teile = listOfNotNull(
            summary.oral?.let { "Mündlich ${formatPunkte(it.points)}" },
            summary.written?.let { "Schriftlich ${formatPunkte(it.points)}" },
        )
        if (teile.isNotEmpty()) {
            Text(
                text = teile.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * Eine einzelne Note: die Punktzahl gross als Leitwaehrung, die Note kleiner
 * daneben -- nie umgekehrt, denn die Punkte sind die eigentliche Eingabe.
 */
@Composable
private fun Notenzeile(note: GradeDTO) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = Abstand.eng)
            .clearAndSetSemantics {
                contentDescription = "${note.points} Punkte, Note ${note.grade}, ${note.label}, " +
                    "${notenartBezeichnung(note.kind)}, ${note.date}"
            },
        horizontalArrangement = Arrangement.spacedBy(Abstand.mittel),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = note.points.toString(),
            style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.width(36.dp),
        )
        Text(
            text = note.grade,
            style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(28.dp),
        )
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Abstand.winzig)) {
            Text(
                text = note.label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${notenartBezeichnung(note.kind)} · ${note.date}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun notenartBezeichnung(kind: String): String = if (kind == "oral") "Mündlich" else "Schriftlich"

/** Eine Nachkommastelle mit deutschem Komma, wie formatPoints in lib/grades.ts. */
private fun formatPunkte(punkte: Double): String =
    String.format(Locale.ROOT, "%.1f", punkte).replace(".", ",")

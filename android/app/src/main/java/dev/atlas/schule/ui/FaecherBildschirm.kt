package dev.atlas.schule.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.TextButton
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.atlas.schule.data.SubjectDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.Tabellenziffern
import dev.atlas.schule.ui.theme.druckSkalierung
import dev.atlas.schule.ui.theme.fachfarbeFuerFach

@Composable
fun FaecherBildschirm(
    zustand: AtlasZustand.App,
    beimOeffnen: (String) -> Unit,
    beimErneutLaden: () -> Unit,
    ansichtsmodell: AtlasViewModel? = null,
    modifier: Modifier = Modifier,
) {
    when (val start = zustand.start) {
        is Ladung.Laedt -> Column(modifier.fillMaxSize().padding(Abstand.weit)) {
            Kopf("Fächer", "Wird geladen …")
            ListenSkelett(
                Modifier.padding(top = Abstand.weit),
                // 67dp = 22dp Titel + 2dp Abstand.winzig + 19dp Untertitel +
                // 2×12dp Abstand.mittel, so hoch ist eine geladene Fachzeile
                // mit Lehrer und Raum wirklich. Beim Skelett-Standardwert
                // sprang die Liste beim Eintreffen der Daten nach unten.
                zeilenHoehe = 67.dp,
            )
        }

        is Ladung.Fehler -> MittigerZustand(modifier) {
            FehlerZustand(start.meldung, beimErneutLaden)
        }

        is Ladung.Da -> {
            val faecher = start.wert.faecher
            val uebersicht = ansichtsmodell?.notenUebersicht?.collectAsStateWithLifecycle()?.value
            androidx.compose.runtime.LaunchedEffect(Unit) {
                if (uebersicht?.ladung == null) ansichtsmodell?.ladeNotenUebersicht()
            }
            var fachNeu by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
            LazyColumn(
                modifier = modifier.fillMaxSize(),
                contentPadding = PaddingValues(Abstand.gross),
            ) {
                item("kopf") {
                    Kopf(
                        "Fächer",
                        if (faecher.isEmpty()) "Noch keins eingerichtet."
                        else "${faecher.size} Fächer. Alles an seinem Platz.",
                    )
                    Spacer(Modifier.height(Abstand.gross))
                }

                (uebersicht?.ladung as? Ladung.Da)?.wert?.overall?.let { schnitt ->
                    item("schnitt") {
                        androidx.compose.material3.Card(modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(Abstand.normal)) {
                                Text("Gesamtschnitt", style = MaterialTheme.typography.labelLarge)
                                Text(
                                    "${schnitt.points.toString().replace(".", ",")} Punkte · Note ${schnitt.label}",
                                    style = MaterialTheme.typography.bodyLarge,
                                )
                            }
                        }
                        Spacer(Modifier.height(Abstand.normal))
                    }
                }

                if (ansichtsmodell != null) {
                    item("aktionen") {
                        Row(horizontalArrangement = Arrangement.spacedBy(Abstand.klein)) {
                            Button(onClick = { fachNeu = true }, shape = MaterialTheme.shapes.small) { Icon(IkonePlus, null, Modifier.size(16.dp)); Spacer(Modifier.size(8.dp)); Text("Fach anlegen") }
                            TextButton(onClick = { ansichtsmodell.faecherReconcile() }, shape = MaterialTheme.shapes.small) { Text("Abgleichen") }
                        }
                        Spacer(Modifier.height(Abstand.normal))
                    }
                }

                if (faecher.isEmpty()) {
                    item("leer") {
                        LeerZustand(
                            titel = "Noch kein Fach eingerichtet",
                            text = "Lege ein Fach an oder übernimm deine Fächer aus Untis.",
                        )
                    }
                }

                items(faecher, key = { it.id }) { fach ->
                    Fachzeile(fach) { beimOeffnen(fach.id) }
                }
            }
            if (fachNeu && ansichtsmodell != null) {
                FachBlatt(
                    bestehend = null,
                    beimSchliessen = { fachNeu = false },
                    beimAnlegen = { name, lehrer, raum, farbe ->
                        ansichtsmodell.fachAnlegen(name, lehrer, raum, farbe)
                        fachNeu = false
                    },
                )
            }
        }
    }
}

@Composable
private fun Fachzeile(fach: SubjectDTO, beimTippen: () -> Unit) {
    val farbe = fachfarbeFuerFach(fach.color, fach.name)
    val untertitel = listOfNotNull(fach.teacherLabel ?: fach.teacher, fach.room).joinToString(" · ")
    val offen = fach.openAssignments
    val beruehrung = remember { MutableInteractionSource() }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 10.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
            .drawBehind { drawRect(farbe, size = Size(3.dp.toPx(), size.height)) }
            .druckSkalierung(beruehrung)
            .clickable(interactionSource = beruehrung, indication = ripple(), onClick = beimTippen)
            .heightIn(min = Hoehe.bedienelement)
            .padding(horizontal = 18.dp, vertical = 16.dp)
            .semantics {
                contentDescription = buildString {
                    append(fach.name)
                    if (untertitel.isNotEmpty()) append(", ").append(untertitel)
                    append(
                        when (offen) {
                            0 -> ", keine offene Aufgabe"
                            1 -> ", eine offene Aufgabe"
                            else -> ", $offen offene Aufgaben"
                        },
                    )
                }
            },
        horizontalArrangement = Arrangement.spacedBy(Abstand.mittel),
        verticalAlignment = Alignment.CenterVertically,
    ) {

        Column(
            // Die Zeile sagt oben schon alles am Stueck. Ohne das Leeren
            // haelt Talkback hier ein zweites und drittes Mal an und liest
            // den Fachnamen und die Zahl noch einmal einzeln.
            Modifier.weight(1f).clearAndSetSemantics { },
            verticalArrangement = Arrangement.spacedBy(Abstand.winzig),
        ) {
            Text(
                text = fach.name,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (untertitel.isNotEmpty()) {
                Text(
                    text = untertitel,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

        }

        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(IkoneWeiter, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                text = if (offen > 0) "$offen offen" else "${fach.noteCount} ${if (fach.noteCount == 1) "Notiz" else "Notizen"}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

package dev.atlas.schule.ui

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
                contentPadding = PaddingValues(Abstand.weit),
            ) {
                item("kopf") {
                    Kopf(
                        "Fächer",
                        if (faecher.isEmpty()) "Noch keins eingerichtet."
                        else "${faecher.size} aktiv, mit Notizen und Aufgaben.",
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
                            androidx.compose.material3.OutlinedButton(onClick = { fachNeu = true }) { Text("Fach anlegen") }
                            androidx.compose.material3.OutlinedButton(onClick = { ansichtsmodell.faecherReconcile() }) { Text("Abgleichen") }
                        }
                        Spacer(Modifier.height(Abstand.normal))
                    }
                }

                if (faecher.isEmpty()) {
                    item("leer") {
                        LeerZustand(
                            titel = "Noch kein Fach eingerichtet",
                            text = "Lege unten ein Fach an oder gleiche mit Untis ab (Einstellungen).",
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
            .clip(MaterialTheme.shapes.medium)
            .druckSkalierung(beruehrung)
            .clickable(interactionSource = beruehrung, indication = ripple(), onClick = beimTippen)
            .heightIn(min = Hoehe.bedienelement)
            .padding(horizontal = Abstand.normal, vertical = Abstand.mittel)
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
        Spacer(Modifier.size(10.dp).clip(CircleShape).background(farbe))

        Column(
            // Die Zeile sagt oben schon alles am Stueck. Ohne das Leeren
            // haelt Talkback hier ein zweites und drittes Mal an und liest
            // den Fachnamen und die Zahl noch einmal einzeln.
            Modifier.weight(1f).clearAndSetSemantics { },
            verticalArrangement = Arrangement.spacedBy(Abstand.winzig),
        ) {
            Text(
                text = fach.name,
                style = MaterialTheme.typography.bodyMedium,
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

        // Eine Null gaebe es an jeder zweiten Zeile zu lesen, ohne etwas zu
        // sagen. Nur was offen ist, verdient Aufmerksamkeit.
        if (offen > 0) {
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = Abstand.normal, vertical = Abstand.winzig)
                    .clearAndSetSemantics { },
            ) {
                Text(
                    text = "$offen",
                    style = MaterialTheme.typography.bodySmall.merge(Tabellenziffern),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

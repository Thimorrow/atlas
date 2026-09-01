package dev.atlas.schule.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.SubjectDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.fachfarbe

@Composable
fun FaecherBildschirm(
    zustand: AtlasZustand.App,
    beimOeffnen: (String) -> Unit,
    beimErneutLaden: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (val start = zustand.start) {
        is Ladung.Laedt -> Column(modifier.fillMaxSize().padding(Abstand.weit)) {
            Kopf("Fächer", "Wird geladen …")
            ListenSkelett(Modifier.padding(top = Abstand.weit))
        }

        is Ladung.Fehler -> MittigerZustand(modifier) {
            FehlerZustand(start.meldung, beimErneutLaden)
        }

        is Ladung.Da -> {
            val faecher = start.wert.faecher
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

                if (faecher.isEmpty()) {
                    item("leer") {
                        LeerZustand(
                            titel = "Noch kein Fach eingerichtet",
                            text = "Die Ersteinrichtung läuft im Browser: dort schlägt Atlas " +
                                "die Fächer aus deinem Untis-Stundenplan vor.",
                        )
                    }
                }

                items(faecher, key = { it.id }) { fach ->
                    Fachzeile(fach) { beimOeffnen(fach.id) }
                }
            }
        }
    }
}

@Composable
private fun Fachzeile(fach: SubjectDTO, beimTippen: () -> Unit) {
    val farbe = fachfarbe(fach.color)
    val untertitel = listOfNotNull(fach.teacher, fach.room).joinToString(" · ")
    val offen = fach.openAssignments

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = beimTippen)
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
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Icon(
            imageVector = IkoneWeiter,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(16.dp),
        )
    }
}

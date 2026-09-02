package dev.atlas.schule.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.AssignmentDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Dauer
import dev.atlas.schule.ui.theme.Tabellenziffern
import dev.atlas.schule.ui.theme.atlasTween
import dev.atlas.schule.ui.theme.fachfarbe
import java.time.LocalDate

@Composable
fun AufgabenBildschirm(
    zustand: AtlasZustand.App,
    beimHaken: (AssignmentDTO, Boolean) -> Unit,
    beimErneutLaden: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (val start = zustand.start) {
        is Ladung.Laedt -> Column(modifier.fillMaxSize().padding(Abstand.weit)) {
            Kopf("Aufgaben", "Wird geladen …")
            ListenSkelett(Modifier.padding(top = Abstand.weit))
        }

        is Ladung.Fehler -> MittigerZustand(modifier) {
            FehlerZustand(start.meldung, beimErneutLaden)
        }

        is Ladung.Da -> {
            val bloecke = gruppiereAufgaben(start.wert.aufgaben, zustand.heute)
            val offen = start.wert.aufgaben.count { it.completedAt == null }

            LazyColumn(
                modifier = modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = Abstand.weit,
                    end = Abstand.weit,
                    top = Abstand.weit,
                    // Platz fuer den Knopf, der ueber der Liste schwebt.
                    bottom = 88.dp,
                ),
            ) {
                item("kopf") {
                    Kopf(
                        "Aufgaben",
                        if (offen == 0) "Nichts offen." else "$offen offen über alle Fächer.",
                    )
                    Spacer(Modifier.height(Abstand.gross))
                }

                if (bloecke.isEmpty()) {
                    item("leer") {
                        LeerZustand(
                            titel = "Keine offene Aufgabe",
                            text = "Alles abgehakt. Eine neue legst du unten rechts an.",
                        )
                    }
                }

                bloecke.forEach { block ->
                    item(block.gruppe.schluessel) {
                        Gruppentitel(
                            block.gruppe.bezeichnung,
                            block.eintraege.size,
                            // Überfällig ist der einzige Zustand, der eine
                            // Handlung erzwingt, und damit der einzige, der
                            // Farbe verdient.
                            hervorgehoben = block.gruppe == Aufgabengruppe.UEBERFAELLIG,
                        )
                    }
                    items(block.eintraege, key = { it.id }) { aufgabe ->
                        Aufgabenzeile(
                            aufgabe = aufgabe,
                            heute = zustand.heute,
                            gruppe = block.gruppe,
                            zeigeFach = true,
                            beimHaken = { beimHaken(aufgabe, true) },
                        )
                    }
                    item("${block.gruppe.schluessel}-luft") {
                        Spacer(Modifier.height(Abstand.gross))
                    }
                }
            }
        }
    }
}

@Composable
fun Kopf(titel: String, unterzeile: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Abstand.winzig)) {
        Text(
            text = titel,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            text = unterzeile,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Gruppentitel(bezeichnung: String, anzahl: Int, hervorgehoben: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = Abstand.klein, bottom = Abstand.normal),
        horizontalArrangement = Arrangement.spacedBy(Abstand.eng),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = bezeichnung,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = if (hervorgehoben) MaterialTheme.colorScheme.error
            else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "$anzahl",
            style = MaterialTheme.typography.bodySmall.merge(Tabellenziffern),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

/**
 * Eine Aufgabenzeile. Wird auch im Fachdetail benutzt, dort ohne den Fachnamen,
 * weil das Fach da schon ueber der Liste steht.
 */
@Composable
fun Aufgabenzeile(
    aufgabe: AssignmentDTO,
    heute: LocalDate,
    gruppe: Aufgabengruppe,
    zeigeFach: Boolean,
    beimHaken: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val farbe = fachfarbe(aufgabe.subjectColor)
    val pruefung = istPruefung(aufgabe.type)

    val datumsLabel = when (gruppe) {
        // Im Ueberfaellig-Block sagt "Di., 3. Juni" wenig; "seit gestern" sagt alles.
        Aufgabengruppe.UEBERFAELLIG -> aufgabe.dueDate?.let { ueberfaelligLabel(it, heute) }
        Aufgabengruppe.HEUTE, Aufgabengruppe.MORGEN -> null
        else -> faelligLabel(aufgabe.dueDate, heute)
    }
    val zusatz = listOfNotNull(
        if (zeigeFach) (aufgabe.subjectName ?: "Allgemein") else null,
        aufgabentypBezeichnung(aufgabe.type).takeIf { aufgabe.type != "homework" },
        datumsLabel,
    ).joinToString(" · ")

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = Abstand.normal),
        horizontalArrangement = Arrangement.spacedBy(Abstand.mittel),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Hakenfeld(
            farbe = farbe,
            ring = pruefung,
            erledigt = aufgabe.completedAt != null,
            ansage = "„${aufgabe.title}“ abhaken",
            beimTippen = beimHaken,
        )
        Column(
            // Titel und Zusatz sind ein Gedanke, kein Paar. Ohne das
            // Zusammenfassen haelt Talkback zweimal an und liest erst
            // "Vokabeln", dann "Biologie". clearAndSetSemantics fasst die
            // beiden zu einem Halt zusammen, so wie es die Fachzeile und der
            // Stundenblock schon tun.
            Modifier.weight(1f).clearAndSetSemantics {
                contentDescription = listOf(aufgabe.title, zusatz)
                    .filter { it.isNotEmpty() }
                    .joinToString(", ")
            },
            verticalArrangement = Arrangement.spacedBy(Abstand.winzig),
        ) {
            Text(
                text = aufgabe.title,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (zusatz.isNotEmpty()) {
                Text(
                    text = zusatz,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (gruppe == Aufgabengruppe.UEBERFAELLIG) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * Der Haken. Aussen 48dp Tippziel, innen ein 22dp-Kreis in der Fachfarbe;
 * Pruefungen tragen einen Ring statt einer Fuellung, genau wie im Stundenplan
 * der Web-App.
 */
@Composable
private fun Hakenfeld(
    farbe: Color,
    ring: Boolean,
    erledigt: Boolean,
    ansage: String,
    beimTippen: () -> Unit,
) {
    val beruehrung = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .size(dev.atlas.schule.ui.theme.Hoehe.bedienelement)
            .clip(CircleShape)
            // toggleable statt clickable: nur so meldet der Knoten neben der
            // Rolle auch den Zustand, und Talkback sagt "nicht angehakt"
            // statt nur den Namen.
            .toggleable(
                value = erledigt,
                interactionSource = beruehrung,
                indication = androidx.compose.material3.ripple(bounded = false),
                role = Role.Checkbox,
                onValueChange = { beimTippen() },
            )
            .semantics { contentDescription = ansage },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(22.dp)
                .clip(CircleShape)
                .background(if (ring) Color.Transparent else farbe.copy(alpha = 0.22f))
                .border(if (ring) 2.dp else 1.dp, farbe.copy(alpha = if (ring) 0.9f else 0.5f), CircleShape),
        )
    }
}

/**
 * Der schwebende Knopf fuer die einzige primaere Handlung dieses Bildschirms.
 * Er verschwindet nicht beim Scrollen: die Liste kann lang werden, und ein
 * Knopf am Listenende faende niemand.
 */
@Composable
fun NeueAufgabeKnopf(sichtbar: Boolean, beimTippen: () -> Unit, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = sichtbar,
        modifier = modifier,
        enter = fadeIn(atlasTween(Dauer.NORMAL)) + scaleIn(atlasTween(Dauer.NORMAL), initialScale = 0.85f),
        exit = fadeOut(atlasTween(Dauer.SCHNELL)) + scaleOut(atlasTween(Dauer.SCHNELL), targetScale = 0.85f),
    ) {
        androidx.compose.material3.FloatingActionButton(
            onClick = beimTippen,
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        ) {
            Icon(IkonePlus, contentDescription = "Neue Aufgabe anlegen")
        }
    }
}

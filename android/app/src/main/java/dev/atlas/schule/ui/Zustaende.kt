package dev.atlas.schule.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.AtlasEasing
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.LocalBewegungReduziert
import dev.atlas.schule.ui.theme.Tabellenziffern
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

// Jeder Bildschirm hat dieselben drei ehrlichen Zustaende. Sie liegen hier
// zusammen, damit "laedt" auf allen drei Bildschirmen gleich aussieht und
// niemand versehentlich einen vierten erfindet.

/**
 * Was aus dem Netz kommt, kann drei Formen haben. Ein blosses "null heisst
 * laedt" verwechselt einen leeren Erfolg mit einem laufenden Abruf, und genau
 * daraus wird ein Kreisel, der sich ewig dreht.
 */
sealed interface Ladung<out T> {
    data object Laedt : Ladung<Nothing>
    data class Da<T>(val wert: T) : Ladung<T>
    data class Fehler(val meldung: String) : Ladung<Nothing>
}

/**
 * Pulsierende Platzhalterflaeche. Ein Skelett haelt die Form der Seite,
 * waehrend ein Kreisel sie zusammenfallen laesst und beim Eintreffen der Daten
 * einen Sprung erzeugt.
 */
@Composable
fun Platzhalter(modifier: Modifier = Modifier, form: RoundedCornerShape = RoundedCornerShape(6.dp)) {
    val reduziert = LocalBewegungReduziert.current
    val deckkraft = if (reduziert) {
        // Bei abgeschalteter Systemanimation laeuft gar keine Schleife mehr.
        // Ein Puls von 1f nach 1f waere unsichtbar, aber wecken wuerde er das
        // Geraet trotzdem jeden Frame.
        1f
    } else {
        val puls = rememberInfiniteTransition(label = "platzhalter")
        val wert by puls.animateFloat(
            initialValue = 1f,
            targetValue = 0.45f,
            animationSpec = infiniteRepeatable(
                animation = tween(900, easing = AtlasEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "puls",
        )
        wert
    }
    Spacer(
        modifier
            .clip(form)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = deckkraft)),
    )
}

/**
 * Skelett fuer eine gruppierte Liste: zwei Gruppen, drei und zwei Zeilen.
 *
 * [zeilenHoehe] ist die Hoehe einer echten Zeile in der jeweiligen Liste. Der
 * Vorgabewert entspricht der Aufgabenzeile (48dp Hakenfeld plus 2×8dp
 * Abstand.normal). Ohne diesen Abgleich fiel die Liste beim Eintreffen der
 * Daten sichtbar zusammen, weil das Skelett schmaler war als die echte Zeile.
 */
@Composable
fun ListenSkelett(
    modifier: Modifier = Modifier,
    zeilenHoehe: Dp = Hoehe.bedienelement + Abstand.normal * 2,
) {
    Column(
        // Das Skelett hat keine Bedeutung, es hat nur eine Form. Vorgelesen
        // waere es eine Reihe namenloser Kaesten.
        modifier = modifier.fillMaxWidth().clearAndSetSemantics { },
        verticalArrangement = Arrangement.spacedBy(Abstand.gross),
    ) {
        listOf(3, 2).forEach { zeilen ->
            Column(verticalArrangement = Arrangement.spacedBy(Abstand.normal)) {
                Platzhalter(Modifier.padding(start = Abstand.klein).height(11.dp).width(72.dp))
                repeat(zeilen) { i ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Abstand.mittel),
                        modifier = Modifier.height(zeilenHoehe),
                    ) {
                        Platzhalter(Modifier.size(22.dp), CircleShape)
                        Column(
                            verticalArrangement = Arrangement.spacedBy(Abstand.eng),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Platzhalter(Modifier.height(13.dp).fillMaxWidth(0.62f - i * 0.09f))
                            Platzhalter(Modifier.height(11.dp).width(96.dp))
                        }
                    }
                }
            }
        }
    }
}

/**
 * Leerer Zustand: sagt, warum nichts da ist, und was als Naechstes zu tun ist.
 * "Keine Eintraege" allein laesst den Nutzer stehen.
 */
@Composable
fun LeerZustand(
    titel: String,
    text: String,
    modifier: Modifier = Modifier,
    aktion: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = Abstand.sehrGross),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Abstand.normal),
    ) {
        Text(
            text = titel,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        aktion?.let {
            Spacer(Modifier.height(Abstand.klein))
            it()
        }
    }
}

/**
 * Fehlerzustand. Drei Signale statt nur Farbe: Zeichen, Satz und ein Weg
 * heraus. Die Meldung kommt fertig aus der Netzwerkschicht, sie ist immer ein
 * deutscher Satz.
 */
@Composable
fun FehlerZustand(
    meldung: String,
    beimErneutVersuchen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = Abstand.sehrGross),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Abstand.mittel),
    ) {
        Icon(
            imageVector = IkoneFehler,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(22.dp),
        )
        Text(
            text = meldung,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        OutlinedButton(
            onClick = beimErneutVersuchen,
            // Waechst mit der Systemschrift, statt die Beschriftung in feste
            // 48dp zu zwingen.
            modifier = Modifier.heightIn(min = Hoehe.bedienelement),
        ) {
            Text("Erneut laden", style = MaterialTheme.typography.labelLarge)
        }
    }
}

/** Fehler und Leere fuellen den ganzen Bildschirm, wenn sonst nichts da ist. */
@Composable
fun MittigerZustand(modifier: Modifier = Modifier, inhalt: @Composable () -> Unit) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = Abstand.gross),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { inhalt() }
}

/**
 * "Stand von 14:32 Uhr" bzw. mit Datum, wenn der Stand nicht von heute ist,
 * dazu der Grund. Die Uhrzeit steht in der Zeitzone des Geraets, nicht in UTC.
 *
 * Der Grund wird mitgefuehrt, statt immer "keine Verbindung" zu behaupten: bei
 * einem 500 oder einer unlesbaren Antwort war der Server ja erreichbar, und wer
 * dann nach seinem Empfang sucht, sucht an der falschen Stelle.
 */
fun standText(zeit: Instant, heute: LocalDate, ohneVerbindung: Boolean): String {
    val lokal = LocalDateTime.ofInstant(zeit, ZoneId.systemDefault())
    val uhr = "%02d:%02d".format(lokal.hour, lokal.minute)
    val grund = if (ohneVerbindung) "keine Verbindung" else "der Server antwortet gerade nicht"
    // Geschuetztes Leerzeichen vor "Uhr": eine Uhrzeit und ihre Einheit sollen
    // nie an unterschiedlichen Zeilenenden landen.
    return if (lokal.toLocalDate() == heute) {
        "Stand von $uhr Uhr, $grund"
    } else {
        "Stand vom ${lokal.dayOfMonth}.${lokal.monthValue}., $uhr Uhr, $grund"
    }
}

/**
 * Die ruhige Zeile ueber veralteten Daten. Sie ersetzt keinen Fehlerbildschirm,
 * sie erklaert nur, warum der Inhalt aelter sein koennte als erwartet. Deshalb
 * kein Rot und kein Zeichen, das nach Stoerung aussieht.
 */
@Composable
fun StandZeile(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall.merge(Tabellenziffern),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(vertical = Abstand.eng, horizontal = Abstand.weit),
    )
}

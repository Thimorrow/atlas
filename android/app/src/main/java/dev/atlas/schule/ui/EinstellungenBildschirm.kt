package dev.atlas.schule.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.AtlasApi
import dev.atlas.schule.data.AtlasErgebnis
import dev.atlas.schule.data.Erscheinungsbild
import dev.atlas.schule.data.MicrosoftStatusAntwort
import dev.atlas.schule.data.SyncUntisAntwort
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Dauer
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.LocalErscheinungsbild
import dev.atlas.schule.ui.theme.LocalErscheinungsbildSetzen
import dev.atlas.schule.ui.theme.Tabellenziffern
import dev.atlas.schule.ui.theme.atlasTween
import java.time.LocalDate
import kotlinx.coroutines.launch

/**
 * Der vierte Reiter. Orientiert an app/settings/page.tsx: dieselbe
 * Reihenfolge und Wortwahl der Abschnitte (Profil, Erscheinungsbild,
 * Stundenplan, OneNote, Konto), als native Oberflaeche statt Webseite.
 *
 * [beimSyncErfolgreich] laedt den Stundenplan im Rest der App neu, damit der
 * Nutzer nach einem Abgleich nicht selbst neu starten muss.
 */
@Composable
fun EinstellungenBildschirm(
    beimSyncErfolgreich: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val api = remember { AtlasApi.fuer(context) }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(Abstand.weit),
        verticalArrangement = Arrangement.spacedBy(Abstand.gross),
    ) {
        item("kopf") {
            Kopf("Einstellungen", "Profil, Erscheinungsbild und Datenquellen von Atlas.")
        }
        item("profil") { ProfilAbschnitt() }
        item("erscheinungsbild") { ErscheinungsbildAbschnitt() }
        item("stundenplan") { StundenplanAbschnitt(api, beimSyncErfolgreich) }
        item("onenote") { OneNoteAbschnitt(api) }
        item("konto") { KontoAbschnitt() }
        item("fuss") {
            Text(
                text = "Atlas · Dein Alltag an einem Ort.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = Abstand.klein),
            )
        }
    }
}

/**
 * Rahmen fuer einen Abschnitt: Zeichen, Titel und Erklaersatz oben, Inhalt
 * darunter. Entspricht der Section()-Komponente im Web.
 */
@Composable
private fun Abschnitt(
    ikone: ImageVector,
    titel: String,
    beschreibung: String,
    inhalt: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)
            .background(MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                .padding(horizontal = Abstand.weit, vertical = Abstand.mittel),
            horizontalArrangement = Arrangement.spacedBy(Abstand.mittel),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(MaterialTheme.shapes.small)
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.small)
                    .background(MaterialTheme.colorScheme.background),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = ikone,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
            }
            Column {
                Text(
                    text = titel,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onBackground,
                    // Als Ueberschrift ausgezeichnet: Talkback springt damit
                    // von Abschnitt zu Abschnitt, statt sich durch alle drei
                    // Erscheinungsbild-Kacheln zum Untis-Abgleich wischen zu
                    // muessen.
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = beschreibung,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Abstand.winzig),
                )
            }
        }
        Column(Modifier.padding(Abstand.weit)) { inhalt() }
    }
}

// --- Profil ------------------------------------------------------------

/**
 * Reine Anzeige, nichts Bearbeitbares -- genau wie im Web bewusst kein
 * Platzhalter-Knopf, der nie einloest.
 */
@Composable
private fun ProfilAbschnitt() {
    Abschnitt(IkonePerson, "Profil", "Deine Kontodaten.") {
        Row(
            horizontalArrangement = Arrangement.spacedBy(Abstand.weit),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "TZ",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column {
                Text(
                    text = "Thimofej",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    text = "Schüler",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "thimofej@yesterday-ai.de",
                    style = MaterialTheme.typography.bodySmall.merge(Tabellenziffern),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// --- Erscheinungsbild ----------------------------------------------------

private data class ThemeKachel(val wert: Erscheinungsbild, val bezeichnung: String, val ikone: ImageVector)

private val THEME_KACHELN = listOf(
    ThemeKachel(Erscheinungsbild.HELL, "Hell", IkoneHell),
    ThemeKachel(Erscheinungsbild.DUNKEL, "Dunkel", IkoneDunkel),
    ThemeKachel(Erscheinungsbild.SYSTEM, "System", IkoneSystem),
)

@Composable
private fun ErscheinungsbildAbschnitt() {
    val gewaehlt = LocalErscheinungsbild.current
    val setzen = LocalErscheinungsbildSetzen.current

    Abschnitt(IkonePalette, "Erscheinungsbild", "Hell, dunkel oder dem System folgen.") {
        Row(horizontalArrangement = Arrangement.spacedBy(Abstand.mittel)) {
            THEME_KACHELN.forEach { kachel ->
                ThemeKachelAnsicht(
                    kachel = kachel,
                    ausgewaehlt = gewaehlt == kachel.wert,
                    beimTippen = { setzen(kachel.wert) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun ThemeKachelAnsicht(
    kachel: ThemeKachel,
    ausgewaehlt: Boolean,
    beimTippen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val beruehrung = remember { MutableInteractionSource() }
    val rahmenFarbe = if (ausgewaehlt) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.outlineVariant
    }
    Column(
        modifier = modifier
            .clip(MaterialTheme.shapes.small)
            .border(
                width = if (ausgewaehlt) 2.dp else 1.dp,
                color = rahmenFarbe,
                shape = MaterialTheme.shapes.small,
            )
            .clickable(interactionSource = beruehrung, indication = null, onClick = beimTippen)
            .padding(vertical = Abstand.mittel, horizontal = Abstand.normal),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Abstand.normal),
    ) {
        Icon(
            imageVector = kachel.ikone,
            contentDescription = null,
            tint = if (ausgewaehlt) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(22.dp),
        )
        Text(
            text = kachel.bezeichnung,
            style = MaterialTheme.typography.labelMedium,
            color = if (ausgewaehlt) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// --- Stundenplan / Untis-Abgleich -----------------------------------------

private sealed interface SyncAnzeige {
    data class Erfolg(val antwort: SyncUntisAntwort) : SyncAnzeige
    data class Fehler(val meldung: String, val ohneVerbindung: Boolean) : SyncAnzeige
}

/**
 * Uebersetzt die technischen WebUntis-/Netzwerkmeldungen in einen Satz, den
 * ein Schueler versteht. Entspricht friendlySyncMessage() aus
 * app/settings/page.tsx, hier eins zu eins uebernommen.
 *
 * Bewusst KEINE feste Meldung fuer einzelne Untis-Codes (etwa -8507, -8509,
 * -7004): das stimmt nur in einem der Faelle, und sobald Untis wieder laeuft,
 * fuehrt eine feste Meldung bei jedem anderen Problem in die Irre. Solche
 * Codes landen deshalb im letzten, allgemeinen Satz -- siehe SyncUebersetzungTest.
 */
internal fun friendlySyncMessage(meldung: String, ohneVerbindung: Boolean): String {
    if (ohneVerbindung) {
        return "Keine Verbindung zum Server. Prüf dein WLAN und versuch es dann noch einmal."
    }
    val e = meldung.lowercase()
    if (Regex("401|403|auth|credential|login|passwor|anmeld").containsMatchIn(e)) {
        return "WebUntis hat die Zugangsdaten abgelehnt. Server, Schule, Benutzer oder Passwort stimmen nicht."
    }
    if (Regex("econnrefused|etimedout|enotfound|fetch failed|timeout|502|503|504|unreachable").containsMatchIn(e)) {
        return "WebUntis antwortet nicht. Oft liegt das an der Schule, etwa weil der Dienst dort gerade " +
            "abgeschaltet ist. Versuch es später erneut."
    }
    return "Der Abgleich hat nicht geklappt. Versuch es später erneut."
}

private fun tag(datum: LocalDate): String = "%02d.%02d.".format(datum.dayOfMonth, datum.monthValue)

@Composable
private fun StundenplanAbschnitt(api: AtlasApi, beimSyncErfolgreich: () -> Unit) {
    var laeuft by remember { mutableStateOf(false) }
    var ergebnis by remember { mutableStateOf<SyncAnzeige?>(null) }
    val bereich = rememberCoroutineScope()

    Abschnitt(
        IkoneStundenplan,
        "Stundenplan",
        "WebUntis-Stunden in deinen Stundenplan importieren.",
    ) {
        // Untereinander, nicht nebeneinander wie im Web: dort ist der Text
        // breit genug fuer zwei Zeilen, hier blieben ihm neben dem Knopf noch
        // etwa 45 Prozent der Breite, und er brach in vier schmale Zeilen um.
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "Lädt deine Stunden von letzter Woche bis in drei Wochen und hält sie aktuell.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(Abstand.normal))
            OutlinedButton(
                enabled = !laeuft,
                onClick = {
                    laeuft = true
                    ergebnis = null
                    bereich.launch {
                        when (val antwort = api.syncUntis()) {
                            is AtlasErgebnis.Erfolg -> {
                                ergebnis = SyncAnzeige.Erfolg(antwort.wert)
                                beimSyncErfolgreich()
                            }
                            is AtlasErgebnis.Fehler -> {
                                ergebnis = SyncAnzeige.Fehler(antwort.meldung, antwort.ohneVerbindung)
                            }
                        }
                        laeuft = false
                    }
                },
                modifier = Modifier.heightIn(min = Hoehe.bedienelement),
            ) {
                if (laeuft) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(14.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(Abstand.eng))
                } else {
                    Icon(IkoneAbgleich, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(Abstand.eng))
                }
                // Beide Beschriftungen liegen uebereinander in derselben Box --
                // die unsichtbare, laengere reserviert die Breite, damit der
                // Knopf beim Wechsel "Jetzt synchronisieren" <->
                // "Synchronisiere…" nicht springt. Compose-Gegenstueck zum
                // CSS-Grid-Trick der Web-App.
                Box {
                    Text(
                        text = "Jetzt synchronisieren",
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.alpha(0f),
                    )
                    Text(
                        text = if (laeuft) "Synchronisiere…" else "Jetzt synchronisieren",
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        }

        AnimatedVisibility(
            visible = ergebnis != null,
            enter = fadeIn(atlasTween(Dauer.SCHNELL)) + expandVertically(atlasTween(Dauer.SCHNELL)),
            exit = fadeOut(atlasTween(Dauer.SCHNELL)) + shrinkVertically(atlasTween(Dauer.SCHNELL)),
        ) {
            when (val stand = ergebnis) {
                is SyncAnzeige.Erfolg -> SyncMeldung(erfolg = true) {
                    Text(
                        buildString {
                            append("${stand.antwort.fetched} Stunden geladen, ${stand.antwort.upserted} aktualisiert.")
                        },
                        style = MaterialTheme.typography.bodySmall.merge(Tabellenziffern),
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        "Zeitraum ${tag(stand.antwort.window.start)} – ${tag(stand.antwort.window.end)}",
                        style = MaterialTheme.typography.bodySmall.merge(Tabellenziffern),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                is SyncAnzeige.Fehler -> SyncMeldung(erfolg = false) {
                    Text(
                        friendlySyncMessage(stand.meldung, stand.ohneVerbindung),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        "Technisches Detail: ${stand.meldung}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = Abstand.winzig),
                    )
                }
                null -> {}
            }
        }
    }
}

@Composable
private fun SyncMeldung(erfolg: Boolean, inhalt: @Composable ColumnScope.() -> Unit) {
    val farbe = if (erfolg) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.error
    Column(
        modifier = Modifier
            .padding(top = Abstand.mittel)
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, farbe.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
            .background(farbe.copy(alpha = 0.08f))
            .padding(Abstand.mittel)
            // liveRegion, damit ein Screenreader das Ergebnis des Abgleichs
            // vorliest, sobald es da ist. Ohne das erschiene die Meldung
            // stumm, und wer den Knopf nicht sehen kann, erfuehre nie, ob der
            // Abgleich geklappt hat. Die Web-App setzt dafuer role="status"
            // mit aria-live, siehe app/settings/page.tsx.
            .semantics { liveRegion = LiveRegionMode.Polite },
        content = inhalt,
    )
}

// --- OneNote --------------------------------------------------------------

@Composable
private fun OneNoteAbschnitt(api: AtlasApi) {
    var stand by remember { mutableStateOf<Ladung<MicrosoftStatusAntwort>>(Ladung.Laedt) }

    LaunchedEffect(Unit) {
        stand = when (val ergebnis = api.microsoftStatus()) {
            is AtlasErgebnis.Erfolg -> Ladung.Da(ergebnis.wert)
            is AtlasErgebnis.Fehler -> Ladung.Fehler(ergebnis.meldung)
        }
    }

    Abschnitt(IkoneNotizen, "OneNote", "Fach-Notizen als Seite in dein OneNote schicken.") {
        when (val jetzt = stand) {
            is Ladung.Laedt -> Text(
                "Wird geladen …",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            is Ladung.Fehler -> Text(
                jetzt.meldung,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            is Ladung.Da -> {
                val antwort = jetzt.wert
                // enabled=false ist der Normalfall, solange keine
                // Azure-Registrierung hinterlegt ist -- kein Fehler, also
                // ruhiger Text statt einer roten Meldung. Kein Anmeldeknopf,
                // der ins Leere fuehrt.
                val text = when {
                    !antwort.enabled ->
                        "Die Verbindung zu OneNote ist noch nicht eingerichtet. Sobald eine Microsoft-" +
                            "Registrierung hinterlegt ist, taucht hier eine Anmeldung auf."
                    antwort.connected ->
                        "Verbunden als ${antwort.account?.email ?: antwort.account?.displayName ?: "unbekannt"}."
                    else -> "Eingerichtet, aber noch nicht mit einem Microsoft-Konto verbunden."
                }
                Text(
                    text,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// --- Konto -----------------------------------------------------------------

@Composable
private fun KontoAbschnitt() {
    Abschnitt(IkoneKonto, "Konto", "Ein Nutzer, keine Anmeldung nötig.") {
        Text(
            text = "Atlas läuft aktuell für ein einzelnes Konto ohne Login. Abmelden gibt es, sobald " +
                "mehrere Nutzer unterstützt werden.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

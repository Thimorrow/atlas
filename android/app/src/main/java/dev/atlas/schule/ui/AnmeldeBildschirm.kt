package dev.atlas.schule.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Dauer
import dev.atlas.schule.ui.theme.Hoehe
import dev.atlas.schule.ui.theme.atlasTween

/**
 * Die Schwelle vor der App, so karg wie im Web: ein Feld, ein Knopf. Sie ist
 * kein Konto-Login, sondern haelt Fremde von der oeffentlich erreichbaren
 * Bereitstellung fern.
 */
@Composable
fun AnmeldeBildschirm(
    zustand: AtlasZustand.Anmeldung,
    beimAnmelden: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // rememberSaveable haelt die Eingabe ueber eine Drehung, ohne sie je auf
    // die Platte zu schreiben. Das Passwort verlaesst den Prozess nirgends.
    var passwort by rememberSaveable { mutableStateOf("") }
    val feldFokus = remember { FocusRequester() }
    val tastatur = LocalSoftwareKeyboardController.current
    val bereit = passwort.isNotBlank() && !zustand.laeuft

    // Wie autoFocus im Web: der Bildschirm hat genau ein Feld, es gibt nichts
    // anderes, was den Fokus sinnvoll haben koennte.
    LaunchedEffect(Unit) { feldFokus.requestFocus() }

    fun absenden() {
        if (!bereit) return
        tastatur?.hide()
        beimAnmelden(passwort)
        // Nach dem Absenden leeren, wie im Web nach einem Fehlversuch. Ein
        // stehengebliebenes falsches Passwort laedt nur zum blinden Nochmal ein.
        passwort = ""
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            // Ohne imePadding schiebt die Tastatur den Knopf unter den Rand.
            .imePadding()
            .padding(horizontal = Abstand.gross),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            // Gleiche Breitenbegrenzung wie max-w-xs im Web. Ein Formular ueber
            // die volle Breite eines Tablets liest sich als Fehler.
            modifier = Modifier.widthIn(max = 320.dp),
            horizontalAlignment = Alignment.Start,
        ) {
            Kopf()
            Spacer(Modifier.height(Abstand.gross))

            // Beschriftung ueber dem Feld, kein Platzhalter im Feld: der
            // verschwindet genau dann, wenn man ihn braucht. Das Feld selbst
            // kommt jetzt aus AtlasFeld.kt, damit es hier und im Blatt "Neue
            // Aufgabe" denselben duennen Rahmen traegt.
            AtlasTextfeld(
                wert = passwort,
                beimAendern = { passwort = it },
                beschriftung = "Passwort",
                aktiviert = !zustand.laeuft,
                fehlerhaft = zustand.fehler != null,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Go,
                ),
                keyboardActions = KeyboardActions(onGo = { absenden() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(feldFokus),
            )

            // Der Fehler blendet ein und schiebt den Knopf mit, statt
            // ueberraschend Platz zu belegen. Bei reduzierter Bewegung faellt
            // die Dauer auf null, der Satz steht dann einfach da.
            AnimatedVisibility(
                visible = zustand.fehler != null,
                enter = fadeIn(atlasTween(Dauer.SCHNELL)) + expandVertically(atlasTween(Dauer.SCHNELL)),
                exit = fadeOut(atlasTween(Dauer.SCHNELL)) + shrinkVertically(atlasTween(Dauer.SCHNELL)),
            ) {
                Fehlerzeile(zustand.fehler.orEmpty())
            }

            Spacer(Modifier.height(Abstand.weit))

            Button(
                onClick = ::absenden,
                enabled = bereit,
                shape = MaterialTheme.shapes.small,
                colors = ButtonDefaults.buttonColors(
                    // Kein opacity-0.4 auf dem aktiven Ton: ein eigener
                    // gedaempfter Token verhaelt sich auf jedem Untergrund
                    // gleich.
                    disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Hoehe.bedienelement),
            ) {
                Text(
                    // Sagt, was passiert, statt "Absenden".
                    text = if (zustand.laeuft) "Einen Moment …" else "Weiter",
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
}

@Composable
private fun Kopf() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Abstand.mittel),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .background(MaterialTheme.colorScheme.primary, MaterialTheme.shapes.medium),
            contentAlignment = Alignment.Center,
        ) {
            AtlasLogo(
                farbe = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(24.dp),
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "Atlas",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                text = "Diese Seite ist geschützt.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Abstand.winzig),
            )
        }
    }
}

/**
 * Fehler tragen drei Signale, nicht nur Farbe: Zeichen, Farbe und Text. Reine
 * Farbcodierung ist fuer farbfehlsichtige Nutzer unsichtbar.
 */
@Composable
private fun Fehlerzeile(meldung: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Abstand.normal)
            // liveRegion, damit ein Screenreader die Meldung vorliest, ohne
            // dass der Fokus aus dem Feld springt.
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(Abstand.eng),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = "!",
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.error,
        )
        Text(
            text = meldung,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

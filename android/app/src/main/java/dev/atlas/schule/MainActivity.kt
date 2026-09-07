package dev.atlas.schule

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.Scaffold
import androidx.compose.foundation.border
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.atlas.schule.ui.AtlasNavigation
import dev.atlas.schule.ui.AtlasTabs
import dev.atlas.schule.ui.AnmeldeBildschirm
import dev.atlas.schule.ui.AtlasViewModel
import dev.atlas.schule.ui.AtlasZustand
import dev.atlas.schule.ui.AufgabeBearbeitenBlatt
import dev.atlas.schule.ui.AufgabenBildschirm
import dev.atlas.schule.ui.BotBildschirm
import dev.atlas.schule.ui.EinstellungenBildschirm
import dev.atlas.schule.ui.FachDetailBildschirm
import dev.atlas.schule.ui.FaecherBildschirm
import dev.atlas.schule.ui.IkoneAufgaben
import dev.atlas.schule.ui.IkoneBot
import dev.atlas.schule.ui.IkoneEinstellungen
import dev.atlas.schule.ui.IkoneFaecher
import dev.atlas.schule.ui.IkoneStundenplan
import dev.atlas.schule.ui.Ladung
import dev.atlas.schule.ui.MorgenPanel
import dev.atlas.schule.ui.NeueAufgabeBlatt
import dev.atlas.schule.ui.Reiter
import dev.atlas.schule.ui.StandZeile
import dev.atlas.schule.ui.StundeDetailBlatt
import dev.atlas.schule.ui.StundenplanBildschirm
import dev.atlas.schule.ui.StundenplanEingabeBlatt
import dev.atlas.schule.ui.standText
import dev.atlas.schule.ui.theme.AtlasTheme
import dev.atlas.schule.ui.theme.Dauer
import dev.atlas.schule.ui.theme.atlasTween

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            AtlasTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AtlasApp()
                }
            }
        }
    }
}

/** Das Zeichen zum Reiter. Der Reiter selbst kennt keine Zeichnung, er ist Zustand. */
private fun ikoneVon(reiter: Reiter): ImageVector = when (reiter) {
    Reiter.STUNDENPLAN -> IkoneStundenplan
    Reiter.AUFGABEN -> IkoneAufgaben
    Reiter.BOT -> IkoneBot
    Reiter.FAECHER -> IkoneFaecher
    Reiter.EINSTELLUNGEN -> IkoneEinstellungen
}

@Composable
private fun AtlasApp(ansichtsmodell: AtlasViewModel = viewModel()) {
    val zustand by ansichtsmodell.zustand.collectAsStateWithLifecycle()

    // Crossfade statt eines Schiebers: zwischen Anmeldung und App gibt es
    // keine Richtung, in die sich etwas bewegen wuerde. Ein Ueberblenden sagt
    // "anderer Zustand" und behauptet keine Navigation.
    Crossfade(
        targetState = zustand is AtlasZustand.Anmeldung,
        animationSpec = atlasTween(Dauer.LANGSAM),
        label = "bildschirm",
    ) { anmeldung ->
        val aktuell = zustand
        when {
            anmeldung && aktuell is AtlasZustand.Anmeldung -> AnmeldeBildschirm(
                zustand = aktuell,
                beimAnmelden = ansichtsmodell::anmelden,
                modifier = Modifier.safeDrawingPadding(),
            )

            aktuell is AtlasZustand.App -> AppGeruest(aktuell, ansichtsmodell)
            else -> Box(Modifier.fillMaxSize())
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppGeruest(zustand: AtlasZustand.App, ansichtsmodell: AtlasViewModel) {
    val schnipsel = remember { SnackbarHostState() }

    // Eigener Fluss neben dem Hauptzustand: die Noten haengen am geoeffneten
    // Fach, nicht am Geruest, und eine spaete Antwort fuer ein inzwischen
    // geschlossenes Fach darf den Rest der App nicht anfassen.
    val noten by ansichtsmodell.notenZustand.collectAsStateWithLifecycle()
    val bearbeitung by ansichtsmodell.aufgabenBearbeitung.collectAsStateWithLifecycle()
    val morgen by ansichtsmodell.morgenZustand.collectAsStateWithLifecycle()
    val bot by ansichtsmodell.botZustand.collectAsStateWithLifecycle()
    val stundeDetail by ansichtsmodell.stundeDetail.collectAsStateWithLifecycle()

    // Ein Hinweis wird genau einmal gezeigt und dann aus dem Zustand geraeumt,
    // sonst taucht er nach jeder Drehung erneut auf.
    LaunchedEffect(zustand.hinweis) {
        zustand.hinweis?.let {
            schnipsel.showSnackbar(it)
            ansichtsmodell.hinweisGelesen()
        }
    }

    // Die Systemgeste "zurueck" schliesst das Fachdetail, statt die App zu
    // beenden. Ohne das waere das Detail eine Sackgasse mit nur einem Ausgang.
    BackHandler(enabled = zustand.detail != null) { ansichtsmodell.schliesseFach() }

    BackHandler(enabled = zustand.detail == null && zustand.reiter == Reiter.BOT && bot.detail != null) {
        ansichtsmodell.schliesseBotVerlauf()
    }
    BackHandler(enabled = zustand.detail == null && bot.detail == null && zustand.reiter != Reiter.STUNDENPLAN) {
        ansichtsmodell.waehleReiter(Reiter.STUNDENPLAN)
    }
    var fokus by rememberSaveable { mutableStateOf(false) }


    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = {
            SnackbarHost(schnipsel) { nachricht ->
                Snackbar(
                    snackbarData = nachricht,
                    containerColor = MaterialTheme.colorScheme.surfaceContainer,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium),
                )
            }
        },
        bottomBar = { AtlasNavigation(zustand.reiter, ansichtsmodell::waehleReiter, ::ikoneVon) },
    ) { polster ->
        // atlasTween liest den Bewegung-reduziert-Schalter und ist damit
        // @Composable; transitionSpec ist es nicht. Deshalb hier, nicht dort.
        val auftritt = fadeIn(atlasTween(Dauer.NORMAL))
        val abgang = fadeOut(atlasTween(Dauer.SCHNELL))

        Box(Modifier.fillMaxSize().padding(polster)) {
            Column(Modifier.fillMaxSize()) {
                // Steht ueber allen drei Reitern, weil der gespeicherte Stand
                // fuer alle drei gilt: sie kommen aus derselben Antwort.
                zustand.startStand?.takeIf { it.veraltet }?.let {
                    StandZeile(standText(it.zeit, zustand.heute, it.ohneVerbindung))
                }
                PullToRefreshBox(
                    isRefreshing = zustand.aktualisiert,
                    onRefresh = ansichtsmodell::aktualisiere,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    // Die drei Reiter stehen nebeneinander, nicht hintereinander:
                    // ein Schieber wuerde eine Richtung behaupten und im
                    // Stundenplan mit dem Wochenwischen kollidieren.
                    AnimatedContent(
                        targetState = zustand.reiter,
                        transitionSpec = { auftritt togetherWith abgang },
                        label = "reiter",
                    ) { reiter ->
                        when (reiter) {
                            Reiter.STUNDENPLAN -> Column(Modifier.fillMaxSize()) {
                                Text("Deine Woche", style = MaterialTheme.typography.headlineMedium,
                                    color = MaterialTheme.colorScheme.onBackground,
                                    modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 12.dp, bottom = 12.dp))
                                AtlasTabs(listOf("Woche", "Fokus"), if (fokus) 1 else 0, { fokus = it == 1 }, Modifier.padding(horizontal = 24.dp))
                                Box(Modifier.weight(1f)) {
                                    if (fokus) {
                                        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                                            MorgenPanel(
                                                zustand = morgen,
                                                beimLaden = ansichtsmodell::ladeMorgen,
                                                beimHaken = ansichtsmodell::setzeHaken,
                                                beimFachOeffnen = ansichtsmodell::oeffneFach,
                                            )
                                        }
                                    } else {
                                        StundenplanBildschirm(
                                            modifier = Modifier.padding(bottom = 16.dp),
                                            zustand = zustand,
                                            beimWochenwechsel = ansichtsmodell::zeigeWoche,
                                            beimWocheLaden = ansichtsmodell::ladeWoche,
                                            beimStundeTippen = ansichtsmodell::oeffneBlattFuerStunde,
                                        )
                                    }
                                }
                            }

                            Reiter.AUFGABEN -> AufgabenBildschirm(
                                beimAnlegen = { pruefung -> ansichtsmodell.oeffneBlatt(if (pruefung) "exam" else "homework") },
                                zustand = zustand,
                                beimHaken = ansichtsmodell::setzeHaken,
                                beimErneutLaden = ansichtsmodell::ladeNeu,
                                beimErledigtAusklappen = ansichtsmodell::wechsleErledigtOffen,
                                beimBearbeiten = ansichtsmodell::oeffneAufgabeBearbeitung,
                            )

                            Reiter.BOT -> BotBildschirm(
                                zustand = bot,
                                beimLaden = ansichtsmodell::ladeBot,
                                beimVerlaufOeffnen = ansichtsmodell::oeffneBotVerlauf,
                                beimVerlaufSchliessen = ansichtsmodell::schliesseBotVerlauf,
                            )

                            Reiter.FAECHER -> FaecherBildschirm(
                                zustand = zustand,
                                beimOeffnen = ansichtsmodell::oeffneFach,
                                beimErneutLaden = ansichtsmodell::ladeNeu,
                                ansichtsmodell = ansichtsmodell,
                            )

                            Reiter.EINSTELLUNGEN -> EinstellungenBildschirm(
                                beimSyncErfolgreich = ansichtsmodell::ladeNeu,
                                ansichtsmodell = ansichtsmodell,
                            )
                        }
                    }
                }
            }

            // Das Detail kommt von rechts und geht nach rechts: eine Ebene
            // tiefer, kein Zustandswechsel am selben Ort.
            AnimatedVisibility(
                visible = zustand.detail != null,
                enter = slideInHorizontally(atlasTween(Dauer.LANGSAM)) { it / 3 } +
                    fadeIn(atlasTween(Dauer.NORMAL)),
                exit = slideOutHorizontally(atlasTween(Dauer.NORMAL)) { it / 3 } +
                    fadeOut(atlasTween(Dauer.SCHNELL)),
            ) {
                // Beim Zumachen ist der Zustand schon null, der letzte Inhalt
                // muss den Abgang aber noch ueberstehen.
                val detail = zustand.detail ?: Ladung.Laedt
                FachDetailBildschirm(
                    ladung = detail,
                    stand = zustand.detailStand,
                    heute = zustand.heute,
                    beimZurueck = ansichtsmodell::schliesseFach,
                    beimHaken = ansichtsmodell::setzeHaken,
                    beimErneutLaden = ansichtsmodell::ladeDetailNeu,
                    notenZustand = noten,
                    beimNotenErneutLaden = ansichtsmodell::ladeNotenNeu,
                    beimNoteBlattOeffnen = ansichtsmodell::oeffneNoteBlatt,
                    beimNoteBlattSchliessen = ansichtsmodell::schliesseNoteBlatt,
                    // Das Fach steht im Notenzustand, nicht am Blatt: das Blatt
                    // weiss nur, was eingegeben wurde, nicht wozu.
                    beimNoteAnlegen = { punkte, bezeichnung, art, datum ->
                        noten.fachId?.let {
                            ansichtsmodell.noteAnlegen(it, punkte, bezeichnung, art, datum)
                        }
                    },
                    ansichtsmodell = ansichtsmodell,
                )
            }
        }
    }

    zustand.blatt?.let { blatt ->
        if (blatt.vorbelegung == null) {
            NeueAufgabeBlatt(
                blatt = blatt,
                heute = zustand.heute,
                faecher = (zustand.start as? Ladung.Da)?.wert?.faecher.orEmpty(),
                beimSchliessen = ansichtsmodell::schliesseBlatt,
                beimAnlegen = ansichtsmodell::legeAufgabeAn,
            )
        } else {
        StundenplanEingabeBlatt(
            blatt = blatt,
            heute = zustand.heute,
            faecher = (zustand.start as? Ladung.Da)?.wert?.faecher.orEmpty(),
            beimSchliessen = ansichtsmodell::schliesseBlatt,
            beimAnlegen = ansichtsmodell::legeAufgabeAn,
        )
        }
    }

    // Aufgabe bearbeiten / löschen.
    bearbeitung.editId?.let { editId ->
        val alle = (zustand.start as? Ladung.Da)?.wert?.aufgaben.orEmpty()
        alle.firstOrNull { it.id == editId }?.let { aufgabe ->
            AufgabeBearbeitenBlatt(
                aufgabe = aufgabe,
                faecher = (zustand.start as? Ladung.Da)?.wert?.faecher.orEmpty(),
                bearbeitung = bearbeitung,
                beimSchliessen = ansichtsmodell::schliesseAufgabeBearbeitung,
                beimSpeichern = { titel, typ, faellig, notizen, fachId, clearDue, clearFach ->
                    ansichtsmodell.aufgabeAendern(editId, titel, typ, faellig, notizen, fachId, clearDue, clearFach)
                },
                beimLoeschen = { ansichtsmodell.aufgabeLoeschen(editId) },
            )
        }
    }

    // Stunden-Detail (Notiz + Meldung).
    stundeDetail.lessonId?.let {
        StundeDetailBlatt(
            zustand = stundeDetail,
            beimSchliessen = ansichtsmodell::schliesseStunde,
            beimNotizSpeichern = ansichtsmodell::stundenNotizSpeichern,
            beimMeldungSpeichern = ansichtsmodell::meldungSpeichern,
            beimMeldungLoeschen = ansichtsmodell::meldungLoeschen,
        )
    }
}

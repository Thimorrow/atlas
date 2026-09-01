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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.atlas.schule.ui.AnmeldeBildschirm
import dev.atlas.schule.ui.AtlasViewModel
import dev.atlas.schule.ui.AtlasZustand
import dev.atlas.schule.ui.AufgabenBildschirm
import dev.atlas.schule.ui.FachDetailBildschirm
import dev.atlas.schule.ui.FaecherBildschirm
import dev.atlas.schule.ui.IkoneAufgaben
import dev.atlas.schule.ui.IkoneFaecher
import dev.atlas.schule.ui.IkoneStundenplan
import dev.atlas.schule.ui.Ladung
import dev.atlas.schule.ui.NeueAufgabeBlatt
import dev.atlas.schule.ui.NeueAufgabeKnopf
import dev.atlas.schule.ui.Reiter
import dev.atlas.schule.ui.StundenplanBildschirm
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
    Reiter.FAECHER -> IkoneFaecher
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

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(schnipsel) },
        floatingActionButton = {
            NeueAufgabeKnopf(
                // Die eine primaere Handlung gehoert auf den Bildschirm, zu dem
                // sie passt. Im Stundenplan und in der Fachliste waere sie ein
                // zweites, konkurrierendes Angebot.
                sichtbar = zustand.reiter == Reiter.AUFGABEN && zustand.detail == null,
                beimTippen = ansichtsmodell::oeffneBlatt,
            )
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.background) {
                Reiter.entries.forEach { reiter ->
                    NavigationBarItem(
                        selected = zustand.reiter == reiter,
                        onClick = { ansichtsmodell.waehleReiter(reiter) },
                        icon = {
                            Icon(
                                imageVector = ikoneVon(reiter),
                                contentDescription = null,
                                modifier = Modifier.size(22.dp),
                            )
                        },
                        label = { Text(reiter.bezeichnung) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onPrimary,
                            selectedTextColor = MaterialTheme.colorScheme.onBackground,
                            indicatorColor = MaterialTheme.colorScheme.primary,
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    )
                }
            }
        },
    ) { polster ->
        // atlasTween liest den Bewegung-reduziert-Schalter und ist damit
        // @Composable; transitionSpec ist es nicht. Deshalb hier, nicht dort.
        val auftritt = fadeIn(atlasTween(Dauer.NORMAL))
        val abgang = fadeOut(atlasTween(Dauer.SCHNELL))

        Box(Modifier.fillMaxSize().padding(polster)) {
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
                        Reiter.STUNDENPLAN -> StundenplanBildschirm(
                            zustand = zustand,
                            beimWochenwechsel = ansichtsmodell::zeigeWoche,
                            beimWocheLaden = ansichtsmodell::ladeWoche,
                        )

                        Reiter.AUFGABEN -> AufgabenBildschirm(
                            zustand = zustand,
                            beimHaken = ansichtsmodell::setzeHaken,
                            beimErneutLaden = ansichtsmodell::ladeNeu,
                        )

                        Reiter.FAECHER -> FaecherBildschirm(
                            zustand = zustand,
                            beimOeffnen = ansichtsmodell::oeffneFach,
                            beimErneutLaden = ansichtsmodell::ladeNeu,
                        )
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
                    heute = zustand.heute,
                    beimZurueck = ansichtsmodell::schliesseFach,
                    beimHaken = ansichtsmodell::setzeHaken,
                    beimErneutLaden = ansichtsmodell::ladeDetailNeu,
                )
            }
        }
    }

    zustand.blatt?.let { blatt ->
        NeueAufgabeBlatt(
            blatt = blatt,
            heute = zustand.heute,
            faecher = (zustand.start as? Ladung.Da)?.wert?.faecher.orEmpty(),
            beimSchliessen = ansichtsmodell::schliesseBlatt,
            beimAnlegen = ansichtsmodell::legeAufgabeAn,
        )
    }
}

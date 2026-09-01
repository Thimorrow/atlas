package dev.atlas.schule

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.atlas.schule.ui.AnmeldeBildschirm
import dev.atlas.schule.ui.AtlasViewModel
import dev.atlas.schule.ui.AtlasZustand
import dev.atlas.schule.ui.UebersichtBildschirm
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

@Composable
private fun AtlasApp(ansichtsmodell: AtlasViewModel = viewModel()) {
    val zustand by ansichtsmodell.zustand.collectAsStateWithLifecycle()

    // Crossfade statt eines Schiebers: zwischen Anmeldung und App gibt es
    // keine Richtung, in die sich etwas bewegen wuerde. Ein Ueberblenden sagt
    // "anderer Zustand" und behauptet keine Navigation.
    Crossfade(
        targetState = zustand,
        animationSpec = atlasTween(Dauer.LANGSAM),
        label = "bildschirm",
    ) { aktuell ->
        when (aktuell) {
            is AtlasZustand.Anmeldung -> AnmeldeBildschirm(
                zustand = aktuell,
                beimAnmelden = ansichtsmodell::anmelden,
                modifier = Modifier.safeDrawingPadding(),
            )

            is AtlasZustand.Uebersicht -> UebersichtBildschirm(
                zustand = aktuell,
                beimErneutLaden = ansichtsmodell::erneutLaden,
                modifier = Modifier.safeDrawingPadding(),
            )
        }
    }
}

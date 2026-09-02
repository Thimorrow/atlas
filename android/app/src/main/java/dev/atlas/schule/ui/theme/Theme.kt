package dev.atlas.schule.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import dev.atlas.schule.data.Erscheinungsbild
import dev.atlas.schule.data.ErscheinungsbildSpeicher

// Atlas ist bewusst monochrom: --brand zeigt im Web auf --primary, es gibt
// keinen bunten Akzent. Deshalb tragen primary, secondary und tertiary hier
// dieselben neutralen Toene wie im Browser, und die einzige Farbe im ganzen
// Schema ist --destructive.
private val HellesSchema = lightColorScheme(
    primary = HellVordergrund,
    onPrimary = HellPrimaerVordergrund,
    secondary = HellGedaempft,
    onSecondary = HellVordergrund,
    tertiary = HellGedaempft,
    onTertiary = HellVordergrund,
    background = HellHintergrund,
    onBackground = HellVordergrund,
    surface = HellHintergrund,
    onSurface = HellVordergrund,
    // --card / --popover. Im Hellmodus liegt die Karte ueber dem leicht warmen
    // Hintergrund, deshalb ist sie reinweiss und damit heller als die Seite.
    surfaceContainerLowest = HellKarte,
    surfaceContainerLow = HellKarte,
    surfaceContainer = HellKarte,
    surfaceContainerHigh = HellKarte,
    surfaceContainerHighest = HellKarte,
    // --muted / --muted-foreground
    surfaceVariant = HellGedaempft,
    onSurfaceVariant = HellGedaempfterText,
    error = HellZerstoerend,
    onError = HellPrimaerVordergrund,
    outline = HellRand,
    outlineVariant = HellFeldrand,
    // Die Container-Slots blieben frueher offen und trugen damit Materials
    // Vorgabe, ein Flieder, den Atlas nirgends verwendet. Sichtbar wurde das an
    // den Auswahlplaettchen im Blatt. Jeder Slot ist jetzt belegt, damit keine
    // fremde Farbe mehr durchschlagen kann, egal welches Bauteil dazukommt.
    secondaryContainer = HellGedaempft,
    onSecondaryContainer = HellVordergrund,
    tertiaryContainer = HellGedaempft,
    onTertiaryContainer = HellVordergrund,
    primaryContainer = HellVordergrund,
    onPrimaryContainer = HellPrimaerVordergrund,
    errorContainer = HellGedaempft,
    onErrorContainer = HellZerstoerend,
    inverseSurface = HellVordergrund,
    inverseOnSurface = HellHintergrund,
    inversePrimary = HellGedaempft,
    // Material faerbt erhoehte Flaechen sonst mit primary ein. Primary ist hier
    // fast schwarz, das wuerde jede Karte grau anlaufen lassen.
    surfaceTint = Color.Transparent,
    surfaceDim = HellGedaempft,
    surfaceBright = HellKarte,
)

private val DunklesSchema = darkColorScheme(
    primary = DunkelVordergrund,
    onPrimary = DunkelKarte,
    secondary = DunkelGedaempft,
    onSecondary = DunkelVordergrund,
    tertiary = DunkelAkzent,
    onTertiary = DunkelVordergrund,
    background = DunkelHintergrund,
    onBackground = DunkelVordergrund,
    surface = DunkelHintergrund,
    onSurface = DunkelVordergrund,
    // Dunkel traegt die Karte ihre Tiefe ueber Helligkeit statt ueber einen
    // Schatten: sie ist heller als die Seite, so wie im Web beschrieben.
    surfaceContainerLowest = DunkelKarte,
    surfaceContainerLow = DunkelKarte,
    surfaceContainer = DunkelKarte,
    surfaceContainerHigh = DunkelKarte,
    surfaceContainerHighest = DunkelKarte,
    surfaceVariant = DunkelGedaempft,
    onSurfaceVariant = DunkelGedaempfterText,
    error = DunkelZerstoerend,
    onError = DunkelKarte,
    outline = DunkelRand,
    outlineVariant = DunkelFeldrand,
    // Dieselbe Luecke wie oben, siehe Kommentar im hellen Schema.
    secondaryContainer = DunkelGedaempft,
    onSecondaryContainer = DunkelVordergrund,
    tertiaryContainer = DunkelAkzent,
    onTertiaryContainer = DunkelVordergrund,
    primaryContainer = DunkelVordergrund,
    onPrimaryContainer = DunkelKarte,
    errorContainer = DunkelGedaempft,
    onErrorContainer = DunkelZerstoerend,
    inverseSurface = DunkelVordergrund,
    inverseOnSurface = DunkelHintergrund,
    inversePrimary = DunkelGedaempft,
    surfaceTint = Color.Transparent,
    surfaceDim = DunkelHintergrund,
    surfaceBright = DunkelGedaempft,
)

/**
 * --ring. Material3 fuehrt keinen Slot fuer den Fokusring, deshalb liegt er
 * daneben statt in einem Slot mit anderer Bedeutung.
 */
val LocalFokusring = compositionLocalOf { HellFokusring }

/** Fachfarben brauchen den Modus, weil "Weiss" pro Modus verschieden ist. */
val LocalDunkelmodus = compositionLocalOf { false }

/** Die aktuell gewaehlte Kachel aus "Erscheinungsbild", nicht das ausgewertete Hell/Dunkel. */
val LocalErscheinungsbild = compositionLocalOf { Erscheinungsbild.SYSTEM }

/** Setzt die Wahl und schreibt sie weg, wechselt also sofort und ueberlebt den naechsten Start. */
val LocalErscheinungsbildSetzen = compositionLocalOf<(Erscheinungsbild) -> Unit> { {} }

/**
 * Farbe eines Fachs aus dem gespeicherten Token. Ein leeres oder unbekanntes
 * Token ergibt das neutrale Grau, genau wie colorValue() im Web.
 */
@Composable
fun fachfarbe(token: String?): Color {
    val farbe = Fachfarbe.vonToken(token)
        ?: return Fachfarbe.neutral(MaterialTheme.colorScheme.onSurface)
    return farbe.farbe(LocalDunkelmodus.current)
}

@Composable
fun AtlasTheme(
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    // Synchron aus den SharedPreferences gelesen, nicht ueber LaunchedEffect:
    // sonst stuende die App fuer einen Frame im System-Look, bevor die
    // gespeicherte Wahl nachtraeglich einschlaegt.
    var erscheinungsbild by remember { mutableStateOf(ErscheinungsbildSpeicher(context).lies()) }
    val system = isSystemInDarkTheme()
    val dunkel = when (erscheinungsbild) {
        Erscheinungsbild.HELL -> false
        Erscheinungsbild.DUNKEL -> true
        Erscheinungsbild.SYSTEM -> system
    }

    val schema = if (dunkel) DunklesSchema else HellesSchema
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val fenster = (context as Activity).window
            // Ohne das bleiben die Symbole in der Statusleiste hell und
            // verschwinden im Hellmodus auf dem weissen Hintergrund.
            WindowCompat.getInsetsController(fenster, view).isAppearanceLightStatusBars = !dunkel
        }
    }

    CompositionLocalProvider(
        LocalFokusring provides if (dunkel) DunkelFokusring else HellFokusring,
        LocalDunkelmodus provides dunkel,
        LocalBewegungReduziert provides bewegungReduziert(context),
        LocalErscheinungsbild provides erscheinungsbild,
        LocalErscheinungsbildSetzen provides { neu ->
            erscheinungsbild = neu
            ErscheinungsbildSpeicher(context).schreibe(neu)
        },
    ) {
        MaterialTheme(
            colorScheme = schema,
            typography = AtlasTypografie,
            shapes = AtlasFormen,
            content = content,
        )
    }
}

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

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
)

/**
 * --ring. Material3 fuehrt keinen Slot fuer den Fokusring, deshalb liegt er
 * daneben statt in einem Slot mit anderer Bedeutung.
 */
val LocalFokusring = compositionLocalOf { HellFokusring }

/** Fachfarben brauchen den Modus, weil "Weiss" pro Modus verschieden ist. */
val LocalDunkelmodus = compositionLocalOf { false }

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
    // Der Dunkelmodus folgt dem System. Einen eigenen Schalter gibt es nicht,
    // die Web-App hat auch keinen.
    dunkel: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val schema = if (dunkel) DunklesSchema else HellesSchema
    val view = LocalView.current
    val context = LocalContext.current

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
    ) {
        MaterialTheme(
            colorScheme = schema,
            typography = AtlasTypografie,
            shapes = AtlasFormen,
            content = content,
        )
    }
}

package dev.atlas.schule.ui.theme

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

/**
 * Atlas-Signaturkurve, identisch zu --ease-atlas in app/globals.css. Sanft,
 * mit etwas Schwung am Ende, statt Materials Default (0.4, 0, 0.2, 1).
 */
val AtlasEasing = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

/**
 * Drei Dauern reichen. Kuerzer als 120ms nimmt niemand als Bewegung wahr,
 * laenger als 350ms wirkt die Oberflaeche nachdenklich.
 */
object Dauer {
    const val SCHNELL = 150 // Zustandswechsel am Ort: Farbe, Deckkraft
    const val NORMAL = 220 // Auftritte und Abgaenge kleiner Flaechen
    const val LANGSAM = 320 // grosse Flaechen, Bildschirmwechsel
}

/**
 * true, wenn das System "Bewegung reduzieren" meldet. Android fuehrt dafuer
 * keinen eigenen Schalter wie prefers-reduced-motion, sondern die
 * Animationsskala in den Entwickler- und Bedienungshilfen-Optionen; steht sie
 * auf 0, will der Nutzer keine Animation sehen.
 */
val LocalBewegungReduziert = compositionLocalOf { false }

internal fun bewegungReduziert(context: Context): Boolean =
    Settings.Global.getFloat(
        context.contentResolver,
        Settings.Global.ANIMATOR_DURATION_SCALE,
        1f,
    ) == 0f

/**
 * Der Standard-Uebergang der App. Bei reduzierter Bewegung faellt die Dauer
 * auf null, der Zielwert wird also sofort gesetzt statt angefahren. Das
 * entspricht dem, was globals.css unter prefers-reduced-motion tut.
 */
@Composable
@ReadOnlyComposable
fun <T> atlasTween(dauer: Int = Dauer.NORMAL): TweenSpec<T> =
    tween(durationMillis = if (LocalBewegungReduziert.current) 0 else dauer, easing = AtlasEasing)

/**
 * Schrumpft eine klickbare Karte oder Zeile auf 96 Prozent, solange eine
 * Beruehrung anhaelt -- ruhiger als eine reine Welle, aber spuerbar genug,
 * um den Druck zu bestaetigen. Nicht kleiner als 0.96, sonst wirkt es
 * uebertrieben statt ruhig.
 */
@Composable
fun Modifier.druckSkalierung(interactionSource: InteractionSource): Modifier {
    val gedrueckt by interactionSource.collectIsPressedAsState()
    val skala by animateFloatAsState(
        targetValue = if (gedrueckt) 0.96f else 1f,
        animationSpec = atlasTween(Dauer.SCHNELL),
        label = "druckSkalierung",
    )
    return this.graphicsLayer { scaleX = skala; scaleY = skala }
}

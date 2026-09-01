package dev.atlas.schule.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path

/**
 * Gefaltete Pfeilspitze, dieselbe Geometrie wie components/atlas-logo.tsx.
 * Zwei Facetten teilen sich einen Mittelgrat, die rechte ist die Schattenseite
 * und laeuft mit halber Deckkraft. Beide Toene kommen aus [farbe], damit das
 * Zeichen dem Theme folgt statt eine eigene Farbe mitzubringen.
 *
 * Die Pfade sind auf ein 24er-Feld gezeichnet, wie im SVG, und werden auf die
 * tatsaechliche Groesse skaliert.
 */
@Composable
fun AtlasLogo(farbe: Color, modifier: Modifier = Modifier) {
    // Rein dekorativ, deshalb ohne Semantik: der Bildschirm sagt daneben
    // "Atlas", eine zweite Ansage waere nur Laerm.
    Canvas(modifier = modifier) {
        val s = size.minDimension / 24f
        fun pfad(punkte: List<Pair<Float, Float>>) = Path().apply {
            moveTo(punkte[0].first * s, punkte[0].second * s)
            punkte.drop(1).forEach { lineTo(it.first * s, it.second * s) }
            close()
        }

        drawPath(
            pfad(listOf(12f to 2.4f, 20.6f to 21f, 14.4f to 21f, 12f to 14f)),
            color = farbe,
            alpha = 0.5f,
        )
        drawPath(
            pfad(listOf(12f to 2.4f, 12f to 14f, 9.6f to 21f, 3.4f to 21f)),
            color = farbe,
        )
    }
}

package dev.atlas.schule.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Abstaende. Die Web-App laeuft auf Tailwinds Vierer-Raster, dieselben Stufen
 * stehen hier unter sprechenden Namen. Wer einen Abstand braucht, der nicht in
 * der Liste steht, hat meistens ein Layoutproblem und keinen Abstandsbedarf.
 */
object Abstand {
    val winzig = 2.dp
    val klein = 4.dp
    val eng = 6.dp
    val normal = 8.dp
    val mittel = 12.dp
    val weit = 16.dp
    val gross = 24.dp
    val sehrGross = 32.dp
}

/**
 * Hoehen von Bedienelementen. Android verlangt 48dp als Mindestgroesse fuer
 * ein Tippziel, die Web-App nutzt h-11 (44px). Die 48dp gewinnen, weil ein zu
 * kleines Ziel ein echter Fehler ist und ein paar Pixel Hoehe nur Geschmack.
 */
object Hoehe {
    val bedienelement = 48.dp

    /**
     * Auswahlplaettchen. Material stellt sie 32dp hoch, das trifft sich in einer
     * seitlich schiebbaren Reihe schlecht. 44dp ist der Kompromiss: sicher zu
     * treffen, ohne dass drei Reihen davon das halbe Blatt fuellen.
     */
    val plaettchen = 44.dp
}

// --radius: 0.625rem = 10px, dazu die abgeleiteten Stufen aus @theme inline.
private val radiusLg = 10.dp

val AtlasFormen = Shapes(
    extraSmall = RoundedCornerShape(radiusLg - 4.dp), // --radius-sm
    small = RoundedCornerShape(radiusLg - 2.dp), // --radius-md
    medium = RoundedCornerShape(radiusLg), // --radius-lg
    large = RoundedCornerShape(radiusLg + 4.dp), // --radius-xl
    extraLarge = RoundedCornerShape(radiusLg + 8.dp),
)

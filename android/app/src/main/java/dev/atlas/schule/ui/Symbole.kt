package dev.atlas.schule.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.PathData
import androidx.compose.ui.unit.dp

// Eine einzige Zeichensprache statt zweier gemischter Bibliotheken: dieselben
// 24er-Kaesten, dieselbe Strichstaerke und dieselben runden Enden wie die
// Lucide-Zeichen der Web-App. Selbst gezeichnet, weil die App nur eine Handvoll
// Zeichen braucht und ein ganzes Symbol-Paket dafuer zu viel waere.
//
// Die Farbe ist bewusst Schwarz: Icon() legt seinen Farbton darueber, der Wert
// hier wird also nie sichtbar.

private const val STRICH = 1.75f

internal fun strichzeichen(name: String, pfad: PathBuilder.() -> Unit): ImageVector =
    ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        addPath(
            pathData = PathData(pfad),
            stroke = SolidColor(Color.Black),
            strokeLineWidth = STRICH,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }.build()

/** Kalenderblatt mit Ringen -- Stundenplan. */
val IkoneStundenplan: ImageVector by lazy {
    strichzeichen("stundenplan") {
        moveTo(4f, 6f); lineTo(20f, 6f); lineTo(20f, 20f); lineTo(4f, 20f); close()
        moveTo(4f, 10f); lineTo(20f, 10f)
        moveTo(8f, 3.5f); lineTo(8f, 6f)
        moveTo(16f, 3.5f); lineTo(16f, 6f)
        moveTo(12f, 10f); lineTo(12f, 20f)
    }
}

/** Liste mit Haken -- Aufgaben. */
val IkoneAufgaben: ImageVector by lazy {
    strichzeichen("aufgaben") {
        moveTo(3.5f, 6.5f); lineTo(5f, 8f); lineTo(8f, 4.5f)
        moveTo(3.5f, 13f); lineTo(5f, 14.5f); lineTo(8f, 11f)
        moveTo(3.5f, 19.5f); lineTo(5f, 21f); lineTo(8f, 17.5f)
        moveTo(11f, 6.5f); lineTo(20.5f, 6.5f)
        moveTo(11f, 13f); lineTo(20.5f, 13f)
        moveTo(11f, 19.5f); lineTo(20.5f, 19.5f)
    }
}

/** Aufgeschlagenes Buch -- Faecher. */
val IkoneFaecher: ImageVector by lazy {
    strichzeichen("faecher") {
        moveTo(12f, 7f); curveTo(10.5f, 5f, 7.5f, 4.5f, 4f, 4.5f)
        lineTo(4f, 18.5f); curveTo(7.5f, 18.5f, 10.5f, 19f, 12f, 21f)
        curveTo(13.5f, 19f, 16.5f, 18.5f, 20f, 18.5f)
        lineTo(20f, 4.5f); curveTo(16.5f, 4.5f, 13.5f, 5f, 12f, 7f)
        close()
        moveTo(12f, 7f); lineTo(12f, 21f)
    }
}

/** Plus -- neue Aufgabe. */
val IkonePlus: ImageVector by lazy {
    strichzeichen("plus") {
        moveTo(12f, 5f); lineTo(12f, 19f)
        moveTo(5f, 12f); lineTo(19f, 12f)
    }
}

/** Haken -- abgehakte Aufgabe. */
val IkoneHaken: ImageVector by lazy {
    strichzeichen("haken") {
        moveTo(5f, 12.5f); lineTo(9.5f, 17f); lineTo(19f, 7f)
    }
}

/** Pfeil nach links -- zurueck aus dem Fachdetail. */
val IkoneZurueck: ImageVector by lazy {
    strichzeichen("zurueck") {
        moveTo(19f, 12f); lineTo(5f, 12f)
        moveTo(11f, 6f); lineTo(5f, 12f); lineTo(11f, 18f)
    }
}

/** Winkel nach rechts -- die Fachzeile fuehrt weiter. */
val IkoneWeiter: ImageVector by lazy {
    strichzeichen("weiter") {
        moveTo(9.5f, 6f); lineTo(15.5f, 12f); lineTo(9.5f, 18f)
    }
}

/** Kreis mit Ausrufezeichen -- Fehlerzustand. */
val IkoneFehler: ImageVector by lazy {
    strichzeichen("fehler") {
        moveTo(12f, 3.5f)
        arcToRelative(8.5f, 8.5f, 0f, true, true, -0.01f, 0f)
        close()
        moveTo(12f, 7.5f); lineTo(12f, 12.5f)
        moveTo(12f, 16f); lineTo(12f, 16.2f)
    }
}

/** Kreuz -- Blatt schliessen. */
val IkoneSchliessen: ImageVector by lazy {
    strichzeichen("schliessen") {
        moveTo(6f, 6f); lineTo(18f, 18f)
        moveTo(18f, 6f); lineTo(6f, 18f)
    }
}

/** Sprechblase mit Stern -- Atlas-Bot. */
val IkoneBot: ImageVector by lazy {
    strichzeichen("bot") {
        moveTo(4f, 6f); lineTo(20f, 6f); lineTo(20f, 14f); lineTo(13f, 14f); lineTo(10f, 17.5f); lineTo(10f, 14f); lineTo(4f, 14f); close()
        moveTo(12f, 8.5f); lineTo(12f, 11.5f)
        moveTo(9.5f, 10f); lineTo(14.5f, 10f)
    }
}

/** Stift -- bearbeiten. */
val IkoneStift: ImageVector by lazy {
    strichzeichen("stift") {
        moveTo(4f, 20f); lineTo(5f, 16f); lineTo(15.5f, 5.5f); lineTo(18.5f, 8.5f); lineTo(8f, 19f); lineTo(4f, 20f); close()
        moveTo(13.5f, 7.5f); lineTo(16.5f, 10.5f)
    }
}

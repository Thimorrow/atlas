package dev.atlas.schule.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Die Web-App setzt Geist Sans. Die Schrift liegt hier nicht als Asset vor,
// und eine halbe Million Byte Schriftdatei nur fuer die Anmeldung waere
// verfrueht -- solange gilt die Systemschrift. Die Groessen bleiben trotzdem
// dieselben, weil die Groessenstaffel den Rhythmus traegt, nicht die Schrift.
//
// Die Web-App arbeitet mit einer sehr schmalen Staffel: 13px fuer Beiwerk und
// Beschriftungen, 15px fuer normalen Text, 17px fuer Ueberschriften, 16px in
// Eingabefeldern. Genau die vier Stufen stehen hier, auf die Material-Slots
// verteilt, die Compose-Bausteine ohnehin abfragen.
val AtlasTypografie = Typography(
    // Web: text-[17px] font-semibold tracking-tight
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 17.sp,
        lineHeight = 24.sp,
        // Tailwinds tracking-tight ist -0.025em, bei 17sp also rund -0.4sp.
        letterSpacing = (-0.4).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        letterSpacing = (-0.2).sp,
    ),
    // Eingabefelder. Im Web sind es 16px, damit iOS beim Fokussieren nicht
    // hineinzoomt. Android kennt das Problem nicht, aber die Groesse bleibt,
    // damit ein Feld auf beiden Plattformen gleich wirkt.
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    ),
    // Der Arbeitspferd-Stil der Web-App: Beschriftungen, Hinweise, Fehler.
    bodySmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 19.sp,
    ),
    // Knopfbeschriftung und Feldbeschriftung, beide 13px medium im Web.
    labelLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 19.sp,
    ),
)

/**
 * Ziffern gleicher Breite statt proportionaler. Ohne das aendert eine "1"
 * neben einer "8" die Breite einer Zahl, und eine Uhrzeit oder ein Zaehler,
 * der sich aendert, zittert dabei sichtbar. Ueber `.merge(Tabellenziffern)`
 * an jede Stelle anhaengen, an der Zahlen sich aendern oder untereinander
 * stehen -- Uhrzeiten, Datumsangaben, Zaehler.
 */
val Tabellenziffern = TextStyle(fontFeatureSettings = "tnum")

package dev.atlas.schule.ui.theme

import androidx.compose.ui.graphics.Color

// Die Werte stammen eins zu eins aus den OKLCH-Tokens in app/globals.css und
// wurden nach sRGB umgerechnet (OKLab -> linear sRGB -> Gammakurve). Compose
// kennt kein OKLCH, deshalb stehen hier feste sRGB-Werte statt einer
// Umrechnung zur Laufzeit. Wer ein Token im Web aendert, muss es hier
// nachziehen, darum steht die Quelle an jeder Zeile.
//
// Zwei Werte lagen ausserhalb des sRGB-Raums und wurden pro Kanal geklemmt.
// Beide sind Rottoene; die Klemmung verschiebt sie unmerklich, weil sie
// ohnehin an der Aussenkante des Gamuts liegen. Sie sind unten vermerkt.

// ---- Hellmodus (:root) ----

/** --background: oklch(0.995 0.001 95) */
val HellHintergrund = Color(0xFFFEFDFD)

/** --foreground, --card-foreground, --popover-foreground, --primary, --secondary-foreground, --accent-foreground: oklch(0.205 0 0) */
val HellVordergrund = Color(0xFF171717)

/** --card, --popover: oklch(1 0 0) */
val HellKarte = Color(0xFFFFFFFF)

/** --primary-foreground: oklch(0.985 0 0) */
val HellPrimaerVordergrund = Color(0xFFFAFAFA)

/** --secondary, --muted, --accent: oklch(0.97 0 0) */
val HellGedaempft = Color(0xFFF5F5F5)

/** --muted-foreground: oklch(0.556 0 0) */
val HellGedaempfterText = Color(0xFF737373)

/** --destructive: oklch(0.577 0.245 27.325). Ausserhalb sRGB, pro Kanal geklemmt. */
val HellZerstoerend = Color(0xFFE7000B)

/** --border: oklch(0.92 0 0) */
val HellRand = Color(0xFFE4E4E4)

/** --input: oklch(0.922 0 0) */
val HellFeldrand = Color(0xFFE5E5E5)

/** --ring: oklch(0.708 0 0) */
val HellFokusring = Color(0xFFA1A1A1)

// ---- Dunkelmodus (.dark) ----

/** --background: oklch(0.165 0 0) */
val DunkelHintergrund = Color(0xFF0E0E0E)

/** --foreground, --card-foreground, --popover-foreground, --primary, --secondary-foreground, --accent-foreground: oklch(0.97 0 0) */
val DunkelVordergrund = Color(0xFFF5F5F5)

/** --card, --popover, --primary-foreground: oklch(0.205 0 0) */
val DunkelKarte = Color(0xFF171717)

/** --secondary, --muted: oklch(0.269 0 0) */
val DunkelGedaempft = Color(0xFF262626)

/** --accent: oklch(0.285 0 0) */
val DunkelAkzent = Color(0xFF2A2A2A)

/** --muted-foreground: oklch(0.708 0 0) */
val DunkelGedaempfterText = Color(0xFFA1A1A1)

/** --destructive: oklch(0.704 0.191 22.216). Ausserhalb sRGB, pro Kanal geklemmt. */
val DunkelZerstoerend = Color(0xFFFF6467)

/**
 * --border: oklch(1 0 0 / 9%). Im Dunkelmodus ist der Rand im Web bewusst
 * halbtransparentes Weiss, kein fester Grauton, damit er sich der Flaeche
 * darunter anpasst. Compose kann das genauso.
 */
val DunkelRand = Color(0x17FFFFFF)

/** --input: oklch(1 0 0 / 15%) */
val DunkelFeldrand = Color(0x26FFFFFF)

/** --ring: oklch(0.556 0 0) */
val DunkelFokusring = Color(0xFF737373)

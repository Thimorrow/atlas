package dev.atlas.schule.ui

import androidx.compose.ui.graphics.vector.ImageVector

/** Zahnrad -- Einstellungen, der vierte Reiter. */
val IkoneEinstellungen: ImageVector by lazy {
    strichzeichen("einstellungen") {
        // Nabe.
        moveTo(12f, 9.4f)
        arcToRelative(2.6f, 2.6f, 0f, true, true, 0f, 5.2f)
        arcToRelative(2.6f, 2.6f, 0f, true, true, 0f, -5.2f)
        close()
        // Aeusserer Ring. Er ist der Unterschied zur Sonne: acht
        // freistehende Strahlen um einen Kreis sind eine Sonne, erst der
        // Ring macht aus den Strahlen Zaehne.
        moveTo(12f, 4.9f)
        arcToRelative(7.1f, 7.1f, 0f, true, true, 0f, 14.2f)
        arcToRelative(7.1f, 7.1f, 0f, true, true, 0f, -14.2f)
        close()
        // Acht Zaehne, jeder nur vom Ring nach aussen.
        moveTo(12f, 2.4f); lineTo(12f, 4.9f)
        moveTo(12f, 19.1f); lineTo(12f, 21.6f)
        moveTo(2.4f, 12f); lineTo(4.9f, 12f)
        moveTo(19.1f, 12f); lineTo(21.6f, 12f)
        moveTo(5.2f, 5.2f); lineTo(7f, 7f)
        moveTo(17f, 17f); lineTo(18.8f, 18.8f)
        moveTo(5.2f, 18.8f); lineTo(7f, 17f)
        moveTo(17f, 7f); lineTo(18.8f, 5.2f)
    }
}

/** Sonne -- helles Erscheinungsbild. */
val IkoneHell: ImageVector by lazy {
    strichzeichen("hell") {
        moveTo(12f, 8.5f)
        arcToRelative(3.5f, 3.5f, 0f, true, true, 0f, 7f)
        arcToRelative(3.5f, 3.5f, 0f, true, true, 0f, -7f)
        close()
        moveTo(12f, 2f); lineTo(12f, 4.5f)
        moveTo(12f, 19.5f); lineTo(12f, 22f)
        moveTo(4.9f, 4.9f); lineTo(6.6f, 6.6f)
        moveTo(17.4f, 17.4f); lineTo(19.1f, 19.1f)
        moveTo(2f, 12f); lineTo(4.5f, 12f)
        moveTo(19.5f, 12f); lineTo(22f, 12f)
        moveTo(4.9f, 19.1f); lineTo(6.6f, 17.4f)
        moveTo(17.4f, 6.6f); lineTo(19.1f, 4.9f)
    }
}

/** Mond -- dunkles Erscheinungsbild. */
val IkoneDunkel: ImageVector by lazy {
    strichzeichen("dunkel") {
        moveTo(20f, 14.5f)
        curveTo(18.7f, 15.2f, 17.2f, 15.6f, 15.6f, 15.6f)
        curveTo(10.6f, 15.6f, 6.5f, 11.6f, 6.5f, 6.5f)
        curveTo(6.5f, 5.1f, 6.8f, 3.8f, 7.4f, 2.7f)
        curveTo(4.3f, 3.9f, 2f, 7f, 2f, 10.7f)
        curveTo(2f, 15.5f, 6f, 19.4f, 10.9f, 19.4f)
        curveTo(14.9f, 19.4f, 18.3f, 17.5f, 20f, 14.5f)
        close()
    }
}

/** Bildschirm -- dem System folgen. */
val IkoneSystem: ImageVector by lazy {
    strichzeichen("system") {
        moveTo(3.5f, 5f); lineTo(20.5f, 5f); lineTo(20.5f, 16f); lineTo(3.5f, 16f); close()
        moveTo(9f, 20f); lineTo(15f, 20f)
        moveTo(12f, 16f); lineTo(12f, 20f)
    }
}

/** Kreisender Pfeil -- Untis-Abgleich. */
val IkoneAbgleich: ImageVector by lazy {
    strichzeichen("abgleich") {
        moveTo(4f, 12f)
        arcToRelative(8f, 8f, 0f, true, true, 2.6f, 5.9f)
        moveTo(4f, 20f); lineTo(4f, 15.5f); lineTo(8.5f, 15.5f)
    }
}

/** Kopf mit Schultern -- Profil. */
val IkonePerson: ImageVector by lazy {
    strichzeichen("person") {
        moveTo(12f, 12f)
        arcToRelative(4f, 4f, 0f, true, true, 0f, -8f)
        arcToRelative(4f, 4f, 0f, true, true, 0f, 8f)
        close()
        moveTo(4.5f, 20.5f)
        curveTo(4.5f, 16.6f, 7.8f, 13.5f, 12f, 13.5f)
        curveTo(16.2f, 13.5f, 19.5f, 16.6f, 19.5f, 20.5f)
    }
}

/** Palette -- Erscheinungsbild. */
val IkonePalette: ImageVector by lazy {
    strichzeichen("palette") {
        moveTo(12f, 3f)
        curveTo(7f, 3f, 3f, 6.8f, 3f, 12f)
        curveTo(3f, 16.4f, 6.1f, 20f, 10.5f, 20.5f)
        curveTo(11.4f, 20.6f, 12f, 19.8f, 12f, 19f)
        curveTo(12f, 18.5f, 11.8f, 18.1f, 11.5f, 17.8f)
        curveTo(11.2f, 17.5f, 11f, 17.1f, 11f, 16.6f)
        curveTo(11f, 15.7f, 11.7f, 15f, 12.6f, 15f)
        lineTo(15f, 15f)
        curveTo(18.3f, 15f, 21f, 12.5f, 21f, 9.5f)
        curveTo(21f, 5.9f, 16.9f, 3f, 12f, 3f)
        close()
        moveTo(7f, 11f); lineTo(7.01f, 11f)
        moveTo(10f, 7.5f); lineTo(10.01f, 7.5f)
        moveTo(15f, 7.5f); lineTo(15.01f, 7.5f)
        moveTo(17f, 11f); lineTo(17.01f, 11f)
    }
}

/** Notizblock -- OneNote. */
val IkoneNotizen: ImageVector by lazy {
    strichzeichen("notizen") {
        moveTo(6f, 3.5f); lineTo(16f, 3.5f); lineTo(20.5f, 8f); lineTo(20.5f, 20.5f); lineTo(6f, 20.5f); close()
        moveTo(16f, 3.5f); lineTo(16f, 8f); lineTo(20.5f, 8f)
        moveTo(9f, 12f); lineTo(17.5f, 12f)
        moveTo(9f, 16f); lineTo(17.5f, 16f)
    }
}

/** Tuer mit Pfeil -- Konto. */
val IkoneKonto: ImageVector by lazy {
    strichzeichen("konto") {
        moveTo(13f, 4f); lineTo(6f, 4f); lineTo(6f, 20f); lineTo(13f, 20f)
        moveTo(11f, 12f); lineTo(20.5f, 12f)
        moveTo(17.5f, 8.5f); lineTo(20.5f, 12f); lineTo(17.5f, 15.5f)
    }
}

package dev.atlas.schule.data

import android.content.Context
import androidx.core.content.edit

/** Die drei Kacheln aus den Einstellungen, genau wie im Web (light/dark/system). */
enum class Erscheinungsbild {
    HELL,
    DUNKEL,
    SYSTEM,
}

/**
 * Haelt die Wahl aus "Erscheinungsbild" ueber Neustarts hinweg. Gleiches
 * Muster wie CookieSpeicher: private SharedPreferences, ein Schluessel.
 */
class ErscheinungsbildSpeicher(context: Context) {
    private val ablage = context.applicationContext
        .getSharedPreferences("atlas-einstellungen", Context.MODE_PRIVATE)

    fun lies(): Erscheinungsbild {
        val name = ablage.getString(SCHLUESSEL, null) ?: return Erscheinungsbild.SYSTEM
        return runCatching { Erscheinungsbild.valueOf(name) }.getOrDefault(Erscheinungsbild.SYSTEM)
    }

    fun schreibe(wert: Erscheinungsbild) {
        ablage.edit { putString(SCHLUESSEL, wert.name) }
    }

    private companion object {
        const val SCHLUESSEL = "erscheinungsbild"
    }
}

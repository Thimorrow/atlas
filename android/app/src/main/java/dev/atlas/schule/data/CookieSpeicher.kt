package dev.atlas.schule.data

import android.content.Context
import androidx.core.content.edit
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Haelt das Anmelde-Cookie ueber Neustarts hinweg. `atlas-gate` gilt ein Jahr,
 * ein Cookie nur im Arbeitsspeicher wuerde den Nutzer bei jedem Kaltstart
 * erneut vor das Passwortfeld setzen.
 *
 * Das Cookie ist HttpOnly und signiert, es ist kein Passwort. Es landet
 * trotzdem in den privaten SharedPreferences der App, die ausserhalb der App
 * auf einem unveraenderten Geraet nicht lesbar sind.
 */
class CookieSpeicher(context: Context) : CookieJar {
    private val ablage = context.applicationContext
        .getSharedPreferences("atlas-cookies", Context.MODE_PRIVATE)

    // Gelesen wird bei jeder Anfrage, geschrieben selten. Der Cache spart das
    // Neuparsen, die Ablage ueberlebt den Prozess.
    private var zwischenspeicher: MutableMap<String, Cookie> = laden()

    private fun laden(): MutableMap<String, Cookie> {
        val basis = ATLAS_BASIS_URL.toHttpUrlOrNull() ?: return mutableMapOf()
        return ablage.getStringSet(SCHLUESSEL, emptySet())
            .orEmpty()
            .mapNotNull { Cookie.parse(basis, it) }
            // Ein abgelaufenes Cookie taeuscht eine Anmeldung vor, die der
            // Server nicht mehr akzeptiert. Beim Laden gleich aussortieren.
            .filter { it.expiresAt > System.currentTimeMillis() }
            .associateBy { it.name }
            .toMutableMap()
    }

    private fun sichern() {
        ablage.edit { putStringSet(SCHLUESSEL, zwischenspeicher.values.map { it.toString() }.toSet()) }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        for (cookie in cookies) {
            // Ein Cookie mit Ablauf in der Vergangenheit ist ein Loeschbefehl,
            // so meldet DELETE /api/login ab.
            if (cookie.expiresAt <= System.currentTimeMillis()) {
                zwischenspeicher.remove(cookie.name)
            } else {
                zwischenspeicher[cookie.name] = cookie
            }
        }
        sichern()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val jetzt = System.currentTimeMillis()
        val abgelaufen = zwischenspeicher.values.filter { it.expiresAt <= jetzt }
        if (abgelaufen.isNotEmpty()) {
            abgelaufen.forEach { zwischenspeicher.remove(it.name) }
            sichern()
        }
        return zwischenspeicher.values.filter { it.matches(url) }
    }

    /** Nach einem 401 und beim Abmelden: der Zustand auf dem Geraet ist wertlos. */
    fun leeren() {
        if (zwischenspeicher.isEmpty()) return
        zwischenspeicher = mutableMapOf()
        ablage.edit { remove(SCHLUESSEL) }
    }

    /** Ohne gueltiges Gate-Cookie braucht die App den Anmeldebildschirm gar nicht erst zu verlassen. */
    fun hatGateCookie(): Boolean =
        zwischenspeicher[GATE_COOKIE]?.let { it.expiresAt > System.currentTimeMillis() } == true

    private companion object {
        const val SCHLUESSEL = "cookies"
    }
}

/** Reiner Arbeitsspeicher, fuer Tests und alles ohne Android-Kontext. */
class FluechtigerCookieSpeicher : CookieJar {
    private val cookies = mutableMapOf<String, Cookie>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookies.forEach { this.cookies[it.name] = it }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> =
        cookies.values.filter { it.matches(url) }

    fun gateCookie(): Cookie? = cookies[GATE_COOKIE]
}

const val GATE_COOKIE = "atlas-gate"

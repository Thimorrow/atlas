package dev.atlas.schule.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.CookieJar
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Die eine Stelle, an der die Adresse der Bereitstellung steht. Kein Slash am
 * Ende, alle Pfade unten beginnen mit einem.
 */
const val ATLAS_BASIS_URL = "https://atlas-ten-orpin.vercel.app"

private val JSON_TYP = "application/json".toMediaType()

/**
 * OkHttp statt Ktor. Ktors Android-Motor ist ohnehin OkHttp, die zusaetzliche
 * Schicht brauchte es also nur, wenn die App mehrere Plattformen bedienen
 * muesste. Was hier wirklich zaehlt, gibt OkHttp direkt her: eine CookieJar
 * genau fuer das Gate-Cookie und einen Interceptor genau fuer den 401.
 */
class AtlasApi(
    private val cookieSpeicher: CookieJar,
    private val basisUrl: String = ATLAS_BASIS_URL,
) {
    private val _abgemeldet = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /**
     * Feuert, wenn der Server eine Anfrage mit 401 beantwortet hat. Die
     * Oberflaeche geht daraufhin zurueck zur Anmeldung. Ein 401 kann jederzeit
     * kommen, nicht nur beim Start.
     */
    val abgemeldet: SharedFlow<Unit> = _abgemeldet

    private val client = OkHttpClient.Builder()
        .cookieJar(cookieSpeicher)
        .addInterceptor(AbmeldeAbfangjaeger())
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        // Der Server darf Felder ergaenzen, ohne dass eine aeltere App-Version
        // beim Einlesen stehenbleibt.
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private inner class AbmeldeAbfangjaeger : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val antwort = chain.proceed(chain.request())
            if (antwort.code == STATUS_NICHT_ANGEMELDET) {
                // Das gespeicherte Cookie ist nachweislich wertlos. Es stehen
                // zu lassen wuerde die App beim naechsten Start wieder in den
                // angemeldeten Zustand starten lassen, nur um sofort wieder
                // herauszufliegen.
                (cookieSpeicher as? CookieSpeicher)?.leeren()
                _abgemeldet.tryEmit(Unit)
            }
            return antwort
        }
    }

    /** POST /api/login. Das Passwort wird nur gesendet, nirgends abgelegt. */
    suspend fun anmelden(passwort: String): AtlasErgebnis<Unit> {
        val rumpf = json.encodeToString(LoginAnfrage(passwort)).toRequestBody(JSON_TYP)
        return anfrage(Request.Builder().url("$basisUrl/api/login").post(rumpf).build()) { }
    }

    /** DELETE /api/login. Der Server entwertet das Cookie, die CookieJar raeumt danach auf. */
    suspend fun abmelden(): AtlasErgebnis<Unit> =
        anfrage(Request.Builder().url("$basisUrl/api/login").delete().build()) { }
            .also { (cookieSpeicher as? CookieSpeicher)?.leeren() }

    /**
     * Ob ueberhaupt ein gueltiges Gate-Cookie vorliegt. Das entscheidet nur,
     * mit welchem Bildschirm die App startet; ob der Server das Cookie noch
     * akzeptiert, klaert die erste echte Anfrage und im Zweifel der 401.
     *
     * GET /api/session waere der saubere Weg, antwortet auf der aktuellen
     * Bereitstellung aber mit 404: die Route liegt im Repo, ist dort aber noch
     * nicht ausgerollt. Ein Startvorgang, der von ihr abhaengt, waere heute
     * kaputt, und dieser Weg spart ohnehin eine Anfrage.
     */
    fun hatGateCookie(): Boolean = (cookieSpeicher as? CookieSpeicher)?.hatGateCookie() ?: false

    /** GET /api/subjects. Ohne Parameter liefert der Server nur die aktiven Faecher. */
    suspend fun faecher(): AtlasErgebnis<List<SubjectDTO>> =
        anfrage(Request.Builder().url("$basisUrl/api/subjects").get().build()) { text ->
            json.decodeFromString<SubjectsAntwort>(text).subjects
        }

    /**
     * Der gemeinsame Weg jeder Anfrage: ausfuehren, Fehler in [AtlasErgebnis]
     * uebersetzen, den Rumpf nur im Erfolgsfall lesen. Jede Ausnahme endet
     * hier, keine verlaesst die Netzwerkschicht.
     */
    private suspend fun <T> anfrage(
        request: Request,
        lies: (String) -> T,
    ): AtlasErgebnis<T> = withContext(Dispatchers.IO) {
        try {
            client.newCall(request).execute().use { antwort ->
                val text = antwort.body.string()
                if (!antwort.isSuccessful) {
                    return@withContext AtlasErgebnis.Fehler(serverMeldung(text, antwort.code), antwort.code)
                }
                AtlasErgebnis.Erfolg(lies(text))
            }
        } catch (e: IOException) {
            AtlasErgebnis.Fehler("Keine Verbindung zum Server.")
        } catch (e: Exception) {
            // Kaputtes JSON, unerwartete Form, alles andere. Der Nutzer kann
            // damit nichts anfangen, deshalb ein Satz statt einer Meldung aus
            // der Bibliothek.
            AtlasErgebnis.Fehler("Die Antwort des Servers war unverständlich.")
        }
    }

    /**
     * Fehlerantworten haben immer die Form {"error": "<deutscher Satz>"}. Wenn
     * doch einmal nicht, faellt die Meldung auf einen eigenen Satz zurueck,
     * damit nie roher HTML-Text im Fehlerfeld landet.
     */
    private fun serverMeldung(text: String, code: Int): String {
        val ausAntwort = runCatching { json.decodeFromString<FehlerAntwort>(text).error }.getOrNull()
        if (!ausAntwort.isNullOrBlank()) return ausAntwort
        return when (code) {
            STATUS_NICHT_ANGEMELDET -> "Nicht angemeldet."
            404 -> "Nicht gefunden."
            else -> "Der Server hat mit Fehler $code geantwortet."
        }
    }

    companion object {
        @Volatile
        private var instanz: AtlasApi? = null

        /**
         * Ein Client fuer die ganze App, damit Verbindungspool und Cookies
         * geteilt werden. Zwei Clients hiessen zwei Cookie-Staende.
         */
        fun fuer(context: Context): AtlasApi = instanz ?: synchronized(this) {
            instanz ?: AtlasApi(CookieSpeicher(context)).also { instanz = it }
        }
    }
}

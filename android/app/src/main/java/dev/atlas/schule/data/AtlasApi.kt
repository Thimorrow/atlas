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
import java.time.LocalDate
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
    /** Null in Tests und ueberall dort, wo es keinen Android-Kontext gibt. */
    private val speicher: AntwortSpeicher? = null,
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
                speicher?.leeren()
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
            .also {
                (cookieSpeicher as? CookieSpeicher)?.leeren()
                speicher?.leeren()
            }

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
     * GET /api/home. Woche, offene Aufgaben, aktive Faecher und Sync-Stand in
     * einem Aufruf. [datum] muss das lokale Datum des Geraets sein: ohne den
     * Parameter nimmt der Server sein eigenes und zeigt am Abend die falsche
     * Woche.
     */
    suspend fun start(datum: LocalDate): AtlasErgebnis<HomeAntwort> =
        anfrage(
            Request.Builder().url("$basisUrl/api/home?date=$datum").get().build(),
            merke = SCHLUESSEL_START,
        ) { text -> json.decodeFromString<HomeAntwort>(text) }

    /**
     * Der zuletzt erfolgreich geladene Startbildschirm von der Platte. Er wird
     * gezeigt, waehrend im Hintergrund neu geladen wird, damit die App im
     * Schulgebaeude ohne Netz nicht leer dasteht.
     *
     * Das gespeicherte Datum wird nicht geprueft: ein Stundenplan von gestern
     * ist mehr wert als ein leerer Bildschirm, und die Zeile mit dem Stand
     * sagt dem Nutzer ohnehin, wie alt er ist.
     */
    suspend fun startGespeichert(): Zwischenstand<HomeAntwort>? =
        gespeichert(SCHLUESSEL_START) { json.decodeFromString<HomeAntwort>(it) }

    /**
     * GET /api/calendar?view=week. Fuer jede Woche ausser der aktuellen: die
     * Aufgaben- und Faecherlisten aendern sich beim Blaettern nicht, nur das
     * Raster. /api/home noch einmal zu holen waere dreimal so viel Antwort.
     */
    suspend fun woche(datum: LocalDate): AtlasErgebnis<ExpandedRange> =
        anfrage(
            Request.Builder().url("$basisUrl/api/calendar?view=week&date=$datum").get().build(),
        ) { text -> json.decodeFromString<ExpandedRange>(text) }

    /** GET /api/subjects/{id}. Fach mit Notizen, Aufgaben und naechsten Stunden. */
    suspend fun fachDetail(id: String): AtlasErgebnis<FachDetailAntwort> =
        anfrage(
            Request.Builder().url("$basisUrl/api/subjects/$id").get().build(),
            merke = schluesselFach(id),
        ) { text -> json.decodeFromString<FachDetailAntwort>(text) }

    /** Das zuletzt erfolgreich geladene Fachdetail von der Platte. */
    suspend fun fachDetailGespeichert(id: String): Zwischenstand<FachDetailAntwort>? =
        gespeichert(schluesselFach(id)) { json.decodeFromString<FachDetailAntwort>(it) }

    /**
     * Gespeicherten Rumpf lesen und einlesen. Scheitert das Einlesen, weil die
     * Datei aus einer aelteren App-Version stammt, gibt es eben nichts
     * vorzuzeigen; der laufende Abruf ersetzt sie gleich.
     */
    private suspend fun <T> gespeichert(
        schluessel: String,
        lies: (String) -> T,
    ): Zwischenstand<T>? = withContext(Dispatchers.IO) {
        val roh = speicher?.lies(schluessel) ?: return@withContext null
        runCatching { Zwischenstand(lies(roh.wert), roh.stand) }.getOrNull()
    }

    /**
     * GET /api/assignments?completed=1. Fuer den "Erledigt"-Abschnitt der
     * Aufgabenliste: der Server mischt Offene und Erledigte, das Ausfiltern
     * der Offenen uebernimmt die Oberflaeche.
     */
    suspend fun erledigteAufgaben(): AtlasErgebnis<List<AssignmentDTO>> =
        anfrage(
            Request.Builder().url("$basisUrl/api/assignments?completed=1").get().build(),
            merke = SCHLUESSEL_ERLEDIGT,
        ) { text -> json.decodeFromString<AssignmentsAntwort>(text).assignments }

    /** Der zuletzt erfolgreich geladene "Erledigt"-Abschnitt von der Platte. */
    suspend fun erledigteAufgabenGespeichert(): Zwischenstand<List<AssignmentDTO>>? =
        gespeichert(SCHLUESSEL_ERLEDIGT) { json.decodeFromString<AssignmentsAntwort>(it).assignments }

    /**
     * POST bzw. DELETE auf /api/assignments/{id}/complete. Der POST ist
     * idempotent, ein zweiter Aufruf laesst completedAt stehen.
     */
    suspend fun abhaken(id: String, erledigt: Boolean): AtlasErgebnis<AssignmentDTO> {
        val url = "$basisUrl/api/assignments/$id/complete"
        val bauer = Request.Builder().url(url)
        val request = if (erledigt) {
            bauer.post(ByteArray(0).toRequestBody(null)).build()
        } else {
            bauer.delete().build()
        }
        return anfrage(request) { text -> json.decodeFromString<AssignmentAntwort>(text).assignment }
    }

    /** POST /api/assignments. Antwortet mit 201 und der angelegten Aufgabe. */
    suspend fun aufgabeAnlegen(neu: NeueAufgabeAnfrage): AtlasErgebnis<AssignmentDTO> {
        val rumpf = json.encodeToString(neu).toRequestBody(JSON_TYP)
        return anfrage(Request.Builder().url("$basisUrl/api/assignments").post(rumpf).build()) { text ->
            json.decodeFromString<AssignmentAntwort>(text).assignment
        }
    }

    /**
     * POST /api/sync/untis, ohne Rumpf: das uebliche Fenster (letzte Woche bis
     * in drei Wochen). Bei Erfolg kommen Anzahl und Zeitraum zurueck, bei
     * Misserfolg ein deutscher Satz -- [AtlasErgebnis.Fehler.ohneVerbindung]
     * unterscheidet dabei schon "kein Netz" von "Server hat abgelehnt", genau
     * die Unterscheidung, die die Einstellungen fuer ihre Meldung brauchen.
     */
    suspend fun syncUntis(): AtlasErgebnis<SyncUntisAntwort> =
        anfrage(
            Request.Builder().url("$basisUrl/api/sync/untis").post(ByteArray(0).toRequestBody(null)).build(),
        ) { text -> json.decodeFromString<SyncUntisAntwort>(text) }

    /**
     * GET /api/microsoft/status. enabled=false ist der Normalfall, solange
     * keine Azure-Registrierung hinterlegt ist, kein Fehler.
     */
    suspend fun microsoftStatus(): AtlasErgebnis<MicrosoftStatusAntwort> =
        anfrage(Request.Builder().url("$basisUrl/api/microsoft/status").get().build()) { text ->
            json.decodeFromString<MicrosoftStatusAntwort>(text)
        }

    /** GET /api/subjects/{id}/grades. Noten und Schnitt eines Fachs. */
    suspend fun noten(fachId: String): AtlasErgebnis<GradesAntwort> =
        anfrage(Request.Builder().url("$basisUrl/api/subjects/$fachId/grades").get().build()) { text ->
            json.decodeFromString<GradesAntwort>(text)
        }

    /** POST /api/subjects/{id}/grades. Antwortet mit 201, der neuen Note und dem neuen Schnitt. */
    suspend fun noteAnlegen(fachId: String, neu: NeueNoteAnfrage): AtlasErgebnis<GradeAntwort> {
        val rumpf = json.encodeToString(neu).toRequestBody(JSON_TYP)
        return anfrage(
            Request.Builder().url("$basisUrl/api/subjects/$fachId/grades").post(rumpf).build(),
        ) { text -> json.decodeFromString<GradeAntwort>(text) }
    }

    /**
     * Der gemeinsame Weg jeder Anfrage: ausfuehren, Fehler in [AtlasErgebnis]
     * uebersetzen, den Rumpf nur im Erfolgsfall lesen. Jede Ausnahme endet
     * hier, keine verlaesst die Netzwerkschicht.
     */
    private suspend fun <T> anfrage(
        request: Request,
        /** Gesetzt, wenn die Antwort fuer den netzlosen Start abgelegt werden soll. */
        merke: String? = null,
        lies: (String) -> T,
    ): AtlasErgebnis<T> = withContext(Dispatchers.IO) {
        try {
            client.newCall(request).execute().use { antwort ->
                val text = antwort.body.string()
                if (!antwort.isSuccessful) {
                    return@withContext AtlasErgebnis.Fehler(serverMeldung(text, antwort.code), antwort.code)
                }
                val wert = AtlasErgebnis.Erfolg(lies(text))
                // Erst nach dem Einlesen ablegen: was die App nicht lesen
                // kann, soll sie beim naechsten Start nicht vorzeigen.
                merke?.let { speicher?.schreibe(it, text) }
                wert
            }
        } catch (e: IOException) {
            AtlasErgebnis.Fehler("Keine Verbindung zum Server.", ohneVerbindung = true)
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
            instanz ?: AtlasApi(
                cookieSpeicher = CookieSpeicher(context),
                speicher = AntwortSpeicher(context),
            ).also { instanz = it }
        }

        private const val SCHLUESSEL_START = "home"
        private const val SCHLUESSEL_ERLEDIGT = "erledigt"

        private fun schluesselFach(id: String) = "fach-$id"
    }
}

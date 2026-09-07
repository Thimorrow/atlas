package dev.atlas.schule

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.atlas.schule.data.*
import dev.atlas.schule.ui.*
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.*
import org.junit.runner.RunWith
import java.io.File
import java.io.IOException
import java.time.LocalDate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Tests der echten Activity. Der Transport antwortet ausschließlich aus Fixtures;
 * keine Anfrage und keine Teständerung erreicht das echte Schulkonto. */
@RunWith(AndroidJUnit4::class)
class NativeAppTest {
    @get:Rule val testName = org.junit.rules.TestName()
    @get:Rule val compose = createEmptyComposeRule()
    private lateinit var scenario: ActivityScenario<MainActivity>
    private lateinit var vm: AtlasViewModel
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val today = LocalDate.now()
    private val subject = SubjectDTO("fach-test", "Mathematik", teacherLabel = "Herr Beispiel", room = "A221", color = "blue")
    private val subjects = listOf(subject.copy(noteCount = 3),
        SubjectDTO("deutsch", "Deutsch", teacherLabel = "Herr Spillmann", room = "A221", color = "rose", noteCount = 2),
        SubjectDTO("bio", "Biologie", teacherLabel = "Frau Taddey", room = "CH 2", color = "green"),
        SubjectDTO("englisch", "Englisch", teacherLabel = "Herr Baumgart", room = "A221", color = "yellow", noteCount = 1),
        SubjectDTO("geschichte", "Geschichte", teacherLabel = "Herr Baumgart", room = "A221", color = "violet"),
        SubjectDTO("physik", "Physik", teacherLabel = "Herr Wirth", room = "PH 1", color = "lime"))
    private val assignment = AssignmentDTO("aufgabe-test", subject.id, subject.name, "blue", "homework", "Brüche üben", dueDate = today.plusDays(1))
    @Volatile private var assignments = listOf(assignment,
        AssignmentDTO("deutsch-aufgabe", "deutsch", "Deutsch", "rose", "homework", "Gedichtanalyse vorbereiten", dueDate = today.plusDays(2)),
        AssignmentDTO("englisch-aufgabe", "englisch", "Englisch", "yellow", "homework", "Vokabeln: Unit 3", dueDate = today),
        AssignmentDTO("mathe-pruefung", subject.id, subject.name, "blue", "exam", "Klassenarbeit: Lineare Funktionen", dueDate = today.plusDays(7)))
    private lateinit var transport: OkHttpClient
    private val week = ExpandedRange(montagVon(today), montagVon(today).plusDays(6), (0..4).map { day ->
        val date = montagVon(today).plusDays(day.toLong())
        val starts = listOf("08:00", "09:50", "11:40", "13:40")
        val ends = listOf("09:30", "11:20", "13:10", "15:10")
        val order = listOf(listOf(0, 1, 2, 3), listOf(3, 0, 4, 5), listOf(1, 2, 3, 0), listOf(5, 4, 0, 1), listOf(2, 3, 1, 4))
        ExpandedDay(date, day, order[day].mapIndexed { index, subjectIndex ->
            val fach = subjects[subjectIndex]
            CalendarEvent("school", "stunde-$day-$index", date, starts[index], ends[index], fach.name, "regular", fach.room)
        })
    })
    @Volatile private var offline = false
    @Volatile private var delayedSave: CountDownLatch? = null
    private var saveStarted = CountDownLatch(1)
    private var note = "Zeile einer längeren Stundennotiz.\n".repeat(24)
    private var count = 5

    @Before fun setup() {
        val cookies = CookieSpeicher(context)
        cookies.leeren()
        AntwortSpeicher(context).leeren()
        val url = ATLAS_BASIS_URL.toHttpUrl()
        cookies.saveFromResponse(url, listOf(Cookie.Builder().name(GATE_COOKIE).value("test-only").hostOnlyDomain(url.host).path("/").expiresAt(System.currentTimeMillis() + 3600000).build()))
        val api = AtlasApi(cookies, speicher = AntwortSpeicher(context))
        val field = AtlasApi::class.java.getDeclaredField("client").apply { isAccessible = true }
        val client = (field.get(api) as OkHttpClient).newBuilder().addInterceptor { chain ->
            if (offline) throw IOException("Test: offline")
            val request = chain.request()
            val path = request.url.encodedPath
            val response = when {
                path == "/api/home" -> Json.encodeToString(HomeAntwort(week, assignments, subjects))
                path == "/api/calendar" -> Json.encodeToString(week)
                path == "/api/assignments" && request.method == "POST" -> {
                    val body = okio.Buffer().also { request.body!!.writeTo(it) }.readUtf8()
                    val input = Json.decodeFromString<NeueAufgabeAnfrage>(body)
                    val created = AssignmentDTO("neu", input.subjectId, subjects.find { it.id == input.subjectId }?.name, type = input.type, title = input.title, dueDate = input.dueDate)
                    assignments = assignments + created
                    Json.encodeToString(AssignmentAntwort(created))
                }
                path == "/api/assignments" -> Json.encodeToString(AssignmentsAntwort(assignments))
                path == "/api/subjects" -> Json.encodeToString(SubjectsAntwort(subjects))
                path == "/api/subjects/${subject.id}" -> Json.encodeToString(FachDetailAntwort(subject))
                path.endsWith("/grades") -> "{\"grades\":[],\"summary\":{},\"subjects\":[],\"recentGrades\":[]}"
                path.endsWith("/files") -> "{\"files\":[]}"
                path == "/api/morgen" -> Json.encodeToString(MorgenAntwort(today.toString(), MorgenTargetDTO(today.plusDays(1).toString(), true, "Morgen"),
                    day = MorgenDayDTO(today.plusDays(1).toString(), 1, subjects.take(3).mapIndexed { index, fach ->
                        MorgenLessonDTO("fokus-$index", listOf("07:50", "09:40", "11:30")[index], listOf("09:20", "11:10", "13:00")[index], fach.name, room = fach.room, teacher = fach.teacherLabel, subjectId = fach.id, subjectColor = fach.color)
                    }), due = (0..7).map { assignment.copy(id = "a-$it", title = if (it == 7) "Letzte Aufgabe" else "Aufgabe $it") }))
                path == "/api/bot" -> Json.encodeToString(BotStartAntwort(true, "Was möchtest du lernen?", listOf("Was steht morgen an?"), "chat-test"))
                path == "/api/bot/verlauf" -> Json.encodeToString(BotVerlaufAntwort(listOf(BotVerlaufEintragDTO("chat-test", "Testgespräch"))))
                path == "/api/bot/verlauf/chat-test" -> Json.encodeToString(BotVerlaufDetailAntwort("chat-test", "Testgespräch", listOf(BotTurnDTO("assistant", "Wir üben Brüche."))))
                path.endsWith("/note") -> {
                    if (request.method == "PUT") {
                        saveStarted.countDown()
                        delayedSave?.await(10, TimeUnit.SECONDS)
                        "{\"note\":{\"id\":\"notiz-test\",\"body\":\"Gespeicherte erste Stunde\"}}"
                    } else Json.encodeToString(LessonNoteAntwort(LessonNoteBodyDTO("notiz-test", if (path.contains("stunde-2")) "Zweite Stunde" else note)))
                }
                path.endsWith("/participation") -> {
                    if (request.method == "PUT") {
                        val body = okio.Buffer().also { request.body!!.writeTo(it) }.readUtf8()
                        val input = Json.parseToJsonElement(body).toString()
                        if (!input.contains("\"count\"")) error("API erwartet count statt points: $input")
                    }
                    "{\"participation\":{\"id\":\"meldung-test\",\"count\":$count,\"updatedAt\":\"2026-09-07T10:00:00Z\"}}"
                }
                path.endsWith("/next-due") -> "{\"dueDate\":\"${today.plusDays(7)}\"}"
                path == "/api/microsoft/status" -> "{\"enabled\":false,\"connected\":false}"
                else -> error("Ungeplante Anfrage im Gerätetest: ${request.method} $path")
            }
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK").body(response.toResponseBody("application/json".toMediaType())).build()
        }.build()
        transport = client
        field.set(api, client)
        AtlasApi::class.java.getDeclaredField("instanz").apply { isAccessible = true }.set(null, api)
        scenario = ActivityScenario.launch(MainActivity::class.java)
        scenario.onActivity { vm = ViewModelProvider(it)[AtlasViewModel::class.java] }
        compose.waitUntil(10000) { (vm.zustand.value as? AtlasZustand.App)?.start is Ladung.Da }
    }

    @After fun cleanup() {
        delayedSave?.countDown()
        runCatching { screenshot("qa-${testName.methodName}") }
        if (::scenario.isInitialized) scenario.close()
        AtlasApi::class.java.getDeclaredField("instanz").apply { isAccessible = true }.set(null, null)
    }

    private fun tab(text: String) = compose.onAllNodes((hasText(text) or hasContentDescription(text)) and hasClickAction()).onFirst().performClick()
    private fun screenshot(name: String) {
        compose.waitForIdle()
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(context.filesDir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()

    }

    @Test fun navigationUndOfflineErhalt() {
        tab("Aufgaben")
        compose.waitUntil(10000) { compose.onNodeWithContentDescription("Brüche üben, Mathematik").isDisplayed() }
        compose.onNodeWithContentDescription("Brüche üben, Mathematik").assertIsDisplayed()
        screenshot("qa-aufgaben")
        tab("Fächer")
        screenshot("qa-faecher")
        tab("Aufgaben")
        offline = true
        scenario.onActivity { vm.aktualisiere() }
        compose.waitUntil(10000) { (vm.zustand.value as? AtlasZustand.App)?.startStand?.veraltet == true }
        compose.onNodeWithContentDescription("Brüche üben, Mathematik").assertIsDisplayed()
        screenshot("qa-offline")
        offline = false
        scenario.onActivity { vm.aktualisiere() }
        compose.waitUntil(10000) { (vm.zustand.value as? AtlasZustand.App)?.startStand?.veraltet == false }
        tab("Fächer")
        compose.onNodeWithContentDescription("Mathematik, Herr Beispiel · A221, keine offene Aufgabe").performClick()
        compose.onNodeWithContentDescription("Zurück zur Fächerliste").assertIsDisplayed()
        scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        compose.onNodeWithContentDescription("Mathematik, Herr Beispiel · A221, keine offene Aufgabe").assertIsDisplayed()
        tab("Einstellungen")
        screenshot("qa-einstellungen")
    }

    @Test fun systemZurueckSchliesstBotVerlauf() {
        tab("Atlas")
        compose.waitUntil(10000) { vm.botZustand.value.verlauf is Ladung.Da }
        compose.onNode(hasText("Testgespräch") and hasClickAction()).performClick()
        compose.waitUntil(10000) { vm.botZustand.value.detail is Ladung.Da }
        compose.waitForIdle()
        scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        Assert.assertNull(vm.botZustand.value.detail)
        compose.onNodeWithText("Atlas fragen").assertIsDisplayed()
    }

    @Test fun langeNotizBleibtBedienbarUndMeldungenWerdenGeladen() {
        scenario.onActivity { vm.oeffneStunde("stunde-1", "Mathematik", today, "08:00") }
        compose.waitUntil(10000) { !vm.stundeDetail.value.laeuft }
        Assert.assertEquals(5, vm.stundeDetail.value.meldung)
        compose.onNodeWithText("Meldung speichern").performScrollTo().assertIsDisplayed()
        screenshot("qa-stundennotiz")
        compose.onNodeWithText("Meldung speichern").performClick()
        compose.waitUntil(10000) { !vm.stundeDetail.value.laeuft }
        Assert.assertNull(vm.stundeDetail.value.fehler)
    }

    @Test fun spaeteNotizAntwortUeberschreibtKeineAndereStunde() {
        note = "Erste Stunde"
        scenario.onActivity { vm.oeffneStunde("stunde-1") }
        compose.waitUntil(10000) { !vm.stundeDetail.value.laeuft }
        delayedSave = CountDownLatch(1)
        scenario.onActivity { vm.stundenNotizSpeichern("Geändert") }
        Assert.assertTrue(saveStarted.await(5, TimeUnit.SECONDS))
        scenario.onActivity { vm.schliesseStunde(); vm.oeffneStunde("stunde-2") }
        compose.waitUntil(10000) { vm.stundeDetail.value.notiz == "Zweite Stunde" }
        delayedSave!!.countDown()
        compose.waitUntil(10000) { !vm.stundeDetail.value.laeuft }
        // Erst den Transport und dann die UI-Zustandsänderung abwarten.
        compose.waitUntil(10000) { transport.dispatcher.runningCallsCount() == 0 }
        compose.waitForIdle()
        Assert.assertEquals("Zweite Stunde", vm.stundeDetail.value.notiz)
    }
    @Test fun fokusUndWocheHabenEigenenPlatz() {
        compose.onNodeWithText("Woche").assertIsDisplayed()
        screenshot("qa-stundenplan")
        compose.onNodeWithText("Fokus").performClick()
        compose.waitUntil(10000) { vm.morgenZustand.value.ladung is Ladung.Da }
        screenshot("qa-fokus")
        compose.onNodeWithText("Letzte Aufgabe").performScrollTo().assertIsDisplayed()
        screenshot("qa-fokus-ende")
        offline = true
        scenario.onActivity { vm.ladeMorgen() }
        compose.waitUntil(10000) { vm.morgenZustand.value.fehler != null }
        Assert.assertTrue(vm.morgenZustand.value.ladung is Ladung.Da)
        offline = false
        scenario.onActivity { vm.ladeMorgen() }
        compose.waitUntil(10000) { vm.morgenZustand.value.fehler == null }
        compose.onNodeWithText("Woche").performClick()
        compose.onNodeWithText("Woche").assertIsDisplayed()
    }

    @Test fun volleWocheImLightmode() {
        ErscheinungsbildSpeicher(context).schreibe(Erscheinungsbild.HELL)
        scenario.recreate()
        compose.onNodeWithText("Woche").assertIsDisplayed()
        compose.waitForIdle()
        screenshot("qa-stundenplan-light-voll")
    }

    @Test fun ungespeicherteNotizKannWeiterBearbeitetWerden() {
        note = "Original"
        scenario.onActivity { vm.oeffneStunde("stunde-1", "Mathematik") }
        compose.waitUntil(10000) { !vm.stundeDetail.value.laeuft }
        compose.onNode(hasSetTextAction()).performTextReplacement("Mein ungespeicherter Entwurf")
        compose.onNodeWithText("Schließen").performScrollTo().performClick()
        compose.onNodeWithText("Änderungen verwerfen?").assertIsDisplayed()
        compose.onNodeWithText("Weiter bearbeiten").performClick()
        compose.onNode(hasSetTextAction()).assertTextEquals("Mein ungespeicherter Entwurf")
        screenshot("qa-entwurf")
    }

    @Test fun aufgabeAnlegenUndPruefungVorbelegen() {
        tab("Aufgaben")
        compose.onNodeWithText("Hausaufgabe hinzufügen").performClick()
        compose.onNodeWithContentDescription("Titel").performTextInput("Übungsaufgabe")
        compose.onNode(hasText("Heute") and hasClickAction()).performScrollTo().performClick()
        scenario.recreate()
        compose.onNodeWithContentDescription("Titel").assertTextEquals("Übungsaufgabe")
        compose.onNodeWithText("Aufgabe anlegen").performScrollTo().performClick()
        compose.waitUntil(10000) { (vm.zustand.value as? AtlasZustand.App)?.blatt == null }
        compose.onNodeWithContentDescription("Übungsaufgabe, Allgemein").performScrollTo().assertIsDisplayed()
        Assert.assertEquals(today, assignments.single { it.title == "Übungsaufgabe" }.dueDate)
        compose.onNodeWithText("Prüfungen").performClick()
        compose.onNodeWithText("Prüfung hinzufügen").performClick()
        Assert.assertEquals("exam", (vm.zustand.value as AtlasZustand.App).blatt?.typ)
        screenshot("qa-pruefung-anlegen")
    }

}

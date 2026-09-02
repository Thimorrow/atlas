package dev.atlas.schule.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.atlas.schule.data.AssignmentDTO
import dev.atlas.schule.data.AtlasApi
import dev.atlas.schule.data.AtlasErgebnis
import dev.atlas.schule.data.ExpandedRange
import dev.atlas.schule.data.FachDetailAntwort
import dev.atlas.schule.data.GradesAntwort
import dev.atlas.schule.data.NeueAufgabeAnfrage
import dev.atlas.schule.data.NeueNoteAnfrage
import dev.atlas.schule.data.SubjectDTO
import dev.atlas.schule.data.SyncDTO
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate

/** Die vier Ziele der unteren Leiste. Die Reihenfolge ist die Reihenfolge dort. */
enum class Reiter(val bezeichnung: String) {
    STUNDENPLAN("Stundenplan"),
    AUFGABEN("Aufgaben"),
    FAECHER("Fächer"),
    EINSTELLUNGEN("Einstellungen"),
}

/** Was /api/home ausser der Woche liefert. Die Woche liegt im Wochenspeicher. */
data class Startdaten(
    val aufgaben: List<AssignmentDTO>,
    val faecher: List<SubjectDTO>,
    val sync: SyncDTO?,
)

/**
 * Wann die gezeigten Daten vom Server kamen und ob der letzte Abruf scheiterte.
 * Nur wenn beides zusammenkommt, sieht der Nutzer eine Zeile darueber: solange
 * frisch nachgeladen wird, ist das Alter der Daten keine Nachricht.
 */
data class Stand(
    val zeit: Instant,
    val veraltet: Boolean = false,
    /** Warum der letzte Abruf scheiterte. Entscheidet ueber den zweiten Halbsatz der Standzeile. */
    val ohneVerbindung: Boolean = false,
)

/**
 * Was schon feststeht, wenn das Blatt aus einer Schulstunde heraus aufgeht.
 * null heisst: ueber das Pluszeichen geoeffnet, also ohne Vorgabe.
 */
data class Vorbelegung(
    /** Das Fach aus der Fachliste, null wenn die Stunde dort keins hat. */
    val fachId: String?,
    /** Der Fachname aus Untis, als Rueckfallebene fuer den Server. */
    val untisFach: String,
    /** Die naechste Stunde desselben Fachs, null wenn in der Woche keine mehr kommt. */
    val faellig: LocalDate?,
)

/** Das Blatt fuer eine neue Aufgabe, solange es offen ist. */
data class BlattZustand(
    val laeuft: Boolean = false,
    val fehler: String? = null,
    val vorbelegung: Vorbelegung? = null,
)

/**
 * Noten und Schnitt eines Fachs, dazu das Blatt fuer eine neue Note.
 *
 * Ein eigener StateFlow statt eines Feldes auf AtlasZustand.App: AtlasZustand
 * ist in Zustaende.kt definiert, das fuer diese Aufgabe gesperrt ist. Das
 * detailFachId-Muster aus holeDetail() gilt hier genauso ueber [fachId]: eine
 * spaete Antwort fuer ein inzwischen verlassenes Fach darf nicht mehr
 * geschrieben werden.
 */
data class NotenZustand(
    /** null heisst: kein Fach mit Notenansicht offen. */
    val fachId: String? = null,
    val noten: Ladung<GradesAntwort>? = null,
    val blattOffen: Boolean = false,
    val blattLaeuft: Boolean = false,
    val blattFehler: String? = null,
)

sealed interface AtlasZustand {
    data class Anmeldung(
        val fehler: String? = null,
        val laeuft: Boolean = false,
    ) : AtlasZustand

    data class App(
        val heute: LocalDate,
        val reiter: Reiter = Reiter.STUNDENPLAN,
        val start: Ladung<Startdaten> = Ladung.Laedt,
        /** Herkunft von [start], null solange nie etwas ankam. */
        val startStand: Stand? = null,
        /** Wochenraster, nach dem Montag der Woche abgelegt. Geblaetterte Wochen bleiben stehen. */
        val wochen: Map<LocalDate, Ladung<ExpandedRange>> = emptyMap(),
        val gezeigteWoche: LocalDate,
        /** Laeuft ein Ziehen von oben. Getrennt von [start], damit die Liste dabei stehen bleibt. */
        val aktualisiert: Boolean = false,
        /** null heisst: kein Fachdetail offen. */
        val detail: Ladung<FachDetailAntwort>? = null,
        /** Herkunft von [detail]. */
        val detailStand: Stand? = null,
        /** Steht auch dann, wenn das Detail im Fehler haengt -- sonst gaebe es kein "erneut laden". */
        val detailFachId: String? = null,
        val blatt: BlattZustand? = null,
        /** Einzeiler ueber der Leiste, etwa wenn ein Haken nicht durchkam. */
        val hinweis: String? = null,
        /** Der eingeklappte "Erledigt"-Abschnitt der Aufgabenliste. */
        val erledigt: Ladung<List<AssignmentDTO>> = Ladung.Laedt,
        /** Herkunft von [erledigt]. */
        val erledigtStand: Stand? = null,
        /** Ob der Abschnitt gerade aufgeklappt ist. */
        val erledigtAusgeklappt: Boolean = false,
    ) : AtlasZustand
}

/** Montag der Woche, in der [datum] liegt. Die Woche laeuft Montag bis Sonntag. */
fun montagVon(datum: LocalDate): LocalDate = datum.with(DayOfWeek.MONDAY)

class AtlasViewModel(anwendung: Application) : AndroidViewModel(anwendung) {
    private val api = AtlasApi.fuer(anwendung)

    // Das gespeicherte Cookie entscheidet ueber den Startbildschirm, und zwar
    // ohne Umweg ueber eine Anfrage: sonst blitzte beim Start kurz die
    // Anmeldung auf, bevor der Server geantwortet hat. Ob der Server das
    // Cookie noch akzeptiert, beantwortet der erste Abruf; ein 401 schickt den
    // Nutzer ueber den Abfangjaeger zurueck zur Anmeldung.
    private val _zustand = MutableStateFlow<AtlasZustand>(
        if (api.hatGateCookie()) frischeApp() else AtlasZustand.Anmeldung(),
    )
    val zustand: StateFlow<AtlasZustand> = _zustand.asStateFlow()

    private val _notenZustand = MutableStateFlow(NotenZustand())
    val notenZustand: StateFlow<NotenZustand> = _notenZustand.asStateFlow()

    private fun frischeApp(): AtlasZustand.App {
        val heute = LocalDate.now()
        return AtlasZustand.App(heute = heute, gezeigteWoche = montagVon(heute))
    }

    init {
        if (_zustand.value is AtlasZustand.App) {
            viewModelScope.launch {
                // Erst der gespeicherte Stand, dann der Abruf. So steht der
                // Stundenplan schon da, waehrend das Netz noch sucht -- und im
                // Schulgebaeude bleibt er stehen, wenn es nichts findet.
                zeigeGespeichertenStart()
                ladeStart()
            }
            viewModelScope.launch {
                zeigeGespeicherteErledigte()
                ladeErledigte()
            }
        }
        // Ein 401 kann jederzeit kommen, etwa wenn das Passwort auf dem Server
        // gewechselt wurde. Dann zurueck vor die Tuer, egal wo man gerade war.
        viewModelScope.launch {
            api.abgemeldet.collect {
                if (_zustand.value !is AtlasZustand.Anmeldung) {
                    _zustand.value = AtlasZustand.Anmeldung(fehler = "Die Anmeldung ist abgelaufen.")
                }
            }
        }
    }

    /** Kurzform fuer "aendere den App-Zustand, wenn wir ueberhaupt in der App sind". */
    private inline fun aendere(block: (AtlasZustand.App) -> AtlasZustand.App) {
        _zustand.update { if (it is AtlasZustand.App) block(it) else it }
    }

    private val app: AtlasZustand.App? get() = _zustand.value as? AtlasZustand.App

    fun anmelden(passwort: String) {
        val jetzt = _zustand.value
        if (jetzt !is AtlasZustand.Anmeldung || jetzt.laeuft) return
        _zustand.value = AtlasZustand.Anmeldung(laeuft = true)
        viewModelScope.launch {
            when (val ergebnis = api.anmelden(passwort)) {
                is AtlasErgebnis.Erfolg -> {
                    _zustand.value = frischeApp()
                    ladeStart()
                }
                // Der 401-Abfangjaeger hat hier schon einen Wechsel in die
                // Anmeldung ausgeloest. Die Meldung des Servers ist genauer als
                // seine, deshalb ueberschreibt sie ihn.
                is AtlasErgebnis.Fehler -> _zustand.value = AtlasZustand.Anmeldung(fehler = ergebnis.meldung)
            }
        }
    }

    /**
     * Das Fachdetail geht mit. Es haengt an der Fachliste, und ueber dem
     * Stundenplan stehenzubleiben waere ein Fenster ohne Bezug zu dem, was
     * darunter liegt.
     */
    fun waehleReiter(reiter: Reiter) = aendere {
        if (it.reiter == reiter) it else it.copy(reiter = reiter, detail = null, detailFachId = null)
    }

    fun hinweisGelesen() = aendere { it.copy(hinweis = null) }

    /** Erster Abruf und "Erneut laden" aus dem Fehlerzustand. */
    fun ladeNeu() {
        aendere { it.copy(start = Ladung.Laedt) }
        viewModelScope.launch { ladeStart() }
        viewModelScope.launch { ladeErledigte() }
    }

    private suspend fun zeigeGespeichertenStart() {
        val gespeichert = api.startGespeichert() ?: return
        val antwort = gespeichert.wert
        aendere { zustand ->
            // Ein laufender Abruf kann schneller gewesen sein als die Platte.
            // Frische Daten mit alten zu ueberschreiben waere ein Rueckschritt.
            if (zustand.start is Ladung.Da) return@aendere zustand
            zustand.copy(
                start = Ladung.Da(Startdaten(antwort.assignments, antwort.subjects, antwort.sync)),
                // Noch nicht veraltet: der Abruf laeuft ja gerade. Erst wenn er
                // scheitert, wird das Alter zur Nachricht.
                startStand = Stand(gespeichert.stand),
                // Auch hier gilt: was schon vom Server kam, bleibt.
                wochen = montagVon(antwort.week.start).let { montag ->
                    if (zustand.wochen[montag] is Ladung.Da) zustand.wochen
                    else zustand.wochen + (montag to Ladung.Da(antwort.week))
                },
            )
        }
    }

    /** Ziehen von oben. Die vorhandene Liste bleibt sichtbar, es kommt nur ein Ring dazu. */
    fun aktualisiere() {
        val jetzt = app ?: return
        if (jetzt.aktualisiert) return
        aendere { it.copy(aktualisiert = true) }
        viewModelScope.launch { ladeStart() }
        viewModelScope.launch { ladeErledigte() }
        // /api/home bringt nur die laufende Woche mit. Wer zwei Wochen weiter
        // steht und von oben zieht, saehe sonst zu, wie sich nichts aendert.
        if (jetzt.gezeigteWoche != montagVon(jetzt.heute)) ladeWoche(jetzt.gezeigteWoche)
    }

    private suspend fun ladeStart() {
        // Das lokale Datum des Geraets, nicht das des Servers: sonst zeigt die
        // App am Abend die Woche von morgen.
        val heute = LocalDate.now()
        when (val ergebnis = api.start(heute)) {
            is AtlasErgebnis.Erfolg -> {
                val antwort = ergebnis.wert
                aendere { zustand ->
                    zustand.copy(
                        heute = heute,
                        start = Ladung.Da(
                            Startdaten(antwort.assignments, antwort.subjects, antwort.sync),
                        ),
                        // Nur die aktuelle Woche wird ersetzt; geblaetterte
                        // Wochen bleiben gueltig und muessen nicht neu ueber
                        // die Leitung.
                        wochen = zustand.wochen + (montagVon(antwort.week.start) to Ladung.Da(antwort.week)),
                        startStand = Stand(Instant.now()),
                        aktualisiert = false,
                    )
                }
            }

            is AtlasErgebnis.Fehler -> {
                // Bei 401 hat der Abfangjaeger den Zustand schon gewechselt,
                // den soll diese Zuweisung nicht wieder umbiegen.
                aendere { zustand ->
                    zustand.copy(
                        // Beim Ziehen bleibt die alte Liste stehen und der
                        // Fehler kommt als Hinweis. Sie wegzuwerfen, nur weil
                        // gerade das Netz weg war, waere ein Rueckschritt.
                        start = if (zustand.start is Ladung.Da) zustand.start else Ladung.Fehler(ergebnis.meldung),
                        // Jetzt ist das Alter der Daten eine Nachricht.
                        startStand = zustand.startStand?.copy(
                            veraltet = true,
                            ohneVerbindung = ergebnis.ohneVerbindung,
                        ),
                        aktualisiert = false,
                        // Beim ersten Aufschlagen mit gespeichertem Stand sagt
                        // schon die Zeile darueber Bescheid, ein Schnipsel
                        // obendrauf waere doppelt. Beim Ziehen von oben hat der
                        // Nutzer selbst gefragt und will eine Antwort.
                        hinweis = if (zustand.aktualisiert) ergebnis.meldung else null,
                    )
                }
            }
        }
    }

    // --- Stundenplan ---------------------------------------------------------

    /** Wischen wechselt die Woche. Die Woche wird erst geholt, wenn sie sichtbar wird. */
    fun zeigeWoche(montag: LocalDate) {
        val jetzt = app ?: return
        aendere { it.copy(gezeigteWoche = montag) }
        if (jetzt.wochen[montag] == null) ladeWoche(montag)
    }

    fun ladeWoche(montag: LocalDate) {
        // Eine schon vorhandene Woche bleibt waehrend des Ladens stehen.
        aendere {
            if (it.wochen[montag] is Ladung.Da) it else it.copy(wochen = it.wochen + (montag to Ladung.Laedt))
        }
        viewModelScope.launch {
            val ergebnis = api.woche(montag)
            aendere { zustand ->
                val eintrag = when (ergebnis) {
                    is AtlasErgebnis.Erfolg -> Ladung.Da(ergebnis.wert)
                    // Der Pager fragt die laufende Woche schon an, bevor der
                    // gespeicherte Stand von der Platte da ist. Ohne diese
                    // Zeile ueberschriebe der Fehler den Plan, der gleich
                    // danach eintrifft.
                    is AtlasErgebnis.Fehler -> zustand.wochen[montag] as? Ladung.Da
                        ?: Ladung.Fehler(ergebnis.meldung)
                }
                zustand.copy(wochen = zustand.wochen + (montag to eintrag))
            }
        }
    }

    // --- Aufgaben ------------------------------------------------------------

    /**
     * Abhaken fuehlt sich sofort an: die Zeile verschwindet, bevor der Server
     * geantwortet hat -- und taucht im selben Zug im "Erledigt"-Abschnitt auf,
     * ohne dass die Liste dafuer neu laedt. Kommt ein Fehler zurueck, kehrt
     * beides zurueck und ein Hinweis sagt warum. Alles andere hiesse, auf eine
     * Mobilfunkantwort zu warten, um einen Haken zu setzen.
     */
    fun setzeHaken(aufgabe: AssignmentDTO, erledigt: Boolean) {
        val vorher = app?.start as? Ladung.Da ?: return
        aendere { zustand ->
            zustand.copy(
                start = Ladung.Da(vorher.wert.mitHaken(aufgabe.id, erledigt)),
                erledigt = zustand.erledigt.mitErledigtHaken(aufgabe, erledigt),
            )
        }
        viewModelScope.launch {
            when (val ergebnis = api.abhaken(aufgabe.id, erledigt)) {
                is AtlasErgebnis.Erfolg -> ladeDetailNeuFallsOffen()
                is AtlasErgebnis.Fehler -> aendere { zustand ->
                    val heute = zustand.start
                    zustand.copy(
                        start = if (heute is Ladung.Da) {
                            Ladung.Da(heute.wert.mitHaken(aufgabe.id, !erledigt))
                        } else {
                            heute
                        },
                        erledigt = zustand.erledigt.mitErledigtHaken(aufgabe, !erledigt),
                        hinweis = ergebnis.meldung,
                    )
                }
            }
        }
    }

    /**
     * Der "Erledigt"-Abschnitt spiegelt jeden Haken sofort, ohne neu zu laden:
     * beim Abhaken kommt die Aufgabe oben rein, beim Zurueckholen faellt sie
     * wieder heraus. Ist der Abschnitt noch gar nicht geladen, bleibt er es --
     * die Aufgabe steht dann drin, sobald der Abruf durch ist.
     */
    private fun Ladung<List<AssignmentDTO>>.mitErledigtHaken(
        aufgabe: AssignmentDTO,
        erledigt: Boolean,
    ): Ladung<List<AssignmentDTO>> {
        if (this !is Ladung.Da) return this
        val ohne = wert.filterNot { it.id == aufgabe.id }
        return Ladung.Da(
            if (erledigt) listOf(aufgabe.copy(completedAt = Instant.now())) + ohne else ohne,
        )
    }

    /** Der eingeklappte Abschnitt am Ende der Aufgabenliste. */
    fun wechsleErledigtOffen() = aendere { it.copy(erledigtAusgeklappt = !it.erledigtAusgeklappt) }

    private suspend fun zeigeGespeicherteErledigte() {
        val gespeichert = api.erledigteAufgabenGespeichert() ?: return
        aendere { zustand ->
            if (zustand.erledigt is Ladung.Da) return@aendere zustand
            zustand.copy(
                erledigt = Ladung.Da(sortiereErledigte(gespeichert.wert)),
                erledigtStand = Stand(gespeichert.stand),
            )
        }
    }

    private suspend fun ladeErledigte() {
        when (val ergebnis = api.erledigteAufgaben()) {
            is AtlasErgebnis.Erfolg -> aendere { zustand ->
                zustand.copy(
                    erledigt = Ladung.Da(sortiereErledigte(ergebnis.wert)),
                    erledigtStand = Stand(Instant.now()),
                )
            }
            is AtlasErgebnis.Fehler -> aendere { zustand ->
                zustand.copy(
                    // Ein schon geladener Abschnitt bleibt stehen. Er ist eine
                    // Randinformation, ein Fehlerbildschirm dafuer waere mehr
                    // Stoerung als die offene Liste wert ist.
                    erledigt = if (zustand.erledigt is Ladung.Da) zustand.erledigt else Ladung.Fehler(ergebnis.meldung),
                    erledigtStand = zustand.erledigtStand?.copy(
                        veraltet = true,
                        ohneVerbindung = ergebnis.ohneVerbindung,
                    ),
                )
            }
        }
    }

    private fun Startdaten.mitHaken(id: String, erledigt: Boolean): Startdaten = mitAufgaben(
        aufgaben.map {
            // completedAt traegt hier nur "gesetzt oder nicht". Der echte
            // Zeitstempel kommt mit dem naechsten Abruf vom Server.
            if (it.id == id) it.copy(completedAt = if (erledigt) java.time.Instant.now() else null) else it
        },
    )

    /**
     * Setzt die Aufgabenliste und rechnet die Zahl auf den Faecher-Kacheln neu.
     * Beides gehoert zusammen: openAssignments kommt sonst vom Server und waere
     * nach jeder lokalen Aenderung eine Zahl aus der Vergangenheit, bis jemand
     * von oben zieht.
     */
    private fun Startdaten.mitAufgaben(neu: List<AssignmentDTO>): Startdaten {
        val offenJeFach = neu.filter { it.completedAt == null }.groupingBy { it.subjectId }.eachCount()
        return copy(
            aufgaben = neu,
            faecher = faecher.map { it.copy(openAssignments = offenJeFach[it.id] ?: 0) },
        )
    }

    fun oeffneBlatt() = aendere { it.copy(blatt = BlattZustand()) }

    /**
     * Dasselbe Blatt, aber aus einer Schulstunde heraus. Der Stundenplan rechnet
     * die Vorgabe aus, weil nur er das Wochenraster kennt; hier liegt sie nur ab.
     */
    fun oeffneBlattFuerStunde(vorbelegung: Vorbelegung) = aendere {
        // Ein zweites Tippen waehrend das Blatt schon offen ist wuerde die
        // bereits getippten Eingaben zuruecksetzen.
        if (it.blatt != null) it else it.copy(blatt = BlattZustand(vorbelegung = vorbelegung))
    }

    fun schliesseBlatt() = aendere { it.copy(blatt = null) }

    fun legeAufgabeAn(
        titel: String,
        typ: String,
        faellig: LocalDate?,
        fachId: String?,
        untisFach: String?,
    ) {
        if (app?.blatt?.laeuft == true) return
        // copy statt neu: die Vorbelegung muss den Lauf ueberstehen, sonst
        // stuende nach einem Fehler ein anderes Blatt da als vorher.
        aendere { it.copy(blatt = it.blatt?.copy(laeuft = true, fehler = null)) }
        viewModelScope.launch {
            val ergebnis = api.aufgabeAnlegen(
                NeueAufgabeAnfrage(
                    title = titel.trim(),
                    type = typ,
                    dueDate = faellig,
                    subjectId = fachId,
                    untisSubject = untisFach,
                ),
            )
            when (ergebnis) {
                is AtlasErgebnis.Erfolg -> {
                    aendere { zustand ->
                        val start = zustand.start
                        zustand.copy(
                            blatt = null,
                            start = if (start is Ladung.Da) {
                                Ladung.Da(start.wert.mitAufgaben(start.wert.aufgaben + ergebnis.wert))
                            } else {
                                start
                            },
                        )
                    }
                    ladeDetailNeuFallsOffen()
                }

                is AtlasErgebnis.Fehler -> aendere {
                    it.copy(blatt = it.blatt?.copy(laeuft = false, fehler = ergebnis.meldung))
                }
            }
        }
    }

    // --- Faecher -------------------------------------------------------------

    fun oeffneFach(id: String) {
        aendere { it.copy(detail = Ladung.Laedt, detailStand = null, detailFachId = id) }
        ladeNoten(id)
        viewModelScope.launch {
            zeigeGespeichertesDetail(id)
            holeDetail(id)
        }
    }

    private suspend fun zeigeGespeichertesDetail(id: String) {
        val gespeichert = api.fachDetailGespeichert(id) ?: return
        aendere { zustand ->
            // Nur wenn noch immer dieses Fach offen ist und noch nichts Frisches da ist.
            if (zustand.detailFachId != id || zustand.detail !is Ladung.Laedt) return@aendere zustand
            zustand.copy(detail = Ladung.Da(gespeichert.wert), detailStand = Stand(gespeichert.stand))
        }
    }

    fun schliesseFach() {
        aendere { it.copy(detail = null, detailFachId = null) }
        _notenZustand.value = NotenZustand()
    }

    fun ladeDetailNeu() {
        val id = app?.detailFachId ?: return
        aendere { it.copy(detail = Ladung.Laedt, detailStand = null) }
        viewModelScope.launch { holeDetail(id) }
    }

    private suspend fun holeDetail(id: String) {
        val ergebnis = api.fachDetail(id)
        // Wer zwischenzeitlich zurueckgegangen ist, soll das Detail nicht
        // wieder aufklappen sehen. Und wer inzwischen ein anderes Fach geoeffnet
        // hat, soll dessen Ueberschrift nicht ueber den Notizen des vorherigen
        // stehen sehen: die spaete Antwort gehoert einem Fach, das niemand mehr
        // ansieht.
        aendere { zustand ->
            if (zustand.detailFachId != id) return@aendere zustand
            when (ergebnis) {
                is AtlasErgebnis.Erfolg -> zustand.copy(
                    detail = Ladung.Da(ergebnis.wert),
                    detailStand = Stand(Instant.now()),
                )
                // Ein gespeichertes Fach bleibt stehen statt durch einen
                // Fehlerbildschirm ersetzt zu werden.
                is AtlasErgebnis.Fehler -> if (zustand.detail is Ladung.Da) {
                    zustand.copy(
                        detailStand = zustand.detailStand?.copy(
                            veraltet = true,
                            ohneVerbindung = ergebnis.ohneVerbindung,
                        ),
                    )
                } else {
                    zustand.copy(detail = Ladung.Fehler(ergebnis.meldung))
                }
            }
        }
    }

    /** Nach einem Haken oder einer neuen Aufgabe stimmt die Aufgabenliste im Detail nicht mehr. */
    private fun ladeDetailNeuFallsOffen() {
        val offen = app?.detailFachId ?: return
        viewModelScope.launch { holeDetail(offen) }
    }

    // --- Noten -----------------------------------------------------------------

    private fun ladeNoten(id: String) {
        _notenZustand.value = NotenZustand(fachId = id, noten = Ladung.Laedt)
        viewModelScope.launch { holeNoten(id) }
    }

    private suspend fun holeNoten(id: String) {
        val ergebnis = api.noten(id)
        // Wer inzwischen ein anderes Fach geoeffnet hat, soll dessen Noten
        // nicht durch die spaete Antwort dieses Fachs ueberschrieben sehen.
        _notenZustand.update { zustand ->
            if (zustand.fachId != id) return@update zustand
            when (ergebnis) {
                is AtlasErgebnis.Erfolg -> zustand.copy(noten = Ladung.Da(ergebnis.wert))
                is AtlasErgebnis.Fehler -> zustand.copy(noten = Ladung.Fehler(ergebnis.meldung))
            }
        }
    }

    fun ladeNotenNeu() {
        val id = _notenZustand.value.fachId ?: return
        ladeNoten(id)
    }

    fun oeffneNoteBlatt() = _notenZustand.update { it.copy(blattOffen = true, blattFehler = null) }

    fun schliesseNoteBlatt() = _notenZustand.update { it.copy(blattOffen = false, blattFehler = null) }

    fun noteAnlegen(fachId: String, punkte: Int, bezeichnung: String, art: String, datum: LocalDate) {
        if (_notenZustand.value.blattLaeuft) return
        _notenZustand.update { it.copy(blattLaeuft = true, blattFehler = null) }
        viewModelScope.launch {
            val ergebnis = api.noteAnlegen(
                fachId,
                NeueNoteAnfrage(points = punkte, label = bezeichnung.trim(), kind = art, date = datum),
            )
            when (ergebnis) {
                is AtlasErgebnis.Erfolg -> {
                    // Neu laden statt die Antwort selbst einzusortieren: der
                    // Server liefert dabei auch den neuen Schnitt gleich mit.
                    //
                    // Aber nicht ueber ladeNoten: das setzt den Zustand auf
                    // Ladung.Laedt zurueck, und die eben noch sichtbare Liste
                    // faellt fuer einen Moment auf das Skelett zurueck. Wer
                    // gerade eine Note eingetragen hat, soll die alte Liste
                    // stehen sehen, bis die neue da ist.
                    _notenZustand.update { zustand ->
                        if (zustand.fachId != fachId) return@update zustand
                        zustand.copy(blattOffen = false, blattLaeuft = false, blattFehler = null)
                    }
                    holeNoten(fachId)
                }

                is AtlasErgebnis.Fehler -> _notenZustand.update { zustand ->
                    if (zustand.fachId != fachId) return@update zustand
                    zustand.copy(blattLaeuft = false, blattFehler = ergebnis.meldung)
                }
            }
        }
    }
}

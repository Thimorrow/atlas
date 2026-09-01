package dev.atlas.schule.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.atlas.schule.data.AtlasApi
import dev.atlas.schule.data.AtlasErgebnis
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Wo die App gerade steht. Mehr Bildschirme gibt es in dieser Runde nicht. */
sealed interface AtlasZustand {
    data class Anmeldung(
        val fehler: String? = null,
        val laeuft: Boolean = false,
    ) : AtlasZustand

    data class Uebersicht(
        val anzahlFaecher: Int? = null,
        val fehler: String? = null,
    ) : AtlasZustand
}

class AtlasViewModel(anwendung: Application) : AndroidViewModel(anwendung) {
    private val api = AtlasApi.fuer(anwendung)

    // Das gespeicherte Cookie entscheidet ueber den Startbildschirm, und zwar
    // ohne Umweg ueber eine Anfrage: sonst blitzte beim Start kurz die
    // Anmeldung auf, bevor der Server geantwortet hat. Ob der Server das
    // Cookie noch akzeptiert, beantwortet der erste Abruf; ein 401 schickt den
    // Nutzer ueber den Abfangjaeger zurueck zur Anmeldung.
    private val _zustand = MutableStateFlow<AtlasZustand>(
        if (api.hatGateCookie()) AtlasZustand.Uebersicht() else AtlasZustand.Anmeldung(),
    )
    val zustand: StateFlow<AtlasZustand> = _zustand.asStateFlow()

    init {
        if (_zustand.value is AtlasZustand.Uebersicht) {
            viewModelScope.launch { ladeFaecher() }
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

    fun anmelden(passwort: String) {
        val jetzt = _zustand.value
        if (jetzt !is AtlasZustand.Anmeldung || jetzt.laeuft) return
        _zustand.value = AtlasZustand.Anmeldung(laeuft = true)
        viewModelScope.launch {
            when (val ergebnis = api.anmelden(passwort)) {
                is AtlasErgebnis.Erfolg -> {
                    _zustand.value = AtlasZustand.Uebersicht()
                    ladeFaecher()
                }
                // Der 401-Abfangjaeger hat hier schon einen Wechsel in die
                // Anmeldung ausgeloest. Die Meldung des Servers ist genauer als
                // seine, deshalb ueberschreibt sie ihn.
                is AtlasErgebnis.Fehler -> _zustand.value = AtlasZustand.Anmeldung(fehler = ergebnis.meldung)
            }
        }
    }

    fun erneutLaden() {
        if (_zustand.value !is AtlasZustand.Uebersicht) return
        _zustand.value = AtlasZustand.Uebersicht()
        viewModelScope.launch { ladeFaecher() }
    }

    private suspend fun ladeFaecher() {
        _zustand.value = when (val ergebnis = api.faecher()) {
            is AtlasErgebnis.Erfolg -> AtlasZustand.Uebersicht(anzahlFaecher = ergebnis.wert.size)
            is AtlasErgebnis.Fehler ->
                // Bei 401 hat der Abfangjaeger den Zustand schon gewechselt,
                // den soll diese Zuweisung nicht wieder umbiegen.
                if (_zustand.value is AtlasZustand.Anmeldung) return
                else AtlasZustand.Uebersicht(fehler = ergebnis.meldung)
        }
    }
}

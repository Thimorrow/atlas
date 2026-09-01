package dev.atlas.schule.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.atlas.schule.data.CalendarEvent
import dev.atlas.schule.data.ExpandedRange
import dev.atlas.schule.data.SubjectDTO
import dev.atlas.schule.ui.theme.Abstand
import dev.atlas.schule.ui.theme.Fachfarbe
import dev.atlas.schule.ui.theme.LocalDunkelmodus
import dev.atlas.schule.ui.theme.fachfarbe
import java.time.LocalDate

// Wieviele Wochen sich blaettern lassen. Ein Schuljahr in beide Richtungen ist
// mehr, als je gebraucht wird, und der Pager haelt nur die sichtbare Seite.
private const val WOCHEN_SPANNE = 60
private const val WOCHEN_MITTE = WOCHEN_SPANNE

private val WOCHENTAGE_KURZ = listOf("Mo", "Di", "Mi", "Do", "Fr")
private val ZEITSPALTE = 38.dp
private val MINDEST_STUNDENHOEHE = 46.dp

/** "2.–8. September 2025", ein Monatsname wenn die Woche nicht umbricht. */
private fun wochenLabel(start: LocalDate, ende: LocalDate): String =
    if (start.monthValue == ende.monthValue) {
        "${start.dayOfMonth}.–${ende.dayOfMonth}. ${MONATE[ende.monthValue - 1]} ${ende.year}"
    } else {
        "${start.dayOfMonth}. ${MONATE[start.monthValue - 1]} – " +
            "${ende.dayOfMonth}. ${MONATE[ende.monthValue - 1]} ${ende.year}"
    }

/**
 * Farbe einer Stunde. Untis kennt nur den Fachnamen, die Farbe haengt am Fach:
 * erst der exakte Untis-Wert, dann der Anzeigename, so wie subjectFor() im Web.
 * Findet sich kein Fach, greift dieselbe Hash-Vorbelegung wie dort.
 */
@Composable
fun fachfarbeFuerStunde(titel: String, faecher: List<SubjectDTO>): Color {
    val fach = faecher.firstOrNull { it.untisSubject == titel }
        ?: faecher.firstOrNull { it.name == titel }
    val token = fach?.color
    return if (token != null) fachfarbe(token)
    else Fachfarbe.standardFuer(titel).farbe(LocalDunkelmodus.current)
}

@Composable
fun StundenplanBildschirm(
    zustand: AtlasZustand.App,
    beimWochenwechsel: (LocalDate) -> Unit,
    beimWocheLaden: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val heutigerMontag = remember(zustand.heute) { montagVon(zustand.heute) }
    val seiten = rememberPagerState(
        initialPage = WOCHEN_MITTE + (
            java.time.temporal.ChronoUnit.WEEKS.between(heutigerMontag, zustand.gezeigteWoche).toInt()
            ),
        pageCount = { WOCHEN_SPANNE * 2 + 1 },
    )

    // Die Seite ist die Wahrheit ueber die gezeigte Woche, nicht umgekehrt:
    // sonst kaempfen Wisch und Zustand um dieselbe Zahl.
    LaunchedEffect(seiten, heutigerMontag) {
        snapshotFlow { seiten.currentPage }.collect { seite ->
            beimWochenwechsel(heutigerMontag.plusWeeks((seite - WOCHEN_MITTE).toLong()))
        }
    }

    val faecher = (zustand.start as? Ladung.Da)?.wert?.faecher.orEmpty()

    HorizontalPager(state = seiten, modifier = modifier.fillMaxSize()) { seite ->
        val montag = heutigerMontag.plusWeeks((seite - WOCHEN_MITTE).toLong())
        Woche(
            montag = montag,
            ladung = zustand.wochen[montag] ?: Ladung.Laedt,
            heute = zustand.heute,
            faecher = faecher,
            beimErneutVersuchen = { beimWocheLaden(montag) },
        )
    }
}

@Composable
private fun Woche(
    montag: LocalDate,
    ladung: Ladung<ExpandedRange>,
    heute: LocalDate,
    faecher: List<SubjectDTO>,
    beimErneutVersuchen: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Text(
            text = wochenLabel(montag, montag.plusDays(4)),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(horizontal = Abstand.weit, vertical = Abstand.mittel),
        )

        when (ladung) {
            is Ladung.Laedt -> WochenSkelett()

            is Ladung.Fehler -> MittigerZustand {
                FehlerZustand(ladung.meldung, beimErneutVersuchen)
            }

            is Ladung.Da -> {
                // Nur Montag bis Freitag: an einem Wochenende hat noch nie eine
                // Schulstunde stattgefunden, und fuenf Spalten sind auf einem
                // Telefon schon eng genug.
                val tage = (0..4).map { versatz ->
                    val datum = montag.plusDays(versatz.toLong())
                    datum to verschmelzeStunden(
                        ladung.wert.days.firstOrNull { it.date == datum }?.events.orEmpty(),
                    )
                }
                val alleStunden = tage.flatMap { it.second }
                if (alleStunden.isEmpty()) {
                    MittigerZustand {
                        LeerZustand(
                            titel = "Keine Stunden in dieser Woche",
                            text = "Entweder sind Ferien, oder der Abgleich mit Untis " +
                                "hat diese Woche noch nicht erfasst.",
                        )
                    }
                } else {
                    Kopfzeile(tage.map { it.first }, heute)
                    Raster(tage, heute, faecher)
                }
            }
        }
    }
}

@Composable
private fun Kopfzeile(tage: List<LocalDate>, heute: LocalDate) {
    Row(Modifier.fillMaxWidth().padding(bottom = Abstand.normal)) {
        Spacer(Modifier.width(ZEITSPALTE))
        tage.forEachIndexed { index, datum ->
            val istHeute = datum == heute
            Column(
                modifier = Modifier
                    .weight(1f)
                    .semantics {
                        contentDescription = "${WOCHENTAGE_LANG[index]}, ${datum.dayOfMonth}. " +
                            MONATE[datum.monthValue - 1] + if (istHeute) ", heute" else ""
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Abstand.klein),
            ) {
                Text(
                    text = WOCHENTAGE_KURZ[index],
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                // Heute traegt einen gefuellten Kreis. Nur eine andere Farbe
                // waere auf einem hellen Bildschirm im Freien kaum zu sehen.
                Box(
                    modifier = Modifier
                        .size(26.dp)
                        .clip(CircleShape)
                        .background(
                            if (istHeute) MaterialTheme.colorScheme.primary else Color.Transparent,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "${datum.dayOfMonth}",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (istHeute) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (istHeute) MaterialTheme.colorScheme.onPrimary
                        else MaterialTheme.colorScheme.onBackground,
                    )
                }
            }
        }
    }
}

private val WOCHENTAGE_LANG =
    listOf("Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag")

@Composable
private fun Raster(
    tage: List<Pair<LocalDate, List<CalendarEvent>>>,
    heute: LocalDate,
    faecher: List<SubjectDTO>,
) {
    val (start, ende) = remember(tage) { tagesgrenzen(tage.flatMap { it.second }) }
    val stunden = ende - start

    BoxWithConstraints(Modifier.fillMaxSize()) {
        // Passt die Woche in die Hoehe, wird sie eingepasst; passt sie nicht,
        // bekommt jede Stunde ihre Mindesthoehe und das Raster scrollt. Ein
        // gestauchtes Raster waere unlesbar, ein immer scrollendes laestig.
        val stundenHoehe = maxOf(MINDEST_STUNDENHOEHE, maxHeight / stunden)
        val gesamt = stundenHoehe * stunden

        Row(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .height(gesamt),
        ) {
            Zeitachse(start, ende, stundenHoehe)
            tage.forEach { (datum, ereignisse) ->
                Tagesspalte(
                    datum = datum,
                    ereignisse = ereignisse,
                    istHeute = datum == heute,
                    tagStart = start,
                    tagEnde = ende,
                    stundenHoehe = stundenHoehe,
                    faecher = faecher,
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                )
            }
        }
    }
}

@Composable
private fun Zeitachse(start: Int, ende: Int, stundenHoehe: androidx.compose.ui.unit.Dp) {
    Box(
        Modifier
            .width(ZEITSPALTE)
            .fillMaxHeight()
            // Die Achse ist eine reine Skala. Jeder Block traegt seine Zeit
            // schon im eigenen Namen, sonst laese ein Screenreader hier zehn
            // freistehende Zahlen vor.
            .clearAndSetSemantics { },
    ) {
        (start until ende).forEach { stunde ->
            Text(
                text = "%02d".format(stunde),
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .offset(y = stundenHoehe * (stunde - start))
                    .padding(end = Abstand.eng)
                    .fillMaxWidth(),
                textAlign = androidx.compose.ui.text.style.TextAlign.End,
            )
        }
    }
}

@Composable
private fun Tagesspalte(
    datum: LocalDate,
    ereignisse: List<CalendarEvent>,
    istHeute: Boolean,
    tagStart: Int,
    tagEnde: Int,
    stundenHoehe: androidx.compose.ui.unit.Dp,
    faecher: List<SubjectDTO>,
    modifier: Modifier = Modifier,
) {
    val bloecke = remember(ereignisse, tagStart, tagEnde) {
        packeTag(ereignisse, tagStart, tagEnde)
    }
    val proMinute = stundenHoehe / 60f

    BoxWithConstraints(
        modifier
            // Der heutige Tag liegt auf einer eigenen, kaum wahrnehmbaren
            // Flaeche. Zusammen mit dem Kreis in der Kopfzeile reicht das; ein
            // krafitger Farbton wuerde mit den Fachfarben streiten.
            .background(
                if (istHeute) MaterialTheme.colorScheme.primary.copy(alpha = 0.04f)
                else Color.Transparent,
            ),
    ) {
        val spaltenbreite = maxWidth

        (tagStart + 1 until tagEnde).forEach { stunde ->
            Spacer(
                Modifier
                    .offset(y = stundenHoehe * (stunde - tagStart))
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(MaterialTheme.colorScheme.outline),
            )
        }

        bloecke.forEach { block ->
            Stundenblock(
                block = block,
                farbe = fachfarbeFuerStunde(block.ereignis.title, faecher),
                oben = proMinute * (block.start - tagStart * 60),
                hoehe = proMinute * (block.ende - block.start) - 2.dp,
                links = spaltenbreite * (block.spur.toFloat() / block.spuren) + 1.dp,
                breite = spaltenbreite / block.spuren - 2.dp,
            )
        }
    }
}

@Composable
private fun Stundenblock(
    block: Rasterblock,
    farbe: Color,
    oben: androidx.compose.ui.unit.Dp,
    hoehe: androidx.compose.ui.unit.Dp,
    links: androidx.compose.ui.unit.Dp,
    breite: androidx.compose.ui.unit.Dp,
) {
    val ereignis = block.ereignis
    val entfaellt = ereignis.status == "cancelled"
    val vertretung = ereignis.status == "substituted"
    // Der Badge braucht eine eigene Zeile unter Fach und Raum. Passt sie nicht,
    // tritt ein Punkt am Fachnamen an seine Stelle; ohne diesen Wechsel schob
    // sich der Badge ausgerechnet auf niedrigen Bloecken ueber den Fachnamen.
    val badgePasst = hoehe >= 58.dp
    val echteHoehe = maxOf(hoehe, 18.dp)

    val ansage = buildString {
        append(ereignis.title)
        append(", ").append(ereignis.startTime)
        ereignis.endTime?.let { append(" bis ").append(it) }
        append(" Uhr")
        ereignis.room?.let { append(", ").append(it) }
        if (vertretung) append(", Vertretung")
        if (entfaellt) append(", entfällt")
    }

    Column(
        modifier = Modifier
            .offset(x = links, y = oben)
            .width(breite)
            .height(echteHoehe)
            .clip(RoundedCornerShape(6.dp))
            // Entfallene Stunden verlieren ihre Fuellung und behalten nur den
            // Umriss: der Platz bleibt sichtbar, die Stunde nicht.
            .background(if (entfaellt) Color.Transparent else farbe.copy(alpha = 0.18f))
            .border(
                width = 1.dp,
                color = if (entfaellt) MaterialTheme.colorScheme.outlineVariant
                else farbe.copy(alpha = 0.45f),
                shape = RoundedCornerShape(6.dp),
            )
            .padding(horizontal = Abstand.eng, vertical = Abstand.winzig)
            .semantics { contentDescription = ansage },
        verticalArrangement = Arrangement.spacedBy(Abstand.winzig),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Abstand.klein),
        ) {
            if (vertretung && !badgePasst) {
                Spacer(
                    Modifier.size(6.dp).clip(CircleShape).background(vertretungFarbe()),
                )
            }
            Text(
                text = ereignis.title,
                style = MaterialTheme.typography.bodySmall,
                // Fachnamen sind unterschiedlich lang, die Spalte ist es nicht.
                // "Mathematik" endete als "Mathema…", obwohl es eine halbe
                // Stufe kleiner ganz hineinpasst. Umbrechen hilft hier nicht,
                // weil es ein einzelnes Wort ist, und eine kuerzere Form gibt
                // Untis nicht her. Also darf die Schrift schrumpfen, aber nur
                // bis 10sp, darunter waere sie kleiner als die Raumnummer.
                autoSize = TextAutoSize.StepBased(
                    minFontSize = 10.sp,
                    maxFontSize = 12.sp,
                    stepSize = 0.5.sp,
                ),
                lineHeight = 14.sp,
                fontWeight = FontWeight.Medium,
                textDecoration = if (entfaellt) TextDecoration.LineThrough else null,
                color = if (entfaellt) MaterialTheme.colorScheme.onSurfaceVariant
                else MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }

        if (echteHoehe > 30.dp) {
            val zusatz = if (entfaellt) "entfällt" else ereignis.room.orEmpty()
            if (zusatz.isNotEmpty()) {
                Text(
                    text = zusatz,
                    style = MaterialTheme.typography.bodySmall,
                    fontSize = 10.sp,
                    lineHeight = 12.sp,
                    fontFamily = if (entfaellt) FontFamily.Default else FontFamily.Monospace,
                    // Auf der eingefaerbten Blockflaeche traegt der volle
                    // gedaempfte Ton nur rund 4:1. Der Vordergrund mit 70
                    // Prozent liegt sicher darueber, so macht es das Web auch.
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clearAndSetSemantics { },
                )
            }
        }

        if (vertretung && badgePasst) {
            Text(
                text = "VERTRETUNG",
                style = MaterialTheme.typography.bodySmall,
                fontSize = 9.sp,
                lineHeight = 11.sp,
                fontWeight = FontWeight.SemiBold,
                // Versalien brauchen Laufweite, sonst kleben sie aneinander.
                // Bei 0.6sp passte das Wort auf einem 1080er Schirm um ein Haar
                // nicht mehr in die Spalte und endete als "VERTRETUN": ohne
                // overflow schneidet Compose mitten im Buchstaben ab, statt zu
                // kuerzen. Weniger Laufweite schafft den Platz, das Ellipsis
                // faengt schmalere Geraete ab.
                letterSpacing = 0.2.sp,
                color = vertretungFarbe(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

/** Bernstein, wie im Web. Die einzige Farbe der App, die nichts mit einem Fach zu tun hat. */
@Composable
private fun vertretungFarbe(): Color =
    if (LocalDunkelmodus.current) Color(0xFFFFB86A) else Color(0xFF9A5B00)

@Composable
private fun WochenSkelett() {
    Column(
        Modifier.fillMaxSize().padding(horizontal = Abstand.weit).clearAndSetSemantics { },
        verticalArrangement = Arrangement.spacedBy(Abstand.normal),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(Abstand.normal)) {
            repeat(5) {
                Platzhalter(Modifier.weight(1f).height(38.dp))
            }
        }
        Row(
            Modifier.fillMaxSize().padding(bottom = Abstand.weit),
            horizontalArrangement = Arrangement.spacedBy(Abstand.normal),
        ) {
            listOf(0.15f to 0.55f, 0.05f to 0.7f, 0.2f to 0.4f, 0.1f to 0.6f, 0.25f to 0.5f)
                .forEach { (versatz, anteil) ->
                    Column(Modifier.weight(1f).fillMaxHeight()) {
                        Spacer(Modifier.fillMaxHeight(versatz))
                        Platzhalter(Modifier.fillMaxWidth().fillMaxHeight(anteil))
                    }
                }
        }
    }
}

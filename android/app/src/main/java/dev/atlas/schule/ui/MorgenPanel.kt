package dev.atlas.schule.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import dev.atlas.schule.data.AssignmentDTO
import dev.atlas.schule.ui.theme.Abstand

/**
 * Morgen / Fokus — Web-Parität zu morgen-panel (Zieltag, Stunden, Prüfungen,
 * Zu-erledigen, Mitzunehmen). Lesend + Haken, kein Heute/Morgen-Schalter
 * (wie im Web: Zieltag kommt vom Server).
 */
@Composable
fun MorgenPanel(
    zustand: MorgenZustand,
    beimLaden: () -> Unit,
    beimHaken: (AssignmentDTO, Boolean) -> Unit,
    beimFachOeffnen: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(Unit) {
        if (zustand.ladung == null) beimLaden()
    }
    when (val l = zustand.ladung) {
        null, is Ladung.Laedt -> Column(Modifier.fillMaxWidth().padding(Abstand.normal)) { CircularProgressIndicator() }
        is Ladung.Fehler -> Column(Modifier.fillMaxWidth().padding(Abstand.normal)) {
            Text(l.meldung, color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = beimLaden) { Text("Erneut laden") }
        }
        is Ladung.Da -> {
            val m = l.wert
            val stunden = m.day?.events.orEmpty()
            Column(modifier = modifier.fillMaxWidth().padding(Abstand.normal), verticalArrangement = Arrangement.spacedBy(Abstand.normal)) {
                Text(m.target?.label ?: "Fokus", style = MaterialTheme.typography.headlineSmall)
                Text(
                    morgenUntertitel(m.today, m.target?.date, m.target?.isTomorrow == true),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (m.exams.isNotEmpty()) {
                    Text("Prüfungen", style = MaterialTheme.typography.titleMedium)
                    m.exams.forEach { p ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(Abstand.normal)) {
                                Text(p.title, style = MaterialTheme.typography.bodyLarge)
                                Text(listOfNotNull(p.subjectName, p.dueDate?.toString()).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
                if (stunden.isNotEmpty()) {
                    Text("Stunden", style = MaterialTheme.typography.titleMedium)
                    stunden.forEach { s ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(Abstand.normal)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("${s.startTime}${s.endTime?.let { "–$it" } ?: ""}", style = MaterialTheme.typography.labelLarge)
                                    if (s.status != "regular") Text(if (s.status == "cancelled") "Entfällt" else "Vertretung", color = MaterialTheme.colorScheme.error)
                                }
                                Text(s.title, style = MaterialTheme.typography.bodyLarge)
                                listOfNotNull(s.room, s.teacher).takeIf { it.isNotEmpty() }?.let {
                                    Text(it.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                                }
                                s.subjectId?.let { fid ->
                                    TextButton(onClick = { beimFachOeffnen(fid) }) { Text("Fach öffnen") }
                                }
                            }
                        }
                    }
                }
                if (m.due.isNotEmpty()) {
                    Text("Zu erledigen", style = MaterialTheme.typography.titleMedium)
                    m.due.forEach { a ->
                        Card(Modifier.fillMaxWidth()) {
                            Row(Modifier.padding(Abstand.normal), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column(Modifier.weight(1f)) {
                                    Text(a.title, style = MaterialTheme.typography.bodyLarge)
                                    Text(listOfNotNull(a.subjectName, a.dueDate?.toString()).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                                }
                                TextButton(onClick = { beimHaken(a, true) }) { Text("Erledigt") }
                            }
                        }
                    }
                }
                if (m.materials.isNotEmpty()) {
                    Text("Mitzunehmen", style = MaterialTheme.typography.titleMedium)
                    m.materials.forEach { mat ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(Abstand.normal)) {
                                Text(mat.subjectName, style = MaterialTheme.typography.bodyLarge)
                                mat.files.take(3).forEach { f ->
                                    Text("📄 ${f.name}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                mat.notes.take(3).forEach { n ->
                                    Text("📝 ${n.title}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                val restDateien = mat.files.size - mat.files.take(3).size
                                val restNotizen = mat.notes.size - mat.notes.take(3).size
                                listOfNotNull(
                                    "+$restDateien Dateien".takeIf { restDateien > 0 },
                                    "+$restNotizen Notizen".takeIf { restNotizen > 0 },
                                ).takeIf { it.isNotEmpty() }?.let {
                                    Text(
                                        "… ${it.joinToString(", ")}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (mat.files.isEmpty() && mat.notes.isEmpty()) {
                                    Text("Keine Dateien, keine Notizen.", style = MaterialTheme.typography.bodySmall)
                                }
                                TextButton(onClick = { beimFachOeffnen(mat.subjectId) }) { Text("Fach öffnen") }
                            }
                        }
                    }
                }
                if (stunden.isEmpty() && m.due.isEmpty() && m.exams.isEmpty() && m.materials.isEmpty()) {
                    // Web sagt "Nichts los." und prüft materials nicht (Web-Bug);
                    // hier bewusst mit materials, damit Mitzunehmen nie hinter
                    // einem leeren Zustand verschwindet.
                    Text("Nichts los.", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "Keine Schulstunden, keine Aufgabe fällig, keine Prüfung in Sicht.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/**
 * Untertitel wie Web subtitleFor: Heute/Morgen + Datum, sonst Hinweis auf
 * den nächsten Schultag.
 */
internal fun morgenUntertitel(today: String, targetDate: String?, isTomorrow: Boolean): String {
    if (targetDate.isNullOrBlank()) return ""
    val datum = runCatching {
        val d = java.time.LocalDate.parse(targetDate)
        java.time.format.DateTimeFormatter.ofPattern("d. MMMM", java.util.Locale.GERMAN).format(d)
    }.getOrNull() ?: targetDate
    if (targetDate == today) return "Heute, $datum"
    if (isTomorrow) return "Morgen, $datum"
    return "Morgen ist schulfrei. Hier der nächste Schultag: $datum"
}

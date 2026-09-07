package dev.atlas.schule.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import dev.atlas.schule.data.AssignmentDTO
import dev.atlas.schule.ui.theme.Tabellenziffern
import dev.atlas.schule.ui.theme.fachfarbe

@Composable
fun MorgenPanel(
    zustand: MorgenZustand,
    beimLaden: () -> Unit,
    beimHaken: (AssignmentDTO, Boolean) -> Unit,
    beimFachOeffnen: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(Unit) { if (zustand.ladung == null) beimLaden() }
    Column(modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        zustand.fehler?.let {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(it, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                TextButton(onClick = beimLaden) { Text("Erneut laden") }
            }
        }
        when (val l = zustand.ladung) {
            null, is Ladung.Laedt -> ListenSkelett()
            is Ladung.Fehler -> FehlerZustand(l.meldung, beimLaden)
            is Ladung.Da -> {
                val m = l.wert
                val stunden = m.day?.events.orEmpty()
                val heute = runCatching { java.time.LocalDate.parse(m.today) }.getOrNull()
                fun datumLabel(datum: java.time.LocalDate?): String? =
                    if (heute != null) faelligLabel(datum, heute)
                    else datum?.format(java.time.format.DateTimeFormatter.ofPattern("d. MMMM", java.util.Locale.GERMAN))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(m.target?.label ?: "Fokus", style = MaterialTheme.typography.headlineMedium)
                    Text(morgenUntertitel(m.today, m.target?.date, m.target?.isTomorrow == true), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (m.exams.isNotEmpty()) {
                    Text("Prüfungen", style = MaterialTheme.typography.titleMedium)
                    m.exams.forEach { p ->
                        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(p.title, style = MaterialTheme.typography.titleMedium)
                                Text(listOfNotNull(p.subjectName, datumLabel(p.dueDate)).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                if (stunden.isNotEmpty()) {
                    Text("Dein Unterricht", style = MaterialTheme.typography.titleMedium)
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        stunden.forEach { s ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                Column(Modifier.width(48.dp).padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(s.startTime, style = MaterialTheme.typography.labelLarge.merge(Tabellenziffern))
                                    s.endTime?.let { Text(it, style = MaterialTheme.typography.bodySmall.merge(Tabellenziffern), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                }
                                val farbe = fachfarbe(s.subjectColor)
                                Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceContainer)
                                    .clickable(enabled = s.subjectId != null, role = Role.Button, onClickLabel = "Fach öffnen", onClick = { s.subjectId?.let(beimFachOeffnen) })
                                    .padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Box(Modifier.width(3.dp).height(32.dp).clip(RoundedCornerShape(2.dp)).background(farbe))
                                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                        Text(s.title, style = MaterialTheme.typography.titleMedium)
                                        listOfNotNull(s.room, s.teacher).takeIf { it.isNotEmpty() }?.let { Text(it.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                        if (s.status != "regular") Text(if (s.status == "cancelled") "Entfällt" else "Vertretung", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
                                    }
                                    if (s.subjectId != null) Icon(IkoneWeiter, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                if (m.due.isNotEmpty()) {
                    Text("Zu erledigen", style = MaterialTheme.typography.titleMedium)
                    m.due.forEach { a ->
                        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                    Text(a.title, style = MaterialTheme.typography.titleMedium)
                                    Text(listOfNotNull(a.subjectName, datumLabel(a.dueDate)).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                TextButton(onClick = { beimHaken(a, true) }) { Text("Erledigt") }
                            }
                        }
                    }
                }
                if (m.materials.isNotEmpty()) {
                    Text("Mitzunehmen", style = MaterialTheme.typography.titleMedium)
                    m.materials.forEach { mat ->
                        Surface(onClick = { beimFachOeffnen(mat.subjectId) }, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Text(mat.subjectName, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                                    Icon(IkoneWeiter, "Fach öffnen", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                mat.files.take(3).forEach { Text(it.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                mat.notes.take(3).forEach { Text(it.title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                val restDateien = (mat.files.size - 3).coerceAtLeast(0)
                                val restNotizen = (mat.notes.size - 3).coerceAtLeast(0)
                                listOfNotNull("+$restDateien Dateien".takeIf { restDateien > 0 }, "+$restNotizen Notizen".takeIf { restNotizen > 0 }).takeIf { it.isNotEmpty() }?.let {
                                    Text(it.joinToString(" · "), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                if (mat.files.isEmpty() && mat.notes.isEmpty()) Text("Keine Dateien oder Notizen.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                if (stunden.isEmpty() && m.due.isEmpty() && m.exams.isEmpty() && m.materials.isEmpty()) {
                    LeerZustand("Freier Kopf.", "Keine Schulstunden, keine Aufgabe fällig, keine Prüfung in Sicht.")
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

package dev.atlas.schule

import dev.atlas.schule.data.FachDetailAntwort
import dev.atlas.schule.data.ParticipationAntwort
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class ApiVertragTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun `Meldungsantwort entspricht der Serverroute`() {
        val antwort = json.decodeFromString<ParticipationAntwort>("""{"participation":{"id":"m1","count":5,"updatedAt":"2026-09-07T12:00:00Z"}}""")
        assertEquals(5, antwort.points)
    }

    @Test fun `Fach mit echten Stundennotizen und Meldungen bleibt lesbar`() {
        val fach = json.decodeFromString<FachDetailAntwort>("""{
          "subject":{"id":"fach","name":"Mathematik"},
          "lessonNotes":[{"id":"n1","schoolBlockId":"stunde","date":"2026-09-07","startTime":"08:00","body":"Brüche","updatedAt":"2026-09-07T12:00:00Z"}],
          "participation":{"summary":{"lessons":2,"total":7,"average":3.5,"best":5},"recent":[{"schoolBlockId":"stunde","date":"2026-09-07","startTime":"08:00","count":5}]}
        }""")
        assertEquals("stunde", fach.lessonNotes.single().lessonId)
        assertEquals(3.5, fach.participation!!.average!!, 0.001)
        assertEquals(2, fach.participation.ratedCount)
    }
}

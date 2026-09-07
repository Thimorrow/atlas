package dev.atlas.schule

import dev.atlas.schule.data.BotVerlaufDetailAntwort
import dev.atlas.schule.data.BotVerlaufAntwort
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class BotVertragTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun `Detail liest conversation und messages und blendet Tool JSON aus`() {
        val result = json.decodeFromString<BotVerlaufDetailAntwort>("""{
          "conversation":{"id":"c1","title":"Mathe"},
          "messages":[{"role":"user","content":"Hallo"},{"role":"tool","content":"{}","toolName":"faecher_lesen","toolResult":[]},{"role":"assistant","content":"Hi"}]
        }""")
        assertEquals("c1", result.id)
        assertEquals("Mathe", result.title)
        assertEquals(listOf("Hallo", "Hi"), result.turns.map { it.content })
    }

    @Test fun `Erstellte Eintraege werden nur aus erfolgreichen Schreibwerkzeugen erkannt`() {
        val result = json.decodeFromString<BotVerlaufAntwort>("""{"conversations":[
          {"id":"a","messages":[{"role":"tool","toolName":"aufgabe_anlegen","toolResult":{"aufgabe":{"id":"x"}}}]},
          {"id":"b","messages":[{"role":"tool","toolName":"aufgabe_anlegen","toolResult":{"error":"Fehler"}}]},
          {"id":"c","title":null,"messages":[{"role":"tool","toolName":"faecher_lesen","toolResult":[]}]}
        ]}""")
        assertEquals(listOf(true, false, false), result.conversations.map { it.hasCreated })
    }
}

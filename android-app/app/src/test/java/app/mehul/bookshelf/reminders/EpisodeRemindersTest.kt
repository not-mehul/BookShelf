package app.mehul.bookshelf.reminders

import org.json.JSONArray
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

class EpisodeRemindersTest {
    private fun item(ep: Long, aired: String) = EpisodeReminders.Item("show1", "Severance", "S2 E$ep", "Ep $ep", aired, ep)
    private val today = LocalDate.parse("2026-11-05")

    @Test
    fun `announces episodes airing today or in the last two days, once`() {
        val items = listOf(item(1, "2026-11-02"), item(2, "2026-11-03"), item(3, "2026-11-05"), item(4, "2026-11-06"))
        assertEquals(listOf(2L, 3L), EpisodeReminders.dueItems(items, today, emptySet()).map { it.episodeId })
        assertEquals(listOf(3L), EpisodeReminders.dueItems(items, today, setOf("show1:2")).map { it.episodeId })
    }

    @Test
    fun `parses the page's schedule and skips malformed items`() {
        val json = JSONArray(
            """[{"entryId":"a","show":"X","code":"S1 E1","name":"Pilot","aired":"2026-11-05","episodeId":9},
                {"entryId":"b","aired":"soon"}, 42]"""
        )
        val parsed = EpisodeReminders.parse(json)
        assertEquals(1, parsed.size)
        assertEquals("a:9", parsed.single().key)
    }
}

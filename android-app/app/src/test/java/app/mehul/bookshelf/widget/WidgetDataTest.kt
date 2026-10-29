package app.mehul.bookshelf.widget

import org.json.JSONObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Contract test: parses exactly what src/platform/widget.js buildWidgetSummary() sends. */
class WidgetDataTest {

    @Test
    fun `parses a full summary from the web app`() {
        val json = JSONObject(
            """
            {"total":7,"counts":{"book":4,"movie":1,"tv":1,"quote":1},
             "inProgress":[{"title":"Dune","creator":"Frank Herbert","type":"book","progress":0.25},
                           {"title":"Severance","creator":"","type":"tv","progress":null}],
             "quote":{"text":"Fear is the mind-killer.","author":"Frank Herbert"},
             "theme":"light"}
            """
        )
        val data = WidgetData.parse(json)
        assertEquals(7, data.total)
        assertEquals(listOf(4, 1, 1, 1), listOf(data.books, data.movies, data.shows, data.quotes))
        assertEquals(WidgetData.Item("Dune", "Frank Herbert", "book", 0.25f), data.inProgress[0])
        assertNull(data.inProgress[1].progress)
        assertEquals("Frank Herbert", data.quote?.author)
        assertFalse(data.darkTheme)
    }

    @Test
    fun `tolerates missing fields and clamps progress`() {
        val data = WidgetData.parse(JSONObject("""{"inProgress":[{"title":"X","progress":3.5}],"quote":{"text":""}}"""))
        assertEquals(0, data.total)
        assertEquals(1f, data.inProgress.single().progress)
        assertNull(data.quote) // blank quote is dropped
        assertTrue(data.darkTheme) // Dusk by default
    }
}

package app.mehul.bookshelf.widget

import android.content.Context
import androidx.core.content.edit
import org.json.JSONObject

/**
 * The summary the web app pushes for the home-screen widget
 * (`src/platform/widget.js` → `widgetUpdate`). Stored as JSON so the widget can
 * render without the WebView running.
 */
data class WidgetData(
    val total: Int,
    val books: Int,
    val movies: Int,
    val shows: Int,
    val quotes: Int,
    val inProgress: List<Item>,
    val quote: Quote?,
    val darkTheme: Boolean,
) {
    data class Item(val title: String, val creator: String, val type: String, val progress: Float?)
    data class Quote(val text: String, val author: String)

    companion object {
        private const val PREFS = "widget"
        private const val KEY = "summary"

        val EMPTY = WidgetData(0, 0, 0, 0, 0, emptyList(), null, darkTheme = true)

        fun save(context: Context, summary: JSONObject) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putString(KEY, summary.toString()) }
        }

        fun load(context: Context): WidgetData {
            val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return EMPTY
            return runCatching { parse(JSONObject(json)) }.getOrDefault(EMPTY)
        }

        /** Tolerant parser: missing or malformed fields fall back to empty values. */
        fun parse(o: JSONObject): WidgetData {
            val counts = o.optJSONObject("counts") ?: JSONObject()
            val items = o.optJSONArray("inProgress")
            val inProgress = (0 until (items?.length() ?: 0)).mapNotNull { i ->
                val it = items?.optJSONObject(i) ?: return@mapNotNull null
                Item(
                    title = it.optString("title"),
                    creator = it.optString("creator"),
                    type = it.optString("type"),
                    progress = if (it.isNull("progress") || !it.has("progress")) null
                    else it.optDouble("progress").toFloat().coerceIn(0f, 1f),
                )
            }
            val q = o.optJSONObject("quote")
            return WidgetData(
                total = o.optInt("total"),
                books = counts.optInt("book"),
                movies = counts.optInt("movie"),
                shows = counts.optInt("tv"),
                quotes = counts.optInt("quote"),
                inProgress = inProgress,
                quote = q?.let { Quote(it.optString("text"), it.optString("author")) }?.takeIf { it.text.isNotBlank() },
                darkTheme = o.optString("theme", "dark") != "light",
            )
        }
    }
}

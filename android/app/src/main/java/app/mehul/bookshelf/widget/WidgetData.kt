package app.mehul.bookshelf.widget

import android.content.Context
import androidx.core.content.edit
import org.json.JSONArray
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
    /**
     * One thing under way. A show also carries `id` and its next aired, unwatched
     * episodes, so the widget can mark them watched without opening the app.
     */
    data class Item(
        val title: String,
        val creator: String,
        val type: String,
        val progress: Float?,
        val id: String = "",
        val next: List<Episode> = emptyList(),
    )
    data class Episode(val id: Long, val label: String)
    data class Quote(val text: String, val author: String)

    companion object {
        private const val PREFS = "widget"
        private const val KEY = "summary"
        private const val WATCHED = "watched"

        val EMPTY = WidgetData(0, 0, 0, 0, 0, emptyList(), null, darkTheme = true)

        fun save(context: Context, summary: JSONObject) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putString(KEY, summary.toString()) }
        }

        fun load(context: Context): WidgetData {
            val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return EMPTY
            return runCatching { parse(JSONObject(json)) }.getOrDefault(EMPTY)
        }

        /**
         * Record that episode [episode] of show [entry] was watched from the widget,
         * for the app to apply when it next runs, and take it off the widget's list
         * at once.
         */
        fun markWatched(context: Context, entry: String, episode: Long) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val pending = runCatching { JSONArray(prefs.getString(WATCHED, "[]")) }.getOrDefault(JSONArray())
            pending.put(JSONObject().put("entry", entry).put("episode", episode))
            val summary = prefs.getString(KEY, null)?.let { runCatching { JSONObject(it) }.getOrNull() }
            summary?.let { dropEpisode(it, entry, episode) }
            prefs.edit {
                putString(WATCHED, pending.toString())
                summary?.let { putString(KEY, it.toString()) }
            }
        }

        /** Episodes marked from the widget since the app last asked; clears the list. */
        fun takeWatched(context: Context): JSONArray {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val pending = runCatching { JSONArray(prefs.getString(WATCHED, "[]")) }.getOrDefault(JSONArray())
            prefs.edit { remove(WATCHED) }
            return pending
        }

        /** Remove [episode] from show [entry]'s `next` list in a stored summary. */
        internal fun dropEpisode(summary: JSONObject, entry: String, episode: Long) {
            val items = summary.optJSONArray("inProgress") ?: return
            for (i in 0 until items.length()) {
                val item = items.optJSONObject(i) ?: continue
                if (item.optString("id") != entry) continue
                val next = item.optJSONArray("next") ?: continue
                val kept = JSONArray()
                for (j in 0 until next.length()) next.optJSONObject(j)?.takeIf { it.optLong("id") != episode }?.let { kept.put(it) }
                item.put("next", kept)
            }
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
                    id = it.optString("id"),
                    next = it.optJSONArray("next")?.let { list ->
                        (0 until list.length()).mapNotNull { j ->
                            list.optJSONObject(j)?.let { ep -> Episode(ep.optLong("id"), ep.optString("label")) }
                        }
                    }.orEmpty(),
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

package app.mehul.bookshelf.reminders

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import app.mehul.bookshelf.MainActivity
import app.mehul.bookshelf.R
import app.mehul.bookshelf.SecureStore
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/**
 * New-episode alerts. The page sends the upcoming episodes of shows with
 * alerts on (`episodeReminders`); a periodic WorkManager job posts a
 * notification on the day each one airs. Works with the app closed.
 *
 * The page also sends which TMDB shows those are (`follow`). While the app is
 * closed, the job asks TMDB (with the user's own key, from the Keystore) for
 * each show's latest and next episode, so a season announced since the app
 * last ran is still announced. Without a key or a network it posts what it has.
 */
object EpisodeReminders {

    data class Item(val entryId: String, val show: String, val code: String, val name: String, val aired: String, val episodeId: Long) {
        val key get() = "$entryId:$episodeId"
    }

    private const val PREFS = "episode_reminders"
    private const val KEY_ITEMS = "items"
    private const val KEY_NOTIFIED = "notified"
    private const val KEY_FOLLOW = "follow"
    private const val TMDB_KEY = "tmdb_api_key"
    private const val CHANNEL_ID = "new_episodes"
    private const val WORK_NAME = "episode-reminders"
    /** Notify for episodes that aired up to this many days ago (missed runs, late installs). */
    private const val LOOKBACK_DAYS = 2L

    /** Episodes to announce today: aired within the lookback window and not yet announced. */
    fun dueItems(items: List<Item>, today: LocalDate, notified: Set<String>): List<Item> {
        val from = today.minusDays(LOOKBACK_DAYS).toString()
        val to = today.toString()
        return items.filter { it.aired in from..to && it.key !in notified }
    }

    fun parse(json: JSONArray): List<Item> = (0 until json.length()).mapNotNull { i ->
        val o = json.optJSONObject(i) ?: return@mapNotNull null
        val aired = o.optString("aired")
        if (!Regex("""\d{4}-\d{2}-\d{2}""").matches(aired)) return@mapNotNull null
        Item(o.optString("entryId"), o.optString("show"), o.optString("code"), o.optString("name"), aired, o.optLong("episodeId"))
    }

    /** A show to check on TMDB while the app is closed. */
    data class Follow(val entryId: String, val show: String, val tmdbId: String)

    fun parseFollow(json: JSONArray): List<Follow> = (0 until json.length()).mapNotNull { i ->
        val o = json.optJSONObject(i) ?: return@mapNotNull null
        val id = o.optString("tmdbId")
        if (id.isBlank() || !id.all { it.isDigit() }) return@mapNotNull null
        Follow(o.optString("entryId"), o.optString("show"), id)
    }

    /** The latest and next episode in a TMDB show record, as items for [show]. */
    fun itemsFromShow(show: Follow, record: JSONObject): List<Item> =
        listOf("last_episode_to_air", "next_episode_to_air").mapNotNull { field ->
            val ep = record.optJSONObject(field) ?: return@mapNotNull null
            val aired = ep.optString("air_date")
            val season = ep.optInt("season_number", -1)
            if (!Regex("\\d{4}-\\d{2}-\\d{2}").matches(aired) || season <= 0) return@mapNotNull null
            Item(show.entryId, show.show, "S$season E${ep.optInt("episode_number")}", ep.optString("name"), aired, ep.optLong("id"))
        }

    /** [items] with [extra] added where an episode isn't there yet. */
    fun merged(items: List<Item>, extra: List<Item>): List<Item> {
        val keys = items.map { it.key }.toMutableSet()
        return items + extra.filter { keys.add(it.key) }
    }

    private fun toJson(items: List<Item>) = JSONArray(items.map {
        JSONObject().put("entryId", it.entryId).put("show", it.show).put("code", it.code)
            .put("name", it.name).put("aired", it.aired).put("episodeId", it.episodeId)
    })

    /** Ask TMDB about each followed show and add any episode the schedule lacks. Blocking. */
    fun refreshFromTmdb(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val follow = runCatching { parseFollow(JSONArray(prefs.getString(KEY_FOLLOW, "[]"))) }.getOrDefault(emptyList())
        if (follow.isEmpty()) return
        val key = runCatching { SecureStore(context).get(TMDB_KEY) }.getOrNull()?.takeIf { it.isNotBlank() } ?: return
        val found = follow.flatMap { show ->
            runCatching { itemsFromShow(show, fetchShow(show.tmdbId, key)) }.getOrDefault(emptyList())
        }
        if (found.isEmpty()) return
        val items = runCatching { parse(JSONArray(prefs.getString(KEY_ITEMS, "[]"))) }.getOrDefault(emptyList())
        prefs.edit { putString(KEY_ITEMS, toJson(merged(items, found)).toString()) }
    }

    private fun fetchShow(id: String, key: String): JSONObject {
        val token = key.startsWith("eyJ")
        val query = "language=en-US" + if (token) "" else "&api_key=" + URLEncoder.encode(key, "UTF-8")
        val conn = URL("https://api.themoviedb.org/3/tv/$id?$query").openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            if (token) conn.setRequestProperty("Authorization", "Bearer $key")
            conn.setRequestProperty("Accept", "application/json")
            if (conn.responseCode != 200) throw IllegalStateException("TMDB ${conn.responseCode}")
            return JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        } finally {
            conn.disconnect()
        }
    }

    /** Store the schedule (and the shows to check) from the page; make sure the job is (or isn't) running. */
    fun update(context: Context, items: JSONArray, follow: JSONArray = JSONArray()) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit {
            putString(KEY_ITEMS, items.toString())
            putString(KEY_FOLLOW, follow.toString())
        }
        val work = WorkManager.getInstance(context)
        if (items.length() == 0 && follow.length() == 0) {
            work.cancelUniqueWork(WORK_NAME)
        } else {
            work.enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<EpisodeReminderWorker>(12, TimeUnit.HOURS).build(),
            )
        }
    }

    /** Post notifications for everything due now. Safe to call repeatedly. */
    fun notifyDue(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val items = runCatching { parse(JSONArray(prefs.getString(KEY_ITEMS, "[]"))) }.getOrDefault(emptyList())
        val notified = prefs.getStringSet(KEY_NOTIFIED, emptySet()).orEmpty()
        val due = dueItems(items, LocalDate.now(), notified)
        if (due.isEmpty() || !canNotify(context)) return

        ensureChannel(context)
        val manager = NotificationManagerCompat.from(context)
        for (item in due) {
            val open = Intent(context, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_OPEN_ENTRY, item.entryId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val pending = PendingIntent.getActivity(
                context, item.key.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_bookshelf)
                .setContentTitle(context.getString(R.string.new_episode_title, item.show))
                .setContentText(listOf(item.code, item.name).filter { it.isNotBlank() }.joinToString(" · "))
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .build()
            try {
                manager.notify(item.key.hashCode(), notification)
            } catch (_: SecurityException) {
                return // permission revoked between the check and now
            }
        }
        // Remember what was announced; forget keys that left the schedule.
        val current = items.map { it.key }.toSet()
        prefs.edit { putStringSet(KEY_NOTIFIED, (notified + due.map { it.key }).intersect(current)) }
    }

    fun canNotify(context: Context): Boolean {
        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return granted && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    private fun ensureChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL_ID, context.getString(R.string.new_episodes_channel), NotificationManager.IMPORTANCE_DEFAULT)
            .apply { description = context.getString(R.string.new_episodes_channel_description) }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}

class EpisodeReminderWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        runCatching { EpisodeReminders.refreshFromTmdb(applicationContext) }
        EpisodeReminders.notifyDue(applicationContext)
        return Result.success()
    }
}

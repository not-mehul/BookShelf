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
import org.json.JSONArray
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/**
 * New-episode alerts. The page sends the upcoming episodes of shows with
 * alerts on (`episodeReminders`); a periodic WorkManager job posts a
 * notification on the day each one airs. Works with the app closed, and needs
 * no network: the schedule was computed by the page.
 */
object EpisodeReminders {

    data class Item(val entryId: String, val show: String, val code: String, val name: String, val aired: String, val episodeId: Long) {
        val key get() = "$entryId:$episodeId"
    }

    private const val PREFS = "episode_reminders"
    private const val KEY_ITEMS = "items"
    private const val KEY_NOTIFIED = "notified"
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

    /** Store the schedule from the page and make sure the job is (or isn't) running. */
    fun update(context: Context, items: JSONArray) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit { putString(KEY_ITEMS, items.toString()) }
        val work = WorkManager.getInstance(context)
        if (items.length() == 0) {
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
        EpisodeReminders.notifyDue(applicationContext)
        return Result.success()
    }
}

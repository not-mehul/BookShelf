package app.mehul.bookshelf

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The weekly backup (src/sync/auto-backup.ts): a dated JSON file in
 * Documents/BookShelf/Backups, keeping the newest few. Written through
 * MediaStore, which needs no storage permission (Android 10 and later, the
 * oldest the app supports).
 */
object Backups {

    private const val DIR = "BookShelf/Backups"
    private const val PREFIX = "bookshelf-backup-"

    suspend fun write(context: Context, name: String, text: String, keep: Int): String = withContext(Dispatchers.IO) {
        val safe = Exports.sanitize(name)
        val resolver = context.contentResolver
        val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, safe)
            put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOCUMENTS}/$DIR/")
        }
        val uri = resolver.insert(collection, values) ?: throw IllegalStateException("Could not create the backup")
        try {
            resolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray()) }
                ?: throw IllegalStateException("Could not write the backup")
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }
        // MediaStore lists an app its own files: only BookShelf's backups are pruned.
        val found = mutableListOf<Pair<Long, String>>()
        resolver.query(
            collection,
            arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME),
            "${MediaStore.MediaColumns.RELATIVE_PATH}=? AND ${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?",
            arrayOf("${Environment.DIRECTORY_DOCUMENTS}/$DIR/", "$PREFIX%"),
            null,
        )?.use { c -> while (c.moveToNext()) found += c.getLong(0) to c.getString(1) }
        found.sortedByDescending { it.second }.drop(keep).forEach { (id, _) ->
            runCatching { resolver.delete(ContentUris.withAppendedId(collection, id), null, null) }
        }
        "Documents/$DIR/$safe"
    }
}

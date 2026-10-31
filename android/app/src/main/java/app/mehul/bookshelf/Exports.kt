package app.mehul.bookshelf

import android.app.Activity
import android.content.Intent
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Hands generated files (Markdown/JSON exports, share-card images) to the
 * system share sheet, via cacheDir/exports and the app's FileProvider.
 */
object Exports {

    suspend fun share(activity: Activity, filename: String, bytes: ByteArray, mime: String = mimeFor(filename)) {
        val file = withContext(Dispatchers.IO) {
            val dir = File(activity.cacheDir, "exports").apply { mkdirs() }
            File(dir, sanitize(filename)).apply { writeBytes(bytes) }
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
        val share = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TITLE, filename)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(Intent.createChooser(share, activity.getString(R.string.export_chooser_title)))
    }

    // Keep the name inside cacheDir/exports: no separators, and no leading
    // dots (so "." / ".." can never resolve to a directory).
    internal fun sanitize(name: String): String =
        name.replace(Regex("[^A-Za-z0-9._-]"), "_").trimStart('.').ifEmpty { "export.md" }

    internal fun mimeFor(name: String): String = when {
        name.endsWith(".json", ignoreCase = true) -> "application/json"
        name.endsWith(".md", ignoreCase = true) -> "text/markdown"
        name.endsWith(".png", ignoreCase = true) -> "image/png"
        else -> "text/plain"
    }
}

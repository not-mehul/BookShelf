package app.mehul.bookshelf

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.edit
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Storage for the encrypted sync file in a folder the user picks with the
 * system folder picker (Storage Access Framework) — e.g. a Google Drive,
 * Nextcloud or Syncthing folder. The page encrypts/decrypts; this class only
 * moves opaque text in and out of `bookshelf-sync.json`.
 *
 * The picker itself is launched by [BookShelfPlugin] (Capacitor owns the
 * activity-result plumbing), which hands the chosen tree to [onPicked].
 */
class FolderSync(private val context: Context) {

    private val prefs by lazy { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }

    /** The folder picker, opened at the current folder if there is one. */
    fun pickerIntent(): Intent = ActivityResultContracts.OpenDocumentTree().createIntent(context, folderUri())

    /** Remember the folder the user picked; keeps the previous one if they cancelled (null). */
    fun onPicked(uri: Uri?): JSONObject? {
        uri ?: return status()
        val resolver = context.contentResolver
        resolver.takePersistableUriPermission(uri, PERMISSION_FLAGS)
        folderUri()?.takeIf { it != uri }?.let { old ->
            runCatching { resolver.releasePersistableUriPermission(old, PERMISSION_FLAGS) }
        }
        prefs.edit { putString(KEY_FOLDER, uri.toString()) }
        return status()
    }

    /** `{ folderName }`, or null when no folder is set or access was revoked. */
    fun status(): JSONObject? {
        val dir = folder() ?: return null
        return JSONObject().put("folderName", dir.name ?: "Selected folder")
    }

    fun forget() {
        folderUri()?.let { runCatching { context.contentResolver.releasePersistableUriPermission(it, PERMISSION_FLAGS) } }
        prefs.edit { remove(KEY_FOLDER) }
    }

    /** Contents of the sync file, or null if there isn't one yet. */
    suspend fun read(): String? = withContext(Dispatchers.IO) {
        val dir = requireFolder()
        // Fall back to the temp file if a previous write was interrupted mid-swap.
        val file = dir.findFile(FILE_NAME) ?: dir.findFile(TEMP_NAME) ?: return@withContext null
        context.contentResolver.openInputStream(file.uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
    }

    /**
     * Replace the sync file. Writes a temp file first and swaps it in, so an
     * interrupted write never leaves a truncated sync file behind.
     */
    suspend fun write(text: String) = withContext(Dispatchers.IO) {
        val dir = requireFolder()
        val bytes = text.toByteArray(Charsets.UTF_8)
        dir.findFile(TEMP_NAME)?.delete()
        // octet-stream: some providers append an extension for other MIME types.
        val temp = dir.createFile(TEMP_MIME, TEMP_NAME) ?: error("Can't create files in the sync folder")
        writeTo(temp.uri, bytes)

        val existing = dir.findFile(FILE_NAME)
        if (existing == null || existing.delete()) {
            if (temp.renameTo(FILE_NAME)) return@withContext
        }
        // Provider can't rename: write in place instead, then drop the temp file.
        val target = dir.findFile(FILE_NAME) ?: dir.createFile(TEMP_MIME, FILE_NAME)
            ?: error("Can't create the sync file")
        writeTo(target.uri, bytes)
        temp.delete()
    }

    private fun writeTo(uri: Uri, bytes: ByteArray) {
        context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) }
            ?: error("Can't write to the sync folder")
    }

    private fun folderUri(): Uri? = prefs.getString(KEY_FOLDER, null)?.let(Uri::parse)

    private fun folder(): DocumentFile? {
        val uri = folderUri() ?: return null
        val granted = context.contentResolver.persistedUriPermissions.any {
            it.uri == uri && it.isReadPermission && it.isWritePermission
        }
        if (!granted) return null
        return DocumentFile.fromTreeUri(context, uri)?.takeIf { it.isDirectory }
    }

    private fun requireFolder(): DocumentFile =
        folder() ?: error("The sync folder is no longer accessible. Choose it again in Settings.")

    companion object {
        private const val PREFS_NAME = "sync"
        private const val KEY_FOLDER = "folder_uri"
        const val FILE_NAME = "bookshelf-sync.json"
        private const val TEMP_NAME = "bookshelf-sync.json.tmp"
        private const val TEMP_MIME = "application/octet-stream"
        private const val PERMISSION_FLAGS =
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
    }
}

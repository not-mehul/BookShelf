package app.mehul.bookshelf

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.os.Build
import android.util.Base64
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResult
import androidx.glance.appwidget.updateAll
import app.mehul.bookshelf.reminders.EpisodeReminders
import app.mehul.bookshelf.widget.BookShelfWidget
import app.mehul.bookshelf.widget.WidgetData
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.WebViewListener
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * BookShelf's native features, exposed to the page as the `BookShelf`
 * Capacitor plugin (web side: `src/platform/native.ts`).
 *
 * Every method resolves `{ value }`, so the page's `callNative(name, params)`
 * can stay generic. Events, all kept until the page subscribes so nothing
 * from a cold start is lost: `shared` (text shared into the app), `openAdd`
 * (widget), `openEntry` (new-episode alert), and `back`.
 */
@CapacitorPlugin(
    name = "BookShelf",
    permissions = [Permission(alias = BookShelfPlugin.NOTIFICATIONS, strings = [Manifest.permission.POST_NOTIFICATIONS])],
)
class BookShelfPlugin : Plugin() {

    private val scope = MainScope()
    private lateinit var secureStore: SecureStore
    private lateinit var folderSync: FolderSync

    // Enabled only while the page has something to dismiss (an open dialog).
    // Otherwise the system owns Back, which keeps the predictive back-to-home
    // animation working.
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() = notifyListeners("back", JSObject())
    }

    override fun load() {
        secureStore = SecureStore(context)
        folderSync = FolderSync(context)
        activity.onBackPressedDispatcher.addCallback(activity, backCallback)
        bridge.addWebViewListener(object : WebViewListener() {
            override fun onRenderProcessGone(webView: WebView, detail: RenderProcessGoneDetail): Boolean {
                // The renderer crashed or was killed for memory. The WebView is
                // unusable now; rebuild the activity instead of crashing the app.
                activity.recreate()
                return true
            }
        })
        handleIntent(activity.intent)
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        handleIntent(intent)
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    /** Forward shared text and widget / alert taps to the page. */
    private fun handleIntent(intent: Intent?) {
        when {
            intent == null -> return
            intent.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty()
                if (text.isNotBlank() || subject.isNotBlank()) {
                    emit("shared", JSObject().put("text", text.take(MAX_SHARED_CHARS)).put("subject", subject))
                }
            }
            intent.getStringExtra(MainActivity.EXTRA_ACTION) == MainActivity.ACTION_ADD -> emit("openAdd", JSObject())
            intent.hasExtra(MainActivity.EXTRA_OPEN_ENTRY) ->
                emit("openEntry", JSObject().put("id", intent.getStringExtra(MainActivity.EXTRA_OPEN_ENTRY)))
        }
    }

    private fun emit(name: String, data: JSObject) = notifyListeners(name, data, true)

    /** Run [block] on the main thread and resolve the call with `{ value }`. */
    private fun respond(call: PluginCall, block: suspend () -> Any?) {
        scope.launch {
            try {
                val result = JSObject()
                block()?.let { result.put("value", it) }
                call.resolve(result)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                call.reject(e.message ?: e.toString())
            }
        }
    }

    private fun PluginCall.require(key: String): String =
        getString(key) ?: throw IllegalArgumentException("Missing \"$key\"")

    // ── HTTP and back ───────────────────────────────────────────────

    @PluginMethod
    fun http(call: PluginCall) {
        scope.launch {
            val reply = withContext(Dispatchers.IO) { NativeHttp.perform(call.data) }
            call.resolve(JSObject.fromJSONObject(reply))
        }
    }

    @PluginMethod
    fun setBackHandler(call: PluginCall) {
        respond(call) {
            backCallback.isEnabled = call.getBoolean("enabled", false) == true
            null
        }
    }

    // ── Secure settings (API keys, sync passphrase) ─────────────────

    @PluginMethod
    fun secureGet(call: PluginCall) = respond(call) { withContext(Dispatchers.IO) { secureStore.get(call.require("key")) } }

    @PluginMethod
    fun secureSet(call: PluginCall) = respond(call) {
        withContext(Dispatchers.IO) { secureStore.set(call.require("key"), call.require("value")) }
        true
    }

    @PluginMethod
    fun secureRemove(call: PluginCall) = respond(call) {
        withContext(Dispatchers.IO) { secureStore.remove(call.require("key")) }
        true
    }

    // ── Barcode ─────────────────────────────────────────────────────

    @PluginMethod
    fun scanBarcode(call: PluginCall) = respond(call) { BarcodeScanner.scan(activity) }

    // ── Folder sync ─────────────────────────────────────────────────

    @PluginMethod
    fun syncStatus(call: PluginCall) = respond(call) { folderSync.status() }

    @PluginMethod
    fun syncPickFolder(call: PluginCall) {
        startActivityForResult(call, folderSync.pickerIntent(), "onFolderPicked")
    }

    @ActivityCallback
    fun onFolderPicked(call: PluginCall, result: ActivityResult) {
        val uri = if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
        respond(call) { folderSync.onPicked(uri) }
    }

    @PluginMethod
    fun syncForget(call: PluginCall) = respond(call) {
        folderSync.forget()
        true
    }

    @PluginMethod
    fun syncRead(call: PluginCall) = respond(call) { folderSync.read() }

    @PluginMethod
    fun syncWrite(call: PluginCall) = respond(call) {
        folderSync.write(call.require("text"))
        true
    }

    // ── New-episode alerts ──────────────────────────────────────────

    @PluginMethod
    fun episodeReminders(call: PluginCall) = respond(call) {
        val items = call.data.getJSONArray("items")
        withContext(Dispatchers.IO) {
            EpisodeReminders.update(context, items)
            EpisodeReminders.notifyDue(context)
        }
        true
    }

    /** True if notifications may be posted, asking on Android 13+ if needed. */
    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        when {
            EpisodeReminders.canNotify(context) -> respond(call) { true }
            // Below Android 13 there is no runtime prompt: they're off in system settings.
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU -> respond(call) { false }
            else -> requestPermissionForAlias(NOTIFICATIONS, call, "onNotificationPermission")
        }
    }

    @PermissionCallback
    fun onNotificationPermission(call: PluginCall) = respond(call) { EpisodeReminders.canNotify(context) }

    // ── Widget ──────────────────────────────────────────────────────

    @PluginMethod
    fun widgetUpdate(call: PluginCall) = respond(call) {
        WidgetData.save(context, call.data.getJSONObject("summary"))
        BookShelfWidget().updateAll(context)
        true
    }

    // ── Exports and share cards ─────────────────────────────────────

    /** Markdown / JSON exports (UTF-8 text). */
    @PluginMethod
    fun export(call: PluginCall) = share(call) {
        call.require("filename") to call.require("text").toByteArray(Charsets.UTF_8)
    }

    /** Share-card images (base64 PNG from the page). */
    @PluginMethod
    fun shareFile(call: PluginCall) = share(call) {
        val bytes = withContext(Dispatchers.Default) { Base64.decode(call.require("base64"), Base64.NO_WRAP) }
        call.require("filename") to bytes
    }

    private fun share(call: PluginCall, file: suspend () -> Pair<String, ByteArray>) = respond(call) {
        try {
            val (filename, bytes) = file()
            Exports.share(activity, filename, bytes, call.getString("mime")?.ifEmpty { null } ?: Exports.mimeFor(filename))
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Toast.makeText(context, context.getString(R.string.export_failed, e.message), Toast.LENGTH_LONG).show()
            throw e
        }
    }

    companion object {
        const val NOTIFICATIONS = "notifications"

        // Shared text becomes a quote; cap absurdly large payloads.
        private const val MAX_SHARED_CHARS = 20_000
    }
}

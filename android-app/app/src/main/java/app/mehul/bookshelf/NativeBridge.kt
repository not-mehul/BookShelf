package app.mehul.bookshelf

import android.content.Intent
import android.util.Base64
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.content.FileProvider
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.max

/**
 * Message channel between the web app and the native shell.
 *
 * Uses [WebViewCompat.addWebMessageListener], which injects `window.BookShelfNative`
 * only into frames whose origin is [MainActivity.APP_ORIGIN] — unlike the legacy
 * `addJavascriptInterface`, no other page could ever reach it. Messages are JSON
 * strings; the web side lives in `src/platform/native.js`.
 *
 * Web → native: `http`, `export`, `theme`, `backHandler`.
 * Native → web: `http` (response, matched by id) and `back`.
 */
class NativeBridge(
    private val activity: ComponentActivity,
    private val webView: WebView,
    private val onBackHandlerChanged: (enabled: Boolean) -> Unit,
    private val onThemeChanged: (dark: Boolean) -> Unit,
) {
    private var replyProxy: JavaScriptReplyProxy? = null
    private var insetsScript: String? = null

    fun install() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(
            webView,
            JS_OBJECT_NAME,
            setOf(MainActivity.APP_ORIGIN),
        ) { _, message, _, isMainFrame, proxy ->
            if (!isMainFrame) return@addWebMessageListener
            replyProxy = proxy
            val msg = try {
                JSONObject(message.data ?: return@addWebMessageListener)
            } catch (_: JSONException) {
                return@addWebMessageListener
            }
            handle(msg, proxy)
        }
    }

    private fun handle(msg: JSONObject, proxy: JavaScriptReplyProxy) {
        when (msg.optString("type")) {
            "http" -> activity.lifecycleScope.launch {
                val reply = withContext(Dispatchers.IO) { performHttp(msg) }
                proxy.send(reply.toString())
            }
            "export" -> activity.lifecycleScope.launch {
                exportFile(msg.optString("filename"), msg.optString("text"))
            }
            "theme" -> onThemeChanged(msg.optString("mode") != "light")
            "backHandler" -> onBackHandlerChanged(msg.optBoolean("enabled"))
        }
    }

    /** Ask the page to dismiss whatever it registered a back handler for. */
    fun dispatchBack() {
        val proxy = replyProxy
        if (proxy != null) {
            proxy.send("""{"type":"back"}""")
        } else {
            // Page never registered; hand Back to the system.
            onBackHandlerChanged(false)
            activity.onBackPressedDispatcher.onBackPressed()
        }
    }

    // The proxy only exists when WEB_MESSAGE_LISTENER is supported (see
    // install()); the explicit check documents that and satisfies lint.
    private fun JavaScriptReplyProxy.send(json: String) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) postMessage(json)
    }

    /** Publish system-bar / cutout insets to the page as CSS variables (in CSS px). */
    fun updateInsets(insets: WindowInsetsCompat) {
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
        val density = activity.resources.displayMetrics.density
        fun css(px: Int) = "${px / density}px"
        // When the keyboard is up the WebView already sits above it, so the
        // navigation-bar inset no longer applies at the bottom.
        val bottom = max(0, bars.bottom - ime.bottom)
        insetsScript = buildString {
            append("(function(s){")
            append("s.setProperty('--inset-top','${css(bars.top)}');")
            append("s.setProperty('--inset-right','${css(bars.right)}');")
            append("s.setProperty('--inset-bottom','${css(bottom)}');")
            append("s.setProperty('--inset-left','${css(bars.left)}');")
            append("})(document.documentElement.style)")
        }
        reapplyInsets()
    }

    /** Re-send the last known insets (e.g. after a page load). */
    fun reapplyInsets() {
        insetsScript?.let { webView.evaluateJavascript(it, null) }
    }

    // ── HTTP ────────────────────────────────────────────────────────

    private fun performHttp(msg: JSONObject): JSONObject {
        val id = msg.optInt("id")
        val reply = JSONObject().put("type", "http").put("id", id)
        var conn: HttpURLConnection? = null
        try {
            val url = URL(msg.getString("url"))
            if (!url.protocol.equals("https", ignoreCase = true) || !isHostAllowed(url.host)) {
                return reply.put("status", 0).put("error", "Blocked request to disallowed host")
            }
            val method = msg.optString("method", "GET").uppercase()
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                instanceFollowRedirects = true
            }
            msg.optJSONObject("headers")?.let { headers ->
                headers.keys().forEach { key -> conn.setRequestProperty(key, headers.getString(key)) }
            }
            if (!msg.isNull("body") && method != "GET" && method != "HEAD") {
                conn.doOutput = true
                conn.outputStream.use { it.write(msg.getString("body").toByteArray(Charsets.UTF_8)) }
            }

            val status = conn.responseCode
            val stream = if (status in 200..399) conn.inputStream else conn.errorStream
            val bytes = stream?.use { it.readBytes() } ?: ByteArray(0)

            val headers = JSONObject()
            conn.headerFields.forEach { (key, values) ->
                if (key != null && !values.isNullOrEmpty()) headers.put(key, values[0])
            }
            return reply
                .put("status", status)
                .put("headers", headers)
                .put("body", Base64.encodeToString(bytes, Base64.NO_WRAP))
        } catch (e: Exception) {
            return reply.put("status", 0).put("error", e.message ?: e.toString())
        } finally {
            conn?.disconnect()
        }
    }

    // ── Export / share ─────────────────────────────────────────────

    private suspend fun exportFile(filename: String, text: String) {
        try {
            val file = withContext(Dispatchers.IO) {
                val dir = File(activity.cacheDir, "exports").apply { mkdirs() }
                File(dir, sanitize(filename)).apply { writeText(text, Charsets.UTF_8) }
            }
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
            val share = Intent(Intent.ACTION_SEND).apply {
                type = mimeFor(filename)
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_TITLE, filename)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(share, activity.getString(R.string.export_chooser_title)))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Toast.makeText(activity, activity.getString(R.string.export_failed, e.message), Toast.LENGTH_LONG).show()
        }
    }

    companion object {
        const val JS_OBJECT_NAME = "BookShelfNative"
        private const val TIMEOUT_MS = 30_000

        // The bridge only exists to bypass CORS for the app's own APIs, so it
        // is scoped to those hosts (and their cover CDNs), never an open proxy.
        private val ALLOWED_HOST_SUFFIXES = listOf(
            "thetvdb.com",
            "googleapis.com",
            "google.com",
            "gstatic.com",
            "googleusercontent.com",
            "openlibrary.org",
        )

        internal fun isHostAllowed(host: String?): Boolean {
            val h = host?.lowercase() ?: return false
            return ALLOWED_HOST_SUFFIXES.any { h == it || h.endsWith(".$it") }
        }

        // Keep the name inside cacheDir/exports: no separators, and no leading
        // dots (so "." / ".." can never resolve to a directory).
        internal fun sanitize(name: String): String =
            name.replace(Regex("[^A-Za-z0-9._-]"), "_").trimStart('.').ifEmpty { "export.md" }

        internal fun mimeFor(name: String): String = when {
            name.endsWith(".json", ignoreCase = true) -> "application/json"
            name.endsWith(".md", ignoreCase = true) -> "text/markdown"
            else -> "text/plain"
        }
    }
}

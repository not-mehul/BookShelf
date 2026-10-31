package app.mehul.bookshelf

import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * HTTP for the page's API calls (TheTVDB and friends don't send CORS headers a
 * WebView would accept). Only exists to bypass CORS for the app's own APIs, so
 * it is scoped to those hosts and their cover CDNs, never an open proxy.
 *
 * Request: `{ url, method, headers, body }`. Reply: `{ status, headers, body }`
 * with a base64 body, or `{ status: 0, error }` for network-level failures.
 * The web side lives in `src/platform/native.ts`.
 */
object NativeHttp {

    private const val TIMEOUT_MS = 30_000

    // Keep in sync with NATIVE_HOST_SUFFIXES in src/platform/native.ts.
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

    /** Blocking; call from Dispatchers.IO. */
    fun perform(msg: JSONObject): JSONObject {
        val reply = JSONObject()
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
}

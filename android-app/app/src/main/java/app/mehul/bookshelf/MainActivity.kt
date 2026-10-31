package app.mehul.bookshelf

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.glance.appwidget.updateAll
import androidx.webkit.WebViewAssetLoader
import app.mehul.bookshelf.widget.BookShelfWidget
import app.mehul.bookshelf.widget.WidgetData
import app.mehul.bookshelf.reminders.EpisodeReminders
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Thin native shell for the BookShelf web app.
 *
 * The web build in `src/main/assets` is served over [APP_ORIGIN] via
 * [WebViewAssetLoader] — a real secure origin, so IndexedDB and localStorage
 * persist reliably. The page talks to the shell through [NativeBridge].
 *
 * The activity draws edge-to-edge: system-bar and display-cutout insets are
 * handed to the page as CSS variables, while the keyboard (IME) inset shrinks
 * the WebView so focused inputs stay visible.
 */
class MainActivity : ComponentActivity() {

    private lateinit var container: FrameLayout
    private lateinit var webView: WebView
    private lateinit var bridge: NativeBridge

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    // Registers an activity-result launcher, so it must exist before onStart.
    private val folderSync = FolderSync(this)

    private var permissionResult: CompletableDeferred<Boolean>? = null
    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            permissionResult?.complete(granted)
            permissionResult = null
        }

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            filePathCallback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            )
            filePathCallback = null
        }

    // Enabled only while the page has something to dismiss (an open modal).
    // Otherwise the system owns Back, which keeps the predictive back-to-home
    // animation working.
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() = bridge.dispatchBack()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        applySystemBarStyle(darkTheme = isSystemInDarkMode())
        super.onCreate(savedInstanceState)

        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView = WebView(this)
        container = FrameLayout(this).apply { addView(webView) }
        setContentView(container)

        bridge = NativeBridge(
            activity = this,
            webView = webView,
            onBackHandlerChanged = { enabled -> backCallback.isEnabled = enabled },
            onThemeChanged = { dark -> applySystemBarStyle(dark) },
        )
        configureWebView()
        registerNativeMethods()
        bridge.install()
        onBackPressedDispatcher.addCallback(this, backCallback)

        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            // Shrink the WebView above the keyboard, like adjustResize used to.
            view.updatePadding(bottom = ime.bottom)
            bridge.updateInsets(insets)
            insets
        }

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl("$APP_ORIGIN/index.html")
        }
        // A restored instance already handled its launch intent.
        if (savedInstanceState == null) handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** Forward shared text and widget actions to the page (queued until it is ready). */
    private fun handleIntent(intent: Intent?) {
        when {
            intent == null -> return
            intent.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty()
                if (text.isNotBlank() || subject.isNotBlank()) {
                    bridge.emit("shared", JSONObject().put("text", text.take(MAX_SHARED_CHARS)).put("subject", subject))
                }
            }
            intent.getStringExtra(EXTRA_ACTION) == ACTION_ADD -> bridge.emit("openAdd")
            intent.hasExtra(EXTRA_OPEN_ENTRY) ->
                bridge.emit("openEntry", JSONObject().put("id", intent.getStringExtra(EXTRA_OPEN_ENTRY)))
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // Assets come from WebViewAssetLoader, never file:// or content://.
            allowFileAccess = false
            allowContentAccess = false
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(APP_DOMAIN)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.toString().startsWith(APP_ORIGIN)) return false
                // Anything else (external links) opens in the user's browser.
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (_: ActivityNotFoundException) {
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                bridge.onPageStarted()
            }

            override fun onPageCommitVisible(view: WebView, url: String) {
                bridge.reapplyInsets()
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // The renderer crashed or was killed for memory. The WebView is
                // unusable now; rebuild the activity instead of crashing the app.
                recreate()
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    fileChooser.launch(params.createIntent())
                    true
                } catch (_: ActivityNotFoundException) {
                    filePathCallback = null
                    false
                }
            }
        }
    }

    /** Methods the page can call with `callNative(name, params)`. */
    private fun registerNativeMethods() {
        val secureStore = SecureStore(this)
        bridge.register("secureGet") { p -> withContext(Dispatchers.IO) { secureStore.get(p.getString("key")) } }
        bridge.register("secureSet") { p ->
            withContext(Dispatchers.IO) { secureStore.set(p.getString("key"), p.getString("value")) }
            true
        }
        bridge.register("secureRemove") { p ->
            withContext(Dispatchers.IO) { secureStore.remove(p.getString("key")) }
            true
        }
        bridge.register("scanBarcode") { BarcodeScanner.scan(this) }

        bridge.register("syncStatus") { folderSync.status() }
        bridge.register("syncPickFolder") { folderSync.pickFolder() }
        bridge.register("syncForget") { folderSync.forget(); true }
        bridge.register("syncRead") { folderSync.read() }
        bridge.register("syncWrite") { p -> folderSync.write(p.getString("text")); true }

        bridge.register("episodeReminders") { p ->
            withContext(Dispatchers.IO) {
                EpisodeReminders.update(this@MainActivity, p.getJSONArray("items"))
                EpisodeReminders.notifyDue(this@MainActivity)
            }
            true
        }
        bridge.register("requestNotificationPermission") { requestNotificationPermission() }

        bridge.register("widgetUpdate") { p ->
            WidgetData.save(this, p.getJSONObject("summary"))
            BookShelfWidget().updateAll(this)
            true
        }
    }

    /** True if notifications may be posted, asking on Android 13+ if needed. */
    private suspend fun requestNotificationPermission(): Boolean {
        if (EpisodeReminders.canNotify(this)) return true
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false // disabled in system settings
        val deferred = CompletableDeferred<Boolean>()
        permissionResult?.cancel()
        permissionResult = deferred
        notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        return deferred.await() && EpisodeReminders.canNotify(this)
    }

    // Transparent bars; icon colour follows the page's Dusk/Dawn theme.
    private fun applySystemBarStyle(darkTheme: Boolean) {
        val style = if (darkTheme) {
            SystemBarStyle.dark(Color.TRANSPARENT)
        } else {
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        }
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
        if (::container.isInitialized) {
            container.setBackgroundColor(getColor(if (darkTheme) R.color.dusk_bg else R.color.dawn_bg))
        }
    }

    private fun isSystemInDarkMode(): Boolean =
        resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        container.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        const val APP_DOMAIN = "appassets.androidwebview.com"
        const val APP_ORIGIN = "https://$APP_DOMAIN"

        /** Intent extra used by the home-screen widget to request an action. */
        const val EXTRA_ACTION = "app.mehul.bookshelf.action"
        const val ACTION_ADD = "add"
        /** Set by new-episode notifications: open this entry. */
        const val EXTRA_OPEN_ENTRY = "app.mehul.bookshelf.openEntry"

        // Shared text becomes a quote; cap absurdly large payloads.
        private const val MAX_SHARED_CHARS = 20_000
    }
}

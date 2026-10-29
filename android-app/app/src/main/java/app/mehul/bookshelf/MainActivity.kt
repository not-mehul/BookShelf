package app.mehul.bookshelf

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
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
import androidx.webkit.WebViewAssetLoader

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
    }
}

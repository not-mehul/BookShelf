package app.mehul.bookshelf;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Thin native shell for the BookShelf web app.
 *
 * The web build lives in src/main/assets and is served over
 * https://appassets.androidwebview.com via {@link WebViewAssetLoader} — a real
 * secure origin, so IndexedDB (Dexie) and localStorage work reliably.
 *
 * Two JavascriptInterfaces replace what Capacitor used to provide:
 *   - AndroidHttp: native HTTP so cross-origin API calls (TheTVDB) bypass CORS.
 *   - AndroidExport: writes the Markdown export and opens the system share sheet.
 */
public class MainActivity extends Activity {

    private static final String APP_ORIGIN = "https://appassets.androidwebview.com";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private final static int FILE_CHOOSER_RESULT_CODE = 1;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @Override
    @SuppressWarnings("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(true);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidwebview.com")
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith(APP_ORIGIN)) {
                    return false; // keep in-app
                }
                // Open anything else (external links) in the user's browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_RESULT_CODE);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.addJavascriptInterface(new HttpBridge(), "AndroidHttp");
        webView.addJavascriptInterface(new ExportBridge(), "AndroidExport");

        if (savedInstanceState == null) {
            webView.loadUrl(APP_ORIGIN + "/index.html");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        webView.restoreState(savedInstanceState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (filePathCallback == null) return;
            filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    // ── Native HTTP bridge ─────────────────────────────────────────────

    private class HttpBridge {
        @JavascriptInterface
        public void request(final int id, final String method, final String url,
                            final String headersJson, final String body) {
            executor.execute(() -> {
                HttpURLConnection conn = null;
                try {
                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setRequestMethod(method);
                    conn.setConnectTimeout(30000);
                    conn.setReadTimeout(30000);
                    conn.setInstanceFollowRedirects(true);

                    if (headersJson != null && !headersJson.isEmpty()) {
                        JSONObject headers = new JSONObject(headersJson);
                        Iterator<String> keys = headers.keys();
                        while (keys.hasNext()) {
                            String key = keys.next();
                            conn.setRequestProperty(key, headers.getString(key));
                        }
                    }

                    boolean hasBody = body != null
                            && !"GET".equals(method) && !"HEAD".equals(method);
                    if (hasBody) {
                        conn.setDoOutput(true);
                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        try (OutputStream os = conn.getOutputStream()) {
                            os.write(payload);
                        }
                    }

                    int status = conn.getResponseCode();
                    InputStream is = (status >= 200 && status < 400)
                            ? conn.getInputStream() : conn.getErrorStream();
                    byte[] data = readAll(is);
                    String b64 = Base64.encodeToString(data, Base64.NO_WRAP);

                    JSONObject respHeaders = new JSONObject();
                    for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                        if (e.getKey() == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                        respHeaders.put(e.getKey(), e.getValue().get(0));
                    }

                    resolve(id, status, respHeaders.toString(), b64, null);
                } catch (Exception ex) {
                    String msg = ex.getMessage() != null ? ex.getMessage() : ex.toString();
                    resolve(id, 0, "{}", "", msg);
                } finally {
                    if (conn != null) conn.disconnect();
                }
            });
        }
    }

    private void resolve(int id, int status, String headersJson, String b64Body, String error) {
        final String js = "window.__nativeHttpResolve("
                + id + ","
                + status + ","
                + JSONObject.quote(headersJson) + ","
                + JSONObject.quote(b64Body) + ","
                + (error == null ? "null" : JSONObject.quote(error))
                + ")";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private static byte[] readAll(InputStream is) throws Exception {
        if (is == null) return new byte[0];
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = is.read(chunk)) != -1) buffer.write(chunk, 0, n);
        is.close();
        return buffer.toByteArray();
    }

    // ── Native export bridge ───────────────────────────────────────────

    private class ExportBridge {
        @JavascriptInterface
        public void save(final String filename, final String text) {
            executor.execute(() -> {
                try {
                    File dir = new File(getCacheDir(), "exports");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    File out = new File(dir, sanitize(filename));
                    try (FileOutputStream fos = new FileOutputStream(out)) {
                        fos.write(text.getBytes(StandardCharsets.UTF_8));
                    }

                    Uri uri = FileProvider.getUriForFile(
                            MainActivity.this,
                            getPackageName() + ".fileprovider",
                            out);

                    Intent share = new Intent(Intent.ACTION_SEND);
                    share.setType("text/markdown");
                    share.putExtra(Intent.EXTRA_STREAM, uri);
                    share.putExtra(Intent.EXTRA_TITLE, filename);
                    share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                    Intent chooser = Intent.createChooser(share, "Export catalog");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(chooser);
                } catch (Exception ex) {
                    webView.post(() -> Toast.makeText(
                            MainActivity.this,
                            "Export failed: " + ex.getMessage(),
                            Toast.LENGTH_LONG).show());
                }
            });
        }
    }

    private static String sanitize(String name) {
        if (name == null || name.isEmpty()) return "export.md";
        return name.replaceAll("[^A-Za-z0-9._-]", "_");
    }
}

# JavascriptInterface methods are called reflectively from the WebView; keep them.
-keepclassmembers class app.bookshelf.personal.MainActivity$* {
    @android.webkit.JavascriptInterface <methods>;
}

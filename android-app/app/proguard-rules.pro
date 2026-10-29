# The web bridge uses WebViewCompat.addWebMessageListener (a normal listener
# object), not reflective @JavascriptInterface methods, so R8 needs no special
# keep rules for it. AndroidX libraries ship their own consumer rules.

# Home-screen widget: Glance calls GlanceAppWidget.provideGlance() from its
# session worker, but R8 (full mode) concludes our override is unreachable and
# strips the whole widget UI from release builds (debug builds are fine).
# Keep the entry point; everything it composes stays reachable from here.
-keep class app.mehul.bookshelf.widget.BookShelfWidget {
    public <init>();
    *** provideGlance(...);
}

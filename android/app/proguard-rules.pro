# Capacitor ships the keep rules its bridge and @CapacitorPlugin classes need
# (including BookShelfPlugin). AndroidX libraries ship their own consumer rules.

# Home-screen widget: Glance calls GlanceAppWidget.provideGlance() from its
# session worker, but R8 (full mode) concludes our override is unreachable and
# strips the whole widget UI from release builds (debug builds are fine).
# Keep the entry point; everything it composes stays reachable from here.
-keep class app.mehul.bookshelf.widget.BookShelfWidget {
    public <init>();
    *** provideGlance(...);
}

# ML Kit (the barcode Code Scanner) finds its components by class name and
# creates them through their no-argument constructors. R8's strict full mode
# drops those constructors unless they are kept, and ML Kit then logs
# NoSuchMethodException at start-up and scanning fails in release builds.
-keep class * implements com.google.firebase.components.ComponentRegistrar {
    public <init>();
}

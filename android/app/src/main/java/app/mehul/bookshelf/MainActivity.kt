package app.mehul.bookshelf

import android.content.Intent
import android.os.Bundle
import com.getcapacitor.BridgeActivity

/**
 * Capacitor shell for the BookShelf web app. The page is served from
 * https://appassets.androidwebview.com (capacitor.config.ts), the origin the
 * old hand-built shell used, so its IndexedDB and settings carry over.
 * Native features live in [BookShelfPlugin].
 */
class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(BookShelfPlugin::class.java)
        // A restored instance already handled its launch intent (shared text,
        // widget tap); don't deliver it to the page a second time.
        if (savedInstanceState != null) intent = Intent(Intent.ACTION_MAIN)
        super.onCreate(savedInstanceState)
    }

    companion object {
        /** Intent extra used by the home-screen widget to request an action. */
        const val EXTRA_ACTION = "app.mehul.bookshelf.action"
        const val ACTION_ADD = "add"

        /** Set by new-episode notifications: open this entry. */
        const val EXTRA_OPEN_ENTRY = "app.mehul.bookshelf.openEntry"
    }
}

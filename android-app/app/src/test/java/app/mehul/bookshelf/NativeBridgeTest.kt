package app.mehul.bookshelf

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NativeBridgeTest {

    @Test
    fun `allows the app's API hosts and their subdomains`() {
        assertTrue(NativeBridge.isHostAllowed("api4.thetvdb.com"))
        assertTrue(NativeBridge.isHostAllowed("artworks.thetvdb.com"))
        assertTrue(NativeBridge.isHostAllowed("www.googleapis.com"))
        assertTrue(NativeBridge.isHostAllowed("covers.openlibrary.org"))
        assertTrue(NativeBridge.isHostAllowed("OPENLIBRARY.ORG"))
    }

    @Test
    fun `rejects other hosts, look-alike suffixes, and null`() {
        assertFalse(NativeBridge.isHostAllowed("example.com"))
        assertFalse(NativeBridge.isHostAllowed("evilthetvdb.com"))
        assertFalse(NativeBridge.isHostAllowed("thetvdb.com.evil.net"))
        assertFalse(NativeBridge.isHostAllowed(null))
    }

    @Test
    fun `sanitizes export filenames`() {
        assertEquals("bookshelf-2026-01-01.md", NativeBridge.sanitize("bookshelf-2026-01-01.md"))
        assertEquals("_etc_passwd", NativeBridge.sanitize("../etc/passwd"))
        assertEquals("export.md", NativeBridge.sanitize(".."))
        assertEquals("export.md", NativeBridge.sanitize(""))
    }

    @Test
    fun `maps export extensions to MIME types`() {
        assertEquals("application/json", NativeBridge.mimeFor("backup.JSON"))
        assertEquals("text/markdown", NativeBridge.mimeFor("catalog.md"))
        assertEquals("text/plain", NativeBridge.mimeFor("quote.txt"))
        assertEquals("image/png", NativeBridge.mimeFor("dune-card.PNG"))
    }
}

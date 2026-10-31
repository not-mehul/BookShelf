package app.mehul.bookshelf

import kotlin.test.Test
import kotlin.test.assertEquals

class ExportsTest {

    @Test
    fun `sanitizes export filenames`() {
        assertEquals("bookshelf-2026-01-01.md", Exports.sanitize("bookshelf-2026-01-01.md"))
        assertEquals("_etc_passwd", Exports.sanitize("../etc/passwd"))
        assertEquals("export.md", Exports.sanitize(".."))
        assertEquals("export.md", Exports.sanitize(""))
    }

    @Test
    fun `maps export extensions to MIME types`() {
        assertEquals("application/json", Exports.mimeFor("backup.JSON"))
        assertEquals("text/markdown", Exports.mimeFor("catalog.md"))
        assertEquals("text/plain", Exports.mimeFor("quote.txt"))
        assertEquals("image/png", Exports.mimeFor("dune-card.PNG"))
    }
}

package app.mehul.bookshelf

import kotlin.test.Test
import kotlin.test.assertEquals

class ExportsTest {

    @Test
    fun `sanitizes export filenames`() {
        assertEquals("Piranesi.txt", Exports.sanitize("Piranesi.txt"))
        assertEquals("_etc_passwd", Exports.sanitize("../etc/passwd"))
        assertEquals("shared.txt", Exports.sanitize(".."))
        assertEquals("shared.txt", Exports.sanitize(""))
    }

    @Test
    fun `share cards are images, everything else text`() {
        assertEquals("text/plain", Exports.mimeFor("quote.txt"))
        assertEquals("image/png", Exports.mimeFor("dune-card.PNG"))
    }
}

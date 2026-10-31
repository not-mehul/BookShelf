package app.mehul.bookshelf

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NativeHttpTest {

    @Test
    fun `allows the app's API hosts and their subdomains`() {
        assertTrue(NativeHttp.isHostAllowed("api4.thetvdb.com"))
        assertTrue(NativeHttp.isHostAllowed("artworks.thetvdb.com"))
        assertTrue(NativeHttp.isHostAllowed("www.googleapis.com"))
        assertTrue(NativeHttp.isHostAllowed("covers.openlibrary.org"))
        assertTrue(NativeHttp.isHostAllowed("OPENLIBRARY.ORG"))
    }

    @Test
    fun `rejects other hosts, look-alike suffixes, and null`() {
        assertFalse(NativeHttp.isHostAllowed("example.com"))
        assertFalse(NativeHttp.isHostAllowed("evilthetvdb.com"))
        assertFalse(NativeHttp.isHostAllowed("thetvdb.com.evil.net"))
        assertFalse(NativeHttp.isHostAllowed(null))
    }
}

package app.mehul.bookshelf

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NativeHttpTest {

    @Test
    fun `allows the app's API hosts and their subdomains`() {
        assertTrue(NativeHttp.isHostAllowed("api.themoviedb.org"))
        assertTrue(NativeHttp.isHostAllowed("image.tmdb.org"))
        assertTrue(NativeHttp.isHostAllowed("www.googleapis.com"))
        assertTrue(NativeHttp.isHostAllowed("covers.openlibrary.org"))
        assertTrue(NativeHttp.isHostAllowed("OPENLIBRARY.ORG"))
    }

    @Test
    fun `rejects other hosts, look-alike suffixes, and null`() {
        assertFalse(NativeHttp.isHostAllowed("example.com"))
        assertFalse(NativeHttp.isHostAllowed("eviltmdb.org"))
        assertFalse(NativeHttp.isHostAllowed("themoviedb.org.evil.net"))
        // TheTVDB is no longer a source.
        assertFalse(NativeHttp.isHostAllowed("artworks.thetvdb.com"))
        assertFalse(NativeHttp.isHostAllowed(null))
    }
}

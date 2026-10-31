package app.mehul.bookshelf

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SecureStoreTest {

    @Test
    fun `accepts the app's setting names`() {
        listOf("tvdb_api_key", "tvdb_pin", "tvdb_token", "google_books_api_key", "sync_passphrase").forEach {
            assertEquals(it, SecureStore.checkName(it))
        }
    }

    @Test
    fun `rejects empty, oversized, and unsafe names`() {
        listOf("", "x".repeat(65), "../prefs", "Key", "a b", "a;b").forEach { name ->
            assertFailsWith<IllegalArgumentException>(name) { SecureStore.checkName(name) }
        }
    }
}

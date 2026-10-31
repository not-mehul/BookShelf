package app.mehul.bookshelf

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small secret store backed by the Android Keystore.
 *
 * Values are encrypted with an AES-256-GCM key that is generated inside the
 * Keystore and never leaves it; SharedPreferences only ever holds
 * `base64(iv || ciphertext)`. The entry name is bound as associated data, so a
 * ciphertext can't be moved to a different name. The prefs file is excluded
 * from backup (see res/xml) because Keystore keys don't survive a restore.
 *
 * Calls do Keystore work — invoke off the main thread.
 */
class SecureStore(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun get(name: String): String? {
        val stored = prefs.getString(checkName(name), null) ?: return null
        return try {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
            cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
            String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
        } catch (_: GeneralSecurityException) {
            // Key was invalidated/replaced or the data is corrupt: the value is
            // unrecoverable, so drop it and let the user re-enter it.
            remove(name)
            null
        } catch (_: IllegalArgumentException) {
            remove(name)
            null
        }
    }

    fun set(name: String, value: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        // The Keystore generates a fresh random IV for every encryption.
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(checkName(name).toByteArray(Charsets.UTF_8))
        val encrypted = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        prefs.edit { putString(name, Base64.encodeToString(encrypted, Base64.NO_WRAP)) }
    }

    fun remove(name: String) {
        prefs.edit { remove(checkName(name)) }
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
            generateKey()
        }
    }

    companion object {
        const val PREFS_NAME = "secure_settings"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "bookshelf.secure_settings.v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_BYTES = 12
        private const val TAG_BITS = 128

        private val NAME_PATTERN = Regex("[a-z0-9_]{1,64}")

        /** Names come from the page; keep them to a safe, bounded charset. */
        internal fun checkName(name: String): String {
            require(NAME_PATTERN.matches(name)) { "Invalid secure setting name" }
            return name
        }
    }
}

package app.mehul.bookshelf

import android.content.Context
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Book barcode scanning via Google's Code Scanner: Play services supplies the
 * whole camera UI, so the app needs no CAMERA permission and no bundled model.
 * Returns the raw code (an ISBN for EAN-13 978/979 codes), or null if cancelled.
 */
object BarcodeScanner {

    private val options = GmsBarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E)
        .enableAutoZoom()
        .build()

    suspend fun scan(context: Context): String? = suspendCancellableCoroutine { cont ->
        GmsBarcodeScanning.getClient(context, options).startScan()
            .addOnSuccessListener { barcode -> cont.resume(barcode.rawValue) }
            .addOnCanceledListener { cont.resume(null) }
            .addOnFailureListener { e ->
                cont.resumeWithException(IllegalStateException("Barcode scanner unavailable: ${e.message}", e))
            }
    }
}

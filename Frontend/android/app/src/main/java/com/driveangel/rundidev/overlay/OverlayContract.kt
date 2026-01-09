package com.driveangel.rundidev.overlay

/**
 * Contratos e interfaces para el sistema de overlay
 * Define el comportamiento esperado de cada componente
 */

/**
 * Resultado de operaciones del overlay (tipo seguro)
 */
sealed class OverlayResult {
    object Success : OverlayResult()
    data class Error(val message: String, val code: ErrorCode) : OverlayResult()
    
    enum class ErrorCode {
        CONTEXT_NULL,
        PERMISSION_DENIED,
        WINDOW_MANAGER_NULL,
        OVERLAY_ALREADY_SHOWING,
        UNKNOWN
    }
}

/**
 * Datos del viaje para mostrar en el overlay
 */
data class RideOverlayData(
    val rideId: String,
    val price: Double,
    val distanceKm: Double,
    val clientName: String? = null
) {
    fun isValid(): Boolean {
        return rideId.isNotEmpty() && price >= 0 && distanceKm >= 0
    }
}

/**
 * Interface para gestionar el overlay
 */
interface IOverlayManager {
    fun showOverlay(data: RideOverlayData, callback: (OverlayResult) -> Unit)
    fun hideOverlay(callback: () -> Unit)
    fun cleanup()
    fun isShowing(): Boolean
}

/**
 * Interface para crear vistas del overlay
 */
interface IOverlayViewFactory {
    fun createOverlayContainer(): android.view.View
    fun getBubbleSizeInPixels(): Int
}

/**
 * Callback para eventos del overlay
 */
interface OverlayEventListener {
    fun onOverlayShown(rideId: String)
    fun onOverlayHidden()
    fun onOverlayClicked(rideId: String)
    fun onOverlayError(error: OverlayResult.Error)
}

/**
 * Logger interface para testing
 */
interface IOverlayLogger {
    fun d(tag: String, message: String)
    fun e(tag: String, message: String, throwable: Throwable? = null)
    fun w(tag: String, message: String, throwable: Throwable? = null)
}

/**
 * Logger por defecto usando Android Log
 */
class DefaultOverlayLogger : IOverlayLogger {
    override fun d(tag: String, message: String) {
        if (OverlayConfig.ENABLE_VERBOSE_LOGS) {
            android.util.Log.d(tag, message)
        }
    }
    
    override fun e(tag: String, message: String, throwable: Throwable?) {
        android.util.Log.e(tag, message, throwable)
    }
    
    override fun w(tag: String, message: String, throwable: Throwable?) {
        android.util.Log.w(tag, message, throwable)
    }
}

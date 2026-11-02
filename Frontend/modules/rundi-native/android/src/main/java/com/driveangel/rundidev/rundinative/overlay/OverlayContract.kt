package com.gruporzc.rundi.rundinative.overlay

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

data class RideOverlayData(
    val rideId: String,
    val price: Double,
    val distanceKm: Double,
    val clientName: String? = null,
    val variant: String = "app"
) {
    fun isValid(): Boolean {
        return rideId.isNotEmpty() && price >= 0 && distanceKm >= 0
    }
}

interface IOverlayManager {
    fun showOverlay(data: RideOverlayData, callback: (OverlayResult) -> Unit)
    fun hideOverlay(callback: () -> Unit)
    fun cleanup()
    fun isShowing(): Boolean
}

interface IOverlayViewFactory {
    fun createOverlayContainer(variant: String): android.view.View
    fun getBubbleSizeInPixels(): Int
}

interface OverlayEventListener {
    fun onOverlayShown(rideId: String)
    fun onOverlayHidden()
    fun onOverlayClicked(rideId: String)
    fun onOverlayError(error: OverlayResult.Error)
}

interface IOverlayLogger {
    fun d(tag: String, message: String)
    fun e(tag: String, message: String, throwable: Throwable? = null)
    fun w(tag: String, message: String, throwable: Throwable? = null)
}

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

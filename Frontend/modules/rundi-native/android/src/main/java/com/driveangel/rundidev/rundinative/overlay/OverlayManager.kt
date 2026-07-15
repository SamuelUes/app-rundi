package com.driveangel.rundidev.rundinative.overlay

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import java.util.concurrent.atomic.AtomicBoolean

class OverlayManager(
    private val context: Context,
    private val logger: IOverlayLogger = DefaultOverlayLogger(),
    private val eventListener: OverlayEventListener? = null
) : IOverlayManager {

    companion object {
        private const val TAG = "OverlayManager"
    }

    private var overlayView: View? = null
    private var overlayParams: WindowManager.LayoutParams? = null
    private var currentRideId: String? = null
    private val isShowingOverlay = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val overlayViewFactory: IOverlayViewFactory = OverlayView(context, logger)

    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var initialX = 0
    private var initialY = 0
    private var lastKnownX = OverlayConfig.DEFAULT_X
    private var lastKnownY = OverlayConfig.DEFAULT_Y

    override fun showOverlay(data: RideOverlayData, callback: (OverlayResult) -> Unit) {
        if (!data.isValid()) {
            val error = OverlayResult.Error(
                "Datos inválidos: ${data}",
                OverlayResult.ErrorCode.UNKNOWN
            )
            eventListener?.onOverlayError(error)
            callback(error)
            return
        }

        showOverlayInternal(data, callback)
    }

    fun showOverlay(
        rideId: String,
        price: Double,
        distanceKm: Double,
        clientName: String?,
        variant: String,
        onSuccess: () -> Unit,
        onError: (String) -> Unit
    ) {
        val data = RideOverlayData(rideId, price, distanceKm, clientName, variant)
        showOverlay(data) { result ->
            when (result) {
                is OverlayResult.Success -> onSuccess()
                is OverlayResult.Error -> onError(result.message)
            }
        }
    }

    private fun showOverlayInternal(
        data: RideOverlayData,
        callback: (OverlayResult) -> Unit
    ) {
        logger.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        logger.d(TAG, "🫧 showOverlay() INICIADO")
        logger.d(TAG, "📋 Params: $data")

        if (isShowingOverlay.get()) {
            logger.w(TAG, "⚠️ Overlay ya activo, limpiando antes de mostrar nuevo...")
            hideOverlay {
                showOverlayInternal(data, callback)
            }
            return
        }

        isShowingOverlay.set(true)

        mainHandler.post {
            try {
                if (overlayView != null) {
                    logger.d(TAG, "🧹 Limpiando overlay existente...")
                    hideOverlayInternal()
                }

                currentRideId = data.rideId
                logger.d(TAG, "💾 RideId guardado: ${data.rideId}")

                val windowManager = getWindowManager()
                if (windowManager == null) {
                    logger.e(TAG, "❌ WindowManager es NULL")
                    isShowingOverlay.set(false)
                    val error = OverlayResult.Error(
                        "WindowManager is null",
                        OverlayResult.ErrorCode.WINDOW_MANAGER_NULL
                    )
                    eventListener?.onOverlayError(error)
                    callback(error)
                    return@post
                }

                val params = createWindowParams()
                logger.d(TAG, "📍 Posición: x=${params.x}, y=${params.y}")

                val container = overlayViewFactory.createOverlayContainer(data.variant) as LinearLayout

                setupTouchListener(container, params, windowManager)

                overlayView = container
                overlayParams = params

                logger.d(TAG, "🔍 Agregando vista al WindowManager...")
                windowManager.addView(container, params)

                logger.d(TAG, "✅✅✅ OVERLAY MOSTRADO EXITOSAMENTE ✅✅✅")
                logger.d(TAG, "🎯 Vista agregada - Burbuja debería ser VISIBLE")
                logger.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

                isShowingOverlay.set(true)
                eventListener?.onOverlayShown(data.rideId)
                callback(OverlayResult.Success)

            } catch (e: Exception) {
                logger.e(TAG, "❌ Error mostrando overlay", e)
                hideOverlayInternal()
                isShowingOverlay.set(false)
                val error = OverlayResult.Error(
                    e.message ?: "Unknown error",
                    OverlayResult.ErrorCode.UNKNOWN
                )
                eventListener?.onOverlayError(error)
                callback(error)
            }
        }
    }

    override fun hideOverlay(callback: () -> Unit) {
        logger.d(TAG, "🫧 hideOverlay() llamado")

        mainHandler.post {
            try {
                hideOverlayInternal()
                isShowingOverlay.set(false)
                logger.d(TAG, "✅ Overlay ocultado exitosamente")
                eventListener?.onOverlayHidden()
                callback()
            } catch (e: Exception) {
                logger.e(TAG, "❌ Error ocultando overlay", e)
                isShowingOverlay.set(false)
                callback()
            }
        }
    }

    override fun isShowing(): Boolean = isShowingOverlay.get()

    private fun hideOverlayInternal() {
        try {
            logger.d(TAG, "🔍 hideOverlayInternal - Iniciando limpieza...")

            val windowManager = getWindowManager()
            val view = overlayView

            logger.d(TAG, "📊 Estado: windowManager=${windowManager != null}, view=${view != null}, parent=${view?.parent != null}")

            if (windowManager != null && view != null && view.parent != null) {
                try {
                    logger.d(TAG, "🗑️ Removiendo vista del WindowManager...")
                    windowManager.removeView(view)
                    logger.d(TAG, "✅ Vista removida exitosamente")
                } catch (e: IllegalArgumentException) {
                    logger.w(TAG, "⚠️ View not attached to window manager", e)
                } catch (e: Exception) {
                    logger.w(TAG, "⚠️ Error removing overlay view", e)
                }
            } else {
                if (view == null) {
                    logger.d(TAG, "ℹ️ No hay vista que remover")
                } else if (view.parent == null) {
                    logger.d(TAG, "ℹ️ Vista ya fue removida")
                }
            }
        } catch (e: Exception) {
            logger.w(TAG, "⚠️ Error general en hideOverlayInternal", e)
        } finally {
            overlayView = null
            overlayParams = null
            currentRideId = null
            isShowingOverlay.set(false)
            logger.d(TAG, "🧹 Limpieza completada")
        }
    }

    private fun createWindowParams(): WindowManager.LayoutParams {
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        logger.d(TAG, "📱 Layout type: $layoutType (SDK ${Build.VERSION.SDK_INT})")

        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = lastKnownX
            y = lastKnownY
        }
    }

    private fun setupTouchListener(
        container: LinearLayout,
        params: WindowManager.LayoutParams,
        windowManager: WindowManager
    ) {
        logger.d(TAG, "🔍 Configurando touch listener...")

        container.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    initialX = params.x
                    initialY = params.y
                    (overlayViewFactory as? OverlayView)?.animatePress(container)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val deltaX = (event.rawX - initialTouchX).toInt()
                    val deltaY = (event.rawY - initialTouchY).toInt()
                    params.x = initialX + deltaX
                    params.y = initialY + deltaY
                    lastKnownX = params.x
                    lastKnownY = params.y
                    windowManager.updateViewLayout(container, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val diffX = Math.abs(event.rawX - initialTouchX)
                    val diffY = Math.abs(event.rawY - initialTouchY)

                    if (diffX < OverlayConfig.CLICK_THRESHOLD_PX && diffY < OverlayConfig.CLICK_THRESHOLD_PX) {
                        logger.d(TAG, "👆 Detectado CLICK (movimiento < ${OverlayConfig.CLICK_THRESHOLD_PX}px)")
                        openApp()
                    } else {
                        logger.d(TAG, "🖐️ Detectado DRAG (movimiento: ${diffX}px, ${diffY}px)")
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun openApp() {
        logger.d(TAG, "👆 Burbuja tocada - abriendo app...")
        val rideId = currentRideId

        hideOverlayInternal()

        if (rideId != null) {
            eventListener?.onOverlayClicked(rideId)
        }

        val launchIntent = context.packageManager
            .getLaunchIntentForPackage(context.packageName)?.apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
                if (rideId != null) {
                    putExtra("overlayRideId", rideId)
                    putExtra("fromOverlay", true)
                }
            }

        try {
            if (launchIntent != null) {
                logger.d(TAG, "🚀 Abriendo app vía launchIntent...")
                context.startActivity(launchIntent)
                logger.d(TAG, "✅ App abierta exitosamente")
            } else {
                logger.e(TAG, "❌ No se pudo obtener launch intent")
            }
        } catch (e: Exception) {
            logger.w(TAG, "⚠️ No se pudo abrir la app", e)
        }
    }

    private fun getWindowManager(): WindowManager? {
        return context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
    }

    override fun cleanup() {
        logger.d(TAG, "🧹 Cleanup() llamado")
        mainHandler.post {
            try {
                hideOverlayInternal()
            } catch (e: Exception) {
                logger.w(TAG, "⚠️ Error durante cleanup", e)
            }
        }
    }
}

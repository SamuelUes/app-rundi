package com.driveangel.rundidev.rundinative.overlay

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Context
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.animation.OvershootInterpolator
import android.widget.ImageView
import android.widget.LinearLayout

class OverlayView(
    private val context: Context,
    private val logger: IOverlayLogger = DefaultOverlayLogger()
) : IOverlayViewFactory {

    companion object {
        private const val TAG = "OverlayView"
    }

    override fun createOverlayContainer(): LinearLayout {
        logger.d(TAG, "🎨 Creando contenedor de overlay...")

        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.TRANSPARENT)
            clipToPadding = false
        }

        val bubbleSize = getBubbleSizeInPixels()
        val shadowSize = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            OverlayConfig.SHADOW_SIZE_DP,
            context.resources.displayMetrics
        )

        logger.d(TAG, "📏 Tamaño: ${bubbleSize}px, Sombra: ${shadowSize}px")

        val bubble = createBubble(bubbleSize, shadowSize)
        val icon = createIcon()

        bubble.addView(icon)
        container.addView(bubble, LinearLayout.LayoutParams(bubbleSize, bubbleSize))

        animateEntry(container)

        logger.d(TAG, "✅ Contenedor creado exitosamente")
        return container
    }

    private fun animateEntry(view: LinearLayout) {
        view.scaleX = 0f
        view.scaleY = 0f
        view.alpha = 0f

        val scaleX = ObjectAnimator.ofFloat(view, "scaleX", 0f, 1f)
        val scaleY = ObjectAnimator.ofFloat(view, "scaleY", 0f, 1f)
        val alpha = ObjectAnimator.ofFloat(view, "alpha", 0f, 1f)

        AnimatorSet().apply {
            playTogether(scaleX, scaleY, alpha)
            duration = OverlayConfig.ANIMATION_DURATION_MS
            interpolator = OvershootInterpolator(1.2f)
            start()
        }
    }

    fun animatePress(view: LinearLayout) {
        ObjectAnimator.ofFloat(view, "scaleX", 1f, OverlayConfig.SCALE_PRESSED, 1f).apply {
            duration = 100
            start()
        }
        ObjectAnimator.ofFloat(view, "scaleY", 1f, OverlayConfig.SCALE_PRESSED, 1f).apply {
            duration = 100
            start()
        }
    }

    private fun createBubble(size: Int, shadowSize: Float): LinearLayout {
        logger.d(TAG, "🔵 Creando burbuja circular...")

        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor(OverlayConfig.BUBBLE_COLOR))
                setSize(size, size)
                setStroke(OverlayConfig.STROKE_WIDTH, OverlayConfig.STROKE_COLOR)
            }
            elevation = shadowSize
        }.also {
            logger.d(TAG, "🎨 Color aplicado: ${OverlayConfig.BUBBLE_COLOR} (dorado)")
        }
    }

    private fun createIcon(): ImageView {
        logger.d(TAG, "🖼️ Creando ícono...")

        return ImageView(context).apply {
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            adjustViewBounds = true

            try {
                val appIcon = context.packageManager.getApplicationIcon(context.packageName)
                setImageDrawable(appIcon)
                clearColorFilter()
                logger.d(TAG, "✅ Ícono de app cargado")
            } catch (e: Exception) {
                logger.w(TAG, "⚠️ No se pudo cargar ícono de app, usando fallback", e)
                setImageResource(OverlayConfig.FALLBACK_ICON)
                setColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN)
            }
        }
    }

    override fun getBubbleSizeInPixels(): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            OverlayConfig.BUBBLE_SIZE_DP,
            context.resources.displayMetrics
        ).toInt()
    }
}

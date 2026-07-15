package com.driveangel.rundidev.rundinative.overlay

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Context
import android.graphics.Color
import android.graphics.Outline
import android.graphics.PorterDuff
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.view.animation.OvershootInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import com.driveangel.rundidev.rundinative.R

class OverlayView(
    private val context: Context,
    private val logger: IOverlayLogger = DefaultOverlayLogger()
) : IOverlayViewFactory {

    companion object {
        private const val TAG = "OverlayView"
    }

    override fun createOverlayContainer(variant: String): LinearLayout {
        logger.d(TAG, "🎨 Creando contenedor de overlay (variant=$variant)...")

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

        val bubble = if (variant == "nearby_ride") {
            logger.d(TAG, "🚗 Creando burbuja de viaje cercano con imagen DriveAngel...")
            createNearbyRideBubble(bubbleSize, shadowSize)
        } else {
            logger.d(TAG, "🔵 Creando burbuja por defecto con ícono de app...")
            val b = createBubble(bubbleSize, shadowSize)
            b.addView(createIcon())
            b
        }

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

    private fun createNearbyRideBubble(size: Int, shadowSize: Float): LinearLayout {
        logger.d(TAG, "🖼️ Creando burbuja de viaje cercano...")

        return LinearLayout(context).apply {
            gravity = Gravity.CENTER
            elevation = shadowSize
            clipToOutline = true
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setOval(0, 0, view.width, view.height)
                }
            }
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setStroke(OverlayConfig.STROKE_WIDTH, OverlayConfig.STROKE_COLOR)
            }

            val image = ImageView(context).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                setImageResource(R.drawable.overlay_nearby_ride)
            }
            addView(image, LinearLayout.LayoutParams(size, size))
        }.also {
            logger.d(TAG, "✅ Burbuja de viaje cercano creada con overlay_nearby_ride")
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

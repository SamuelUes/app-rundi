package com.gruporzc.rundi.rundinative.overlay

import android.graphics.Color

object OverlayConfig {

    const val BUBBLE_SIZE_DP = 68f
    const val SHADOW_SIZE_DP = 6f
    const val STROKE_WIDTH = 4

    const val BUBBLE_COLOR = "#D4AF37"
    val STROKE_COLOR = Color.WHITE

    const val DEFAULT_X = 32
    const val DEFAULT_Y = 160

    const val CLICK_THRESHOLD_PX = 15
    const val DOUBLE_CLICK_THRESHOLD_MS = 300L

    const val ANIMATION_DURATION_MS = 200L
    const val FADE_DURATION_MS = 150L
    const val SCALE_NORMAL = 1.0f
    const val SCALE_PRESSED = 0.9f

    const val ENABLE_VERBOSE_LOGS = true

    const val FALLBACK_ICON = android.R.drawable.ic_dialog_map
}

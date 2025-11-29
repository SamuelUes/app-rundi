package com.driveangel.rundidev.overlay

import android.graphics.Color

/**
 * Configuración centralizada del overlay
 * Todos los valores configurables en un solo lugar
 */
object OverlayConfig {
    
    // Tamaños
    const val BUBBLE_SIZE_DP = 68f
    const val SHADOW_SIZE_DP = 6f
    const val STROKE_WIDTH = 4
    
    // Colores
    const val BUBBLE_COLOR = "#D4AF37" // Dorado de la app
    val STROKE_COLOR = Color.WHITE
    
    // Posicionamiento
    const val DEFAULT_X = 32
    const val DEFAULT_Y = 160
    
    // Touch behavior
    const val CLICK_THRESHOLD_PX = 15
    const val DOUBLE_CLICK_THRESHOLD_MS = 300L
    
    // Animaciones
    const val ANIMATION_DURATION_MS = 200L
    const val FADE_DURATION_MS = 150L
    const val SCALE_NORMAL = 1.0f
    const val SCALE_PRESSED = 0.9f
    
    // Logs
    const val ENABLE_VERBOSE_LOGS = true
    
    // Fallback
    const val FALLBACK_ICON = android.R.drawable.ic_dialog_map
}

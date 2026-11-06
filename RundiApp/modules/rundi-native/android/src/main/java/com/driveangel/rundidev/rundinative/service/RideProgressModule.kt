package com.gruporzc.rundi.rundinative.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Notificación ongoing con progreso del viaje — equivalente Android del
 * Live Activity de iOS (misma idea: estado visible fuera de la app).
 * No es un foreground service: es solo una notificación persistente.
 */
class RideProgressModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RideProgressModule")

    AsyncFunction("showRideProgress") { rideId: String, title: String, body: String, progress: Int ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")
      RideProgressNotifier.show(context, rideId, title, body, progress)
      true
    }

    AsyncFunction("hideRideProgress") { _: Unit ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")
      RideProgressNotifier.hide(context)
      true
    }
  }
}

internal object RideProgressNotifier {
  private const val NOTIFICATION_ID = 14022
  private const val CHANNEL_ID = "rundi-ride-progress"
  private const val CHANNEL_NAME = "Viaje en curso"
  private const val CHANNEL_DESCRIPTION = "Estado del viaje activo"
  private const val NOTIFICATION_ICON_NAME = "notification_icon"

  fun show(context: Context, rideId: String, title: String, body: String, progress: Int) {
    ensureChannel(context)

    val launchIntent = context.packageManager
      .getLaunchIntentForPackage(context.packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        putExtra("rideId", rideId)
      }

    val pendingIntent = PendingIntent.getActivity(
      context,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or flagImmutable()
    )

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(notificationSmallIcon(context))
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)

    if (progress in 0..100) {
      builder.setProgress(100, progress, false)
    } else {
      builder.setProgress(100, 0, true)
    }

    manager(context).notify(NOTIFICATION_ID, builder.build())
  }

  fun hide(context: Context) {
    manager(context).cancel(NOTIFICATION_ID)
  }

  private fun manager(context: Context): NotificationManager =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  /**
   * El ícono de launcher es a color y Android lo enmascara a alfa, dejando un
   * cuadrado blanco. `notification_icon` (generado por el plugin de
   * expo-notifications) es la silueta monocroma correcta.
   */
  private fun notificationSmallIcon(context: Context): Int {
    val id = context.resources.getIdentifier(NOTIFICATION_ICON_NAME, "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = manager(context)
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return

    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
        description = CHANNEL_DESCRIPTION
        setShowBadge(false)
        enableLights(false)
        enableVibration(false)
      }
    )
  }

  private fun flagImmutable(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_IMMUTABLE
    } else {
      0
    }
  }
}

package com.driveangel.rundidev.rundinative.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class TrackingForegroundService : Service() {

  private val notificationId = 14021
  private val channelId = CHANNEL_ID

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopForegroundService()
      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(EXTRA_TITLE)
      ?: DEFAULT_TITLE
    val body = intent?.getStringExtra(EXTRA_BODY)
      ?: DEFAULT_BODY

    val notification = buildNotification(title, body)
    startForeground(notificationId, notification)

    return START_STICKY
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun stopForegroundService() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun buildNotification(title: String, body: String): Notification {
    val launchIntent = packageManager
      .getLaunchIntentForPackage(packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }

    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or flagImmutable()
    )

    return NotificationCompat.Builder(this, channelId)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(notificationSmallIcon())
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  /**
   * El ícono de launcher es a color y Android lo enmascara a alfa, dejando un
   * cuadrado blanco. `notification_icon` (generado por el plugin de
   * expo-notifications) es la silueta monocroma correcta.
   */
  private fun notificationSmallIcon(): Int {
    val id = resources.getIdentifier(NOTIFICATION_ICON_NAME, "drawable", packageName)
    return if (id != 0) id else applicationInfo.icon
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existingChannel = manager.getNotificationChannel(channelId)
    if (existingChannel != null) return

    val channel = NotificationChannel(
      channelId,
      DEFAULT_CHANNEL_NAME,
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = DEFAULT_CHANNEL_DESCRIPTION
      setShowBadge(false)
      enableLights(false)
      enableVibration(false)
    }

    manager.createNotificationChannel(channel)
  }

  private fun flagImmutable(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_IMMUTABLE
    } else {
      0
    }
  }

  companion object {
    const val EXTRA_TITLE = "extra_notification_title"
    const val EXTRA_BODY = "extra_notification_body"
    const val ACTION_START = "com.driveangel.action.FOREGROUND_START"
    const val ACTION_STOP = "com.driveangel.action.FOREGROUND_STOP"
    const val CHANNEL_ID = "tracking_foreground_channel"
    private const val NOTIFICATION_ICON_NAME = "notification_icon"

    private const val DEFAULT_TITLE = "Rundi está rastreando tu viaje"
    private const val DEFAULT_BODY = "Tu ubicación se comparte para ofrecer el mejor servicio."
    private const val DEFAULT_CHANNEL_NAME = "Seguimiento en segundo plano"
    private const val DEFAULT_CHANNEL_DESCRIPTION = "Muestra una notificación persistente cuando el seguimiento de ubicación está activo."
  }
}

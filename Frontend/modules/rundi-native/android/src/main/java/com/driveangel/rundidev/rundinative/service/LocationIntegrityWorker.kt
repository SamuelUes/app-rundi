package com.driveangel.rundidev.rundinative.service

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class LocationIntegrityWorker(
  appContext: Context,
  params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

  override suspend fun doWork(): Result {
    return try {
      val intent = Intent(applicationContext, TrackingForegroundService::class.java).apply {
        action = TrackingForegroundService.ACTION_START
      }
      ContextCompat.startForegroundService(applicationContext, intent)
      Result.success()
    } catch (error: Exception) {
      Result.retry()
    }
  }
}

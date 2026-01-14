package com.driveangel.rundidev.service

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import androidx.work.ListenableWorker

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

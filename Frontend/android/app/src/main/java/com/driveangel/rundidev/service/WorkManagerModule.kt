package com.driveangel.rundidev.service

import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.TimeUnit

class WorkManagerModule(private val appContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(appContext) {

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun scheduleLocationIntegrity(intervalMinutes: Double, promise: Promise) {
    try {
      val minutes = if (intervalMinutes.isNaN() || intervalMinutes < MIN_INTERVAL_MINUTES) {
        MIN_INTERVAL_MINUTES
      } else {
        intervalMinutes
      }

      val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

      val request = PeriodicWorkRequestBuilder<LocationIntegrityWorker>(
        minutes.toLong(),
        TimeUnit.MINUTES
      )
        .setConstraints(constraints)
        .build()

      WorkManager.getInstance(appContext)
        .enqueueUniquePeriodicWork(
          WORK_NAME,
          ExistingPeriodicWorkPolicy.UPDATE,
          request
        )

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_WORK_SCHEDULE", error)
    }
  }

  @ReactMethod
  fun cancelLocationIntegrity(promise: Promise) {
    try {
      WorkManager.getInstance(appContext).cancelUniqueWork(WORK_NAME)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_WORK_CANCEL", error)
    }
  }

  companion object {
    private const val MODULE_NAME = "WorkManagerModule"
    private const val WORK_NAME = "driveangel_location_integrity"
    private const val MIN_INTERVAL_MINUTES = 15.0
  }
}

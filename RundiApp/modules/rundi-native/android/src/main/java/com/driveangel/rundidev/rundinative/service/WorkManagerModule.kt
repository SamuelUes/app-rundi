package com.gruporzc.rundi.rundinative.service

import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

class WorkManagerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WorkManagerModule")

    AsyncFunction("scheduleLocationIntegrity") { intervalMinutes: Double ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")

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

        WorkManager.getInstance(context)
          .enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
          )

        true
      } catch (error: Exception) {
        throw error
      }
    }

    AsyncFunction("cancelLocationIntegrity") { _: Unit ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")

      try {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        true
      } catch (error: Exception) {
        throw error
      }
    }
  }

  companion object {
    private const val WORK_NAME = "gruporzc_location_integrity"
    private const val MIN_INTERVAL_MINUTES = 15.0
  }
}

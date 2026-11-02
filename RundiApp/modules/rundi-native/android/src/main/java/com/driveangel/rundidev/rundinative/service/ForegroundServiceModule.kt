package com.gruporzc.rundi.rundinative.service

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ForegroundServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ForegroundServiceModule")

    AsyncFunction("start") { title: String?, body: String? ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")

      try {
        val serviceIntent = Intent(context, TrackingForegroundService::class.java).apply {
          action = TrackingForegroundService.ACTION_START
          putExtra(TrackingForegroundService.EXTRA_TITLE, title)
          putExtra(TrackingForegroundService.EXTRA_BODY, body)
        }
        startServiceCompat(context, serviceIntent)
        true
      } catch (error: Exception) {
        throw error
      }
    }

    AsyncFunction("stop") { _: Unit ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")

      try {
        val serviceIntent = Intent(context, TrackingForegroundService::class.java)
        context.stopService(serviceIntent)
        true
      } catch (error: Exception) {
        throw error
      }
    }
  }

  private fun startServiceCompat(context: Context, intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ContextCompat.startForegroundService(context, intent)
    } else {
      context.startService(intent)
    }
  }
}

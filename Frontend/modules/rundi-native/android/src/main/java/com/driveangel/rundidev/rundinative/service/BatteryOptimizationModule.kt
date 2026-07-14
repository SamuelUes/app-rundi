package com.driveangel.rundidev.rundinative.service

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BatteryOptimizationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BatteryOptimizationModule")

    AsyncFunction("isIgnoringOptimizations") { _: Unit ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return@AsyncFunction true
      }

      val pm = context.getSystemService(PowerManager::class.java)
      val ignoring = pm?.isIgnoringBatteryOptimizations(context.packageName) ?: false
      ignoring
    }

    AsyncFunction("requestIgnoreOptimizations") { _: Unit ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return@AsyncFunction true
      }

      val pm = context.getSystemService(PowerManager::class.java)
      val alreadyIgnoring = pm?.isIgnoringBatteryOptimizations(context.packageName) ?: false
      if (alreadyIgnoring) {
        return@AsyncFunction true
      }

      try {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        true
      } catch (error: ActivityNotFoundException) {
        try {
          val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(intent)
          false
        } catch (fallbackError: Exception) {
          throw fallbackError
        }
      } catch (error: Exception) {
        throw error
      }
    }
  }
}

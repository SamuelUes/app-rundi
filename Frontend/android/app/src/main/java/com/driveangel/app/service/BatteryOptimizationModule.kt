package com.driveangel.app.service

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BatteryOptimizationModule(private val appContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(appContext) {

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun isIgnoringOptimizations(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true)
      return
    }

    val pm = appContext.getSystemService(PowerManager::class.java)
    val packageName = appContext.packageName
    val ignoring = pm?.isIgnoringBatteryOptimizations(packageName) ?: false
    promise.resolve(ignoring)
  }

  @ReactMethod
  fun requestIgnoreOptimizations(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true)
      return
    }

    val pm = appContext.getSystemService(PowerManager::class.java)
    val packageName = appContext.packageName
    val alreadyIgnoring = pm?.isIgnoringBatteryOptimizations(packageName) ?: false
    if (alreadyIgnoring) {
      promise.resolve(true)
      return
    }

    try {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:$packageName")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      appContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: ActivityNotFoundException) {
      try {
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        appContext.startActivity(intent)
        promise.resolve(false)
      } catch (fallbackError: Exception) {
        promise.reject("E_BATTERY_SETTINGS", fallbackError)
      }
    } catch (error: Exception) {
      promise.reject("E_BATTERY_SETTINGS", error)
    }
  }

  companion object {
    private const val MODULE_NAME = "BatteryOptimizationModule"
  }
}

package com.driveangel.rundidev.service

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ForegroundServiceModule(private val appContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(appContext) {

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun start(title: String?, body: String?, promise: Promise) {
    try {
      val serviceIntent = Intent(appContext, TrackingForegroundService::class.java).apply {
        action = TrackingForegroundService.ACTION_START
        putExtra(TrackingForegroundService.EXTRA_TITLE, title)
        putExtra(TrackingForegroundService.EXTRA_BODY, body)
      }
      startServiceCompat(appContext, serviceIntent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_FOREGROUND_START", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val serviceIntent = Intent(appContext, TrackingForegroundService::class.java)
      appContext.stopService(serviceIntent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_FOREGROUND_STOP", error)
    }
  }

  private fun startServiceCompat(context: Context, intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ContextCompat.startForegroundService(context, intent)
    } else {
      context.startService(intent)
    }
  }

  companion object {
    private const val MODULE_NAME = "ForegroundServiceModule"
  }
}

package com.driveangel.rundidev.rundinative.overlay

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ShowRideOverlayArgs : Record {
  @Field val rideId: String = ""
  @Field val price: Double = 0.0
  @Field val distanceKm: Double = 0.0
  @Field val clientName: String? = null
}

class OverlayModule : Module() {
  companion object {
    private const val TAG = "OverlayPermissionModule"
    private const val REQUEST_CODE_OVERLAY_PERMISSION = 9093
  }

  private var overlayManager: OverlayManager? = null

  private val eventListener = object : OverlayEventListener {
    override fun onOverlayShown(rideId: String) {
      Log.d(TAG, "Overlay shown: $rideId")
    }

    override fun onOverlayHidden() {
      Log.d(TAG, "Overlay hidden")
    }

    override fun onOverlayClicked(rideId: String) {
      Log.d(TAG, "📤 Emitting 'onOverlayOpened' with rideId: $rideId")
      sendEvent("onOverlayOpened", mapOf("rideId" to rideId))
    }

    override fun onOverlayError(error: OverlayResult.Error) {
      Log.e(TAG, "Overlay error: ${error.message}")
    }
  }

  override fun definition() = ModuleDefinition {
    Name("OverlayPermissionModule")

    Events("onOverlayOpened")

    AsyncFunction("hasOverlayPermission") { _: Unit ->
      try {
        val context = appContext.reactContext
        if (context == null) {
          false
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          Settings.canDrawOverlays(context)
        } else {
          true
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error in hasOverlayPermission", e)
        false
      }
    }

    AsyncFunction("requestOverlayPermission") { _: Unit ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return@AsyncFunction true
      }

      if (Settings.canDrawOverlays(context)) {
        return@AsyncFunction true
      }

      val activity = appContext.currentActivity
        ?: throw Exception("No foreground activity to request permission")

      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:" + context.packageName)
      )

      try {
        activity.startActivityForResult(intent, REQUEST_CODE_OVERLAY_PERMISSION)
        true
      } catch (ex: ActivityNotFoundException) {
        false
      }
    }

    AsyncFunction("showRideOverlay") { args: ShowRideOverlayArgs ->
      val context = appContext.reactContext
        ?: throw Exception("Context is null")

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
        throw Exception("El permiso de superposición no está concedido.")
      }

      val manager = getOrCreateOverlayManager()

      var success = false
      var errorMsg: String? = null

      manager.showOverlay(
        rideId = args.rideId,
        price = args.price,
        distanceKm = args.distanceKm,
        clientName = args.clientName,
        onSuccess = { success = true },
        onError = { err -> errorMsg = err }
      )

      if (errorMsg != null) {
        throw Exception(errorMsg)
      }
      success
    }

    AsyncFunction("hideRideOverlay") { _: Unit ->
      try {
        overlayManager?.hideOverlay { }
        true
      } catch (e: Exception) {
        Log.e(TAG, "Error in hideRideOverlay", e)
        true
      }
    }

    AsyncFunction("openOverlaySettings") { _: Unit ->
      val context = appContext.reactContext
        ?: throw Exception("Context is null")

      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:" + context.packageName)
      )

      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      true
    }

    OnActivityResult { activity, payload ->
      if (payload.requestCode == REQUEST_CODE_OVERLAY_PERMISSION) {
        val context = appContext.reactContext
        val hasPermission = if (context != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          Settings.canDrawOverlays(context)
        } else {
          true
        }
        Log.d(TAG, "Overlay permission result: $hasPermission")
      }
    }
  }

  private fun getOrCreateOverlayManager(): OverlayManager {
    val context = appContext.reactContext
      ?: throw Exception("React context is null")
    return overlayManager ?: OverlayManager(
      context = context,
      eventListener = eventListener
    ).also { overlayManager = it }
  }
}

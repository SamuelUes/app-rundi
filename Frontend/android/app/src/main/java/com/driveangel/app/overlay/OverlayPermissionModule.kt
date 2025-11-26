package com.driveangel.app.overlay

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Módulo React Native para gestionar permisos y overlay flotante
 * Delega la lógica de UI a OverlayManager y OverlayView
 */
class OverlayPermissionModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  ActivityEventListener,
  LifecycleEventListener {

  companion object {
    private const val MODULE_NAME = "OverlayPermissionModule"
    private const val REQUEST_CODE_OVERLAY_PERMISSION = 9093
    private const val TAG = "OverlayPermissionModule"
  }

  private var pendingPermissionPromise: Promise? = null
  private val overlayManager = OverlayManager(reactContext)

  init {
    reactContext.addActivityEventListener(this)
    reactContext.addLifecycleEventListener(this)
    Log.d(TAG, "✅ OverlayPermissionModule initialized")
  }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun hasOverlayPermission(promise: Promise) {
    try {
      val context = reactApplicationContext
      if (context == null) {
        Log.w(TAG, "⚠️ Context null en hasOverlayPermission")
        promise.resolve(false)
        return
      }
      
      val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(context)
      } else {
        true
      }
      
      Log.d(TAG, "✅ hasOverlayPermission: $hasPermission")
      promise.resolve(hasPermission)
    } catch (e: Exception) {
      Log.e(TAG, "❌ Error en hasOverlayPermission", e)
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    val context = reactApplicationContext

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true)
      return
    }

    if (Settings.canDrawOverlays(context)) {
      promise.resolve(true)
      return
    }

    val activity = currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "No hay actividad en primer plano para solicitar el permiso.")
      return
    }

    if (pendingPermissionPromise != null) {
      promise.reject("E_PERMISSION_IN_PROGRESS", "Ya existe una solicitud de permiso en curso.")
      return
    }

    pendingPermissionPromise = promise

    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:" + context.packageName)
    )

    try {
      activity.startActivityForResult(intent, REQUEST_CODE_OVERLAY_PERMISSION)
    } catch (ex: ActivityNotFoundException) {
      pendingPermissionPromise?.reject("E_UNAVAILABLE", "No se pudo abrir la pantalla de permisos de superposición.")
      pendingPermissionPromise = null
    }
  }

  @ReactMethod
  fun showRideOverlay(rideId: String, price: Double, distanceKm: Double, clientName: String?, promise: Promise) {
    try {
      Log.d(TAG, "🫧 [Bridge] showRideOverlay() - Delegando a OverlayManager...")
      
      val context = reactApplicationContext
      if (context == null) {
        Log.e(TAG, "❌ Context es NULL")
        promise.reject("E_CONTEXT_NULL", "Context is null")
        return
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
        Log.e(TAG, "❌ Sin permiso SYSTEM_ALERT_WINDOW")
        promise.reject("E_PERMISSION_DENIED", "El permiso de superposición no está concedido.")
        return
      }

      // Delegar a OverlayManager
      overlayManager.showOverlay(
        rideId = rideId,
        price = price,
        distanceKm = distanceKm,
        clientName = clientName,
        onSuccess = {
          promise.resolve(true)
        },
        onError = { error ->
          promise.reject("E_OVERLAY_ERROR", error)
        }
      )
      
    } catch (e: Exception) {
      Log.e(TAG, "❌ Error general en showRideOverlay", e)
      promise.reject("E_OVERLAY_ERROR", e.message ?: "Unknown error")
    }
  }

  @ReactMethod
  fun hideRideOverlay(promise: Promise) {
    try {
      Log.d(TAG, "🫧 [Bridge] hideRideOverlay() - Delegando a OverlayManager...")
      
      overlayManager.hideOverlay {
        promise.resolve(true)
      }
      
    } catch (e: Exception) {
      Log.e(TAG, "❌ Error general en hideRideOverlay", e)
      promise.resolve(true) // Resolver de todas formas
    }
  }

  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    try {
      val context = reactApplicationContext ?: run {
        promise.reject("E_CONTEXT_NULL", "Context is null")
        return
      }

      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:" + context.packageName)
      )

      val activity = currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }

      promise.resolve(true)
    } catch (e: Exception) {
      Log.e(TAG, "❌ Error abriendo ajustes de overlay", e)
      promise.reject("E_OPEN_OVERLAY_SETTINGS", e.message ?: "Unable to open overlay settings")
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for NativeEventEmitter
  }

  override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE_OVERLAY_PERMISSION) {
      return
    }

    val promise = pendingPermissionPromise ?: return
    pendingPermissionPromise = null

    val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(reactApplicationContext)
    } else {
      true
    }

    promise.resolve(hasPermission)
  }

  override fun onNewIntent(intent: Intent?) {
    // Not used
  }

  override fun onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy()
    Log.d(TAG, "💥 onCatalystInstanceDestroy - Cleaning up")
    cleanup()
  }

  override fun onHostResume() {
    // no-op
  }

  override fun onHostPause() {
    // no-op
  }

  override fun onHostDestroy() {
    Log.d(TAG, "💥 onHostDestroy - Ensuring overlay cleanup")
    cleanup()
  }

  private fun cleanup() {
    try {
      // Delegar limpieza de overlay a OverlayManager
      overlayManager.cleanup()
    } catch (e: Exception) {
      Log.w(TAG, "⚠️ Error calling overlay cleanup", e)
    }

    // Remover listeners una sola vez
    try {
      reactApplicationContext.removeActivityEventListener(this)
    } catch (e: Exception) {
      Log.w(TAG, "⚠️ Error removing activity listener", e)
    }

    try {
      reactApplicationContext.removeLifecycleEventListener(this)
    } catch (e: Exception) {
      Log.w(TAG, "⚠️ Error removing lifecycle listener", e)
    }

    pendingPermissionPromise = null
    Log.d(TAG, "🧹 Cleanup completed")
  }
}

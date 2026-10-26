package com.driveangel.rundidev.rundinative.ocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// OCR on-device con ML Kit en Android. En iOS se usa Apple Vision porque los
// pods de Google ML Kit no traen slice arm64 para el simulador; por Gradle no
// existe esa limitación.
class DocumentOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DocumentOcr")

    AsyncFunction("recognizeText") { imagePath: String, promise: Promise ->
      val context = appContext.reactContext
        ?: throw Exception("React context is null")

      val image = try {
        InputImage.fromFilePath(context, Uri.parse(imagePath))
      } catch (error: Exception) {
        promise.reject("OCR_ERROR", "No se pudo cargar la imagen: ${error.message}", error)
        return@AsyncFunction
      }

      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

      fun recognize(input: InputImage, onDone: (String, List<Map<String, Any>>) -> Unit) {
        recognizer.process(input)
          .addOnSuccessListener { result ->
            val blocks = result.textBlocks.map { block ->
              val rect = block.boundingBox
              mapOf(
                "text" to block.text,
                "frame" to mapOf(
                  "left" to (rect?.left ?: 0).toDouble(),
                  "top" to (rect?.top ?: 0).toDouble(),
                  "right" to (rect?.right ?: 0).toDouble(),
                  "bottom" to (rect?.bottom ?: 0).toDouble(),
                ),
              )
            }
            onDone(result.text, blocks)
          }
          .addOnFailureListener {
            onDone("", emptyList())
          }
      }

      recognize(image) { text, blocks ->
        // Segundo pase con grises + contraste: rescata texto de color sobre
        // fondo claro (fecha roja de expiración de la licencia). Se fusionan
        // las líneas únicas de ambos pases en vez de elegir un ganador.
        val enhanced = enhancedBitmap(context, imagePath)
        if (enhanced == null) {
          promise.resolve(mapOf("text" to text, "blocks" to blocks))
          return@recognize
        }
        recognize(InputImage.fromBitmap(enhanced, 0)) { text2, blocks2 ->
          fun key(s: String) = s.uppercase().replace(" ", "")
          val seenLines = text.lines().map(::key).toMutableSet()
          val extraLines = text2.lines().filter { seenLines.add(key(it)) }
          val seenBlocks = blocks.map { key(it["text"] as String) }.toMutableSet()
          val extraBlocks = blocks2.filter { seenBlocks.add(key(it["text"] as String)) }
          promise.resolve(
            mapOf(
              "text" to (text.lines() + extraLines).joinToString("\n"),
              "blocks" to (blocks + extraBlocks),
            ),
          )
        }
      }
    }
  }

  /// Bitmap en escala de grises con contraste aumentado, con la orientación
  /// EXIF ya aplicada (fromBitmap no la lee, a diferencia de fromFilePath).
  private fun enhancedBitmap(context: Context, imagePath: String): Bitmap? {
    val uri = Uri.parse(imagePath)
    val raw = context.contentResolver.openInputStream(uri)?.use {
      BitmapFactory.decodeStream(it)
    } ?: return null

    val rotation = context.contentResolver.openInputStream(uri)?.use {
      when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
      }
    } ?: 0f

    val oriented = if (rotation != 0f) {
      val matrix = Matrix().apply { postRotate(rotation) }
      Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
    } else {
      raw
    }

    val output = Bitmap.createBitmap(oriented.width, oriented.height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val paint = Paint()
    val matrix = ColorMatrix().apply {
      setSaturation(0f)
      // contraste ~1.7 con pivote en gris medio
      postConcat(
        ColorMatrix(
          floatArrayOf(
            1.7f, 0f, 0f, 0f, -90f,
            0f, 1.7f, 0f, 0f, -90f,
            0f, 0f, 1.7f, 0f, -90f,
            0f, 0f, 0f, 1f, 0f,
          ),
        ),
      )
    }
    paint.colorFilter = ColorMatrixColorFilter(matrix)
    canvas.drawBitmap(oriented, 0f, 0f, paint)
    return output
  }
}

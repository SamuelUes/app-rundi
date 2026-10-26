import ExpoModulesCore
import Vision
import UIKit

/// OCR on-device con Apple Vision (VNRecognizeTextRequest).
/// Reemplaza a ML Kit en iOS: los pods de Google ML Kit no traen slice
/// arm64 para simulador y rompen el build en Xcode 27 (sin simuladores
/// x86_64). Vision es framework del sistema → funciona en todos lados.
public class DocumentOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DocumentOcr")

    AsyncFunction("recognizeText") { (imagePath: String) -> [String: Any] in
      guard let cgImage = Self.loadCgImage(from: imagePath) else {
        throw NSError(
          domain: "DocumentOcr",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "No se pudo cargar la imagen: \(imagePath)"]
        )
      }

      // Los documentos no son prosa de diccionario (números, nombres,
      // códigos): usesLanguageCorrection une/deforma tokens ("2024RA4"),
      // por eso va desactivado.
      func makeRequest() -> VNRecognizeTextRequest {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        // Revision 3 es la que soporta español (la default es revision 2, solo inglés)
        if #available(iOS 16.0, *) {
          request.revision = VNRecognizeTextRequestRevision3
        }
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["es-ES", "es-MX", "en-US"]
        request.minimumTextHeight = 0.01
        return request
      }

      func run(_ image: CGImage) throws -> [VNRecognizedTextObservation] {
        let request = makeRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        try handler.perform([request])
        return request.results ?? []
      }

      let observations: [VNRecognizedTextObservation]
      do {
        let primary = try run(cgImage)
        // Segundo pase con grises + contraste: rescata texto de color
        // sobre fondo claro (la fecha roja de expiración de la licencia).
        // Se fusionan las líneas únicas de ambos pases — así el pase 1 aporta
        // el cuerpo del documento y el pase 2 lo que el color escondió.
        if let enhanced = Self.enhancedForOcr(cgImage) {
          let secondary = try run(enhanced)
          observations = Self.mergeObservations(primary, secondary)
        } else {
          observations = primary
        }
      } catch {
        throw NSError(
          domain: "DocumentOcr",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Vision OCR falló: \(error.localizedDescription)"]
        )
      }

      var lines: [String] = []
      var blocks: [[String: Any]] = []
      for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        lines.append(candidate.string)

        // boundingBox viene en coordenadas normalizadas (origen abajo-izq);
        // se traduce a píxeles con origen arriba-izq para mantener la API.
        let box = observation.boundingBox
        let w = Double(cgImage.width)
        let h = Double(cgImage.height)
        blocks.append([
          "text": candidate.string,
          "frame": [
            "left": Double(box.origin.x) * w,
            "top": (1 - Double(box.origin.y) - Double(box.height)) * h,
            "right": (Double(box.origin.x) + Double(box.width)) * w,
            "bottom": (1 - Double(box.origin.y)) * h,
          ],
        ])
      }

      return ["text": lines.joined(separator: "\n"), "blocks": blocks]
    }
  }

  /// Une dos listas de observaciones quitando líneas repetidas (mismo texto
  /// normalizado). Las líneas nuevas del segundo pase van al final.
  private static func mergeObservations(
    _ primary: [VNRecognizedTextObservation],
    _ secondary: [VNRecognizedTextObservation]
  ) -> [VNRecognizedTextObservation] {
    var seen = Set<String>()
    var merged: [VNRecognizedTextObservation] = []
    for observation in primary + secondary {
      guard let text = observation.topCandidates(1).first?.string else { continue }
      let key = text.uppercased().replacingOccurrences(of: " ", with: "")
      if seen.insert(key).inserted {
        merged.append(observation)
      }
    }
    return merged
  }

  /// Versión en escala de grises con contraste aumentado para el segundo
  /// pase de OCR: hace legible texto de color (rojo sobre salmón) que en
  /// la imagen original tiene contraste de luminancia insuficiente.
  private static func enhancedForOcr(_ cgImage: CGImage) -> CGImage? {
    let ciImage = CIImage(cgImage: cgImage)
    guard let filter = CIFilter(name: "CIColorControls") else { return nil }
    filter.setValue(ciImage, forKey: kCIInputImageKey)
    filter.setValue(0.0, forKey: kCIInputSaturationKey)
    filter.setValue(1.7, forKey: kCIInputContrastKey)
    guard let output = filter.outputImage else { return nil }
    return CIContext(options: nil).createCGImage(output, from: output.extent)
  }

  private static func loadCgImage(from imagePath: String) -> CGImage? {
    let url: URL
    if let parsed = URL(string: imagePath), parsed.scheme != nil {
      url = parsed
    } else {
      url = URL(fileURLWithPath: imagePath)
    }
    guard let image = UIImage(contentsOfFile: url.path) else {
      return nil
    }
    // Normaliza la orientación EXIF: UIImage.cgImage no la aplica y el OCR
    // saldría rotado en fotos con metadatos de orientación.
    if image.imageOrientation == .up, let cgImage = image.cgImage {
      return cgImage
    }
    let rendered = UIGraphicsImageRenderer(size: image.size).image { _ in
      image.draw(at: .zero)
    }
    return rendered.cgImage
  }
}

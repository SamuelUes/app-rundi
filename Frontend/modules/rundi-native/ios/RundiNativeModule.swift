import ExpoModulesCore

public class RundiNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RundiNative")

    Events("onOverlayOpened", "onOverlayClosed", "onOverlayClicked")
  }
}

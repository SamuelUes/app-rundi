import ExpoModulesCore

public class RundiNativeModule: Module {
  public func definition() -> ModuleDefinition {
    name("RundiNative")

    events("onOverlayOpened", "onOverlayClosed", "onOverlayClicked")
  }
}

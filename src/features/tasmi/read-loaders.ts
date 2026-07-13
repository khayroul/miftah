/**
 * PUBLIC lightweight Read integration surface.
 *
 * This module must not statically export recorder, VAD, ONNX, or session code.
 */
export const loadHifzTasmiOverlay = () =>
  import("./components/HifzTasmiOverlay").then((module) => module.HifzTasmiOverlay);

export const isInlinePdfUnsupported = () => {
  if (typeof navigator === "undefined") return false;
  if ((navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled === false) return true;
  // iPadOS Safari reports a Mac user agent, so touch support identifies it.
  const isIpad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIpad || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

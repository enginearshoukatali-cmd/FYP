export const isInlinePdfUnsupported = () => {
  if (typeof navigator === "undefined") return false;
  if ((navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled === false) return true;
  // iPadOS Safari reports a Mac user agent, so touch support identifies it.
  const isIpad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  // A coarse primary pointer also covers phones using "Request desktop site".
  const coarsePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  return isIpad || coarsePointer || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

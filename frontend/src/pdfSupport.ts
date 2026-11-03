export const isInlinePdfUnsupported = () => {
  if (typeof navigator === "undefined") return false;
  if ((navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled === false) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

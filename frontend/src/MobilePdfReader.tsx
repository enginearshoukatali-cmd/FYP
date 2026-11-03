import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker";

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

type Props = {
  url: string;
  selectedPages: number[];
  onTogglePage?: (page: number) => void;
};

export default function MobilePdfReader({ url, selectedPages, onTogglePage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Range requests let the 500 MB scanned textbooks load page by page.
    let cancelled = false;
    const task = pdfjs.getDocument({ url, rangeChunkSize: 262144 });
    task.promise
      .then((loaded) => { if (!cancelled) setDoc(loaded); })
      .catch((reason) => { if (!cancelled) setError(reason?.message || "Could not open this PDF."); });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!doc || !canvasRef.current || !containerRef.current) return;
    let cancelled = false;
    let renderTask: pdfjs.RenderTask | null = null;
    setLoading(true);
    doc.getPage(page).then((pdfPage) => {
      if (cancelled || !canvasRef.current || !containerRef.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const cssWidth = containerRef.current.clientWidth || 320;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: (cssWidth / base.width) * ratio });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${(viewport.height / ratio)}px`;
      renderTask = pdfPage.render({ canvas, viewport });
      return renderTask.promise;
    }).catch((reason) => {
      if (!cancelled && reason?.name !== "RenderingCancelledException") setError(reason?.message || "Could not draw this page.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, page]);

  const total = doc?.numPages || 0;
  const goTo = (target: number) => {
    if (!total) return;
    const next = Math.min(Math.max(1, Math.round(target) || 1), total);
    setPage(next);
    setPageInput(String(next));
  };
  const selected = selectedPages.includes(page);

  if (error) {
    return (
      <div role="alert" className="p-6 text-sm text-white">
        <p className="font-bold">The PDF could not be shown on this device.</p>
        <p className="mt-1 text-slate-300">{error}</p>
        <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg bg-white px-3 py-2 font-bold text-slate-900">Open PDF in a new tab</a>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-slate-800 text-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-slate-900 p-3 text-sm">
        <button type="button" onClick={() => goTo(page - 1)} disabled={page <= 1} className="min-h-10 rounded-lg bg-slate-700 px-3 font-bold disabled:opacity-40">Prev</button>
        <input
          value={pageInput}
          inputMode="numeric"
          aria-label="Go to page"
          onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))}
          onKeyDown={(event) => { if (event.key === "Enter") goTo(Number(pageInput)); }}
          onBlur={() => goTo(Number(pageInput))}
          className="min-h-10 w-16 rounded-lg bg-white px-2 text-center font-bold text-slate-900"
        />
        <span className="text-slate-300">/ {total || "…"}</span>
        <button type="button" onClick={() => goTo(page + 1)} disabled={!total || page >= total} className="min-h-10 rounded-lg bg-slate-700 px-3 font-bold disabled:opacity-40">Next</button>
        {onTogglePage && <button
          type="button"
          onClick={() => onTogglePage(page)}
          className={`ml-auto min-h-10 rounded-lg px-3 font-bold ${selected ? "bg-emerald-500 text-white" : "bg-white text-slate-900"}`}
        >
          {selected ? "Selected ✓ (tap to remove)" : "Select this page"}
        </button>}
      </div>
      <div ref={containerRef} className="relative min-h-[60vh] w-full overflow-auto bg-slate-700">
        {loading && <p className="absolute left-3 top-3 z-10 rounded bg-slate-900/80 px-2 py-1 text-xs">Loading page…</p>}
        <canvas ref={canvasRef} className="block bg-white" />
      </div>
    </div>
  );
}

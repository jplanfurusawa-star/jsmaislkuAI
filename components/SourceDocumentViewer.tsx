"use client";

import React, { useState, useEffect, useRef, useId } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, ExternalLink, FileText, Loader2, Image as ImageIcon, RefreshCw } from 'lucide-react';

interface Props {
  files: { file: File; dataUrl: string }[];
}

export default function SourceDocumentViewer({ files }: Props) {
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  const currentFile = files[selectedFileIdx];

  // Update blobUrl for currentFile
  useEffect(() => {
    if (!currentFile) {
      setBlobUrl('');
      return;
    }
    try {
      const url = URL.createObjectURL(currentFile.file);
      setBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } catch {
      setBlobUrl(currentFile.dataUrl);
    }
  }, [currentFile]);

  // Load PDF when currentFile changes
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      if (!currentFile || currentFile.file.type !== 'application/pdf') {
        pdfDocRef.current = null;
        setTotalPages(1);
        setCurrentPage(1);
        setPdfError(null);
        return;
      }

      setLoading(true);
      setPdfError(null);

      try {
        const pdfjsLib = await import('pdfjs-dist');
        
        // Configure PDF.js worker
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        }

        // Use ArrayBuffer for fast, reliable parsing
        const arrayBuffer = await currentFile.file.arrayBuffer();
        if (isCancelled) return;

        const loadingTask = pdfjsLib.getDocument({ 
          data: new Uint8Array(arrayBuffer),
          cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        if (isCancelled) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err: any) {
        if (!isCancelled) {
          console.warn("PDF loading error in canvas viewer:", err);
          setPdfError("PDFのインライン描画を準備中、または別形式です。別窓表示をご利用いただけます。");
          setLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }
    };
  }, [currentFile]);

  // Render Page to Canvas with cancellation safety
  useEffect(() => {
    let isCancelled = false;

    async function renderPage() {
      if (!pdfDocRef.current || !canvasRef.current) return;

      // Cancel any ongoing rendering task before starting a new one
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }

      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: zoom * 1.5 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        renderTaskRef.current = null;
      } catch (e: any) {
        // Ignore expected cancellation exceptions
        if (e?.name !== 'RenderingCancelledException') {
          console.warn("PDF page rendering notice:", e);
        }
      }
    }

    if (currentFile?.file.type === 'application/pdf') {
      renderPage();
    }

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }
    };
  }, [currentPage, zoom, currentFile]);

  const handleOpenInNewTab = () => {
    if (!currentFile) return;
    try {
      const url = blobUrl || URL.createObjectURL(currentFile.file);
      window.open(url, '_blank');
    } catch {
      window.open(currentFile.dataUrl, '_blank');
    }
  };

  if (!files || files.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-slate-400 text-center bg-slate-50 border border-slate-200 rounded">
        <FileText className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-xs font-bold">アップロードされた資料はありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100 rounded-lg border border-slate-300 overflow-hidden shadow-inner">
      {/* Top Bar: File Tabs & Tools */}
      <div className="bg-slate-800 text-white p-2 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 max-w-[240px]">
            {files.map((f, i) => (
              <button
                key={i}
                onClick={() => {
                  setSelectedFileIdx(i);
                  setZoom(1.0);
                }}
                className={`px-2 py-1 rounded text-[10px] font-bold shrink-0 transition-colors flex items-center gap-1 ${
                  selectedFileIdx === i
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
                title={f.file.name}
              >
                {f.file.type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                <span className="truncate max-w-[85px]">{f.file.name}</span>
              </button>
            ))}
          </div>

          {/* New Tab Button */}
          <button
            onClick={handleOpenInNewTab}
            title="別タブで開く"
            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded flex items-center gap-1 transition-colors shrink-0 shadow-xs"
          >
            <ExternalLink className="w-3 h-3" />
            <span>別窓表示</span>
          </button>
        </div>

        {/* Zoom & Page Controls */}
        <div className="flex items-center justify-between text-xs border-t border-slate-700 pt-1.5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              title="縮小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-300 w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(2.5, z + 0.2))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              title="拡大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1.0)}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
              title="倍率リセット"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {currentFile?.file.type === 'application/pdf' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 text-slate-300"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-bold text-slate-300 font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 text-slate-300"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-200 custom-scrollbar relative">
        {loading && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs flex flex-col items-center justify-center text-white z-10">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <span className="text-xs font-bold">PDFレンダリング中...</span>
          </div>
        )}

        {pdfError ? (
          <div className="p-4 bg-white border border-slate-300 text-slate-700 rounded-xl text-center space-y-3 max-w-xs shadow-md">
            <FileText className="w-8 h-8 text-blue-500 mx-auto" />
            <p className="text-xs font-bold text-slate-800">{pdfError}</p>
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={handleOpenInNewTab}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded shadow transition-colors flex items-center justify-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                別タブで原本PDFを開く
              </button>
            </div>
          </div>
        ) : currentFile?.file.type === 'application/pdf' ? (
          <div className="bg-white shadow-lg rounded border border-slate-300 overflow-hidden flex items-center justify-center transition-transform max-w-full">
            <canvas ref={canvasRef} className="max-w-full h-auto block" />
          </div>
        ) : currentFile?.file.type.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentFile.dataUrl}
            alt={currentFile.file.name}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            className="max-w-full max-h-full object-contain shadow-lg bg-white rounded transition-transform"
          />
        ) : (
          <div className="p-6 text-center text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm max-w-xs">
            <FileText className="w-12 h-12 mx-auto mb-2 text-slate-400" />
            <p className="font-bold text-xs text-slate-800">{currentFile?.file.name}</p>
            <p className="text-[10px] text-slate-400 mt-1">プレビュー非対応形式</p>
            <button
              onClick={handleOpenInNewTab}
              className="mt-3 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-sm flex items-center justify-center gap-1 mx-auto"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              別窓で表示 / 保存
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

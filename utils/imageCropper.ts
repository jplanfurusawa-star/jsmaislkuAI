import { ExtractedImage, ImageCategory } from '@/types';

export interface VisualElementDetection {
  box2d: number[]; // [ymin, xmin, ymax, xmax] 0-1000 normalized coordinates
  fileIndex: number;
  category: string;
  subCategory: string;
  label: string;
  confidence?: 'high' | 'medium' | 'low';
}

/**
 * 周囲の余計な白枠や透明領域、不要な外枠を除去し、情報本体（写真・図面・地図）のみを保持
 */
export function autoTrimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];

        // 完全に透明でなく、かつ純白(>250,250,250)以外のピクセル
        const isContent = a > 20 && !(r > 248 && g > 248 && b > 248);

        if (isContent) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // 適切なマージン（6px）をつけて切り出し
    const pad = 6;
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(width - cropX, (maxX - minX) + pad * 2);
    const cropH = Math.min(height - cropY, (maxY - minY) + pad * 2);

    if (cropW > 60 && cropH > 60 && (cropW < width * 0.98 || cropH < height * 0.98)) {
      const trimmedCanvas = document.createElement('canvas');
      trimmedCanvas.width = cropW;
      trimmedCanvas.height = cropH;
      const tCtx = trimmedCanvas.getContext('2d');
      if (tCtx) {
        tCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        return trimmedCanvas;
      }
    }
  } catch (e) {
    console.warn("Auto trim skipped", e);
  }
  return canvas;
}

/**
 * 画像ファイルをHTMLImageElementとして読み込みCanvasに描画
 */
function loadImageToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      } else {
        reject(new Error("Canvas context is not available"));
      }
    };
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

/**
 * PDFの各ページを高解像度Canvasとしてレンダリング
 */
async function renderPdfPagesToCanvases(dataUrl: string, maxPages = 5): Promise<HTMLCanvasElement[]> {
  const canvases: HTMLCanvasElement[] = [];
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const loadingTask = pdfjsLib.getDocument({ url: dataUrl });
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages, maxPages);

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      // 高精細切り出し用に2.5倍スケールで描画
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await (page.render as any)({ canvasContext: ctx, viewport, canvas }).promise;
        canvases.push(canvas);
      }
    }
  } catch (e) {
    console.error("Failed to render PDF pages", e);
  }
  return canvases;
}

/**
 * 元資料（チラシ・マイソク）全体から、AIが検出した個別の外観写真・内観写真・平面図・案内図の領域のみを正確に切り出し
 * ※ 元マイソク全体を1枚画像化するのではなく、個別のパーツ（写真、間取図、地図）のみを抽出
 */
export async function cropVisualElementsFromSource(
  files: { file: File; dataUrl: string }[],
  detections: VisualElementDetection[]
): Promise<ExtractedImage[]> {
  const extractedImages: ExtractedImage[] = [];

  // 全ページ/画像のCanvasをフラットに格納（GeminiのfileIndexと1:1対応）
  const pageList: { canvas: HTMLCanvasElement; sourceFileIndex: number; pageNum: number }[] = [];

  for (let fIdx = 0; fIdx < files.length; fIdx++) {
    const fileObj = files[fIdx];
    if (fileObj.file.type === 'application/pdf') {
      const pdfCanvases = await renderPdfPagesToCanvases(fileObj.dataUrl);
      pdfCanvases.forEach((c, pIdx) => {
        pageList.push({ canvas: c, sourceFileIndex: fIdx, pageNum: pIdx + 1 });
      });
    } else if (fileObj.file.type.startsWith('image/')) {
      try {
        const imgCanvas = await loadImageToCanvas(fileObj.dataUrl);
        pageList.push({ canvas: imgCanvas, sourceFileIndex: fIdx, pageNum: 1 });
      } catch (e) {
        console.error(`Failed to load image file ${fIdx}`, e);
      }
    }
  }

  if (pageList.length === 0) return [];

  // 検出された個別の視覚要素（写真、平面図、案内図等）を切り出し
  for (let i = 0; i < detections.length; i++) {
    const d = detections[i];
    const targetIndex = typeof d.fileIndex === 'number' ? d.fileIndex : 0;
    const targetPageObj = pageList[targetIndex] || pageList[0];

    const sourceCanvas = targetPageObj.canvas;
    if (!sourceCanvas || !d.box2d || d.box2d.length < 4) continue;

    let [ymin, xmin, ymax, xmax] = d.box2d;

    // 0〜1000 正規化座標の正規化チェック
    if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
    if (xmin > xmax) [xmin, xmax] = [xmax, xmin];

    const boxWidthRatio = (xmax - xmin) / 1000;
    const boxHeightRatio = (ymax - ymin) / 1000;

    const catUpper = (d.category || '').toUpperCase();
    const subCatLower = (d.subCategory || '').toLowerCase();
    const labelLower = (d.label || '').toLowerCase();
    const isPlan = catUpper.includes('PLAN') || subCatLower.includes('平面') || labelLower.includes('平面');

    // 極端に小さいノイズ(3%未満)はスキップ
    if (boxWidthRatio < 0.04 || boxHeightRatio < 0.04) continue;
    // 【重要】平面図・間取図はページの大半を占めるため、95%以上でも除外しない！
    // マイソク全紙スキャン（1枚チラシ全体）のみ、非図面の場合にスキップ
    if (!isPlan && boxWidthRatio > 0.96 && boxHeightRatio > 0.96) {
      continue;
    }

    const cW = sourceCanvas.width;
    const cH = sourceCanvas.height;

    const cropX = Math.max(0, Math.floor((xmin / 1000) * cW));
    const cropY = Math.max(0, Math.floor((ymin / 1000) * cH));
    const cropW = Math.min(cW - cropX, Math.ceil(boxWidthRatio * cW));
    const cropH = Math.min(cH - cropY, Math.ceil(boxHeightRatio * cH));

    if (cropW < 40 || cropH < 40) continue;

    // 切り出し用Canvas作成
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const cCtx = croppedCanvas.getContext('2d');
    if (!cCtx) continue;

    cCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // 外枠や余白をクリーンにトリミング
    const finalCanvas = autoTrimCanvas(croppedCanvas);
    const croppedDataUrl = finalCanvas.toDataURL('image/jpeg', 0.94);

    // カテゴリ正規化
    let category: ImageCategory = 'PHOTO';

    if (
      catUpper.includes('PLAN') || 
      catUpper.includes('図面') || 
      catUpper.includes('間取') || 
      subCatLower.includes('平面') || 
      subCatLower.includes('区画') || 
      subCatLower.includes('フロア') ||
      labelLower.includes('平面図') ||
      labelLower.includes('区画図')
    ) {
      category = 'PLAN';
    } else if (
      catUpper.includes('ACCESS') || 
      catUpper.includes('MAP') || 
      catUpper.includes('地図') || 
      catUpper.includes('案内') || 
      subCatLower.includes('案内') || 
      subCatLower.includes('地図') ||
      labelLower.includes('案内図') ||
      labelLower.includes('地図')
    ) {
      category = 'ACCESS';
    } else if (catUpper.includes('OTHER') || subCatLower.includes('ロゴ') || subCatLower.includes('文字') || subCatLower.includes('条件')) {
      category = 'OTHER';
    }

    const itemNum = String(extractedImages.length + 1).padStart(2, '0');
    let subCat = d.subCategory || (category === 'PLAN' ? '平面図' : category === 'ACCESS' ? '案内図' : '外観');
    
    // パース・完成予想図のサブカテゴリ明記
    if (subCatLower.includes('パース') || labelLower.includes('パース') || labelLower.includes('予想図') || labelLower.includes('レンダリング')) {
      if (subCatLower.includes('内観') || labelLower.includes('内観') || labelLower.includes('店舗')) {
        subCat = '内観パース';
      } else {
        subCat = '外観パース';
      }
    }

    const isExcludedFromPhoto = category !== 'PHOTO' || subCatLower.includes('ロゴ') || subCatLower.includes('条件');
    const label = d.label || (category === 'PLAN' ? '平面図・間取図' : category === 'ACCESS' ? '現地案内図・周辺地図' : subCat);

    extractedImages.push({
      id: `crop_${Date.now()}_${i}`,
      dataUrl: croppedDataUrl,
      category,
      subCategory: subCat,
      label,
      width: finalCanvas.width,
      height: finalCanvas.height,
      confidence: d.confidence || 'high',
      sourcePage: targetPageObj.pageNum,
      reason: `AI領域解析 (P.${targetPageObj.pageNum}): ${label}`,
      isExcludedFromPhoto,
      suggestedFilename: `${itemNum}_${subCat}.jpg`,
    });
  }

  return extractedImages;
}

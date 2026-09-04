import { ExtractedImage, ImageCategory } from '@/types';
import JSZip from 'jszip';

/**
 * 画像の特徴量（アスペクト比、彩度・コントラスト、明度分布、上部/下部の色調など）から
 * 初期カテゴリ (PHOTO, PLAN, ACCESS, OTHER) とサブカテゴリ（外観、内観、平面図、案内図等）を高精度に自動判定
 */
function analyzeAndClassifyImage(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  index: number
): { category: ImageCategory; subCategory: string; label: string; confidence: 'high' | 'medium' | 'low' } {
  try {
    const aspectRatio = width / height;
    const sampleWidth = Math.min(width, 100);
    const sampleHeight = Math.min(height, 100);
    
    // サンプル用Canvasでピクセル解析
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;
    const sampleCtx = sampleCanvas.getContext('2d');
    if (!sampleCtx) {
      return { category: 'OTHER', subCategory: 'その他', label: `抽出画像 ${index + 1}`, confidence: 'low' };
    }
    sampleCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
    const imgData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;

    let totalBrightness = 0;
    let totalSaturation = 0;
    let whitePixelCount = 0;
    let darkPixelCount = 0;
    let skyLikePixels = 0; // 上部の空らしいピクセル（青系または明るい空）
    let warmLightingPixels = 0; // 室内照明らしい暖色ピクセル (r > b + 20)
    const totalPixels = sampleWidth * sampleHeight;

    // 上部1/3と下部1/3の明度差・色調差を計測
    let topThirdBrightness = 0;
    let bottomThirdBrightness = 0;
    const topPixelsCount = sampleWidth * Math.floor(sampleHeight / 3);
    const bottomPixelsStart = sampleWidth * Math.floor((sampleHeight * 2) / 3);

    for (let y = 0; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        const i = (y * sampleWidth + x) * 4;
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        const saturation = max === 0 ? 0 : delta / max;
        const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

        totalBrightness += brightness;
        totalSaturation += saturation;

        if (brightness > 0.92) whitePixelCount++;
        if (brightness < 0.18) darkPixelCount++;

        // 上部1/3（空・ビル上部）の解析
        if (y < sampleHeight / 3) {
          topThirdBrightness += brightness;
          // 青空または白〜水色の空領域
          if ((b > r + 10 && b > 140) || (brightness > 0.85 && saturation < 0.15)) {
            skyLikePixels++;
          }
        } else if (y >= (sampleHeight * 2) / 3) {
          bottomThirdBrightness += brightness;
        }

        // 室内照明（暖色系・木目・ダウンライト）
        if (r > b + 25 && r > 120 && g > 90) {
          warmLightingPixels++;
        }
      }
    }

    const avgSaturation = totalSaturation / totalPixels;
    const avgBrightness = totalBrightness / totalPixels;
    const whiteRatio = whitePixelCount / totalPixels;
    const avgTopBrightness = topPixelsCount > 0 ? topThirdBrightness / topPixelsCount : 0;
    const avgBottomBrightness = topPixelsCount > 0 ? bottomThirdBrightness / topPixelsCount : 0;
    const skyRatio = topPixelsCount > 0 ? skyLikePixels / topPixelsCount : 0;
    const warmRatio = warmLightingPixels / totalPixels;

    // 判定ロジック
    // 1. 図面 (PLAN): 背景が白が多く(whiteRatio > 0.38)、彩度が低く(avgSaturation < 0.20)、線画中心
    if (whiteRatio > 0.38 && avgSaturation < 0.20) {
      return {
        category: 'PLAN',
        subCategory: '平面図',
        label: '平面図・間取図',
        confidence: 'high',
      };
    }

    // 2. 地図・案内図 (ACCESS): 横長または正方形で、特定の色味・道路などのブロックがある
    if (avgSaturation > 0.14 && whiteRatio > 0.22 && (aspectRatio > 0.85 && aspectRatio < 1.65)) {
      if (index === 2 || (index > 0 && avgBrightness > 0.65 && warmRatio < 0.15 && skyRatio < 0.15)) {
        return {
          category: 'ACCESS',
          subCategory: '現地案内図',
          label: '現地案内図・周辺地図',
          confidence: 'medium',
        };
      }
    }

    // 3. 写真 (PHOTO): 彩度が高く、自然光・内装・外観の色調が豊か
    if (avgSaturation >= 0.15 || whiteRatio < 0.35) {
      // 外観の判定条件:
      // - 縦長（ビル全景）: aspectRatio < 0.95
      // - 上部に空領域や高明度がある: skyRatio > 0.20 または avgTopBrightness > avgBottomBrightness + 0.10
      // - 最初の画像 (index === 0) または外観らしい特徴を持つ
      const isExteriorLikely = (
        index === 0 ||
        aspectRatio < 0.95 || // 縦長ビル写真
        skyRatio > 0.18 || // 青空/明るい空
        (avgTopBrightness > avgBottomBrightness + 0.08 && warmRatio < 0.25) // 上部が空で下部が地面/建物
      );

      const isInteriorLikely = (
        !isExteriorLikely &&
        (warmRatio > 0.20 || avgBrightness < 0.60 || avgSaturation > 0.22)
      );

      if (isExteriorLikely) {
        return {
          category: 'PHOTO',
          subCategory: '外観',
          label: '建物外観',
          confidence: 'high',
        };
      }

      if (isInteriorLikely) {
        return {
          category: 'PHOTO',
          subCategory: '内観',
          label: '内観写真',
          confidence: 'medium',
        };
      }

      // どちらとも断定しづらい場合は中立的な「物件写真」
      return {
        category: 'PHOTO',
        subCategory: '外観',
        label: '建物外観・物件写真',
        confidence: 'medium',
      };
    }

    return {
      category: 'OTHER',
      subCategory: 'その他参考資料',
      label: `参考資料 ${index + 1}`,
      confidence: 'low',
    };
  } catch (e) {
    return { category: 'OTHER', subCategory: 'その他', label: `抽出画像 ${index + 1}`, confidence: 'low' };
  }
}

/**
 * 余白の自動トリミング（周囲の余計な白枠や透明領域を除去し、情報部分を保持）
 */
function autoTrimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
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

    // 白または透明とみなす閾値
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];

        // 完全に透明でなく、かつ純白(>250,250,250)以外のピクセル
        const isNotWhite = a > 20 && !(r > 248 && g > 248 && b > 248);

        if (isNotWhite) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // 適切なマージン（8px）をつけて切り出し
    const pad = 8;
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(width - cropX, (maxX - minX) + pad * 2);
    const cropH = Math.min(height - cropY, (maxY - minY) + pad * 2);

    if (cropW > 80 && cropH > 80 && cropW < width * 0.98 && cropH < height * 0.98) {
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
 * PDF.jsのobjs/commonObjsから非同期で安全に画像オブジェクトを解決・取得するヘルパー
 * （コールバック形式で待機し、未解決エラーを防ぐ）
 */
function getPdfImageObject(page: any, objId: string, timeoutMs = 3500): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    const onResolve = (imgObj: any) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(imgObj);
      }
    };

    try {
      if (page.objs && typeof page.objs.get === 'function') {
        page.objs.get(objId, onResolve);
      } else if (page.commonObjs && typeof page.commonObjs.get === 'function') {
        page.commonObjs.get(objId, onResolve);
      } else {
        onResolve(null);
      }
    } catch (e) {
      try {
        if (page.commonObjs && typeof page.commonObjs.get === 'function') {
          page.commonObjs.get(objId, onResolve);
        } else {
          onResolve(null);
        }
      } catch (e2) {
        onResolve(null);
      }
    }
  });
}

/**
 * PDFページごとの文脈情報（タイトル・テキスト・キーワード判定）
 */
export interface PdfPageContext {
  pageNum: number;
  pageTitle: string;
  pageText: string;
  isPlanPage: boolean;
  isInteriorPage: boolean;
  isExteriorPage: boolean;
  isMapPage: boolean;
  isOverviewPage: boolean;
  floorLabel?: string;
}

/**
 * PDFページからタイトルおよびテキスト文脈を解析
 */
async function extractPageContext(page: any, pageNum: number): Promise<PdfPageContext> {
  try {
    const textContent = await page.getTextContent();
    const items = (textContent.items || [])
      .filter((it: any) => it.str && typeof it.str === 'string' && it.str.trim().length > 0)
      .map((it: any) => ({
        str: it.str.trim(),
        x: it.transform ? it.transform[4] : 0,
        y: it.transform ? it.transform[5] : 0,
        fontSize: it.transform ? Math.abs(it.transform[0] || it.transform[3] || 10) : 10,
      }));

    // Y座標降順（ページ上部から下部）にソート
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const pageText = items.map(i => i.str).join(' ');

    // タイトルの抽出: ■, 【, ●, ◆ 等で始まる見出し、または上部で重要なキーワードを含むテキスト
    let pageTitle = '';
    const titleMarkers = ['■', '【', '●', '◆', '▲', '▼', '#', '・'];
    const titleCandidate = items.find(it => titleMarkers.some(m => it.str.startsWith(m)));
    if (titleCandidate) {
      pageTitle = titleCandidate.str;
    } else {
      const topItems = items.slice(0, 6);
      const keywordCandidate = topItems.find(it =>
        /平面図|間取|PLAN|内装|内観|写真|PHOTO|案内図|地図|概要|募集/i.test(it.str)
      );
      if (keywordCandidate) {
        pageTitle = keywordCandidate.str;
      } else if (topItems.length > 0) {
        pageTitle = topItems[0].str;
      }
    }

    const titleLower = pageTitle.toLowerCase();
    const textLower = pageText.toLowerCase();

    // 1. 平面図・図面ページ判定 (例: 「■平面図」)
    const isPlanPage = /平面図|間取|間取り|plan|区画図|配置図|フロアマップ|図面/.test(titleLower) ||
      (/平面図|間取/.test(textLower) && !/募集条件|賃料|概要/.test(titleLower));

    // 2. 内装・写真ページ判定 (例: 「■内装（引渡し状況）」)
    const isInteriorPage = /内装|内観|室内|引渡し|引き渡し|店舗内|現況写真/.test(titleLower) ||
      (/内装|内観/.test(textLower) && !isPlanPage && !/募集条件|賃料|概要/.test(titleLower));

    // 3. 地図・案内図判定
    const isMapPage = /案内図|周辺地図|地図|map|access|アクセスマップ|位置図/.test(titleLower);

    // 4. 物件概要・募集条件判定
    const isOverviewPage = pageNum === 1 || /物件概要|募集条件|募集図面|賃貸条件|案件概要/.test(titleLower);

    // 5. 外観判定
    const isExteriorPage = /外観|建物外観|ファサード|外観写真/.test(titleLower);

    // 階数表記の検出 (例: 1F, B1F, 地下1階, 1階)
    let floorLabel = '';
    const has1F = /1f|1階/i.test(pageText);
    const hasB1 = /b1|b1f|地下1階|地下１階/i.test(pageText);
    const has2F = /2f|2階/i.test(pageText);
    if (has1F && hasB1) {
      floorLabel = '1F・B1F';
    } else if (has1F) {
      floorLabel = '1F';
    } else if (hasB1) {
      floorLabel = 'B1F';
    } else if (has2F) {
      floorLabel = '2F';
    }

    return {
      pageNum,
      pageTitle,
      pageText,
      isPlanPage,
      isInteriorPage,
      isExteriorPage,
      isMapPage,
      isOverviewPage,
      floorLabel,
    };
  } catch (err) {
    console.warn(`Failed to extract context for page ${pageNum}`, err);
    return {
      pageNum,
      pageTitle: '',
      pageText: '',
      isPlanPage: false,
      isInteriorPage: false,
      isExteriorPage: false,
      isMapPage: false,
      isOverviewPage: pageNum === 1,
    };
  }
}

/**
 * PDFから画像（外観、内観、平面図、区画図、案内図等）を高解像度で直接抽出・分類
 * ページタイトル・周辺テキスト文脈を優先して高精度分類を実施
 */
export async function extractAndClassifyImagesFromPdf(dataUrl: string): Promise<ExtractedImage[]> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const loadingTask = pdfjsLib.getDocument({ url: dataUrl });
    const pdf = await loadingTask.promise;
    const extractedImages: ExtractedImage[] = [];
    const seenHashes = new Set<string>();

    const numPages = Math.min(pdf.numPages, 6);

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      // 1. ページ文脈情報（タイトル・テキスト）を取得
      const pageCtx = await extractPageContext(page, pageNum);

      const ops = await page.getOperatorList();
      const pageImages: { canvas: HTMLCanvasElement; objId: string }[] = [];

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        
        // 独立した画像オブジェクト (XObject / InlineImage)
        if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) {
          const objId = ops.argsArray[i][0];
          try {
            const img = await getPdfImageObject(page, objId, 3500);
            if (!img) continue;

            const width = img.width || img.naturalWidth || 0;
            const height = img.height || img.naturalHeight || 0;

            // 微小な装飾アイコン・ゴミ(60px未満)のみ除外
            if (width < 60 || height < 60 || width * height < 3600) continue;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            if (img.data) {
              let imgData: ImageData;
              if (img.data.length === width * height * 4) {
                imgData = new ImageData(new Uint8ClampedArray(img.data), width, height);
              } else if (img.data.length === width * height * 3) {
                const rgba = new Uint8ClampedArray(width * height * 4);
                let ptr = 0;
                for (let j = 0; j < img.data.length; j += 3) {
                  rgba[ptr++] = img.data[j];
                  rgba[ptr++] = img.data[j + 1];
                  rgba[ptr++] = img.data[j + 2];
                  rgba[ptr++] = 255;
                }
                imgData = new ImageData(rgba, width, height);
              } else if (img.data.length === width * height) {
                const rgba = new Uint8ClampedArray(width * height * 4);
                let ptr = 0;
                for (let j = 0; j < img.data.length; j++) {
                  rgba[ptr++] = img.data[j];
                  rgba[ptr++] = img.data[j];
                  rgba[ptr++] = img.data[j];
                  rgba[ptr++] = 255;
                }
                imgData = new ImageData(rgba, width, height);
              } else {
                continue;
              }
              ctx.putImageData(imgData, 0, 0);
            } else if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
              ctx.drawImage(img, 0, 0);
            } else if (img.bitmap && typeof ImageBitmap !== 'undefined' && img.bitmap instanceof ImageBitmap) {
              ctx.drawImage(img.bitmap, 0, 0);
            } else if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement) {
              ctx.drawImage(img, 0, 0);
            } else {
              continue;
            }

            // 【重要】大きな画像を一律除外しない！
            // 平面図や高解像度写真はページの大半を占めるため、サイズ制限での除外を撤廃
            pageImages.push({ canvas, objId });
          } catch (e) {
            console.warn("Skipped single image extraction for obj", objId, e);
          }
        }
      }

      // ページ内の抽出画像を文脈と合わせて分類
      for (let pIdx = 0; pIdx < pageImages.length; pIdx++) {
        const { canvas } = pageImages[pIdx];
        const finalCanvas = autoTrimCanvas(canvas);
        const dataUrlImg = finalCanvas.toDataURL('image/jpeg', 0.94);
        
        const hash = `${finalCanvas.width}x${finalCanvas.height}_${finalCanvas.toDataURL('image/jpeg', 0.1).slice(-30)}`;
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        const width = finalCanvas.width;
        const height = finalCanvas.height;
        const aspectRatio = width / height;

        // ピクセル解析
        const pCtx = finalCanvas.getContext('2d');
        const classification = pCtx
          ? analyzeAndClassifyImage(finalCanvas, pCtx, width, height, extractedImages.length)
          : { category: 'OTHER' as ImageCategory, subCategory: 'その他', label: '素材', confidence: 'low' as const };

        let finalCategory: ImageCategory = classification.category;
        let finalSubCategory: string = classification.subCategory;
        let finalLabel: string = classification.label;
        let confidence: 'high' | 'medium' | 'low' = classification.confidence;
        let reason = '';
        let isExcludedFromPhoto = false;

        // ----------------------------------------------------
        // A. 会社ロゴ・ヘッダー装飾判定 (PHOTOへの自動配置は厳禁)
        // ----------------------------------------------------
        const isLogoShape = (
          (width < 450 && height < 120 && aspectRatio > 2.5) ||
          (width < 160 && height < 160 && width * height < 26000)
        );
        const hasCompanyContext = /j\.square|j-square|株式会社|仲介|免許番号/i.test(pageCtx.pageText);
        if (isLogoShape && (hasCompanyContext || pageCtx.isOverviewPage)) {
          finalCategory = 'OTHER';
          finalSubCategory = '会社ロゴ';
          finalLabel = '会社ロゴ';
          confidence = 'high';
          reason = '会社ロゴ・ヘッダー装飾のためPHOTO配置除外';
          isExcludedFromPhoto = true;
        }

        // ----------------------------------------------------
        // B. 募集条件表・文書・テキストブロック判定 (PHOTOへの自動配置は厳禁)
        // ----------------------------------------------------
        if (!isExcludedFromPhoto && pageCtx.isOverviewPage) {
          // 純白背景が多く彩度が極めて低い文字ブロック
          const sCtx = finalCanvas.getContext('2d');
          if (sCtx && width > 300) {
            const sampleData = sCtx.getImageData(0, 0, Math.min(width, 100), Math.min(height, 100)).data;
            let whiteCount = 0;
            let lowSatCount = 0;
            const total = sampleData.length / 4;
            for (let k = 0; k < sampleData.length; k += 4) {
              const r = sampleData[k], g = sampleData[k + 1], b = sampleData[k + 2];
              const max = Math.max(r, g, b), min = Math.min(r, g, b);
              const sat = max === 0 ? 0 : (max - min) / max;
              const br = (r + g + b) / 765;
              if (br > 0.88) whiteCount++;
              if (sat < 0.08) lowSatCount++;
            }
            if (whiteCount / total > 0.72 && lowSatCount / total > 0.85 && !pageCtx.isPlanPage) {
              finalCategory = 'OTHER';
              finalSubCategory = '募集条件・文字領域';
              finalLabel = '募集条件・文字領域';
              reason = '募集条件・文字領域のためPHOTO配置除外';
              isExcludedFromPhoto = true;
            }
          }
        }

        // ----------------------------------------------------
        // C. ページ文脈に基づく高精度分類
        // ----------------------------------------------------
        if (!isExcludedFromPhoto) {
          if (pageCtx.isPlanPage) {
            // 【PAGE 2等】タイトル「■平面図」等 → 最大の画像をPLANとして高優先度分類
            finalCategory = 'PLAN';
            finalSubCategory = '平面図';
            const fl = pageCtx.floorLabel;
            finalLabel = fl ? `平面図 (${fl})` : '平面図・間取図';
            confidence = 'high';
            reason = `ページ${pageNum}タイトル「${pageCtx.pageTitle || '平面図'}」より図面として分類`;
            isExcludedFromPhoto = true;
          } else if (pageCtx.isInteriorPage) {
            // 【PAGE 3等】タイトル「■内装（引渡し状況）」等 → 掲載写真をinterior (PHOTO)として分類
            finalCategory = 'PHOTO';
            finalSubCategory = '内観';
            finalLabel = `店舗・区画内観写真 ${pIdx + 1}`;
            confidence = 'high';
            reason = `ページ${pageNum}タイトル「${pageCtx.pageTitle || '内装'}」より内観写真として分類`;
            isExcludedFromPhoto = false;
          } else if (pageCtx.isMapPage) {
            // 地図・案内図ページ
            finalCategory = 'ACCESS';
            finalSubCategory = '現地案内図';
            finalLabel = '現地案内図・アクセスマップ';
            confidence = 'high';
            reason = `ページ${pageNum}タイトル「${pageCtx.pageTitle || '案内図'}」より現地案内図として分類`;
            isExcludedFromPhoto = true;
          } else if (pageCtx.isOverviewPage || pageNum === 1) {
            // 【PAGE 1等】地図、外観写真2枚、会社情報など
            // 地図判定: アスペクト比がほぼ四角または一般的な地図比率(0.7〜1.8)で、案内図らしい色合い
            const isMapLike = (
              (aspectRatio >= 0.75 && aspectRatio <= 1.85) &&
              (classification.category === 'ACCESS' || /案内図|地図|map|access/i.test(pageCtx.pageText))
            );

            if (isMapLike && finalCategory !== 'OTHER') {
              finalCategory = 'ACCESS';
              finalSubCategory = '現地案内図';
              finalLabel = '周辺案内図・位置図';
              confidence = 'high';
              reason = `ページ1 周辺案内図・位置図`;
              isExcludedFromPhoto = true;
            } else {
              // 建物外観写真
              finalCategory = 'PHOTO';
              finalSubCategory = '外観';
              finalLabel = `建物外観写真 ${pIdx + 1}`;
              confidence = 'high';
              reason = `ページ1 建物外観写真`;
              isExcludedFromPhoto = false;
            }
          }
        }

        const itemIndex = String(extractedImages.length + 1).padStart(2, '0');
        const suggestedFilename = `${itemIndex}_${finalSubCategory}.jpg`;

        extractedImages.push({
          id: `img_p${pageNum}_${Date.now()}_${pIdx}`,
          dataUrl: dataUrlImg,
          category: finalCategory,
          subCategory: finalSubCategory,
          label: finalLabel,
          width,
          height,
          confidence,
          sourcePage: pageNum,
          pageTitle: pageCtx.pageTitle,
          reason,
          isEmbedded: true,
          isExcludedFromPhoto,
          suggestedFilename,
        });
      }
    }

    return extractedImages;
  } catch (error) {
    console.error("Failed to extract images from PDF", error);
    return [];
  }
}

/**
 * 簡易ラッパー：既存互換用
 */
export async function extractImagesFromPdf(dataUrl: string): Promise<string[]> {
  const list = await extractAndClassifyImagesFromPdf(dataUrl);
  return list.map(item => item.dataUrl);
}

/**
 * フォーマット別の最適スロット自動割り当て
 * 優先順位：
 * 1. 募集区画の平面図 (PLAN)
 * 2. 建物外観 (PHOTO - 外観)
 * 3. 募集区画の内観 (PHOTO - 内観)
 * 4. 現地案内図 (ACCESS)
 * 5. エントランス / 共用部 / 周辺
 */
export function assignSlotByFormat(
  classifiedImages: ExtractedImage[],
  format: 'JS-A' | 'JS-B' | 'JS-C' | 'JS-D' = 'JS-B'
): {
  main: string;
  floorPlan: string;
  map: string;
  subPhotos: string[];
  allExtracted: string[];
  classifiedList: ExtractedImage[];
} {
  // 1. 平面図: category === 'PLAN' のみ
  const planImages = classifiedImages.filter(img => img.category === 'PLAN' && img.dataUrl);
  // 最大サイズまたは高解像度の平面図を優先
  const planImg = planImages.length > 0
    ? planImages.reduce((prev, curr) => ((curr.width || 0) * (curr.height || 0) > (prev.width || 0) * (prev.height || 0) ? curr : prev)).dataUrl
    : '';

  // 2. 外観写真: PHOTOのうち「外観」「外観パース」を最優先
  const allowedPhotos = classifiedImages.filter(img =>
    img.category === 'PHOTO' &&
    !img.isExcludedFromPhoto &&
    img.subCategory !== '会社ロゴ' &&
    img.subCategory !== '募集条件・文字領域' &&
    img.dataUrl
  );

  const exteriorPhoto = allowedPhotos.find(img => img.subCategory === '外観' || img.subCategory === '外観パース')?.dataUrl;
  const anyPhoto = allowedPhotos.find(img => img.subCategory !== '内観')?.dataUrl || allowedPhotos[0]?.dataUrl || '';

  // メイン写真（表紙・物件詳細用）
  const main = exteriorPhoto || anyPhoto || '';

  // 3. 案内図: category === 'ACCESS' のみ
  const accessImg = classifiedImages.find(img => img.category === 'ACCESS' && img.dataUrl)?.dataUrl || '';
  const map = accessImg;

  // 4. 平面図スロット: 平面図がなければ勝手に内観写真や別画像を使用しない！
  const floorPlan = planImg;

  // 5. PHOTOスライド用写真: 内観写真を最優先、次にメイン以外の外観・物件写真
  // 地図、平面図、会社ロゴ、文字表は絶対に混入させない！
  const interiorPhotos = allowedPhotos
    .filter(img => (img.subCategory === '内観' || img.subCategory === '内観パース') && img.dataUrl !== main)
    .map(img => img.dataUrl);

  const otherValidPhotos = allowedPhotos
    .filter(img => img.dataUrl !== main && !interiorPhotos.includes(img.dataUrl))
    .map(img => img.dataUrl);

  const subPhotos = [...interiorPhotos, ...otherValidPhotos];

  // 各画像の assignedSlot を更新
  const updatedList = classifiedImages.map(img => {
    let slot: 'main' | 'floorPlan' | 'map' | 'photo' | 'none' = 'none';
    if (img.dataUrl === main) slot = 'main';
    else if (img.dataUrl === floorPlan) slot = 'floorPlan';
    else if (img.dataUrl === map) slot = 'map';
    else if (subPhotos.includes(img.dataUrl)) slot = 'photo';

    return {
      ...img,
      assignedSlot: slot,
    };
  });

  const allUrls = classifiedImages.map(img => img.dataUrl);

  return {
    main,
    floorPlan,
    map,
    subPhotos,
    allExtracted: allUrls,
    classifiedList: updatedList,
  };
}

/**
 * 抽出された全画像素材をZIPアーカイブとして一括ダウンロード（仕様第11項）
 * 命名規則: ［物件名］_画像素材_YYYYMMDD.zip
 * 内包ファイル: 01_外観.jpg, 02_内観.jpg, 03_平面図.png, 04_案内図.png 等
 */
export async function downloadExtractedImagesZip(
  propertyName: string,
  classifiedImages: ExtractedImage[],
  dateStr: string
): Promise<void> {
  if (!classifiedImages || classifiedImages.length === 0) {
    alert("ダウンロード可能な抽出画像がありません。");
    return;
  }

  const zip = new JSZip();
  const cleanPropertyName = (propertyName || '物件').replace(/[\\/:*?"<>|]/g, '_');
  const folderName = `${cleanPropertyName}_画像素材_${dateStr}`;
  const folder = zip.folder(folderName) || zip;

  classifiedImages.forEach((img, idx) => {
    const filename = img.suggestedFilename || `${String(idx + 1).padStart(2, '0')}_${img.subCategory || '素材'}.jpg`;
    const base64Data = img.dataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    folder.file(filename, base64Data, { base64: true });
  });

  const content = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${folderName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

/**
 * PDFの各ページからテキストレイヤーを抽出し、同時に高解像度JPEGとしてレンダリング
 * AI（Gemini）解析用のテキスト＋視覚画像のハイブリッド入力を生成
 */
export async function extractPdfTextAndRenderPages(dataUrl: string, maxPages = 4): Promise<{
  fullText: string;
  pageImages: { mimeType: string; data: string }[];
}> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const loadingTask = pdfjsLib.getDocument({ url: dataUrl });
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages, maxPages);

    let fullText = '';
    const pageImages: { mimeType: string; data: string }[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);

      // 1. テキストレイヤーの抽出
      try {
        const textContent = await page.getTextContent();
        const textItems = textContent.items
          .map((item: any) => item.str || '')
          .filter(Boolean);
        if (textItems.length > 0) {
          fullText += `\n[--- PDF ページ ${pageNum} のテキスト ---]\n` + textItems.join(' ');
        }
      } catch (textErr) {
        console.warn(`Page ${pageNum} text extraction failed`, textErr);
      }

      // 2. ページ全体の高精細レンダリング (2.0倍スケール)
      try {
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await (page.render as any)({ canvasContext: ctx, viewport, canvas }).promise;
          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.88);
          const base64Data = jpegDataUrl.split(',')[1];
          if (base64Data) {
            pageImages.push({
              mimeType: 'image/jpeg',
              data: base64Data
            });
          }
        }
      } catch (renderErr) {
        console.warn(`Page ${pageNum} render failed`, renderErr);
      }
    }

    return { fullText, pageImages };
  } catch (error) {
    console.error("Failed to extract PDF text and render pages", error);
    return { fullText: '', pageImages: [] };
  }
}

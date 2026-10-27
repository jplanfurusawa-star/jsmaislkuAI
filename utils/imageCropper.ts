import type { ExtractedImage, ImageCategory } from '@/types';

export interface VisualElementDetection {
  box2d: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  fileIndex: number;
  category: string;
  subCategory: string;
  label: string;
  confidence?: 'high' | 'medium' | 'low';
}

export function autoTrimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        const isContent =
          a > 20 &&
          !(r > 248 && g > 248 && b > 248);

        if (!isContent) continue;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) return canvas;

    const pad = 6;

    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);

    const cropW = Math.min(
      width - cropX,
      maxX - minX + 1 + pad * 2
    );

    const cropH = Math.min(
      height - cropY,
      maxY - minY + 1 + pad * 2
    );

    if (cropW < 60 || cropH < 60) return canvas;

    if (
      cropW >= width * 0.98 &&
      cropH >= height * 0.98
    ) {
      return canvas;
    }

    const trimmed = document.createElement('canvas');

    trimmed.width = cropW;
    trimmed.height = cropH;

    const tctx = trimmed.getContext('2d');

    if (!tctx) return canvas;

    tctx.drawImage(
      canvas,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );

    return trimmed;

  } catch (error) {
    console.warn('Auto trim skipped', error);
    return canvas;
  }
}

function loadImageToCanvas(
  dataUrl: string
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas =
        document.createElement('canvas');

      canvas.width =
        img.naturalWidth || img.width;

      canvas.height =
        img.naturalHeight || img.height;

      const ctx =
        canvas.getContext('2d');

      if (!ctx) {
        reject(
          new Error(
            'Canvas context is not available'
          )
        );
        return;
      }

      ctx.drawImage(img, 0, 0);

      resolve(canvas);
    };

    img.onerror = reject;

    img.src = dataUrl;
  });
}

async function renderPdfPagesToCanvases(
  dataUrl: string,
  maxPages = 20
): Promise<HTMLCanvasElement[]> {

  const canvases: HTMLCanvasElement[] = [];

  try {
    const pdfjsLib =
      await import('pdfjs-dist');

    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const pdf =
      await pdfjsLib
        .getDocument({ url: dataUrl })
        .promise;

    const pageCount =
      Math.min(
        pdf.numPages,
        maxPages
      );

    for (
      let pageNum = 1;
      pageNum <= pageCount;
      pageNum++
    ) {
      const page =
        await pdf.getPage(pageNum);

      const viewport =
        page.getViewport({
          scale: 2.5
        });

      const canvas =
        document.createElement('canvas');

      canvas.width =
        Math.ceil(viewport.width);

      canvas.height =
        Math.ceil(viewport.height);

      const ctx =
        canvas.getContext('2d');

      if (!ctx) continue;

      await (page.render as any)({
        canvasContext: ctx,
        viewport,
        canvas
      }).promise;

      canvases.push(canvas);
    }

  } catch (error) {
    console.error(
      'Failed to render PDF pages',
      error
    );
  }

  return canvases;
}

function normalizeCategory(
  d: VisualElementDetection
): ImageCategory {

  const category =
    (d.category || '').toUpperCase();

  const sub =
    (d.subCategory || '').toLowerCase();

  const label =
    (d.label || '').toLowerCase();

  if (
    category.includes('PLAN') ||
    category.includes('図面') ||
    category.includes('間取') ||
    sub.includes('平面') ||
    sub.includes('区画') ||
    sub.includes('フロア') ||
    label.includes('平面図') ||
    label.includes('区画図')
  ) {
    return 'PLAN';
  }

  if (
    category.includes('ACCESS') ||
    category.includes('MAP') ||
    category.includes('地図') ||
    category.includes('案内') ||
    sub.includes('案内') ||
    sub.includes('地図') ||
    label.includes('案内図') ||
    label.includes('地図')
  ) {
    return 'ACCESS';
  }

  if (
    category.includes('OTHER') ||
    sub.includes('ロゴ') ||
    sub.includes('文字') ||
    sub.includes('条件') ||
    label.includes('ロゴ') ||
    label.includes('会社名') ||
    label.includes('社章')
  ) {
    return 'OTHER';
  }

  return 'PHOTO';
}

export async function cropVisualElementsFromSource(
  files: {
    file: File;
    dataUrl: string;
  }[],
  detections: VisualElementDetection[]
): Promise<ExtractedImage[]> {

  const extractedImages: ExtractedImage[] = [];

  const pages: {
    canvas: HTMLCanvasElement;
    pageNum: number;
  }[] = [];

  for (const fileObj of files) {

    if (
      fileObj.file.type ===
      'application/pdf'
    ) {
      const rendered =
        await renderPdfPagesToCanvases(
          fileObj.dataUrl,
          20
        );

      rendered.forEach(
        (canvas, index) => {
          pages.push({
            canvas,
            pageNum: index + 1
          });
        }
      );

    } else if (
      fileObj.file.type.startsWith(
        'image/'
      )
    ) {

      try {
        pages.push({
          canvas:
            await loadImageToCanvas(
              fileObj.dataUrl
            ),
          pageNum: 1
        });

      } catch (error) {
        console.error(
          'Failed to load image source',
          error
        );
      }
    }
  }

  if (pages.length === 0) {
    return extractedImages;
  }

  for (
    let i = 0;
    i < detections.length;
    i++
  ) {
    const d = detections[i];

    const page =
      pages[
        Number.isFinite(d.fileIndex)
          ? d.fileIndex
          : 0
      ] || pages[0];

    if (
      !page ||
      !Array.isArray(d.box2d) ||
      d.box2d.length < 4
    ) {
      continue;
    }

    let [
      ymin,
      xmin,
      ymax,
      xmax
    ] = d.box2d.map(Number);

    if (
      ![
        ymin,
        xmin,
        ymax,
        xmax
      ].every(Number.isFinite)
    ) {
      continue;
    }

    if (ymin > ymax) {
      [ymin, ymax] = [ymax, ymin];
    }

    if (xmin > xmax) {
      [xmin, xmax] = [xmax, xmin];
    }

    ymin = Math.max(
      0,
      Math.min(1000, ymin)
    );

    xmin = Math.max(
      0,
      Math.min(1000, xmin)
    );

    ymax = Math.max(
      0,
      Math.min(1000, ymax)
    );

    xmax = Math.max(
      0,
      Math.min(1000, xmax)
    );

    const widthRatio =
      (xmax - xmin) / 1000;

    const heightRatio =
      (ymax - ymin) / 1000;

    const category =
      normalizeCategory(d);

    const isPlan =
      category === 'PLAN';

    if (
      widthRatio < 0.04 ||
      heightRatio < 0.04
    ) {
      continue;
    }

    if (
      !isPlan &&
      widthRatio > 0.96 &&
      heightRatio > 0.96
    ) {
      continue;
    }

    const source =
      page.canvas;

    const cropX =
      Math.max(
        0,
        Math.floor(
          (xmin / 1000) *
          source.width
        )
      );

    const cropY =
      Math.max(
        0,
        Math.floor(
          (ymin / 1000) *
          source.height
        )
      );

    const cropW =
      Math.min(
        source.width - cropX,
        Math.ceil(
          widthRatio *
          source.width
        )
      );

    const cropH =
      Math.min(
        source.height - cropY,
        Math.ceil(
          heightRatio *
          source.height
        )
      );

    if (
      cropW < 40 ||
      cropH < 40
    ) {
      continue;
    }

    const cropped =
      document.createElement(
        'canvas'
      );

    cropped.width = cropW;
    cropped.height = cropH;

    const ctx =
      cropped.getContext('2d');

    if (!ctx) continue;

    ctx.drawImage(
      source,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );

    const finalCanvas =
      autoTrimCanvas(cropped);

    const rawSub =
      d.subCategory || '';

    const rawLabel =
      d.label || '';

    const combined =
      `${rawSub} ${rawLabel}`
        .toLowerCase();

    let subCategory =
      rawSub ||
      (
        category === 'PLAN'
          ? '平面図'
          : category === 'ACCESS'
          ? '案内図'
          : category === 'OTHER'
          ? 'その他'
          : '外観'
      );

    if (
      /パース|予想図|レンダリング/
        .test(combined)
    ) {
      subCategory =
        /内観|室内|店舗内/
          .test(combined)
          ? '内観パース'
          : '外観パース';
    }

    if (
      /ロゴ|会社名|社章/
        .test(combined)
    ) {
      subCategory =
        '会社ロゴ';
    }

    const isExcludedFromPhoto =
      category !== 'PHOTO' ||
      /ロゴ|会社名|社章|条件|文字/
        .test(combined);

    const label =
      rawLabel ||
      (
        category === 'PLAN'
          ? '平面図・間取図'
          : category === 'ACCESS'
          ? '現地案内図・周辺地図'
          : subCategory
      );

    extractedImages.push({
      id:
        `crop_${Date.now()}_${i}`,

      dataUrl:
        finalCanvas.toDataURL(
          'image/jpeg',
          0.94
        ),

      category,
      subCategory,
      label,

      width:
        finalCanvas.width,

      height:
        finalCanvas.height,

      confidence:
        d.confidence || 'high',

      sourcePage:
        page.pageNum,

      reason:
        `AI領域解析 (P.${page.pageNum}): ${label}`,

      isExcludedFromPhoto,

      suggestedFilename:
        `${String(
          extractedImages.length + 1
        ).padStart(
          2,
          '0'
        )}_${subCategory}.jpg`,
    });
  }

  return extractedImages;
}
import type { ExtractedImage, ImageCategory } from '@/types';

type Confidence = 'high' | 'medium' | 'low';

type PageContext = {
  pageNum: number;
  pageText: string;
  pageTitle: string;
  isPlanPage: boolean;
  isInteriorPage: boolean;
  isMapPage: boolean;
  isOverviewPage: boolean;
  floorLabel?: string;
};

type PixelStats = {
  whiteRatio: number;
  avgSaturation: number;
  avgBrightness: number;
  skyRatio: number;
  warmRatio: number;
};

function getPixelStats(canvas: HTMLCanvasElement): PixelStats {
  const sample = document.createElement('canvas');

  const sw = Math.min(canvas.width, 96);
  const sh = Math.min(canvas.height, 96);

  sample.width = sw;
  sample.height = sh;

  const ctx = sample.getContext('2d');

  if (!ctx || sw <= 0 || sh <= 0) {
    return {
      whiteRatio: 0,
      avgSaturation: 0,
      avgBrightness: 0,
      skyRatio: 0,
      warmRatio: 0,
    };
  }

  ctx.drawImage(canvas, 0, 0, sw, sh);

  const data = ctx.getImageData(
    0,
    0,
    sw,
    sh
  ).data;

  let white = 0;
  let saturationSum = 0;
  let brightnessSum = 0;
  let sky = 0;
  let skyTotal = 0;
  let warm = 0;

  const total = sw * sh;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);

      const sat =
        max === 0
          ? 0
          : (max - min) / max;

      const brightness =
        (
          r * 0.299 +
          g * 0.587 +
          b * 0.114
        ) / 255;

      saturationSum += sat;
      brightnessSum += brightness;

      if (
        brightness > 0.92 &&
        sat < 0.08
      ) {
        white++;
      }

      if (
        r > b + 25 &&
        r > 120 &&
        g > 90
      ) {
        warm++;
      }

      if (y < sh / 3) {
        skyTotal++;

        if (
          (
            b > r + 10 &&
            b > 130
          ) ||
          (
            brightness > 0.88 &&
            sat < 0.12
          )
        ) {
          sky++;
        }
      }
    }
  }

  return {
    whiteRatio:
      total
        ? white / total
        : 0,

    avgSaturation:
      total
        ? saturationSum / total
        : 0,

    avgBrightness:
      total
        ? brightnessSum / total
        : 0,

    skyRatio:
      skyTotal
        ? sky / skyTotal
        : 0,

    warmRatio:
      total
        ? warm / total
        : 0,
  };
}

function autoTrimCanvas(
  canvas: HTMLCanvasElement
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  try {
    const {
      width,
      height,
    } = canvas;

    const data = ctx.getImageData(
      0,
      0,
      width,
      height
    ).data;

    let minX = width;
    let minY = height;

    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i =
          (y * width + x) * 4;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        const isContent =
          a > 20 &&
          !(
            r > 248 &&
            g > 248 &&
            b > 248
          );

        if (!isContent) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);

        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (
      maxX < minX ||
      maxY < minY
    ) {
      return canvas;
    }

    const pad = 6;

    const x = Math.max(
      0,
      minX - pad
    );

    const y = Math.max(
      0,
      minY - pad
    );

    const w = Math.min(
      width - x,
      maxX - minX + 1 + pad * 2
    );

    const h = Math.min(
      height - y,
      maxY - minY + 1 + pad * 2
    );

    if (
      w < 60 ||
      h < 60
    ) {
      return canvas;
    }

    if (
      w >= width * 0.98 &&
      h >= height * 0.98
    ) {
      return canvas;
    }

    const out =
      document.createElement('canvas');

    out.width = w;
    out.height = h;

    const outCtx =
      out.getContext('2d');

    if (!outCtx) {
      return canvas;
    }

    outCtx.drawImage(
      canvas,
      x,
      y,
      w,
      h,
      0,
      0,
      w,
      h
    );

    return out;

  } catch (error) {
    console.warn(
      'autoTrimCanvas skipped',
      error
    );

    return canvas;
  }
}

function canvasSignature(
  canvas: HTMLCanvasElement
): string {
  const sig =
    document.createElement('canvas');

  sig.width = 10;
  sig.height = 10;

  const ctx =
    sig.getContext('2d');

  if (!ctx) {
    return `${canvas.width}x${canvas.height}`;
  }

  ctx.drawImage(
    canvas,
    0,
    0,
    10,
    10
  );

  const data = ctx.getImageData(
    0,
    0,
    10,
    10
  ).data;

  let a = 0;
  let b = 0;

  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {
    const n =
      i / 4 + 1;

    a =
      (
        a +
        (
          data[i] * 3 +
          data[i + 1] * 5 +
          data[i + 2] * 7
        ) *
          n
      ) %
      1000000007;

    b =
      (
        b +
        Math.abs(
          data[i] -
          data[i + 1]
        ) +
        Math.abs(
          data[i + 1] -
          data[i + 2]
        )
      ) %
      1000003;
  }

  return (
    `${canvas.width}` +
    `x${canvas.height}` +
    `_${a}_${b}`
  );
}

async function getPageContext(
  page: any,
  pageNum: number
): Promise<PageContext> {
  try {
    const textContent =
      await page.getTextContent();

    const items =
      (
        textContent.items || []
      )
        .map(
          (item: any) =>
            String(
              item?.str || ''
            ).trim()
        )
        .filter(Boolean);

    const pageText =
      items.join(' ');

    const pageTitle =
      items.find(
        (s: string) =>
          /平面図|間取|内装|内観|案内図|地図|物件概要|募集条件|募集図面|外観/i.test(
            s
          )
      ) ||
      items[0] ||
      '';

    const t =
      `${pageTitle} ${pageText}`
        .toLowerCase();

    let floorLabel = '';

    const hasB1 =
      /b1f|b1|地下1階|地下１階/i.test(
        pageText
      );

    const has1F =
      /(^|\s)1f|1階/i.test(
        pageText
      );

    const has2F =
      /(^|\s)2f|2階/i.test(
        pageText
      );

    const has3F =
      /(^|\s)3f|3階/i.test(
        pageText
      );

    if (
      hasB1 &&
      has1F
    ) {
      floorLabel =
        'B1F・1F';

    } else if (hasB1) {
      floorLabel =
        'B1F';

    } else if (has1F) {
      floorLabel =
        '1F';

    } else if (has2F) {
      floorLabel =
        '2F';

    } else if (has3F) {
      floorLabel =
        '3F';
    }

    return {
      pageNum,
      pageText,
      pageTitle,

      isPlanPage:
        /平面図|間取|間取り|plan|区画図|配置図|フロアマップ/.test(
          t
        ),

      isInteriorPage:
        /内装|内観|室内|店舗内|現況写真/.test(
          t
        ),

      isMapPage:
        /案内図|周辺地図|地図|map|access|アクセスマップ|位置図/.test(
          t
        ),

      isOverviewPage:
        pageNum === 1 ||
        /物件概要|募集条件|募集図面|賃貸条件|案件概要/.test(
          t
        ),

      floorLabel:
        floorLabel ||
        undefined,
    };

  } catch (error) {
    console.warn(
      `Page ${pageNum} context extraction failed`,
      error
    );

    return {
      pageNum,
      pageText: '',
      pageTitle: '',
      isPlanPage: false,
      isInteriorPage: false,
      isMapPage: false,
      isOverviewPage:
        pageNum === 1,
    };
  }
}

function classifyCanvas(
  canvas: HTMLCanvasElement,
  page: PageContext,
  imageIndex: number
): {
  category: ImageCategory;
  subCategory: string;
  label: string;
  confidence: Confidence;
  isExcludedFromPhoto: boolean;
} {
  const {
    width,
    height,
  } = canvas;

  const aspect =
    height
      ? width / height
      : 1;

  const stats =
    getPixelStats(canvas);

  const compact =
    width <= 560 &&
    height <= 260 &&
    width * height <= 130000;

  const smallSquare =
    width <= 190 &&
    height <= 190 &&
    width * height <= 32000;

  const flatGraphic =
    stats.whiteRatio > 0.42 &&
    stats.avgSaturation < 0.24;

  const companyContext =
    /株式会社|有限会社|company|association|免許|tel|fax|仲介|貸主/i.test(
      page.pageText
    );

  if (
    (
      compact &&
      aspect >= 1.2 &&
      aspect <= 7 &&
      flatGraphic &&
      companyContext
    ) ||
    (
      smallSquare &&
      flatGraphic &&
      companyContext
    )
  ) {
    return {
      category: 'OTHER',
      subCategory: '会社ロゴ',
      label: '会社ロゴ',
      confidence: 'high',
      isExcludedFromPhoto: true,
    };
  }

  if (page.isMapPage) {
    return {
      category: 'ACCESS',
      subCategory: '現地案内図',
      label:
        '現地案内図・アクセスマップ',
      confidence: 'high',
      isExcludedFromPhoto: true,
    };
  }

  if (page.isPlanPage) {
    return {
      category: 'PLAN',
      subCategory: '平面図',
      label:
        page.floorLabel
          ? `平面図 (${page.floorLabel})`
          : '平面図・区画図',
      confidence: 'high',
      isExcludedFromPhoto: true,
    };
  }

  if (
    stats.whiteRatio > 0.55 &&
    stats.avgSaturation < 0.16
  ) {
    return {
      category: 'PLAN',
      subCategory: '平面図',
      label:
        '平面図・区画図',
      confidence: 'medium',
      isExcludedFromPhoto: true,
    };
  }

  const looksPhoto =
    stats.avgSaturation > 0.10 ||
    stats.whiteRatio < 0.45;

  if (looksPhoto) {
    if (
      page.isInteriorPage ||
      stats.warmRatio > 0.22
    ) {
      return {
        category: 'PHOTO',
        subCategory: '内観',
        label:
          `店舗・区画内観写真 ${imageIndex + 1}`,
        confidence: 'medium',
        isExcludedFromPhoto: false,
      };
    }

    if (
      page.pageNum === 1 ||
      stats.skyRatio > 0.12 ||
      aspect < 0.95
    ) {
      return {
        category: 'PHOTO',
        subCategory: '外観',
        label:
          `建物外観写真 ${imageIndex + 1}`,
        confidence: 'medium',
        isExcludedFromPhoto: false,
      };
    }

    return {
      category: 'PHOTO',
      subCategory: '内観',
      label:
        `物件写真 ${imageIndex + 1}`,
      confidence: 'low',
      isExcludedFromPhoto: false,
    };
  }

  return {
    category: 'OTHER',
    subCategory:
      'その他参考資料',
    label:
      `参考資料 ${imageIndex + 1}`,
    confidence: 'low',
    isExcludedFromPhoto: true,
  };
}

async function resolvePdfImage(
  page: any,
  arg: any,
  timeoutMs = 3000
): Promise<any> {
  if (
    arg &&
    typeof arg === 'object' &&
    (
      arg.data ||
      arg.bitmap ||
      arg.width ||
      arg.height
    )
  ) {
    return arg;
  }

  if (
    typeof arg !== 'string'
  ) {
    return null;
  }

  return new Promise(
    (resolve) => {
      let settled = false;

      let timer:
        ReturnType<typeof setTimeout>;

      const done = (
        value: any
      ) => {
        if (settled) {
          return;
        }

        settled = true;

        clearTimeout(timer);

        resolve(
          value ||
          null
        );
      };

      timer =
        setTimeout(
          () => done(null),
          timeoutMs
        );

      try {
        if (
          page.objs?.get
        ) {
          page.objs.get(
            arg,
            done
          );

        } else if (
          page.commonObjs?.get
        ) {
          page.commonObjs.get(
            arg,
            done
          );

        } else {
          done(null);
        }

      } catch {
        try {
          if (
            page.commonObjs?.get
          ) {
            page.commonObjs.get(
              arg,
              done
            );

          } else {
            done(null);
          }

        } catch {
          done(null);
        }
      }
    }
  );
}

function pdfImageToCanvas(
  img: any
): HTMLCanvasElement | null {
  const width =
    Number(
      img?.width ||
      img?.naturalWidth ||
      img?.bitmap?.width ||
      0
    );

  const height =
    Number(
      img?.height ||
      img?.naturalHeight ||
      img?.bitmap?.height ||
      0
    );

  if (
    !width ||
    !height ||
    width < 50 ||
    height < 50
  ) {
    return null;
  }

  const canvas =
    document.createElement(
      'canvas'
    );

  canvas.width = width;
  canvas.height = height;

  const ctx =
    canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  try {
    if (img.data) {
      const src =
        img.data as
        | Uint8Array
        | Uint8ClampedArray;

      let rgba:
        Uint8ClampedArray;

      if (
        src.length ===
        width * height * 4
      ) {
        rgba =
          new Uint8ClampedArray(
            src
          );

      } else if (
        src.length ===
        width * height * 3
      ) {
        rgba =
          new Uint8ClampedArray(
            width *
            height *
            4
          );

        let p = 0;

        for (
          let i = 0;
          i < src.length;
          i += 3
        ) {
          rgba[p++] = src[i];
          rgba[p++] = src[i + 1];
          rgba[p++] = src[i + 2];
          rgba[p++] = 255;
        }

      } else if (
        src.length ===
        width * height
      ) {
        rgba =
          new Uint8ClampedArray(
            width *
            height *
            4
          );

        let p = 0;

        for (
          let i = 0;
          i < src.length;
          i++
        ) {
          rgba[p++] = src[i];
          rgba[p++] = src[i];
          rgba[p++] = src[i];
          rgba[p++] = 255;
        }

      } else {
        return null;
      }

      ctx.putImageData(
        new ImageData(
          rgba,
          width,
          height
        ),
        0,
        0
      );

      return canvas;
    }

    if (img.bitmap) {
      ctx.drawImage(
        img.bitmap,
        0,
        0,
        width,
        height
      );

      return canvas;
    }

    if (
      typeof ImageBitmap !==
        'undefined' &&
      img instanceof ImageBitmap
    ) {
      ctx.drawImage(
        img,
        0,
        0,
        width,
        height
      );

      return canvas;
    }

    if (
      typeof HTMLImageElement !==
        'undefined' &&
      img instanceof
        HTMLImageElement
    ) {
      ctx.drawImage(
        img,
        0,
        0,
        width,
        height
      );

      return canvas;
    }

    if (
      typeof HTMLCanvasElement !==
        'undefined' &&
      img instanceof
        HTMLCanvasElement
    ) {
      ctx.drawImage(
        img,
        0,
        0,
        width,
        height
      );

      return canvas;
    }

  } catch (error) {
    console.warn(
      'PDF image conversion failed',
      error
    );
  }

  return null;
}

export async function extractAndClassifyImagesFromPdf(
  dataUrl: string
): Promise<ExtractedImage[]> {
  const output:
    ExtractedImage[] = [];

  const seen =
    new Set<string>();

  try {
    const pdfjsLib =
      await import(
        'pdfjs-dist'
      );

    pdfjsLib
      .GlobalWorkerOptions
      .workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const pdf =
      await pdfjsLib
        .getDocument({
          url: dataUrl,
        })
        .promise;

    const pageCount =
      Math.min(
        pdf.numPages,
        20
      );

    for (
      let pageNum = 1;
      pageNum <= pageCount;
      pageNum++
    ) {
      const page =
        await pdf.getPage(
          pageNum
        );

      const context =
        await getPageContext(
          page,
          pageNum
        );

      const ops =
        await page
          .getOperatorList();

      let imageIndex = 0;

      for (
        let i = 0;
        i < ops.fnArray.length;
        i++
      ) {
        const fn =
          ops.fnArray[i];

        if (
          fn !==
            pdfjsLib.OPS
              .paintImageXObject &&
          fn !==
            pdfjsLib.OPS
              .paintInlineImageXObject
        ) {
          continue;
        }

        const arg =
          ops.argsArray[i]?.[0];

        const img =
          await resolvePdfImage(
            page,
            arg
          );

        const rawCanvas =
          pdfImageToCanvas(
            img
          );

        if (!rawCanvas) {
          continue;
        }

        const canvas =
          autoTrimCanvas(
            rawCanvas
          );

        const signature =
          canvasSignature(
            canvas
          );

        if (
          seen.has(
            signature
          )
        ) {
          continue;
        }

        seen.add(
          signature
        );

        const c =
          classifyCanvas(
            canvas,
            context,
            imageIndex++
          );

        output.push({
          id:
            `img_p${pageNum}_` +
            `${output.length + 1}`,

          dataUrl:
            canvas.toDataURL(
              'image/jpeg',
              0.94
            ),

          category:
            c.category,

          subCategory:
            c.subCategory,

          label:
            c.label,

          width:
            canvas.width,

          height:
            canvas.height,

          confidence:
            c.confidence,

          sourcePage:
            pageNum,

          pageTitle:
            context.pageTitle,

          reason:
            `PDF埋め込み画像 / P.${pageNum}`,

          isEmbedded:
            true,

          isExcludedFromPhoto:
            c.isExcludedFromPhoto,

          suggestedFilename:
            `${String(
              output.length + 1
            ).padStart(
              2,
              '0'
            )}_` +
            `${c.subCategory}.jpg`,
        });
      }
    }

  } catch (error) {
    console.error(
      'Failed to extract images from PDF',
      error
    );
  }

  return output;
}

export async function extractPdfTextAndRenderPages(
  dataUrl: string,
  maxPages = 20
): Promise<{
  fullText: string;
  pageImages: {
    mimeType: string;
    data: string;
    pageNumber: number;
    pageText: string;
  }[];
}> {
  let fullText = '';

  const pageImages: {
    mimeType: string;
    data: string;
    pageNumber: number;
    pageText: string;
  }[] = [];

  try {
    const pdfjsLib =
      await import(
        'pdfjs-dist'
      );

    pdfjsLib
      .GlobalWorkerOptions
      .workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const pdf =
      await pdfjsLib
        .getDocument({
          url: dataUrl,
        })
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
        await pdf.getPage(
          pageNum
        );

      let pageText = '';

      try {
        const textContent =
          await page
            .getTextContent();

        pageText =
          (
            textContent.items ||
            []
          )
            .map(
              (item: any) =>
                String(
                  item?.str ||
                  ''
                ).trim()
            )
            .filter(Boolean)
            .join(' ')
            .replace(
              /\s+/g,
              ' '
            )
            .trim();

        if (pageText) {
          fullText +=
            `\n[--- PDF ページ ${pageNum} ---]\n` +
            pageText;
        }

      } catch (textError) {
        console.warn(
          `Page ${pageNum} text extraction failed`,
          textError
        );
      }

      try {
        const viewport =
          page.getViewport({
            scale: 1.4,
          });

        const canvas =
          document
            .createElement(
              'canvas'
            );

        canvas.width =
          Math.ceil(
            viewport.width
          );

        canvas.height =
          Math.ceil(
            viewport.height
          );

        const ctx =
          canvas.getContext(
            '2d'
          );

        if (!ctx) {
          continue;
        }

        await (
          page.render as any
        )({
          canvasContext: ctx,
          viewport,
          canvas,
        }).promise;

        const dataUrlImage =
          canvas.toDataURL(
            'image/jpeg',
            0.85
          );

        const base64 =
          dataUrlImage
            .split(',')[1];

        if (!base64) {
          continue;
        }

        pageImages.push({
          mimeType:
            'image/jpeg',

          data:
            base64,

          pageNumber:
            pageNum,

          pageText,
        });

      } catch (renderError) {
        console.warn(
          `Page ${pageNum} render failed`,
          renderError
        );
      }
    }

  } catch (error) {
    console.error(
      'Failed to extract PDF text/render pages',
      error
    );
  }

  return {
    fullText,
    pageImages,
  };
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
 * 
 * JS-A メイン画像優先順位:
 * 1. 実写の建物外観 (PHOTO_EXTERIOR)
 * 2. 外観パース・完成予想図 (PHOTO_EXTERIOR_RENDER)
 * 3. 店舗ファサード
 * 4. エントランス (PHOTO_ENTRANCE)
 * 5. 内観 (PHOTO_INTERIOR)
 * ※「外観」「外観パース」が存在する場合、エントランスや内観をメイン画像にしない。
 * ※平面図はPLANを1点掲載。立面図、断面図、配置図はJS-Aメイン平面図には使用しない。
 */
export function assignSlotByFormat(
  classifiedImages: ExtractedImage[],
  format: string = 'JS-B'
): {
  main: string;
  floorPlan: string;
  map: string;
  subPhotos: string[];
  allExtracted: string[];
  classifiedList: ExtractedImage[];
  mainImage?: ExtractedImage;
  floorPlanImage?: ExtractedImage;
  mapImage?: ExtractedImage;
  subPhotoImages?: ExtractedImage[];
} {
  const isSafePhoto = (img: ExtractedImage) => {
    const text = `${img.subCategory || ''} ${img.label || ''}`;
    return (
      img.category === 'PHOTO' &&
      !img.isExcludedFromPhoto &&
      !/会社ロゴ|ロゴ|社章|会社情報|募集条件|文字領域|広告|バナー|使用しない/.test(text)
    );
  };

  const photoImages = classifiedImages.filter(isSafePhoto);

  // 平面図：立面図・断面図・配置図は除外し、純粋な平面図・間取図・区画図を最優先
  const planImages = classifiedImages.filter(img => {
    const text = `${img.subCategory || ''} ${img.label || ''}`.toLowerCase();
    if (/立面|断面|elevation|section|配置図|site.?plan/.test(text)) return false;
    return img.category === 'PLAN' || /平面|間取|区画図|floor.?plan/.test(text);
  });

  const mapImages = classifiedImages.filter(
    img => img.category === 'ACCESS' || img.subCategory === '現地案内図' || img.subCategory === '周辺地図'
  );

  const scorePhoto = (img: ExtractedImage) => {
    const pixels = Math.max(1, (img.width || 0) * (img.height || 0));
    const confidenceScore = img.confidence === 'high' ? 3 : img.confidence === 'medium' ? 2 : 1;
    return Math.log10(pixels + 1) + confidenceScore;
  };

  // 1. 実写の建物外観 (PHOTO_EXTERIOR)
  const realExteriorCandidates = photoImages
    .filter(img => {
      const text = `${img.subCategory || ''} ${img.label || ''}`;
      return /外観|建物全景|路面/.test(text) && !/パース|予想図|レンダリング/.test(text);
    })
    .sort((a, b) => scorePhoto(b) - scorePhoto(a));

  // 2. 外観パース・完成予想図 (PHOTO_EXTERIOR_RENDER)
  const exteriorRenderCandidates = photoImages
    .filter(img => {
      const text = `${img.subCategory || ''} ${img.label || ''}`;
      return /外観パース|パース|完成予想図/.test(text) && !/内観/.test(text);
    })
    .sort((a, b) => scorePhoto(b) - scorePhoto(a));

  // 3. 店舗ファサード
  const facadeCandidates = photoImages
    .filter(img => {
      const text = `${img.subCategory || ''} ${img.label || ''}`;
      return /ファサード|店舗外観/.test(text);
    })
    .sort((a, b) => scorePhoto(b) - scorePhoto(a));

  // 4. 入口・エントランス (PHOTO_ENTRANCE)
  const entranceCandidates = photoImages
    .filter(img => {
      const text = `${img.subCategory || ''} ${img.label || ''}`;
      return /エントランス|入口|共用部/.test(text) && !/外観|パース|ファサード/.test(text);
    })
    .sort((a, b) => scorePhoto(b) - scorePhoto(a));

  // 5. 室内・内観 (PHOTO_INTERIOR)
  const interiorCandidates = photoImages
    .filter(img => {
      const text = `${img.subCategory || ''} ${img.label || ''}`;
      return /内観|室内|店舗内/.test(text) && !/外観|パース|ファサード/.test(text);
    })
    .sort((a, b) => scorePhoto(b) - scorePhoto(a));

  const allPhotoCandidates = [...photoImages].sort((a, b) => scorePhoto(b) - scorePhoto(a));

  // 厳格なメイン画像選定：外観または外観パースがある場合は、エントランスや内観は絶対にメインにしない
  const mainCandidate =
    realExteriorCandidates[0] ||
    exteriorRenderCandidates[0] ||
    facadeCandidates[0] ||
    entranceCandidates[0] ||
    interiorCandidates[0] ||
    allPhotoCandidates[0];

  const main = mainCandidate?.dataUrl || '';

  const floorPlanCandidate = planImages[0];
  const floorPlan = floorPlanCandidate?.dataUrl || '';

  const mapCandidate = mapImages[0];
  const map = mapCandidate?.dataUrl || '';

  const maxSubPhotos = format === 'JS-A' ? 4 : 6;
  const subPhotoCandidates = allPhotoCandidates
    .filter(img => img.id !== mainCandidate?.id)
    .slice(0, maxSubPhotos);
  const subPhotos = subPhotoCandidates.map(img => img.dataUrl);

  const classifiedList = classifiedImages.map(img => {
    let assignedSlot: ExtractedImage['assignedSlot'] = 'none';
    if (img.id === mainCandidate?.id) assignedSlot = 'main';
    else if (img.id === floorPlanCandidate?.id) assignedSlot = 'floorPlan';
    else if (img.id === mapCandidate?.id) assignedSlot = 'map';
    else if (subPhotoCandidates.some(sp => sp.id === img.id)) assignedSlot = 'photo';
    return { ...img, assignedSlot };
  });

  const allExtracted = classifiedImages.map(img => img.dataUrl).filter(Boolean);

  return {
    main,
    floorPlan,
    map,
    subPhotos,
    allExtracted,
    classifiedList,
    mainImage: mainCandidate,
    floorPlanImage: floorPlanCandidate,
    mapImage: mapCandidate,
    subPhotoImages: subPhotoCandidates,
  };
}

/**
 * 抽出された全画像素材をZIPアーカイブとして一括ダウンロード
 */
export async function downloadExtractedImagesZip(
  propertyName: string,
  classifiedImages: ExtractedImage[],
  dateStr: string
): Promise<void> {
  if (!classifiedImages || classifiedImages.length === 0) {
    if (typeof window !== 'undefined') {
      alert("ダウンロード可能な抽出画像がありません。");
    }
    return;
  }

  const zip = new JSZip();
  const cleanPropertyName = (propertyName || '物件').replace(/[\\/:*?"<>|]/g, '_');
  const folderName = `${cleanPropertyName}_画像素材_${dateStr}`;
  const folder = zip.folder(folderName) || zip;

  classifiedImages.forEach((img, idx) => {
    const filename = img.suggestedFilename || `${String(idx + 1).padStart(2, '0')}_${img.subCategory || '素材'}.jpg`;
    const base64Data = (img.dataUrl || '').replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    if (base64Data) {
      folder.file(filename, base64Data, { base64: true });
    }
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
 * マイソク見本ファイル（PDFまたは画像）を解析用の画像データURLとテキスト情報に変換
 */
export async function prepareSampleFormatForAnalysis(file: File): Promise<{
  previewDataUrl: string;
  mimeType: string;
  pdfText: string;
  fileName: string;
}> {
  const fileName = file.name;
  const isPdf = file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    // 画像ファイルの場合 (PNG, JPEG, WebP)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const previewDataUrl = reader.result as string;
        resolve({
          previewDataUrl,
          mimeType: file.type || 'image/jpeg',
          pdfText: '',
          fileName,
        });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  // PDFファイルの場合: 1ページ目をレンダリング
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument({ url: dataUrl });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        // テキスト抽出
        let pdfText = '';
        try {
          const textContent = await page.getTextContent();
          pdfText = (textContent.items || []).map((it: any) => it.str || '').filter(Boolean).join(' ');
        } catch (e) {
          console.warn("Sample PDF text extraction error", e);
        }

        // 高解像度レンダリング (scale 1.5)
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2Dコンテキストが取得できませんでした');

        await (page.render as any)({ canvasContext: ctx, viewport, canvas }).promise;
        const previewDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        resolve({
          previewDataUrl,
          mimeType: 'image/jpeg',
          pdfText,
          fileName,
        });
      } catch (err) {
        console.error("Failed to render PDF page 1 for sample analysis", err);
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
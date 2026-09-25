'use client';

import React, { useEffect, useState, useRef } from 'react';
import { AppState, PropertyData, ExtractedImage, ImageCategory, CoverImageSettings, FloorPlanAsset, PropertyUnit } from '@/types';
import { extractAndClassifyImagesFromPdf, extractPdfTextAndRenderPages } from '@/utils/pdf';
import { generateMapImages } from '@/utils/maps';
import { cropVisualElementsFromSource } from '@/utils/imageCropper';
import { Loader2, CheckCircle, AlertTriangle, RefreshCw, Layers } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  files: { file: File; dataUrl: string }[];
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onNext: () => void;
}

interface ApiFilePayload {
  mimeType: string;
  data: string;
}

interface RenderedPdfPage {
  fileName: string;
  pageNumber: number;
  mimeType: string;
  dataUrl: string;
  pageText?: string;
}

const MAX_BATCH_BASE64_SIZE = 3.5 * 1024 * 1024;

const normalizeUnitName = (value: any): string =>
  String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[（）()]/g, '')
    .replace(/[‐-‒–—―ー]/g, '-')
    .replace(/\s+/g, '');

const normalizeFloor = (value: any): string => {
  if (!value) return '';
  const str = String(value).normalize('NFKC').toUpperCase().replace(/\s+/g, '');
  const match = str.match(/(B?\d+)F?/);
  return match ? `${match[1]}F` : str;
};

const normalizePlanVariant = (value: any): '2分割' | '3分割' | 'standard' => {
  const str = String(value || '').normalize('NFKC').toUpperCase();
  if (str.includes('2分割') || str.includes('2区画') || str.includes('2-SPLIT') || str.includes('2SPLIT') || str.includes('2-PART')) return '2分割';
  if (str.includes('3分割') || str.includes('3区画') || str.includes('3-SPLIT') || str.includes('3SPLIT') || str.includes('3-PART')) return '3分割';
  return 'standard';
};

const getSourcePageNumber = (value: any): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const extractFloorFromText = (text: string): string => {
  if (!text) return '';
  const normalized = text.normalize('NFKC').toUpperCase();
  const match = normalized.match(/(B\d+|\d+)\s*F\b/) || normalized.match(/(B\d+|\d+)階/);
  return match ? `${match[1]}F` : '';
};

const getImageContext = (img: ExtractedImage): string =>
  [img.label, img.pageTitle, img.subCategory, img.reason, img.notes].filter(Boolean).join(' ');

const detectPreferredPlanVariantForUnit = (unit: any): '2分割' | '3分割' | null => {
  const name = normalizeUnitName(unit?.unitName || unit?.unitId);
  if (/^(北|南|2F-?北|2F-?南|A区画|B区画|NORTH|SOUTH)$/.test(name)) return '2分割';
  if (/^(201|202|203|C区画)$/.test(name)) return '3分割';
  return null;
};

const isContractedUnit = (unit: any): boolean => {
  const target = [
    unit?.status,
    unit?.currentStatus,
    unit?.unitName,
    unit?.handoverCondition,
    unit?.contractType,
    unit?.notes,
  ]
    .filter(Boolean)
    .map((v: any) => String(v).normalize('NFKC').toUpperCase())
    .join(' ');

  return /契約済|成約済|申込済|CLOSED|CONTRACTED|LEASED|終了/.test(target);
};

const mergeObjectPreferExisting = (base: any, incoming: any): any => {
  if (!base) return incoming;
  if (!incoming) return base;
  const result: any = { ...base };

  for (const key of Object.keys(incoming)) {
    const bVal = base[key];
    const iVal = incoming[key];

    const isBaseEmpty =
      bVal === null ||
      bVal === undefined ||
      (typeof bVal === 'string' && bVal.trim() === '') ||
      (Array.isArray(bVal) && bVal.length === 0);

    if (isBaseEmpty) {
      result[key] = iVal;
    } else if (
      typeof bVal === 'object' &&
      !Array.isArray(bVal) &&
      typeof iVal === 'object' &&
      !Array.isArray(iVal)
    ) {
      result[key] = mergeObjectPreferExisting(bVal, iVal);
    }
  }
  return result;
};

const mergeArrayUnique = <T,>(base: T[] = [], incoming: T[] = []): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];

  [...base, ...incoming].forEach(item => {
    const key = typeof item === 'object' ? JSON.stringify(item) : String(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  });

  return out;
};

function getUnitContractStateFromSourceText(
  unit: any,
  sourceText: string
): 'contracted' | 'available' | 'unknown' {
  if (!sourceText || !unit) return 'unknown';

  const normalize = (value: string) =>
    String(value || '')
      .replace(/[（）()]/g, '')
      .replace(/[‐-‒–—―ー]/g, '-')
      .replace(/\s+/g, '')
      .toUpperCase();

  const unitId = normalize(unit.unitId || '');
  const floor = normalize(unit.floor || '');
  const unitName = normalize(unit.unitName || '');

  const areaTsubo =
    unit.areaTsubo !== null &&
    unit.areaTsubo !== undefined &&
    unit.areaTsubo !== ''
      ? Number(unit.areaTsubo)
      : null;

  // PDF抽出テキストを「行」単位に分ける
  const lines = sourceText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const candidateLines = lines.filter(line => {
    const normalizedLine = normalize(line);

    // 区画名称候補
    const labels = [
      unitId,
      unitName ? `${floor}${unitName}` : '',
      floor && !unitName ? floor : '',
    ].filter(Boolean);

    const labelMatched = labels.some(label => {
      // 2F が 2F北 / 2F南 に誤ヒットしないようにする
      if (label === '2F') {
        return (
          normalizedLine.startsWith('2F') &&
          !normalizedLine.startsWith('2F北') &&
          !normalizedLine.startsWith('2F南') &&
          !normalizedLine.startsWith('2F-北') &&
          !normalizedLine.startsWith('2F-南')
        );
      }

      if (label === 'B1F') {
        return (
          normalizedLine.startsWith('B1F') &&
          !normalizedLine.startsWith('B1FB1-1') &&
          !normalizedLine.startsWith('B1FB1-2')
        );
      }

      return normalizedLine.includes(label);
    });

    if (!labelMatched) return false;

    // 面積が取れている場合はさらに一致確認
    if (areaTsubo !== null && Number.isFinite(areaTsubo)) {
      const areaCandidates = [
        areaTsubo.toFixed(2),
        String(areaTsubo),
      ];

      const hasArea = areaCandidates.some(area =>
        normalizedLine.includes(normalize(area))
      );

      return hasArea || labelMatched;
    }

    return true;
  });

  if (candidateLines.length === 0) {
    return 'unknown';
  }

  // 「同じ行」に契約済が書いてある場合だけ contracted
  const contractedLine = candidateLines.find(line =>
    /契約済|成約済|申込済|募集終了/.test(line)
  );

  if (contractedLine) {
    return 'contracted';
  }

  // 同じ行に賃料や募集条件があれば募集中と判断
  const availableLine = candidateLines.find(line =>
    /円|募集中|分割可|重飲食可|相談可/.test(line)
  );

  if (availableLine) {
    return 'available';
  }

  return 'unknown';
}

const isPlanApplicableToUnit = (plan: any, unit: any): boolean => {
  const unitFloor = normalizeFloor(unit?.floor || unit?.unitId);
  const planFloor = normalizeFloor(plan?.floor || plan?.caption);
  if (!unitFloor || !planFloor || unitFloor !== planFloor) return false;

  const preferredVariant = detectPreferredPlanVariantForUnit(unit);
  const planVariant = normalizePlanVariant(plan?.variant || plan?.caption || plan?.unitName);

  // 親区画（例: 2F全体）は同フロアの複数案をすべて関連図面として持てる。
  if (!preferredVariant) return true;

  // 子区画は対応する分割案だけを関連図面にする。
  if (planVariant === 'standard') return true;
  return planVariant === preferredVariant;
};

const sortPlansBySourcePage = (plans: any[]): any[] =>
  [...plans].sort((a, b) => {
    const aPage = getSourcePageNumber(a?.sourcePage) ?? Number.MAX_SAFE_INTEGER;
    const bPage = getSourcePageNumber(b?.sourcePage) ?? Number.MAX_SAFE_INTEGER;
    return aPage - bPage;
  });

/**
 * units の一意判定
 * floor + unitName + areaTsubo を組み合わせて、2F / 2F北 / 2F南 や B1F / B1-1 / B1-2 を別unitとして独立保持
 */
const mergeUnits = (base: any[] = [], incoming: any[] = []): any[] => {
  const out = [...base];
  incoming.forEach(unit => {
    const floor = normalizeFloor(unit?.floor || unit?.unitId);
    const unitName = normalizeUnitName(unit?.unitName);
    const unitId = normalizeUnitName(unit?.unitId);
    const areaTsubo = unit?.areaTsubo != null ? Number(unit.areaTsubo).toFixed(2) : '';

    const idx = out.findIndex(existing => {
      const existingId = normalizeUnitName(existing?.unitId);
      const existingFloor = normalizeFloor(existing?.floor || existing?.unitId);
      const existingUnitName = normalizeUnitName(existing?.unitName);
      const existingArea = existing?.areaTsubo != null ? Number(existing.areaTsubo).toFixed(2) : '';

      if (unitId && existingId && unitId === existingId) return true;
      if (floor && existingFloor === floor && unitName === existingUnitName) {
        if (areaTsubo && existingArea && areaTsubo !== existingArea) return false;
        return true;
      }
      return false;
    });

    if (idx >= 0) out[idx] = mergeObjectPreferExisting(out[idx], unit);
    else out.push(unit);
  });
  return out;
};

const mergePlans = (base: any[] = [], incoming: any[] = []): any[] => {
  const out = [...base];
  incoming.forEach(plan => {
    const floor = normalizeFloor(plan?.floor || plan?.caption);
    const unitName = normalizeUnitName(plan?.unitName);
    const assetId = normalizeUnitName(plan?.assetId);
    const variant = normalizePlanVariant(plan?.variant || plan?.caption || plan?.unitName);
    const sourcePage = getSourcePageNumber(plan?.sourcePage);

    const idx = out.findIndex(existing => {
      const existingAssetId = normalizeUnitName(existing?.assetId);
      if (assetId && existingAssetId && assetId === existingAssetId) return true;

      const sameFloor = floor && normalizeFloor(existing?.floor || existing?.caption) === floor;
      const sameUnit = normalizeUnitName(existing?.unitName) === unitName;
      const sameVariant = normalizePlanVariant(existing?.variant || existing?.caption || existing?.unitName) === variant;
      const existingPage = getSourcePageNumber(existing?.sourcePage);

      // 2Fの「2分割」「3分割」のような別案は絶対に同一planへ潰さない
      if (!sameFloor || !sameUnit || !sameVariant) return false;
      if (sourcePage !== null && existingPage !== null) return sourcePage === existingPage;
      return sourcePage === null && existingPage === null;
    });

    if (idx >= 0) out[idx] = mergeObjectPreferExisting(out[idx], plan);
    else out.push(plan);
  });
  return out;
};

const mergeExtractionData = (base: any, incoming: any): any => {
  if (!base) return incoming;
  if (!incoming) return base;

  const merged = mergeObjectPreferExisting(base, incoming);
  merged.units = mergeUnits(base.units || [], incoming.units || []);
  merged.plans = mergePlans(base.plans || [], incoming.plans || []);
  merged.visualElements = mergeArrayUnique(base.visualElements || [], incoming.visualElements || []);
  merged.leasePatterns = mergeArrayUnique(base.leasePatterns || [], incoming.leasePatterns || []);
  merged.equipment = mergeArrayUnique(base.equipment || [], incoming.equipment || []);
  merged.conditions = mergeArrayUnique(base.conditions || [], incoming.conditions || []);
  return merged;
};

const buildApiBatches = (apiFiles: ApiFilePayload[]): ApiFilePayload[][] => {
  if (apiFiles.length === 0) return [[]];

  const batches: ApiFilePayload[][] = [];
  let current: ApiFilePayload[] = [];
  let currentSize = 0;

  apiFiles.forEach(item => {
    const itemSize = (item.data || '').length;

    if (current.length > 0 && currentSize + itemSize > MAX_BATCH_BASE64_SIZE) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(item);
    currentSize += itemSize;

    if (itemSize > MAX_BATCH_BASE64_SIZE) {
      console.warn('[Step2Extracting] A single page/file exceeds the recommended batch size. It will be sent alone.');
      batches.push(current);
      current = [];
      currentSize = 0;
    }
  });

  if (current.length > 0) batches.push(current);
  return batches.length > 0 ? batches : [[]];
};

export default function Step2Extracting({ files, appState, setAppState, onNext }: Props) {
  const [loading, setLoading] = useState(false);
  const [extractStatus, setExtractStatus] = useState<string>('元資料の解析を開始しています...');
  const [extractedList, setExtractedList] = useState<ExtractedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDailyQuotaError, setIsDailyQuotaError] = useState(false);
  const [success, setSuccess] = useState(false);

  const isExtractingRef = useRef<boolean>(false);
  const lastProcessedSig = useRef<string>('');

  const currentFilesSig = files.map(f => `${f.file.name}_${f.file.size}`).join('|');

  const executeExtraction = async (force: boolean = false) => {
    if (files.length === 0) return;

    if (isExtractingRef.current) {
      console.log("[Step2Extracting] Extraction is already in progress, skipping duplicate call.");
      return;
    }

    if (!force && appState.data && lastProcessedSig.current === currentFilesSig) {
      console.log("[Step2Extracting] Reusing existing extraction data for document:", currentFilesSig);
      setSuccess(true);
      if (appState.extractedImages && appState.extractedImages.length > 0) {
        setExtractedList(appState.extractedImages);
      }
      return;
    }

    isExtractingRef.current = true;
    setLoading(true);
    setError(null);
    setIsDailyQuotaError(false);
    setSuccess(false);

    try {
      setExtractStatus('資料データを解析用に最適化中（PDFテキスト抽出・全ページ高精細展開）...');

      const apiFiles: { mimeType: string; data: string }[] = [];
      const renderedPdfPages: RenderedPdfPage[] = [];
      let combinedPdfText = '';

      for (const f of files) {
        const isPdf = f.file.type === 'application/pdf' || f.file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          try {
            const { fullText, pageImages } = await extractPdfTextAndRenderPages(f.dataUrl, 20);
            if (fullText) {
              combinedPdfText += `\n【資料ファイル: ${f.file.name}】\n` + fullText;
            }
            if (pageImages.length > 0) {
              pageImages.forEach((pageImage: any, pageIndex: number) => {
                const mimeType = pageImage.mimeType || 'image/jpeg';
                const pageNumber = Number(pageImage.pageNumber) > 0 ? Number(pageImage.pageNumber) : pageIndex + 1;
                renderedPdfPages.push({
                  fileName: f.file.name,
                  pageNumber,
                  mimeType,
                  dataUrl: `data:${mimeType};base64,${pageImage.data}`,
                  pageText: pageImage.pageText || '',
                });
              });
              apiFiles.push(...pageImages);
            } else {
              apiFiles.push({
                mimeType: 'application/pdf',
                data: f.dataUrl.split(',')[1]
              });
            }
          } catch (pdfErr) {
            console.warn("PDF pre-processing fallback", pdfErr);
            apiFiles.push({
              mimeType: 'application/pdf',
              data: f.dataUrl.split(',')[1]
            });
          }
        } else {
          const mime = f.file.type || (f.file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
          apiFiles.push({
            mimeType: mime,
            data: f.dataUrl.split(',')[1]
          });
        }
      }

      setExtractStatus('AI（Gemini）による募集条件・フロア区画・平面図構造の解析中...');
      const batches = buildApiBatches(apiFiles);
      let aggregatedData: any = null;

      for (let i = 0; i < batches.length; i++) {
        const batchFiles = batches[i];
        if (batches.length > 1) {
          setExtractStatus(`AI解析を実行中（バッチ ${i + 1}/${batches.length}）...`);
        }

        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: batchFiles,
            extractedText: combinedPdfText,
            forceRefresh: force
          })
        });

        const json = await res.json();
        if (!json.success) {
          if (json.isDailyQuota) setIsDailyQuotaError(true);
          throw new Error(json.error || 'AI解析に失敗しました。');
        }

        const partialData = json.data || json;
        aggregatedData = mergeExtractionData(aggregatedData, partialData);
      }

      const data = aggregatedData;
      if (data) {
        setExtractStatus('画像素材の高精度分類とスロット割り当てを実行中...');

        const allClassifiedImages: ExtractedImage[] = [];

        // 1. PDF内部の埋め込み画像抽出（全ページ対応）
        for (const f of files) {
          const isPdf = f.file.type === 'application/pdf' || f.file.name.toLowerCase().endsWith('.pdf');
          if (isPdf) {
            try {
              const images = await extractAndClassifyImagesFromPdf(f.dataUrl);
              allClassifiedImages.push(...images);
            } catch (e) {
              console.warn("PDF direct image extraction warning", e);
            }
          }
        }

        const hasPhoto = allClassifiedImages.some(img => img.category === 'PHOTO' || img.subCategory.includes('外観') || img.subCategory.includes('内観'));
        const hasMap = allClassifiedImages.some(img => img.category === 'ACCESS' || img.subCategory.includes('案内') || img.subCategory.includes('地図'));
        const embeddedPlanCount = allClassifiedImages.filter(img => img.category === 'PLAN' || img.subCategory === '平面図').length;
        const expectedPlanCount = Math.max(
          Array.isArray(data.plans) ? data.plans.length : 0,
          Array.isArray(data.units) ? data.units.length : 0,
          0
        );
        const needsAdditionalPlans = expectedPlanCount > 0 && embeddedPlanCount < expectedPlanCount;

        // 2. 不足しているカテゴリをAI領域認識（クロップ）で補完
        if ((needsAdditionalPlans || !hasPhoto || !hasMap) && data.visualElements && Array.isArray(data.visualElements) && data.visualElements.length > 0) {
          setExtractStatus('未検出素材の補完のため、AI視覚領域切り出しを実行中...');
          try {
            const filteredDetections = data.visualElements.filter((d: any) => {
              const cat = (d.category || '').toUpperCase();
              const sub = (d.subCategory || '').toLowerCase();
              if (cat.includes('PLAN') || sub.includes('平面') || sub.includes('区画図') || sub.includes('フロア図')) {
                return needsAdditionalPlans;
              }
              if (cat.includes('ACCESS') || sub.includes('案内') || sub.includes('地図')) return !hasMap;
              return !hasPhoto;
            });

            if (filteredDetections.length > 0) {
              const croppedElements = await cropVisualElementsFromSource(files, filteredDetections);
              allClassifiedImages.push(...croppedElements);
            }
          } catch (cropErr) {
            console.warn('Visual elements crop fallback warning', cropErr);
          }
        }

        // 3. ユーザーが直接カメラ写真等の画像ファイルをアップロードした場合
        const directImageFiles = files.filter(f => f.file.type.startsWith('image/'));
        if (allClassifiedImages.length === 0 && directImageFiles.length > 0) {
          directImageFiles.forEach((imgFile, index) => {
            const itemIndex = String(allClassifiedImages.length + 1).padStart(2, '0');
            const fnameLower = (imgFile.file.name || '').toLowerCase();
            let subCat = '外観';
            let label = '建物外観写真';

            if (fnameLower.includes('内観') || fnameLower.includes('interior') || fnameLower.includes('店舗') || fnameLower.includes('室内')) {
              subCat = '内観';
              label = `店舗・区画内観写真 ${index + 1}`;
            } else if (fnameLower.includes('平面') || fnameLower.includes('間取') || fnameLower.includes('plan') || fnameLower.includes('図面')) {
              subCat = '平面図';
              label = '区画平面図・間取図';
            } else if (fnameLower.includes('地図') || fnameLower.includes('map') || fnameLower.includes('案内')) {
              subCat = '案内図';
              label = '現地案内図・アクセスマップ';
            } else if (index > 0) {
              subCat = '外観';
              label = `物件写真 ${index + 1}`;
            }

            allClassifiedImages.push({
              id: `direct_${Date.now()}_${index}`,
              dataUrl: imgFile.dataUrl,
              category: (subCat === '平面図' ? 'PLAN' : subCat === '案内図' ? 'ACCESS' : 'PHOTO') as ExtractedImage['category'],
              subCategory: subCat,
              label: label,
              confidence: 'medium',
              isEmbedded: false,
              isExcludedFromPhoto: subCat === '平面図' || subCat === '案内図',
              suggestedFilename: `${itemIndex}_${subCat}.jpg`,
            });
          });
        }

        const assignedSlots = assignSlotByFormat(allClassifiedImages, appState.format);
        const finalizedClassifiedImages = assignedSlots.classifiedList;

        setExtractedList(finalizedClassifiedImages);

        // 地図画像生成
        const propName = data.property?.name || '対象物件';
        const propAddr = data.property?.address || '';
        const propAccess = data.property?.access || '';
        let mapRes = { wideMapUrl: '', detailMapUrl: '', isConfirmed: false, method: 'none' };
        try {
          mapRes = await generateMapImages(propName, propAddr, propAccess);
        } catch (mErr) {
          console.warn("Pre map generation warning", mErr);
        }

        // 初期フィールド検証ステータス
        const initialFieldStatus: Record<string, 'confirmed' | 'needs_review' | 'not_in_source'> = {};
        const checkField = (key: string, val: any) => {
          const isEmpty = val === null || val === undefined || (typeof val === 'string' && val.trim() === '') || (Array.isArray(val) && val.length === 0);
          initialFieldStatus[key] = isEmpty ? 'needs_review' : 'confirmed';
        };

        checkField('property.name', data.property?.name);
        checkField('property.address', data.property?.address);
        checkField('property.access', data.property?.access);
        checkField('property.usage', data.property?.usage);
        checkField('property.floor', data.property?.floor);
        checkField('property.room', data.property?.room);
        checkField('property.currentStatus', data.property?.currentStatus);
        checkField('property.handoverTiming', data.property?.handoverTiming);
        checkField('property.handoverStatus', data.property?.handoverStatus);
        checkField('area.sqm', data.area?.sqm);
        checkField('area.tsubo', data.area?.tsubo);
        checkField('rent.amount', data.rent?.amount);
        checkField('rent.tsuboPrice', data.rent?.tsuboPrice);
        checkField('commonFee.amount', data.commonFee?.amount);
        checkField('commonFee.tsuboPrice', data.commonFee?.tsuboPrice);
        checkField('deposit', data.deposit);
        checkField('keyMoney', data.keyMoney);
        checkField('depreciation', data.depreciation);
        checkField('contract', data.contract);
        checkField('building.structure', data.building?.structure);
        checkField('building.scale', data.building?.scale);
        checkField('building.builtYearMonth', data.building?.builtYearMonth);
        checkField('building.siteAreaSqm', data.building?.siteAreaSqm);
        checkField('building.totalFloorAreaSqm', data.building?.totalFloorAreaSqm);
        checkField('building.currentUsage', data.building?.currentUsage);
        checkField('building.constructionDates', data.building?.constructionDates);

        // ==========================================
        // 【最重要】平面図（plans）の完全復元・画像割り当て
        // ==========================================
        const planImages = finalizedClassifiedImages.filter(
          img => img.category === 'PLAN' || img.subCategory === '平面図' || img.assignedSlot?.startsWith('floorPlan')
        );

        const mergedPlans: FloorPlanAsset[] = (data.plans && data.plans.length > 0) ? [...data.plans] : [];

        // 1. AI視覚領域（visualElements）から平面図を復元
        const visualPlanElements = Array.isArray(data?.visualElements)
          ? data.visualElements.filter((d: any) => {
              const cat = String(d?.category || '').toUpperCase();
              const sub = String(d?.subCategory || '').normalize('NFKC').toUpperCase();
              const ctx = [d?.label, d?.title, d?.pageTitle, d?.text, d?.description, d?.floor, d?.unitName]
                .filter(Boolean).join(' ');
              const floorPlanLike = cat.includes('PLAN') || /平面|区画|FLOOR.?PLAN/.test(sub + ' ' + ctx.toUpperCase());
              const nonFloorDrawing = /立面|断面|ELEVATION|SECTION/.test(sub + ' ' + ctx.toUpperCase());
              return floorPlanLike && !nonFloorDrawing;
            })
          : [];

        visualPlanElements.forEach((det: any, detIndex: number) => {
          const sourcePage = getSourcePageNumber(det?.sourcePage ?? det?.page ?? det?.pageNumber);
          const context = [det?.label, det?.title, det?.pageTitle, det?.text, det?.description, det?.floor, det?.unitName]
            .filter(Boolean).join(' ');
          const floor = normalizeFloor(det?.floor || extractFloorFromText(context));
          const variant = normalizePlanVariant(det?.variant || context);
          const renderedPage = sourcePage !== null
            ? renderedPdfPages.find(page => page.pageNumber === sourcePage)
            : undefined;

          if (!sourcePage || !renderedPage) return;
          if (!floor && variant === 'standard') return;

          const exists = mergedPlans.some((plan: any) => {
            const samePage = getSourcePageNumber(plan?.sourcePage) === sourcePage;
            const sameFloor = !floor || normalizeFloor(plan?.floor || plan?.caption) === floor;
            const sameVariant = normalizePlanVariant(plan?.variant || plan?.caption || plan?.unitName) === variant;
            return samePage && sameFloor && sameVariant;
          });

          if (!exists) {
            mergedPlans.push({
              assetId: `plan_${floor || 'UNKNOWN'}_${variant === 'standard' ? 'STD' : variant}_${sourcePage}_${detIndex + 1}`,
              floor,
              unitName: det?.unitName || '',
              variant,
              areaTsubo: det?.areaTsubo ?? null,
              areaSqm: det?.areaSqm ?? null,
              sourcePage,
              imagePath: renderedPage.dataUrl,
              imageSource: 'rendered_pdf_page',
              caption: det?.label || det?.title || `${floor || ''} ${variant !== 'standard' ? variant : ''} 平面図`.trim(),
              matchedUnitId: null,
              appliesToUnitIds: [],
              confidence: floor ? 'high' : 'medium',
              isOutputTarget: true,
            });
          }
        });

        // 2. PDF各ページのテキストを直接走査し、ベクター平面図ページを確実に補完（立面図・断面図は除外）
        renderedPdfPages.forEach(page => {
          const pageText = page.pageText || '';
          if (!pageText) return;

          const norm = pageText.normalize('NFKC').toUpperCase().replace(/\s+/g, ' ');

          // 立面図・断面図・概要図の除外
          if (/立面|断面|ELEVATION|SECTION/.test(norm)) return;

          const hasPlanKeyword = /平面|区画|FLOOR.?PLAN|間取/.test(norm);

          // B1F平面図（43.50坪 / B1-1 / B1-2 等）
          const isB1F = /B1F|地下1階|B1-1|B1-2/.test(norm) && (hasPlanKeyword || /43\.50|26\.51|17\.00/.test(norm));
          // 1F平面図（48.57坪 等）
          const is1F = (norm.includes('1F') || norm.includes('1階')) && !norm.includes('B1F') && (hasPlanKeyword || /48\.57/.test(norm));
          // 2F 2分割平面図（23.58坪 / 21.19坪 / 2F北 / 2F南 等）
          const is2F_2split = (norm.includes('2F') || norm.includes('2階')) && (/2分割|2区画/.test(norm) || /2F北|2F南|23\.58|21\.19/.test(norm));
          // 2F 3分割平面図（201 / 202 / 203 / 16.97坪 / 13.71坪 / 14.09坪 等）
          const is2F_3split = (norm.includes('2F') || norm.includes('2階')) && (/3分割|3区画/.test(norm) || /201|202|203|16\.97|13\.71|14\.09/.test(norm));

          let detectedFloor = '';
          let detectedVariant: '2分割' | '3分割' | 'standard' = 'standard';
          let detectedCaption = '';

          if (isB1F) {
            detectedFloor = 'B1F';
            detectedVariant = '2分割';
            detectedCaption = 'B1F 平面図';
          } else if (is1F) {
            detectedFloor = '1F';
            detectedVariant = 'standard';
            detectedCaption = '1F 平面図';
          } else if (is2F_3split) {
            detectedFloor = '2F';
            detectedVariant = '3分割';
            detectedCaption = '2F 3分割平面図';
          } else if (is2F_2split) {
            detectedFloor = '2F';
            detectedVariant = '2分割';
            detectedCaption = '2F 2分割平面図';
          } else if (hasPlanKeyword) {
            detectedFloor = extractFloorFromText(pageText);
            detectedVariant = normalizePlanVariant(pageText);
            detectedCaption = `${detectedFloor || ''} 平面図`.trim();
          }

          if (detectedFloor) {
            const exists = mergedPlans.some(p => {
              const samePage = p.sourcePage === page.pageNumber;
              const sameFloor = normalizeFloor(p.floor) === detectedFloor;
              const sameVariant = normalizePlanVariant(p.variant || p.caption) === detectedVariant;
              return samePage || (sameFloor && sameVariant && !!p.imagePath);
            });

            if (!exists) {
              mergedPlans.push({
                assetId: `plan_${detectedFloor}_${detectedVariant}_page_${page.pageNumber}`,
                floor: detectedFloor,
                variant: detectedVariant,
                sourcePage: page.pageNumber,
                imagePath: page.dataUrl,
                imageSource: 'rendered_pdf_page',
                caption: detectedCaption || `${detectedFloor} 平面図`,
                matchedUnitId: null,
                appliesToUnitIds: [],
                confidence: 'high',
                isOutputTarget: true,
              });
            } else {
              // 既にplanがあるがimagePathが空の場合、このレンダリング画像を割り当て
              mergedPlans.forEach(p => {
                if (p.sourcePage === page.pageNumber && !p.imagePath) {
                  p.imagePath = page.dataUrl;
                  p.imageSource = 'rendered_pdf_page';
                }
              });
            }
          }
        });

        // 3. sourcePageが明示されたplanにレンダリング画像を割り当て
        mergedPlans.forEach((plan: any) => {
          plan.floor = normalizeFloor(plan.floor || plan.caption) || plan.floor || '';
          plan.variant = normalizePlanVariant(plan.variant || plan.caption || plan.unitName);
          plan.appliesToUnitIds = Array.isArray(plan.appliesToUnitIds) ? plan.appliesToUnitIds : [];
          if (plan.isOutputTarget === undefined) plan.isOutputTarget = true;

          if (plan.imagePath) return;

          const sourcePage = getSourcePageNumber(plan.sourcePage);
          if (sourcePage !== null) {
            const renderedPage = renderedPdfPages.find(page => page.pageNumber === sourcePage);
            if (renderedPage) {
              plan.imagePath = renderedPage.dataUrl;
              plan.imageSource = 'rendered_pdf_page';
            }
          }
        });

        // 4. sourcePageで取得できなかった場合のみ、分類済み画像から照合
        if (mergedPlans.length > 0 && planImages.length > 0) {
          const usedImageIds = new Set<string>();

          mergedPlans.forEach((plan: any) => {
            if (plan.imagePath) return;

            const planFloor = normalizeFloor(plan.floor);
            const planUnitName = normalizeUnitName(plan.unitName);
            const planVariant = normalizePlanVariant(plan.variant || plan.caption || plan.unitName);
            const planSourcePage = getSourcePageNumber(plan.sourcePage);

            let candidates = planImages.filter(img => !usedImageIds.has(img.id));

            if (planSourcePage !== null) {
              candidates = candidates.filter(img => getSourcePageNumber((img as any).sourcePage) === planSourcePage);
            }

            if (planFloor) {
              candidates = candidates.filter(img => extractFloorFromText(getImageContext(img)) === planFloor);
            }

            if (planVariant !== 'standard') {
              const byVariant = candidates.filter(img => normalizePlanVariant(getImageContext(img)) === planVariant);
              if (byVariant.length > 0) candidates = byVariant;
            }

            if (planUnitName && candidates.length > 1) {
              const byUnitName = candidates.filter(img => normalizeUnitName(getImageContext(img)).includes(planUnitName));
              if (byUnitName.length > 0) candidates = byUnitName;
            }

            let matchedImg: ExtractedImage | undefined;
            if (candidates.length === 1) {
              matchedImg = candidates[0];
            } else if (mergedPlans.length === 1 && planImages.length === 1) {
              matchedImg = planImages[0];
            }

            if (matchedImg) {
              plan.imagePath = matchedImg.dataUrl;
              plan.imageSource = 'classified_image';
              usedImageIds.add(matchedImg.id);
            }
          });
        }

        // plan 共通フィールドの正規化
        mergedPlans.forEach((plan: any, idx: number) => {
          plan.assetId = plan.assetId || `plan_${normalizeFloor(plan.floor) || 'UNKNOWN'}_${normalizePlanVariant(plan.variant || plan.caption)}_${getSourcePageNumber(plan.sourcePage) || idx + 1}`;
          plan.floor = normalizeFloor(plan.floor || plan.caption) || plan.floor || '';
          plan.variant = normalizePlanVariant(plan.variant || plan.caption || plan.unitName);
          plan.appliesToUnitIds = Array.isArray(plan.appliesToUnitIds) ? plan.appliesToUnitIds : [];
          if (plan.isOutputTarget === undefined) plan.isOutputTarget = true;
        });

        // ==========================================
        // 【units】の正規化・契約済判定・平面図紐付け
        // ==========================================
        const mergedUnits: PropertyUnit[] = (data.units && data.units.length > 0) ? [...data.units] : [{
          unitId: (data.property?.floor || '1F').trim() || '1F',
          floor: (data.property?.floor || '1F').trim() || '1F',
          unitName: (data.property?.room || '').trim(),
          areaSqm: data.area?.sqm ?? null,
          areaTsubo: data.area?.tsubo ?? null,
          rent: data.rent?.amount ?? null,
          rentTsuboPrice: data.rent?.tsuboPrice ?? null,
          commonFee: data.commonFee?.amount ?? null,
          commonFeeTsuboPrice: data.commonFee?.tsuboPrice ?? null,
          deposit: data.deposit || '',
          keyMoney: data.keyMoney || '',
          contractType: data.contract || '',
          handoverCondition: data.property?.handoverStatus || '',
          handoverDate: data.property?.handoverTiming || '',
          status: 'available',
          isOutputTarget: true,
          floorGroup: normalizeFloor(data.property?.floor || '1F') || '1F',
          primaryPlanAssetId: mergedPlans.length === 1 ? mergedPlans[0]?.assetId || null : null,
          relatedPlanAssetIds: mergedPlans.length === 1 ? [mergedPlans[0]?.assetId].filter(Boolean) : [],
          planAssetId: mergedPlans.length === 1 ? mergedPlans[0]?.assetId || null : null,
          linkStatus: mergedPlans.length === 1 && mergedPlans[0]?.imagePath ? 'linked' : 'needs_review',
        }];

        mergedUnits.forEach((unit: any) => {
          const unitFloor = normalizeFloor(unit.floor || unit.unitId);
          unit.floorGroup = unitFloor || unit.floorGroup || '';

          const sourceContractState = getUnitContractStateFromSourceText(unit, combinedPdfText);
          const contracted = sourceContractState === 'contracted' || (sourceContractState === 'unknown' && isContractedUnit(unit));

          if (contracted) {
            unit.status = 'contracted';
            unit.isOutputTarget = false;
          } else {
            if (sourceContractState === 'available') {
              unit.status = 'available';
              unit.isOutputTarget = true;
            } else if (unit.isOutputTarget === undefined) {
              unit.isOutputTarget = true;
            }
          }

          // 同一フロアかつ区画の分割パターンに適合する plan を「関連図面」として複数保持
          const applicablePlans = sortPlansBySourcePage(
            mergedPlans.filter((plan: any) => isPlanApplicableToUnit(plan, unit))
          );

          const relatedPlanAssetIds = applicablePlans
            .map((plan: any) => plan.assetId)
            .filter(Boolean);

          unit.relatedPlanAssetIds = Array.from(new Set([
            ...(Array.isArray(unit.relatedPlanAssetIds) ? unit.relatedPlanAssetIds : []),
            ...relatedPlanAssetIds,
          ]));

          const existingPrimaryId = unit.primaryPlanAssetId || unit.planAssetId;
          const existingPrimary = existingPrimaryId
            ? mergedPlans.find((plan: any) => plan.assetId === existingPrimaryId)
            : undefined;

          let primaryPlan: any | undefined;
          if (existingPrimary && existingPrimary.imagePath && isPlanApplicableToUnit(existingPrimary, unit)) {
            primaryPlan = existingPrimary;
          }

          const plansWithImage = applicablePlans.filter((plan: any) => !!plan.imagePath);
          const preferredVariant = detectPreferredPlanVariantForUnit(unit);

          if (!primaryPlan && preferredVariant) {
            const preferredPlans = sortPlansBySourcePage(
              plansWithImage.filter((plan: any) => normalizePlanVariant(plan.variant || plan.caption) === preferredVariant)
            );
            if (preferredPlans.length > 0) primaryPlan = preferredPlans[0];
          }

          if (!primaryPlan && !preferredVariant && plansWithImage.length > 0) {
            primaryPlan = sortPlansBySourcePage(plansWithImage)[0];
          }

          if (primaryPlan) {
            unit.primaryPlanAssetId = primaryPlan.assetId;
            unit.planAssetId = primaryPlan.assetId;
            unit.linkStatus = 'linked';
          } else if (unit.relatedPlanAssetIds.length > 0) {
            unit.primaryPlanAssetId = unit.relatedPlanAssetIds[0];
            unit.planAssetId = unit.relatedPlanAssetIds[0];
            unit.linkStatus = 'linked';
          } else {
            unit.linkStatus = 'needs_review';
          }
        });

        // plans 側の appliesToUnitIds を同期
        mergedPlans.forEach((plan: any) => {
          const matchedUnits = mergedUnits.filter((unit: any) => isPlanApplicableToUnit(plan, unit));
          plan.appliesToUnitIds = matchedUnits.map((u: any) => u.unitId).filter(Boolean);
        });

        // 最終 PropertyData の構築
        const finalPropertyData: PropertyData = {
          ...data,
          units: mergedUnits,
          plans: mergedPlans,
          fieldStatus: initialFieldStatus,
          maps: {
            ...data.maps,
            wideMapUrl: mapRes.wideMapUrl || data.maps?.wideMapUrl || '',
            detailMapUrl: mapRes.detailMapUrl || data.maps?.detailMapUrl || '',
            isConfirmed: mapRes.isConfirmed,
            method: mapRes.method,
          },
          images: {
            main: assignedSlots.main?.dataUrl || (data.images?.main || ''),
            floorPlan: assignedSlots.floorPlan?.dataUrl || (mergedPlans.find(p => !!p.imagePath)?.imagePath || data.images?.floorPlan || ''),
            map: mapRes.detailMapUrl || assignedSlots.map?.dataUrl || (data.images?.map || ''),
            detailMap: mapRes.detailMapUrl || '',
            subPhotos: assignedSlots.subPhotos.map(img => img.dataUrl),
            allExtracted: finalizedClassifiedImages.map(img => img.dataUrl),
            classifiedList: finalizedClassifiedImages,
          }
        };

        const initialCoverSettings: CoverImageSettings = {
          imageId: assignedSlots.main?.id,
          imageUrl: assignedSlots.main?.dataUrl,
          objectPositionX: 50,
          objectPositionY: 50,
          scale: 1.0,
          brightness: 100,
          contrast: 105,
          grayscale: 100,
        };

        setAppState(prev => ({
          ...prev,
          data: finalPropertyData,
          extractedImages: finalizedClassifiedImages,
          coverSettings: prev.coverSettings || initialCoverSettings,
        }));

        lastProcessedSig.current = currentFilesSig;
        setSuccess(true);
      }
    } catch (err: any) {
      console.error("[Step2Extracting Error]", err);
      const isQuota = err?.isDailyQuota || err?.status === 429;
      setIsDailyQuotaError(!!isQuota);
      setError(err?.message || 'データの抽出に失敗しました。');
    } finally {
      isExtractingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    executeExtraction(false);
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center relative overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative mb-6">
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Layers className="w-6 h-6 text-blue-400 opacity-60" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">資料を解析・画像展開中</h2>
            <p className="text-slate-600 max-w-lg mb-6">{extractStatus}</p>
            <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-600"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 15, ease: 'easeInOut', repeat: Infinity }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="py-8">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">解析エラーが発生しました</h2>
            <p className="text-red-600 font-medium max-w-lg mx-auto mb-6 bg-red-50 p-4 rounded-xl border border-red-200">
              {error}
            </p>
            {isDailyQuotaError && (
              <p className="text-slate-600 text-sm max-w-md mx-auto mb-6">
                Gemini APIの利用上限に達した可能性があります。時間をおいて再試行してください。
              </p>
            )}
            <button
              onClick={() => executeExtraction(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              再解析を実行する
            </button>
          </div>
        )}

        {success && !loading && (
          <div className="py-8">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">解析が完了しました</h2>
            <p className="text-slate-600 max-w-lg mx-auto mb-8">
              物件情報、募集区画、全フロア平面図素材の展開が完了しました。確認・編集画面へ進んでください。
            </p>

            <button
              onClick={onNext}
              className="px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-500/25"
            >
              次へ（情報確認・編集）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function assignSlotByFormat(images: ExtractedImage[], format: string) {
  const photoImages = images.filter(img => img.category === 'PHOTO' && !img.isExcludedFromPhoto);
  const planImages = images.filter(img => img.category === 'PLAN' || img.subCategory === '平面図');
  const mapImages = images.filter(img => img.category === 'ACCESS' || img.subCategory === '現地案内図' || img.subCategory === '周辺地図');

  let main = photoImages.find(img => img.subCategory.includes('外観')) || photoImages[0];
  let floorPlan = planImages[0];
  let map = mapImages[0];

  const subPhotos = photoImages.filter(img => img.id !== main?.id).slice(0, 4);

  const classifiedList = images.map(img => {
    let assignedSlot: ExtractedImage['assignedSlot'] = 'none';
    if (img.id === main?.id) assignedSlot = 'main';
    else if (img.id === floorPlan?.id) assignedSlot = 'floorPlan';
    else if (img.id === map?.id) assignedSlot = 'map';
    else if (subPhotos.some(sp => sp.id === img.id)) assignedSlot = 'photo';
    return { ...img, assignedSlot };
  });

  return {
    main,
    floorPlan,
    map,
    subPhotos,
    classifiedList,
  };
}

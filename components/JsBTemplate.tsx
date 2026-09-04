'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AppState, PropertyData, CoverImageSettings, ExtractedImage, PropertyDetailItem } from '@/types';
import { AlertCircle, MapPin } from 'lucide-react';

// ==========================================
// J.square 公式ロゴコンポーネント
// ==========================================
export function JSquareLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      {/* 菱形・ピッチ屋根の公式シンボルマーク */}
      <svg className="w-8 h-8 text-slate-900" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 3L37 20L20 37L3 20L20 3Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M20 9L31 20L20 31L9 20L20 9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M6 20H34" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <div className="font-sans font-black tracking-tight text-[12px] text-slate-900 flex items-center leading-none mt-1">
        <span>J</span>
        <span className="w-1 h-1 bg-slate-900 rounded-full mx-0.5 inline-block"></span>
        <span className="font-bold">square</span>
      </div>
    </div>
  );
}

// ==========================================
// 方位記号 (North Arrow) コンポーネント
// ==========================================
export function NorthArrow({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <svg className="w-9 h-9" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="16" stroke="#475569" strokeWidth="1.4" />
        <path d="M20 6L25 20H15L20 6Z" fill="#1E293B" />
        <path d="M20 34L15 20H25L20 34Z" fill="#94A3B8" />
        <line x1="20" y1="6" x2="20" y2="34" stroke="#475569" strokeWidth="1" />
      </svg>
      <span className="text-[10px] font-black text-slate-700 mt-0.5 font-sans">N</span>
    </div>
  );
}

// ==========================================
// 値サニタイズ（ダミー・null・undefined完全排除）
// ==========================================
export function cleanVal(val: string | undefined | null, fallback: string = '―'): string {
  if (!val || typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (
    trimmed === '' ||
    trimmed === '要確認' ||
    trimmed === '未入力' ||
    trimmed === '記載なし' ||
    trimmed === '未記載' ||
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed === 'null null' ||
    trimmed === 'SAMPLE' ||
    trimmed === 'DUMMY' ||
    trimmed === 'PLACEHOLDER'
  ) {
    return fallback;
  }
  return trimmed;
}

// 賃貸面積の表示整形
export function formatRentalArea(data: PropertyData): string {
  if (data.area?.sqm || data.area?.tsubo) {
    const parts: string[] = [];
    if (data.area.sqm) parts.push(`${data.area.sqm}㎡`);
    if (data.area.tsubo) parts.push(`(${data.area.tsubo}坪)`);
    return parts.join(' ');
  }
  if (data.building?.totalFloorAreaSqm || data.building?.totalFloorAreaTsubo) {
    const parts: string[] = [];
    if (data.building.totalFloorAreaSqm) parts.push(`${data.building.totalFloorAreaSqm}㎡`);
    if (data.building.totalFloorAreaTsubo) parts.push(`(${data.building.totalFloorAreaTsubo}坪)`);
    return parts.join(' ');
  }
  return '―';
}

// 賃料の表示整形（月額総額と坪単価を明確に併記）
export function formatRent(data: PropertyData): string {
  if (data.rent?.amount && data.rent?.tsuboPrice) {
    return `${data.rent.amount.toLocaleString()}円（約${data.rent.tsuboPrice.toLocaleString()}円/坪）`;
  }
  if (data.rent?.amount) {
    return `${data.rent.amount.toLocaleString()}円`;
  }
  if (data.rent?.tsuboPrice) {
    return `${data.rent.tsuboPrice.toLocaleString()}円/坪`;
  }
  return '相談';
}

// 共益費の表示整形
export function formatCommonFee(data: PropertyData): string {
  if (data.commonFee?.amount) {
    return `${data.commonFee.amount.toLocaleString()}円`;
  }
  if (data.commonFee?.taxIncluded || data.rent?.amount) {
    return '賃料に含む';
  }
  return '―';
}

// ==========================================
// スライド定義型 & メディア抽出ヘルパー
// ==========================================
export type JsBSlideType = 'COVER' | 'DETAILS' | 'LOCATION' | 'PHOTO' | 'PLAN';

export interface JsBSlideItem {
  id: string;
  num: number;
  type: JsBSlideType;
  label: string;
  title: string;
  // PLANスライド用の追加情報
  planLabel?: string;
  planUrl?: string;
}

/**
 * 外観写真の判定ヘルパー
 */
export function isExteriorPhoto(img: { category?: string; subCategory?: string; label?: string }): boolean {
  if (!img) return false;
  const sub = (img.subCategory || '').toLowerCase();
  const label = (img.label || '').toLowerCase();
  return (
    sub.includes('外観') ||
    label.includes('外観') ||
    sub.includes('外観パース') ||
    label.includes('外観パース') ||
    sub.includes('ファサード') ||
    label.includes('ファサード') ||
    sub.includes('全景') ||
    label.includes('全景') ||
    sub.includes('exterior') ||
    label.includes('exterior')
  );
}

/**
 * 表紙背景への自動選定を禁止する画像（内観、平面図、地図、サイン等）
 */
export function isForbiddenCoverPhoto(img: { category?: string; subCategory?: string; label?: string }): boolean {
  if (!img) return true;
  if (img.category === 'PLAN' || img.category === 'ACCESS') return true;
  const sub = (img.subCategory || '').toLowerCase();
  const label = (img.label || '').toLowerCase();
  return (
    sub.includes('内観') || label.includes('内観') ||
    sub.includes('室内') || label.includes('室内') ||
    sub.includes('店舗') || label.includes('店舗') ||
    sub.includes('エントランス') || label.includes('エントランス') ||
    sub.includes('間取') || label.includes('間取') ||
    sub.includes('平面') || label.includes('平面') ||
    sub.includes('地図') || label.includes('地図') ||
    sub.includes('案内') || label.includes('案内') ||
    sub.includes('設備') || label.includes('設備') ||
    sub.includes('区画') || label.includes('区画') ||
    sub.includes('サイン') || label.includes('サイン')
  );
}

/**
 * 表紙背景画像の選定関数
 * 優先順位：
 *  1. ユーザーが明示的に「表紙背景」に指定した画像
 *  2. AI画像分類で「外観」と判定された画像のうち最も表紙向きなもの
 *  3. その他の物件写真（ただし内観、平面図、地図は自動的に表紙背景へ使用しない）
 * 外観写真が存在しない場合、勝手に別画像を使用せず未設定とする
 */
export function selectJsBCoverImage(
  appState: AppState,
  explicitCoverUrl?: string
): {
  url: string | undefined;
  source: 'user' | 'ai_exterior' | 'other_photo' | 'none';
  isMissing: boolean;
  settings: CoverImageSettings;
} {
  const data = appState.data;
  const settings: CoverImageSettings = {
    objectPositionX: 50,
    objectPositionY: 50,
    scale: 1.0,
    brightness: 98,
    contrast: 105,
    grayscale: 100,
    ...(appState.coverImageSettings || data?.images?.coverImageSettings || {}),
  };

  // 1. ユーザーが明示的に「表紙背景」に指定した画像
  if (settings.imageUrl) {
    return { url: settings.imageUrl, source: 'user', isMissing: false, settings };
  }
  if (explicitCoverUrl) {
    return { url: explicitCoverUrl, source: 'user', isMissing: false, settings: { ...settings, imageUrl: explicitCoverUrl } };
  }

  // 候補となる画像リスト（classifiedList および extractedImages）
  const allImages: ExtractedImage[] = [
    ...(data?.images?.classifiedList || []),
    ...(appState.extractedImages || [])
  ];

  // 2. AI画像分類で「外観」と判定された画像のうち最も表紙向きなもの
  const exteriorImages = allImages.filter(img => img.dataUrl && isExteriorPhoto(img));
  if (exteriorImages.length > 0) {
    const bestExterior = exteriorImages.find(img => img.confidence === 'high') || exteriorImages[0];
    return {
      url: bestExterior.dataUrl,
      source: 'ai_exterior',
      isMissing: false,
      settings: { ...settings, imageId: bestExterior.id, imageUrl: bestExterior.dataUrl },
    };
  }

  // images.main が外観とみなせるかチェック
  if (data?.images?.main) {
    const mainMatches = allImages.find(img => img.dataUrl === data.images?.main);
    if (mainMatches && isExteriorPhoto(mainMatches)) {
      return {
        url: data.images.main,
        source: 'ai_exterior',
        isMissing: false,
        settings: { ...settings, imageUrl: data.images.main },
      };
    }
    // 禁止対象（内観・図面・地図）でなければ使用可能
    if (!mainMatches || !isForbiddenCoverPhoto(mainMatches)) {
      return {
        url: data.images.main,
        source: 'other_photo',
        isMissing: false,
        settings: { ...settings, imageUrl: data.images.main },
      };
    }
  }

  // 3. その他の物件写真（ただし内観・平面図・地図等は自動適用しない！）
  const otherPhotos = allImages.filter(img => 
    img.dataUrl &&
    img.category === 'PHOTO' &&
    !isForbiddenCoverPhoto(img)
  );

  if (otherPhotos.length > 0) {
    const selected = otherPhotos[0];
    return {
      url: selected.dataUrl,
      source: 'other_photo',
      isMissing: false,
      settings: { ...settings, imageId: selected.id, imageUrl: selected.dataUrl },
    };
  }

  // 外観写真が存在しない場合、勝手に別画像を使用せず未設定とする
  return {
    url: undefined,
    source: 'none',
    isMissing: true,
    settings,
  };
}

/**
 * JS-B 表紙の共通設定定義（Single Source of Truth）
 * Step7Preview, PDF出力, PowerPoint出力の3系統で完全に同一の設定を参照する
 */
export interface JsBCoverConfig {
  backgroundImage?: string;
  isMissing: boolean;
  source: 'user' | 'ai_exterior' | 'other_photo' | 'none';
  // フィルター・トリミング設定
  grayscale: number;        // モノクロ階調 (通常100%)
  brightness: number;       // 明度 (通常98%)
  contrast: number;         // コントラスト (通常105%)
  objectPositionX: number;  // 水平焦点 (0-100%, 通常50%)
  objectPositionY: number;  // 垂直焦点 (0-100%, 通常50%)
  scale: number;            // 拡大率 (通常1.0)
  // 下部アクセント帯設定
  bandColor: string;        // '#48C78E' (公式エメラルドグリーン)
  bandColorHexNoHash: string; // '48C78E'
  bandRgba: string;         // 'rgba(72, 199, 142, 0.85)'
  bandOpacity: number;      // 0.85
  bandHeightPercent: number; // 28 (%)
  // タイトル・物件名
  title: string;            // 'PROPERTY INFORMATION'
  subtitle: string;         // '【物件名】物件のご提案'
  propName: string;
}

/**
 * JS-B表紙設定取得関数（Single Source of Truth）
 */
export function getJsBCoverConfig(
  appState: AppState,
  targetImages?: { main?: string; floorPlan?: string; map?: string; detailMap?: string }
): JsBCoverConfig {
  const data = appState?.data;
  const coverSelection = selectJsBCoverImage(appState, targetImages?.main);
  const settings = coverSelection.settings;
  const propName = cleanVal(data?.property?.name, '');

  const posX = settings?.objectPositionX ?? 50;
  const posY = settings?.objectPositionY ?? 50;
  const scale = settings?.scale ?? 1.0;
  const contrast = settings?.contrast ?? 105;
  const brightness = settings?.brightness ?? 98;
  const grayscale = settings?.grayscale ?? 100;

  return {
    backgroundImage: coverSelection.url,
    isMissing: coverSelection.isMissing,
    source: coverSelection.source,
    grayscale,
    brightness,
    contrast,
    objectPositionX: posX,
    objectPositionY: posY,
    scale,
    bandColor: '#48C78E',
    bandColorHexNoHash: '48C78E',
    bandRgba: 'rgba(72, 199, 142, 0.85)',
    bandOpacity: 0.85,
    bandHeightPercent: 28,
    title: 'PROPERTY INFORMATION',
    subtitle: propName ? `【${propName}】物件のご提案` : '物件のご提案',
    propName,
  };
}

// 加工済み表紙画像のインメモリキャッシュ
const coverProcessCache = new Map<string, string>();

/**
 * 表紙背景画像を1000:707比率・モノクロ（グレースケール100%・コントラスト105%・明度98%）・焦点位置・拡大率でCanvas合成
 * Preview, PDF, PPTX の全系統で同一の加工画像URL（DataURL）を利用可能にする
 */
export async function processCoverImage(
  imageUrl: string,
  settings?: Partial<JsBCoverConfig> | CoverImageSettings
): Promise<string> {
  if (!imageUrl) return '';
  if (typeof window === 'undefined') return imageUrl;

  const contrast = (settings as any)?.contrast ?? 105;
  const brightness = (settings as any)?.brightness ?? 98;
  const grayscale = (settings as any)?.grayscale ?? 100;
  const posX = (settings as any)?.objectPositionX ?? 50;
  const posY = (settings as any)?.objectPositionY ?? 50;
  const scale = (settings as any)?.scale ?? 1.0;

  const cacheKey = `${imageUrl.slice(0, 120)}_${grayscale}_${brightness}_${contrast}_${posX}_${posY}_${scale}`;
  if (coverProcessCache.has(cacheKey)) {
    return coverProcessCache.get(cacheKey)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleLoad = () => {
      try {
        const canvas = document.createElement('canvas');
        // 1000px x 707px の2倍解像度 (2000 x 1414) で鮮明に描画
        const canvasWidth = 2000;
        const canvasHeight = 1414;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageUrl);
          return;
        }

        // 計算: object-fit: cover + object-position + scale
        const natW = img.naturalWidth || 1920;
        const natH = img.naturalHeight || 1080;
        const targetAspect = canvasWidth / canvasHeight;
        const imgAspect = natW / natH;

        let baseW = canvasWidth;
        let baseH = canvasHeight;

        if (imgAspect > targetAspect) {
          // 横長画像: 高さを合わせ、横が余る
          baseH = canvasHeight;
          baseW = canvasHeight * imgAspect;
        } else {
          // 縦長画像: 幅を合わせ、縦が余る
          baseW = canvasWidth;
          baseH = canvasWidth / imgAspect;
        }

        const scaledW = baseW * scale;
        const scaledH = baseH * scale;

        // 焦点位置 (posX, posY) を中心にしたオフセット計算
        const focalX = (posX / 100) * baseW;
        const focalY = (posY / 100) * baseH;
        const canvasCenterX = canvasWidth * (posX / 100);
        const canvasCenterY = canvasHeight * (posY / 100);

        const drawX = canvasCenterX - (focalX * scale);
        const drawY = canvasCenterY - (focalY * scale);

        // フィルター適用 (モノクロ + コントラスト + 明度)
        ctx.filter = `grayscale(${grayscale}%) contrast(${contrast}%) brightness(${brightness}%)`;
        ctx.drawImage(img, drawX, drawY, scaledW, scaledH);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        coverProcessCache.set(cacheKey, dataUrl);
        resolve(dataUrl);
      } catch (err) {
        console.warn('Canvas filter processing failed, falling back to original image', err);
        resolve(imageUrl);
      }
    };

    img.onload = handleLoad;
    img.onerror = () => {
      resolve(imageUrl);
    };

    img.src = imageUrl;
  });
}

export const processCoverImageForPptx = processCoverImage;

/**
 * 5枚以上ある場合の高品質な4枚自動選定関数（仕様要求第2・4・5項準拠）
 * - 解像度（面積 width × height）
 * - アスペクト比の安定性（極端な帯状などを回避）
 * - AI分類の確信度
 * - アングル/カテゴリの多様性（内観写真を優先）
 * - 重複排除
 * - 手動指定スロット (photo_1..4, subPhotos) を最優先
 */
export function selectBestFourPhotos(
  allClassified: ExtractedImage[],
  rawUrls: string[],
  coverImage?: string,
  mapImage?: string,
  manualSlotMap?: { [key: string]: string },
  manualSubPhotos?: string[]
): { displayPhotos: string[]; allCandidates: string[] } {
  // 表紙・地図を除外した候補URLリスト
  const cleanRawUrls = Array.from(new Set(rawUrls)).filter(url => url && url !== coverImage && url !== mapImage);

  // 1. 手動指定スロット (photo_1, photo_2, photo_3, photo_4) の最優先チェック
  if (manualSlotMap) {
    const slots = [
      manualSlotMap.photo_1,
      manualSlotMap.photo_2,
      manualSlotMap.photo_3,
      manualSlotMap.photo_4,
    ].filter(Boolean) as string[];

    if (slots.length > 0) {
      // ユーザー指定順を尊重
      const display = slots.filter(url => url !== coverImage && url !== mapImage);
      return {
        displayPhotos: display.slice(0, 4),
        allCandidates: cleanRawUrls,
      };
    }
  }

  // 2. 手動選択された subPhotos があればそれを優先
  if (manualSubPhotos && manualSubPhotos.length > 0) {
    const validSubs = manualSubPhotos.filter(url => url && url !== coverImage && url !== mapImage);
    if (validSubs.length > 0) {
      return {
        displayPhotos: validSubs.slice(0, 4),
        allCandidates: cleanRawUrls,
      };
    }
  }

  // 3. 写真候補オブジェクトの収集とスコアリング
  const validCandidates = allClassified.filter(
    img => img.category === 'PHOTO' && !img.isExcludedFromPhoto && img.dataUrl && img.dataUrl !== coverImage && img.dataUrl !== mapImage
  );

  // 万一 classifiedList にない rawUrls があれば補完
  const candidateMap = new Map<string, ExtractedImage>();
  validCandidates.forEach(img => candidateMap.set(img.dataUrl, img));
  cleanRawUrls.forEach((url, i) => {
    if (!candidateMap.has(url)) {
      candidateMap.set(url, {
        id: `photo_raw_${i}`,
        dataUrl: url,
        category: 'PHOTO',
        subCategory: '内観',
        label: `写真 ${i + 1}`,
        confidence: 'medium',
      });
    }
  });

  const photoItemList = Array.from(candidateMap.values());

  if (photoItemList.length <= 4) {
    return {
      displayPhotos: photoItemList.map(item => item.dataUrl),
      allCandidates: photoItemList.map(item => item.dataUrl),
    };
  }

  // 5枚以上の場合の自動選定スコアリング（解像度・アスペクト比・確信度・アングル多様性）
  const scored = photoItemList.map((img, index) => {
    let score = 100;

    // 解像度スコア
    const w = img.width || 800;
    const h = img.height || 600;
    const area = w * h;
    score += Math.min(area / 10000, 40);

    // アスペクト比スコア (一般的な 1.1〜1.8 または 0.7〜0.9)
    const ratio = w / h;
    if (ratio >= 1.1 && ratio <= 1.8) {
      score += 25; // 横長標準
    } else if (ratio >= 0.7 && ratio <= 0.95) {
      score += 15; // 縦長標準
    } else if (ratio > 2.2 || ratio < 0.45) {
      score -= 40; // 極端な帯状パノラマやヘッダー
    }

    // 確信度
    if (img.confidence === 'high') score += 20;
    else if (img.confidence === 'low') score -= 15;

    // 内観写真を優先（PHOTOページには内観が最重要）
    if (img.subCategory === '内観' || (img.label && /内観|室内|客席|厨房|店内|ホール/i.test(img.label))) {
      score += 30;
    }

    // 元資料での出現順（先頭に近いほど重要写真の傾向）
    score -= index * 2;

    return { img, score };
  });

  // スコア降順ソート
  scored.sort((a, b) => b.score - a.score);

  const bestFour = scored.slice(0, 4).map(s => s.img.dataUrl);

  return {
    displayPhotos: bestFour,
    allCandidates: photoItemList.map(item => item.dataUrl),
  };
}

export function extractJsBMedia(
  appState: AppState,
  images: { main?: string; floorPlan?: string; map?: string; detailMap?: string } = {}
) {
  const data = appState.data;
  if (!data) {
    return {
      coverImage: undefined,
      isCoverImageMissing: true,
      coverSettings: { objectPositionX: 50, objectPositionY: 50, scale: 1.0, brightness: 98, contrast: 105, grayscale: 100 },
      coverSource: 'none' as const,
      mapImage: undefined,
      photos: [],
      candidatePhotos: [],
      plans: [],
    };
  }

  // 表紙画像の厳格な選定
  const coverSelection = selectJsBCoverImage(appState, images.main);
  const coverImage = coverSelection.url;
  const isCoverImageMissing = coverSelection.isMissing;
  const coverSettings = coverSelection.settings;
  const coverSource = coverSelection.source;

  const mapImage = images.map || data.maps?.wideMapUrl || images.detailMap || data.maps?.detailMapUrl || data.images?.map || data.images?.detailMap;

  // 写真候補の収集（地図・平面図・ロゴ・文字表を厳格に除外）
  const rawPhotos: string[] = [];
  if (data.images?.subPhotos && Array.isArray(data.images.subPhotos)) {
    rawPhotos.push(...data.images.subPhotos.filter(Boolean));
  }
  if (appState.extractedImages && Array.isArray(appState.extractedImages)) {
    appState.extractedImages
      .filter(img => img.category === 'PHOTO' && !img.isExcludedFromPhoto && img.dataUrl)
      .forEach(p => rawPhotos.push(p.dataUrl));
  }
  if (data.images?.classifiedList && Array.isArray(data.images.classifiedList)) {
    data.images.classifiedList
      .filter(img => img.category === 'PHOTO' && !img.isExcludedFromPhoto && img.dataUrl)
      .forEach(p => rawPhotos.push(p.dataUrl));
  }

  const allClassified = [
    ...(appState.extractedImages || []),
    ...(data.images?.classifiedList || [])
  ];

  // 4枚動的選定 & 未使用候補保持（手動指定最優先）
  const photoSelection = selectBestFourPhotos(
    allClassified,
    rawPhotos,
    coverImage,
    mapImage,
    data.images?.slotMap,
    data.images?.subPhotos
  );

  const photos = photoSelection.displayPhotos;
  const candidatePhotos = photoSelection.allCandidates;

  // 平面図・間取り図の収集
  const planItems: { id: string; label: string; url: string }[] = [];
  const seenUrls = new Set<string>();

  const planObjs = [
    ...(appState.extractedImages || []),
    ...(data.images?.classifiedList || [])
  ].filter(img => img.category === 'PLAN' && img.dataUrl);

  planObjs.forEach((p, idx) => {
    if (!seenUrls.has(p.dataUrl)) {
      seenUrls.add(p.dataUrl);
      let rawLabel = (p.label || '').trim();
      let label = rawLabel;

      // 「平面図 (1F・B1F)」や「平面図(1F)」などから階数・区画名部分を優先抽出
      const floorMatch = rawLabel.match(/(?:平面図|間取図|間取り図|図面|区画図)?\s*[(（]?\s*([0-9A-Za-z・/／~〜\-\s]+(?:F|階|区画|号室)?)\s*[)）]?/);
      if (
        !rawLabel ||
        rawLabel === 'PLAN' ||
        rawLabel === '間取り図' ||
        rawLabel === '平面図' ||
        rawLabel === '区画図' ||
        rawLabel === '平面図・間取図'
      ) {
        label = data.property?.floor ? `${data.property.floor}` : `第${planItems.length + 1}区画`;
      } else if (floorMatch && floorMatch[1] && /[0-9A-Za-zF階]/.test(floorMatch[1])) {
        label = floorMatch[1].trim();
      } else if (data.property?.floor) {
        label = data.property.floor;
      }

      planItems.push({
        id: p.id || `plan-${idx}`,
        label,
        url: p.dataUrl,
      });
    }
  });

  const primaryPlan = images.floorPlan || data.images?.floorPlan;
  if (primaryPlan && !seenUrls.has(primaryPlan)) {
    seenUrls.add(primaryPlan);
    const label = data.property?.floor ? `${data.property.floor}` : (planItems.length === 0 ? '1F・B1F' : `第${planItems.length + 1}区画`);
    planItems.unshift({
      id: 'primary-plan',
      label,
      url: primaryPlan,
    });
  }

  return {
    coverConfig: getJsBCoverConfig(appState, images),
    coverImage,
    isCoverImageMissing,
    coverSettings,
    coverSource,
    mapImage,
    photos,
    candidatePhotos,
    plans: planItems,
  };
}

// ==========================================
// 動的スライド一覧生成関数
// ==========================================
export function getJsBSlides(
  appState: AppState,
  images: { main?: string; floorPlan?: string; map?: string; detailMap?: string } = {}
): JsBSlideItem[] {
  const media = extractJsBMedia(appState, images);
  const slides: JsBSlideItem[] = [];
  let currentNum = 1;

  // 1. COVER: 常に生成
  slides.push({
    id: 'cover',
    num: currentNum++,
    type: 'COVER',
    label: '1. 表紙',
    title: 'PROPERTY INFORMATION',
  });

  // 2. PROPERTY DETAILS: 常に生成
  slides.push({
    id: 'details',
    num: currentNum++,
    type: 'DETAILS',
    label: '2. 物件概要',
    title: 'PROPERTY DETAILS',
  });

  // 3. LOCATION: 地図データが存在する場合に生成
  if (media.mapImage) {
    slides.push({
      id: 'location',
      num: currentNum++,
      type: 'LOCATION',
      label: `${slides.length + 1}. 位置図`,
      title: 'LOCATION',
    });
  }

  // 4. PHOTO: 使用可能な写真がある場合に生成
  if (media.photos.length > 0) {
    slides.push({
      id: 'photo',
      num: currentNum++,
      type: 'PHOTO',
      label: `${slides.length + 1}. 写真`,
      title: 'PHOTO',
    });
  }

  // 5. PLAN: 平面図が存在する区画ごとに1ページ生成（未検出の場合は明示的警告スライドを提示）
  if (media.plans.length > 0) {
    media.plans.forEach((plan, idx) => {
      slides.push({
        id: plan.id,
        num: currentNum++,
        type: 'PLAN',
        label: `${slides.length + 1}. 図面 (${plan.label})`,
        title: `PLAN：${plan.label}`,
        planLabel: plan.label,
        planUrl: plan.url,
      });
    });
  } else {
    // 平面図が1枚も検出されなかった場合、空のまま放置せず明示的な警告スライドを生成
    slides.push({
      id: 'plan-missing',
      num: currentNum++,
      type: 'PLAN',
      label: `${slides.length + 1}. 図面（未検出）`,
      title: 'PLAN：第1区画',
      planLabel: '未検出',
      planUrl: undefined,
    });
  }

  return slides;
}

// ==========================================
// SLIDE 1: 表紙（Cover Slide）
// JS-B 表紙の Single Source of Truth 正式定義
// ==========================================
export function JsBCoverSlide({
  data,
  coverImage,
  settings,
  isMissing,
  config: providedConfig,
}: {
  data: PropertyData;
  coverImage?: string;
  settings?: CoverImageSettings;
  isMissing?: boolean;
  config?: JsBCoverConfig;
}) {
  const config: JsBCoverConfig = useMemo(() => {
    if (providedConfig) return providedConfig;
    const propName = cleanVal(data?.property?.name, '');
    const posX = settings?.objectPositionX ?? 50;
    const posY = settings?.objectPositionY ?? 50;
    const scale = settings?.scale ?? 1.0;
    const contrast = settings?.contrast ?? 105;
    const brightness = settings?.brightness ?? 98;
    const grayscale = settings?.grayscale ?? 100;

    return {
      backgroundImage: coverImage,
      isMissing: isMissing ?? !coverImage,
      source: 'user',
      grayscale,
      brightness,
      contrast,
      objectPositionX: posX,
      objectPositionY: posY,
      scale,
      bandColor: '#48C78E',
      bandColorHexNoHash: '48C78E',
      bandRgba: 'rgba(72, 199, 142, 0.85)',
      bandOpacity: 0.85,
      bandHeightPercent: 28,
      title: 'PROPERTY INFORMATION',
      subtitle: propName ? `【${propName}】物件のご提案` : '物件のご提案',
      propName,
    };
  }, [providedConfig, data, coverImage, settings, isMissing]);

  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const activeImg = config.backgroundImage;
  const isImageMissing = config.isMissing || !activeImg;

  useEffect(() => {
    let isMounted = true;
    if (isImageMissing || !activeImg) {
      setProcessedUrl(null);
      return;
    }

    processCoverImage(activeImg, config)
      .then((processed) => {
        if (isMounted) {
          setProcessedUrl(processed);
        }
      })
      .catch((err) => {
        console.warn('JsBCoverSlide processCoverImage warning:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [
    activeImg,
    isImageMissing,
    config.grayscale,
    config.brightness,
    config.contrast,
    config.objectPositionX,
    config.objectPositionY,
    config.scale,
  ]);

  return (
    <div 
      data-slide-type="COVER"
      className="w-[1000px] h-[707px] bg-white relative overflow-hidden select-none flex flex-col justify-between"
    >
      {/* 背景写真（モノクロ加工・コントラスト調整・焦点位置調整・全面object-cover） */}
      {!isImageMissing && activeImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={processedUrl || activeImg}
          alt="外観写真（表紙背景）"
          style={{
            objectPosition: processedUrl ? '50% 50%' : `${config.objectPositionX}% ${config.objectPositionY}%`,
            transform: (!processedUrl && config.scale !== 1.0) ? `scale(${config.scale})` : undefined,
            transformOrigin: `${config.objectPositionX}% ${config.objectPositionY}%`,
            filter: processedUrl ? undefined : `grayscale(${config.grayscale}%) contrast(${config.contrast}%) brightness(${config.brightness}%)`,
          }}
          className="absolute inset-0 w-full h-full object-cover transition-all duration-300"
        />
      ) : (
        <div className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center text-slate-500 p-8 border-2 border-dashed border-slate-300">
          <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-3 text-amber-600 shadow-xs">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <span className="text-base font-bold text-slate-700">表紙背景画像が未設定です</span>
          <p className="text-xs text-slate-500 mt-1 max-w-md text-center leading-relaxed">
            外観写真が登録されると、自動的に見本PDFと同様のモノクロ（グレースケール）調に加工され、全面に配置されます。
          </p>
        </div>
      )}

      {/* 下部エメラルドグリーン半透明帯バナー (#48C78E / 85%透過) */}
      <div 
        style={{
          backgroundColor: config.bandRgba,
        }}
        className="absolute bottom-0 left-0 right-0 h-[28%] flex flex-col justify-center px-14 text-white shadow-md z-10"
      >
        <h1 className="text-[32px] font-black tracking-[0.16em] leading-tight text-white drop-shadow-xs font-sans">
          {config.title}
        </h1>
        <p className="text-[17px] font-semibold text-white/95 mt-2.5 drop-shadow-xs font-sans">
          {config.subtitle}
        </p>
      </div>
    </div>
  );
}

// ==========================================
// PROPERTY DETAILS 動的項目ビルダー (可変項目レイアウト)
// ==========================================
export function isValidDetailValue(val: any): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number') return !isNaN(val);
  if (typeof val !== 'string') return false;
  const t = val.trim();
  if (t === '') return false;
  const lower = t.toLowerCase();
  const banned = [
    '―', '-', '—', 'null', 'undefined', '記載なし', '未記載', '未入力', '要確認',
    '不明', '未定', 'none', 'n/a', 'na', '用途未記載', 'null null', 'sample', 'dummy', 'placeholder'
  ];
  return !banned.includes(lower);
}

export function normalizeDetailLabelKey(label: string): string {
  const l = label.trim().replace(/[\s・/／:：※（）()]/g, '');
  if (/^ビル名$|^建物名$|^物件名$/.test(l)) return 'name';
  if (/^所在地$|^住所$|^物件所在地$/.test(l)) return 'address';
  if (/^最寄駅$|^交通$|^アクセス$/.test(l)) return 'access';
  if (/^階数$|^号室$|^階数号室$|^階数区画$|^所在階$/.test(l)) return 'floor';
  if (/^賃貸面積$|^面積$|^専有面積$|^契約面積$/.test(l)) return 'area';
  if (/^賃料$|^月額賃料$|^賃料※$/.test(l)) return 'rent';
  if (/^共益費$|^管理費$|^共益費等$/.test(l)) return 'commonFee';
  if (/^敷金$|^保証金$|^敷金保証金$|^敷金・保証金$/.test(l)) return 'deposit';
  if (/^礼金$|^権利金$/.test(l)) return 'keyMoney';
  if (/^償却$|^敷引$|^償却費$/.test(l)) return 'depreciation';
  if (/^契約$|^契約期間$|^契約形態$|^契約区分$/.test(l)) return 'contract';
  if (/^用途$|^利用用途$|^用途地域$/.test(l)) return 'usage';
  if (/^構造$|^建物構造$/.test(l)) return 'structure';
  if (/^規模$|^建物規模$|^階数規模$/.test(l)) return 'scale';
  if (/^竣工時期$|^築年月$|^竣工$|^建築時期$/.test(l)) return 'builtYearMonth';
  if (/^引渡時期$|^入居時期$|^入居$|^引渡し時期$|^明渡時期$/.test(l)) return 'handoverTiming';
  if (/^現況$|^引渡状態$|^引渡条件$|^現況状態$/.test(l)) return 'status';
  return l;
}

export function buildDynamicPropertyDetailItems(
  data: PropertyData,
  additionalItems?: { id?: string; name: string; content: string }[]
): PropertyDetailItem[] {
  const items: PropertyDetailItem[] = [];
  const seenKeys = new Set<string>();

  const add = (label: string, value: string | undefined | null, source = 'pdf') => {
    if (!label) return;
    const cleanLabel = label.trim();
    const normKey = normalizeDetailLabelKey(cleanLabel);
    if (seenKeys.has(normKey)) return;

    if (!isValidDetailValue(value)) return;
    const cleanValStr = String(value).trim();
    if (
      cleanValStr === '' ||
      cleanValStr === '―' ||
      cleanValStr === '-' ||
      cleanValStr === '記載なし' ||
      cleanValStr === '未記載' ||
      cleanValStr === '要確認'
    ) return;

    items.push({
      label: cleanLabel,
      value: cleanValStr,
      source,
      confirmed: true,
    });
    seenKeys.add(normKey);
  };

  // ----------------------------------------------------
  // 1. 基本項目（baseItems: 元資料から取得できた主要情報）
  // ----------------------------------------------------
  add('ビル名', data.property?.name);
  add('所在地', data.property?.address);
  add('最寄駅', data.property?.access);

  const floorRoom = [data.property?.floor, data.property?.room].filter(Boolean).join(' ');
  if (floorRoom) add('階数・区画', floorRoom);

  // 賃貸面積
  const areaStr = formatRentalArea(data);
  if (areaStr && areaStr !== '―') {
    add('賃貸面積', areaStr);
  }

  // 賃料
  if (data.rent?.amount || data.rent?.tsuboPrice) {
    add('賃料※', formatRent(data));
  }

  // 共益費・管理費
  if (data.commonFee?.amount !== null && data.commonFee?.amount !== undefined) {
    const cf = formatCommonFee(data);
    if (cf && cf !== '―') {
      add('共益費', cf);
    }
  }

  // 敷金・保証金
  add('敷金', data.deposit);
  // 礼金
  add('礼金', data.keyMoney);
  // 償却・敷引
  add('償却', data.depreciation);
  // 契約期間・形態
  add('契約', data.contract);

  // 現況・引渡状態（重複を統合）
  const rawCurrent = (data.property?.currentStatus || '').trim();
  const rawHandover = (data.property?.handoverStatus || data.handover || '').trim();
  if (rawCurrent && rawHandover && rawCurrent.toLowerCase() === rawHandover.toLowerCase()) {
    add('現況', rawCurrent);
  } else {
    if (rawCurrent) add('現況', rawCurrent);
    if (rawHandover) add('引渡状態', rawHandover);
  }

  // 入居・引渡時期
  add('入居', data.property?.handoverTiming);

  // 用途
  add('用途', data.property?.usage || data.building?.currentUsage);
  // 構造
  add('構造', data.building?.structure);
  // 規模
  add('規模', data.building?.scale);
  // 竣工時期
  add('竣工時期', data.building?.builtYearMonth || data.building?.constructionDates);

  // ----------------------------------------------------
  // 2. 元資料から取得した追加項目 (extraItems: data.detailItems)
  // （キュービクル点検、貯水槽点検、電気メーター検針、解約予告、看板料、ダクト、電気容量等）
  // ----------------------------------------------------
  if (Array.isArray(data.detailItems)) {
    for (const d of data.detailItems) {
      if (d && d.label && d.value) {
        add(d.label, d.value, d.source || 'pdf');
      }
    }
  }

  // ----------------------------------------------------
  // 3. 特記事項 (conditions) からの構造化個別条件
  // ----------------------------------------------------
  if (Array.isArray(data.conditions)) {
    for (const cond of data.conditions) {
      if (!cond || typeof cond !== 'string') continue;
      const c = cond.trim();
      if (!c || c === '要確認' || c === '記載なし') continue;

      if (c.includes('：') || c.includes(':')) {
        const parts = c.split(/[:：]/);
        const lbl = parts[0].trim();
        const val = parts.slice(1).join(':').trim();
        if (lbl && val && isValidDetailValue(val)) {
          add(lbl, val);
          continue;
        }
      }

      if (c.includes('再契約料') || c.includes('更新料')) {
        add('更新料', c);
      } else if (c.includes('解約予告') || c.includes('予告期間')) {
        add('解約予告', c);
      } else if (c.includes('保証会社') || c.includes('保証料')) {
        add('保証会社', c);
      } else if (c.includes('看板料') || c.includes('看板')) {
        add('看板料', c);
      } else if (c.includes('駐車場') || c.includes('パーキング')) {
        add('駐車場', c);
      } else if (c.includes('重飲食') || c.includes('飲食')) {
        add('飲食制限', c);
      } else if (c.includes('営業時間') || c.includes('深夜営業')) {
        add('営業時間制限', c);
      } else if (c.includes('電気容量') || c.includes('受電')) {
        add('電気容量', c);
      } else if (c.includes('給排水') || c.includes('ダクト')) {
        add('設備仕様', c);
      }
    }
  }

  // ----------------------------------------------------
  // 4. ユーザー編集の追加項目 (additionalItems)
  // ----------------------------------------------------
  if (Array.isArray(additionalItems)) {
    for (const a of additionalItems) {
      if (a && a.name && a.content) {
        add(a.name, a.content, 'user');
      }
    }
  }

  return items;
}

// ==========================================
// SLIDE 2: 物件概要・諸条件（Property Details）
// - 基本項目 + 元資料追加項目のマージ一覧表示
// - 左右2列の上詰め均等再配置
// - 行数に応じたフォント・行間・パディング自動最適化
// ==========================================
export function JsBDetailsSlide({
  data,
  additionalItems,
}: {
  data: PropertyData;
  additionalItems?: { id?: string; name: string; content: string }[];
}) {
  // 基本項目 + 追加項目の完全マージ配列を構築
  const items = buildDynamicPropertyDetailItems(data, additionalItems);

  // 左右均等に分割
  const totalCount = items.length;
  const half = Math.ceil(totalCount / 2);
  const leftItems = items.slice(0, half);
  const rightItems = items.slice(half);

  // 項目数に応じたレイアウトパラメータの自動調整（はみ出し防止 & 均等配置）
  const isDense = totalCount >= 16;
  const isMedium = totalCount >= 12 && totalCount < 16;

  const spaceYClass = isDense ? 'space-y-2' : isMedium ? 'space-y-2.5' : 'space-y-3.5';
  const rowHeightClass = isDense ? 'min-h-[28px]' : isMedium ? 'min-h-[30px]' : 'min-h-[34px]';
  const badgeHeightClass = isDense ? 'h-[28px]' : isMedium ? 'h-[30px]' : 'h-[34px]';
  const labelWidthClass = isDense ? 'w-[95px]' : 'w-[105px]';
  const textClass = isDense ? 'text-[11px]' : 'text-xs';

  return (
    <div className="w-[1000px] h-[707px] bg-white p-12 flex flex-col justify-between select-none relative overflow-hidden font-sans">
      {/* 上部ヘッダー */}
      <div className="flex items-center justify-between shrink-0 mb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[#20B26C] text-xl font-black tracking-wide font-sans">
            PROPERTY DETAILS
          </h2>
          <span className="text-[11px] text-slate-400 font-semibold">
            物件概要・諸条件（{totalCount}項目）
          </span>
        </div>
        <JSquareLogo />
      </div>

      {/* 2列可変テーブルエリア（上詰めで自然に配置） */}
      {totalCount === 0 ? (
        <div className="mt-6 mb-auto w-full py-16 text-center text-slate-400 text-xs bg-slate-50 border border-slate-200 rounded-lg">
          物件概要データが抽出されていません
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-10 mt-3 mb-auto items-start">
          {/* 左列 */}
          <div className={`${spaceYClass} flex flex-col`}>
            {leftItems.map((item, idx) => (
              <div key={`left-${idx}`} className={`flex items-center ${rowHeightClass}`}>
                <div className={`${labelWidthClass} ${badgeHeightClass} bg-[#6ED4A4] text-white text-[11px] font-bold rounded-md flex items-center justify-center shrink-0 tracking-wide px-1 text-center truncate shadow-2xs`}>
                  {item.label}
                </div>
                <div className={`${textClass} font-semibold text-slate-800 pl-3 leading-snug flex-1 truncate`} title={item.value}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* 右列 */}
          <div className={`${spaceYClass} flex flex-col`}>
            {rightItems.map((item, idx) => (
              <div key={`right-${idx}`} className={`flex items-center ${rowHeightClass}`}>
                <div className={`${labelWidthClass} ${badgeHeightClass} bg-[#6ED4A4] text-white text-[11px] font-bold rounded-md flex items-center justify-center shrink-0 tracking-wide px-1 text-center truncate shadow-2xs`}>
                  {item.label}
                </div>
                <div className={`${textClass} font-semibold text-slate-800 pl-3 leading-snug flex-1 truncate`} title={item.value}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最下部注記 */}
      <div className="text-left text-[11px] text-slate-500 shrink-0 pt-2 border-t border-slate-100 flex items-center justify-between">
        <span>※：賃料は税別表記となります。（保証金・敷金は除く）</span>
        <span className="text-[10px] text-slate-400">※元資料記載の情報のみ掲載</span>
      </div>
    </div>
  );
}

// ==========================================
// SLIDE 3: 位置図・周辺地図（Location）
// - 正式な公的地図（国土地理院タイル/OSM）または手動指定地図のみ使用
// - AI生成の模式図・架空地図・透かし地図は完全禁止
// - 取得失敗時は未設定警告UIを表示
// ==========================================
export function JsBLocationSlide({
  mapImage,
}: {
  mapImage?: string;
}) {
  return (
    <div className="w-[1000px] h-[707px] bg-white p-12 flex flex-col justify-between select-none relative overflow-hidden font-sans">
      {/* 上部ヘッダー */}
      <div className="flex items-center justify-between shrink-0 mb-4">
        <h2 className="text-[#20B26C] text-xl font-black tracking-wide font-sans">
          LOCATION
        </h2>
        <JSquareLogo />
      </div>

      {/* 地図中央配置エリア */}
      <div className="flex-1 relative flex items-center justify-center my-auto overflow-hidden">
        {mapImage ? (
          <div className="relative w-full h-[530px] flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
            {/* PROPERTY グリーンバナーバッジ */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-[#20B26C] text-white text-xs font-black px-7 py-1 rounded-sm shadow-xs tracking-wider uppercase">
              PROPERTY
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mapImage}
              alt="位置図"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : (
          <div className="w-full h-[500px] bg-amber-50/40 border-2 border-dashed border-amber-300 rounded-2xl flex flex-col items-center justify-center p-8 text-center text-amber-900 select-none">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-3.5 text-amber-600 shadow-xs">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-amber-950 mb-1.5 tracking-wide">
              地図を取得できませんでした。地図画像を指定してください
            </h3>
            <p className="text-xs text-amber-800/90 max-w-md leading-relaxed mb-4">
              物件住所から自動地図が取得できませんでした。<br />
              Google Mapsのスクリーンショット等を、Step 6 デザイン・編集の【案内図スロット】にアップロードまたは素材一覧から指定してください。
            </p>
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-amber-200 rounded-md text-[11px] text-amber-900 font-semibold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              AIによる推測地図や模式図は出力されません（正確性保護）
            </div>
          </div>
        )}
      </div>

      {/* 最下部フッター */}
      <div className="text-right text-[10px] text-slate-400 shrink-0 pt-1">
        ※ 掲載地図は国土地理院またはOpenStreetMapの公認地図データです
      </div>
    </div>
  );
}

// ==========================================
// SLIDE 4: 写真ギャラリー（Photo）
// - 写真枚数に応じた動的アダプティブレイアウト（仕様要求第1・2項準拠）
//   * 1枚: ページ中央に大判1枚
//   * 2枚: 左右2分割
//   * 3枚: 左側に大判1枚、右側に上下2枚
//   * 4枚（5枚以上含む）: 2列×2行グリッド
// - 表示可能領域を最大限活用し、各スロットいっぱい（w-full h-full object-cover）に表示
// ==========================================
export function JsBPhotoSlide({
  photos,
}: {
  photos: string[];
}) {
  const displayPhotos = photos.slice(0, 4);
  const count = displayPhotos.length;

  return (
    <div className="w-[1000px] h-[707px] bg-white p-12 flex flex-col justify-between select-none relative overflow-hidden font-sans">
      {/* 上部ヘッダー */}
      <div className="flex items-center justify-between shrink-0 mb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[#20B26C] text-xl font-black tracking-wide font-sans">
            PHOTO
          </h2>
          {count > 0 && (
            <span className="text-[11px] text-slate-400 font-semibold">
              内観・設備写真（{count}枚）
            </span>
          )}
        </div>
        <JSquareLogo />
      </div>

      {/* 写真表示可能領域（縦540pxを最大活用） */}
      {count === 0 ? (
        <div className="flex-1 w-full h-[540px] my-auto bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-8 text-center text-slate-400">
          <ImageIcon className="w-12 h-12 mb-2 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">写真が設定されていません</p>
          <p className="text-xs text-slate-400 mt-1">Step 6 デザイン・編集の画像管理から写真を追加・指定してください</p>
        </div>
      ) : count === 1 ? (
        /* 1枚: ページ中央に大判1枚 */
        <div className="flex-1 w-full h-[540px] my-auto flex items-center justify-center">
          <div className="w-full h-full bg-slate-50 border border-slate-200 overflow-hidden relative shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayPhotos[0]}
              alt="物件写真 1"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      ) : count === 2 ? (
        /* 2枚: 左右2分割 */
        <div className="flex-1 w-full h-[540px] my-auto grid grid-cols-2 gap-4">
          {displayPhotos.map((photoUrl, idx) => (
            <div
              key={idx}
              className="w-full h-full bg-slate-50 border border-slate-200 overflow-hidden relative shadow-2xs"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt={`物件写真 ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : count === 3 ? (
        /* 3枚: 左側に大判1枚、右側に上下2枚 */
        <div className="flex-1 w-full h-[540px] my-auto grid grid-cols-2 gap-4">
          {/* 左側: 大判1枚 */}
          <div className="w-full h-full bg-slate-50 border border-slate-200 overflow-hidden relative shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayPhotos[0]}
              alt="物件写真 1"
              className="w-full h-full object-cover"
            />
          </div>
          {/* 右側: 上下2枚 */}
          <div className="w-full h-full grid grid-rows-2 gap-4">
            <div className="w-full h-full bg-slate-50 border border-slate-200 overflow-hidden relative shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayPhotos[1]}
                alt="物件写真 2"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="w-full h-full bg-slate-50 border border-slate-200 overflow-hidden relative shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayPhotos[2]}
                alt="物件写真 3"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      ) : (
        /* 4枚（または5枚以上から選定された4枚）: 2列×2行グリッド */
        <div className="flex-1 w-full h-[540px] my-auto grid grid-cols-2 grid-rows-2 gap-4">
          {displayPhotos.map((photoUrl, idx) => (
            <div
              key={idx}
              className="w-full h-full bg-slate-50 border border-slate-200 overflow-hidden relative shadow-2xs"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt={`物件写真 ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// SLIDE 5..N: 区画平面図（Plan）
// ==========================================
export function JsBPlanSlide({
  planLabel,
  planUrl,
}: {
  planLabel: string;
  planUrl?: string;
}) {
  return (
    <div className="w-[1000px] h-[707px] bg-white p-12 flex flex-col justify-between select-none relative overflow-hidden font-sans">
      {/* 上部ヘッダー */}
      <div className="flex items-center justify-between shrink-0 mb-2">
        <h2 className="text-[#20B26C] text-xl font-black tracking-wide font-sans">
          PLAN：{planLabel}
        </h2>
        <JSquareLogo />
      </div>

      {/* 方位記号 (North Arrow) */}
      <NorthArrow className="absolute top-20 right-14" />

      {/* 図面描画エリア */}
      <div className="flex-1 flex items-center justify-center my-auto overflow-hidden p-2">
        {planUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={planUrl}
            alt={`図面 ${planLabel}`}
            className="max-w-full max-h-[530px] object-contain"
          />
        ) : (
          <div className="w-full h-[500px] bg-amber-50/40 border-2 border-dashed border-amber-300 rounded-2xl flex flex-col items-center justify-center p-8 text-center text-amber-900 select-none">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-3.5 text-amber-600 shadow-xs">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-amber-950 mb-1.5 tracking-wide">
              平面図を検出できませんでした。画像を指定してください
            </h3>
            <p className="text-xs text-amber-800/90 max-w-md leading-relaxed mb-4">
              元資料から平面図（間取図・区画図）が検出されませんでした。<br />
              画面上部または編集ステップ（Step 6 デザイン・編集）の【図面スロット】にて、直接画像をアップロードまたは素材一覧から指定してください。
            </p>
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-amber-200 rounded-md text-[11px] text-amber-900 font-semibold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              内装写真や地図は自動流用されません（誤認防止保護）
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

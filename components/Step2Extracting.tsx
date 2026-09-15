"use client";

import React, { useEffect, useState, useRef } from 'react';
import { AppState, defaultPropertyData, ExtractedImage } from '@/types';
import { Loader2, AlertTriangle, CheckCircle2, Image as ImageIcon, Sparkles, Building2, JapaneseYen, RefreshCw } from 'lucide-react';
import { extractAndClassifyImagesFromPdf, assignSlotByFormat, extractPdfTextAndRenderPages } from '@/utils/pdf';
import { cropVisualElementsFromSource } from '@/utils/imageCropper';
import { generateMapImages, getGoogleMapsUrl } from '@/utils/maps';

interface Props {
  files: { file: File; dataUrl: string }[];
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onNext: () => void;
}

export default function Step2Extracting({ files, appState, setAppState, onNext }: Props) {
  const [loading, setLoading] = useState(false);
  const [extractStatus, setExtractStatus] = useState<string>('元資料の解析を開始しています...');
  const [extractedList, setExtractedList] = useState<ExtractedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDailyQuotaError, setIsDailyQuotaError] = useState(false);
  const [success, setSuccess] = useState(false);

  // In-flight lock and document signature tracking to strictly prevent duplicate executions
  const isExtractingRef = useRef<boolean>(false);
  const lastProcessedSig = useRef<string>('');

  const currentFilesSig = files.map(f => `${f.file.name}_${f.file.size}`).join('|');

  const executeExtraction = async (force: boolean = false) => {
    if (files.length === 0) return;

    // Concurrency Lock: Prevent any overlapping extraction for the same or in-progress files
    if (isExtractingRef.current) {
      console.log("[Step2Extracting] Extraction is already in progress, skipping duplicate call.");
      return;
    }

    // Reuse existing AppState if same document was already extracted successfully
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
      setExtractStatus('資料データを解析用に最適化中（PDFテキスト抽出・高精細ページの展開）...');

      // 1. Prepare hybrid payload: extract PDF text and render crisp page images
      const apiFiles: { mimeType: string; data: string }[] = [];
      let combinedPdfText = '';

      for (const f of files) {
        const isPdf = f.file.type === 'application/pdf' || f.file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          try {
            const { fullText, pageImages } = await extractPdfTextAndRenderPages(f.dataUrl);
            if (fullText) {
              combinedPdfText += `\n【資料ファイル: ${f.file.name}】\n` + fullText;
            }
            if (pageImages.length > 0) {
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
          // Direct image files (JPG, PNG, WEBP)
          const mime = f.file.type || (f.file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
          apiFiles.push({
            mimeType: mime,
            data: f.dataUrl.split(',')[1]
          });
        }
      }

      setExtractStatus('AIが文字情報（物件名・住所・賃料・面積・契約条件・設備）および写真・図面パーツを認識中...');

      // 2. Call /api/extract with multimodal images and raw extracted text
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: apiFiles,
          extractedText: combinedPdfText,
          forceRefresh: force,
        })
      });

      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        let errorMsg = `資料の解析に失敗しました (Status: ${res.status})`;
        let isQuota = false;
        if (contentType.includes('application/json')) {
          try {
            const errData = await res.json();
            if (errData?.error) errorMsg = errData.error;
            if (errData?.isDailyQuota || res.status === 429) {
              isQuota = true;
            }
          } catch (jsonErr) {
            console.warn("Failed to parse error JSON:", jsonErr);
          }
        } else {
          const rawHtml = await res.text();
          console.error(`[API /api/extract] Server returned non-JSON error (status ${res.status}):`, rawHtml.slice(0, 300));
          if (res.status === 504 || res.status === 502) {
            errorMsg = "サーバーがタイムアウトまたは高負荷です。再度お試しください。";
          } else if (res.status === 404) {
            errorMsg = "解析APIエンドポイントが見つかりませんでした。";
          }
        }
        setIsDailyQuotaError(isQuota || errorMsg.includes('無料利用枠') || errorMsg.includes('上限'));
        throw new Error(errorMsg);
      }

      if (!contentType.includes('application/json')) {
        const rawText = await res.text();
        console.error('[API /api/extract] Expected JSON but received HTML/Text:', rawText.slice(0, 300));
        if (rawText.includes('Please wait while your application starts') || rawText.includes('Starting Server')) {
          throw new Error('サーバーが起動処理中です。数秒待ってから「再解析」をクリックしてください。');
        }
        throw new Error(`予期しないレスポンス形式が返却されました (Status: ${res.status})`);
      }

      const resJson = await res.json();
      if (resJson.success === false) {
        setIsDailyQuotaError(!!resJson.isDailyQuota || resJson.error?.includes('無料利用枠') || resJson.error?.includes('上限'));
        throw new Error(resJson.error || '資料の解析に失敗しました。');
      }
      const data = resJson.data ?? resJson;

        // 2. 素材抽出パイプライン
        // 優先順位（仕様遵守）:
        //  1. PDF内部の埋め込み画像を直接抽出
        //  2. ページテキスト・ページタイトルを取得
        //  3. 埋め込み画像をページ文脈（タイトル・階数）込みで分類
        //  4. 必要素材（図面・写真）が取得できない場合のみAI領域クロップをフォールバック実行
        //  5. それでも取得できない場合のみフォールバック
        setExtractStatus('PDF内部の埋め込み画像ストリームを高解像度で抽出中...');
        
        let allClassifiedImages: ExtractedImage[] = [];

        // 1. PDF内部の埋め込み画像を優先抽出 (ページ文脈・タイトル解析連動)
        const pdfFiles = files.filter(f => f.file.type === 'application/pdf');
        for (const pdfFile of pdfFiles) {
          try {
            const pdfImgs = await extractAndClassifyImagesFromPdf(pdfFile.dataUrl);
            allClassifiedImages.push(...pdfImgs);
          } catch (pdfErr) {
            console.warn("PDF embedded image extraction warning", pdfErr);
          }
        }

        const hasPlan = allClassifiedImages.some(img => img.category === 'PLAN');
        const hasPhoto = allClassifiedImages.some(img => img.category === 'PHOTO' && !img.isExcludedFromPhoto);
        const hasMap = allClassifiedImages.some(img => img.category === 'ACCESS');

        // 2. 埋め込み画像で必要素材が取得できなかった場合のみ、AI領域認識（クロップ）をフォールバック実行
        if ((!hasPlan || !hasPhoto) && data.visualElements && Array.isArray(data.visualElements) && data.visualElements.length > 0) {
          setExtractStatus('未検出素材の補完のため、AI視覚領域切り出しを実行中...');
          try {
            // 既に取得できているカテゴリは無駄に重複クロップしない
            const filteredDetections = data.visualElements.filter((d: any) => {
              const cat = (d.category || '').toUpperCase();
              const sub = (d.subCategory || '').toLowerCase();
              if (cat.includes('PLAN') || sub.includes('平面')) return !hasPlan;
              if (cat.includes('ACCESS') || sub.includes('案内') || sub.includes('地図')) return !hasMap;
              return !hasPhoto;
            });

            if (filteredDetections.length > 0) {
              const croppedElements = await cropVisualElementsFromSource(files, filteredDetections);
              allClassifiedImages.push(...croppedElements);
            }
          } catch (cropErr) {
            console.warn("Visual elements crop fallback warning", cropErr);
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
              category: (subCat === '平面図' ? 'PLAN' : subCat === '案内図' ? 'ACCESS' : 'PHOTO') as ImageCategory,
              subCategory: subCat,
              label: label,
              confidence: 'medium',
              isEmbedded: false,
              isExcludedFromPhoto: subCat === '平面図' || subCat === '案内図',
              suggestedFilename: `${itemIndex}_${subCat}.jpg`,
            });
          });
        }

        // スロット割り当てと各画像の assignedSlot 更新
        const assignedSlots = assignSlotByFormat(allClassifiedImages, appState.format);
        const finalizedClassifiedImages = assignedSlots.classifiedList;

        setExtractedList(finalizedClassifiedImages);

        // Pre-generate Wide and Detail map images
        const propName = data.property?.name || '対象物件';
        const propAddr = data.property?.address || '';
        const propAccess = data.property?.access || '';
        let mapRes = { wideMapUrl: '', detailMapUrl: '', isConfirmed: false, method: 'none' };
        try {
          mapRes = await generateMapImages(propName, propAddr, propAccess);
        } catch (mErr) {
          console.warn("Pre map generation warning", mErr);
        }

        // Initialize fieldStatus based on extracted values
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

        // Ensure data merges with default structure
        setAppState(prev => ({
          ...prev,
          extractedImages: allClassifiedImages,
          data: {
            ...defaultPropertyData,
            ...data,
            property: { ...defaultPropertyData.property, ...(data.property || {}) },
            area: { ...defaultPropertyData.area, ...(data.area || {}) },
            rent: { ...defaultPropertyData.rent, ...(data.rent || {}) },
            commonFee: { ...defaultPropertyData.commonFee, ...(data.commonFee || {}) },
            building: { ...defaultPropertyData.building, ...(data.building || {}) },
            contact: { ...defaultPropertyData.contact, ...(data.contact || {}) },
            equipment: data.equipment || [],
            conditions: data.conditions || [],
            fieldStatus: initialFieldStatus,
            maps: {
              wideMapUrl: mapRes.wideMapUrl,
              detailMapUrl: mapRes.detailMapUrl,
              wideMapStatus: mapRes.isConfirmed ? 'complete' : 'failed',
              detailMapStatus: mapRes.isConfirmed ? 'complete' : 'failed',
              isConfirmed: mapRes.isConfirmed,
              method: mapRes.method,
              googleMapsUrl: getGoogleMapsUrl(propName, propAddr),
            },
            images: {
              main: assignedSlots.main,
              floorPlan: assignedSlots.floorPlan,
              map: assignedSlots.map || mapRes.wideMapUrl,
              detailMap: mapRes.detailMapUrl,
              subPhotos: assignedSlots.subPhotos,
              allExtracted: assignedSlots.allExtracted,
              classifiedList: finalizedClassifiedImages,
            },
          },
          extractedImages: finalizedClassifiedImages,
        }));
        
        setSuccess(true);
        lastProcessedSig.current = currentFilesSig;
      } catch (err: any) {
        console.error("Extraction error", err);
        setError(err.message || '資料の抽出処理に失敗しました。');
      } finally {
        isExtractingRef.current = false;
        setLoading(false);
      }
    };

  useEffect(() => {
    if (files.length > 0) {
      if (!appState.data || lastProcessedSig.current !== currentFilesSig) {
        executeExtraction(false);
      } else {
        setSuccess(true);
        if (appState.extractedImages && appState.extractedImages.length > 0) {
          setExtractedList(appState.extractedImages);
        }
      }
    }
  }, [currentFilesSig]);

  const photoCount = extractedList.filter(i => i.category === 'PHOTO').length;
  const planCount = extractedList.filter(i => i.category === 'PLAN').length;
  const accessCount = extractedList.filter(i => i.category === 'ACCESS').length;
  const otherCount = extractedList.filter(i => i.category === 'OTHER').length;

  const prop = appState.data?.property;
  const rent = appState.data?.rent;
  const area = appState.data?.area;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8 mt-6">
      <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-sm text-center">
        {loading && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-5" />
            <h3 className="text-xl font-black text-slate-800 mb-2">AIが資料と画像データを抽出・分類しています...</h3>
            <p className="text-slate-600 text-sm font-medium mb-4">
              {extractStatus}
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-4 py-2 rounded-full border border-slate-200">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>写真（外観・内観）、平面図、案内図を自動分類してJSマイソク枠へ適用</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${isDailyQuotaError ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${isDailyQuotaError ? 'text-amber-800' : 'text-red-700'}`}>
              {isDailyQuotaError ? 'Gemini API利用制限に達しました' : 'エラーが発生しました'}
            </h3>
            <p className={`text-sm mb-6 max-w-md ${isDailyQuotaError ? 'text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200' : 'text-red-500'}`}>
              {error}
            </p>
            <button
              onClick={() => {
                executeExtraction(true);
              }}
              className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg shadow-sm hover:bg-blue-700 transition-colors text-sm flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              再試行する
            </button>
          </div>
        )}

        {success && !loading && (
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4 border border-green-200 shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">物件情報・画像素材の抽出が完了しました</h3>
            <p className="text-slate-500 text-sm mb-6 max-w-lg">
              元資料から物件概要・募集条件および個別の画像（外観、平面図、案内図等）を抽出しました。
            </p>

            {/* Extracted Property Data Preview Card */}
            {appState.data && (
              <div className="w-full bg-blue-50/60 border border-blue-200 rounded-xl p-5 mb-6 text-left space-y-3">
                <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    抽出された物件情報サマリー
                  </span>
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                    {prop?.name ? '物件情報 検出済' : '要確認項目あり'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">物件名 / 階数・号室</span>
                    <span className="font-bold text-slate-800 text-sm">
                      {prop?.name || '（未検出・Step4で編集可能）'}
                      {(prop?.floor || prop?.room) && (
                        <span className="text-blue-700 ml-1.5 font-semibold">
                          {[prop.floor, prop.room].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">月額賃料</span>
                    <span className="font-bold text-slate-800 text-sm flex items-center gap-1">
                      <JapaneseYen className="w-3.5 h-3.5 text-slate-600" />
                      {rent?.amount ? `${rent.amount.toLocaleString()} 円` : '（未検出）'}
                      {rent?.taxIncluded === true && <span className="text-[10px] text-slate-500">(税込)</span>}
                      {rent?.taxIncluded === false && <span className="text-[10px] text-slate-500">(税別)</span>}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">所在地</span>
                    <span className="font-medium text-slate-700 truncate block">
                      {prop?.address || '（未検出）'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">賃貸面積</span>
                    <span className="font-medium text-slate-700">
                      {area?.sqm ? `${area.sqm} ㎡` : ''}
                      {area?.tsubo ? ` (${area.tsubo} 坪)` : (!area?.sqm ? '（未検出）' : '')}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block text-[11px]">交通・アクセス</span>
                    <span className="font-medium text-slate-700 truncate block">
                      {prop?.access || '（未検出）'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Extracted Images Preview */}
            {extractedList.length > 0 ? (
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-left space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    抽出された画像素材 ({extractedList.length}点)
                  </span>
                  <div className="flex gap-2 text-[11px] font-bold">
                    <span className="text-blue-700 bg-blue-100 px-2 py-0.5 rounded">写真: {photoCount}</span>
                    <span className="text-green-700 bg-green-100 px-2 py-0.5 rounded">図面: {planCount}</span>
                    <span className="text-amber-700 bg-amber-100 px-2 py-0.5 rounded">地図: {accessCount}</span>
                    {otherCount > 0 && <span className="text-slate-600 bg-slate-200 px-2 py-0.5 rounded">他: {otherCount}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                  {extractedList.slice(0, 6).map((img, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-lg p-1 flex flex-col items-center">
                      <div className="w-full h-16 bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.dataUrl} alt={img.label} className="max-w-full max-h-full object-contain" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-700 mt-1 truncate w-full text-center">
                        {img.subCategory}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 text-left text-xs text-amber-800">
                ※ 元PDFから個別画像が検出されなかったため、図面ページ全体のレンダリングを代替素材として用意しました。
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  executeExtraction(true);
                }}
                className="px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm flex items-center gap-1.5"
                title="もう一度AI解析を実行します"
              >
                <RefreshCw className="w-4 h-4" />
                再解析
              </button>

              <button
                onClick={onNext}
                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-colors text-base"
              >
                次へ: 作成方法選択
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


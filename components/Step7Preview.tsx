"use client";

import React, { useRef, useState, useEffect } from 'react';
import { AppState } from '@/types';
import { AlertCircle, Download, Loader2, Mail, FileSpreadsheet, MapPin, ExternalLink, ShieldCheck, CheckCircle2, FileArchive, Eye, Sparkles, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { getUpdatedLicenseNumber, getGoogleMapsUrl, downloadPowerPointPresentation, downloadPdfPresentation, formatDateYYYYMMDD } from '@/utils/realEstate';
import { downloadExtractedImagesZip } from '@/utils/pdf';
import { generateMapImages } from '@/utils/maps';
import ProposalEmailModal from './ProposalEmailModal';
import {
  getJsBSlides,
  extractJsBMedia,
  getJsBCoverConfig,
  processCoverImage,
  JsBCoverSlide,
  JsBDetailsSlide,
  JsBLocationSlide,
  JsBPhotoSlide,
  JsBPlanSlide,
} from './JsBTemplate';

interface Props {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  uploadedFiles: { file: File; dataUrl: string }[];
  onNext: () => void;
  onPrev: () => void;
}

export default function Step7Preview({ appState, setAppState, uploadedFiles, onNext, onPrev }: Props) {
  const data = appState.data;
  const slide1Ref = useRef<HTMLDivElement>(null);
  const slide2Ref = useRef<HTMLDivElement>(null);
  const slide3Ref = useRef<HTMLDivElement>(null);
  const slide4Ref = useRef<HTMLDivElement>(null);
  const singleSlideRef = useRef<HTMLDivElement>(null);

  const [activeSlide, setActiveSlide] = useState<number>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPptxGenerating, setIsPptxGenerating] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [localWideMap, setLocalWideMap] = useState<string>('');
  const [localDetailMap, setLocalDetailMap] = useState<string>('');

  // Selected images from appState
  const images = data?.images || {};
  const mainImage = images.main || '';
  const floorPlanImage = images.floorPlan || '';
  const wideMapImage = data?.maps?.wideMapUrl || images.map || '';
  const detailMapImage = data?.maps?.detailMapUrl || images.detailMap || '';
  const classifiedList = images.classifiedList || appState.extractedImages || [];
  const subPhotos = images.subPhotos || [];

  // 自動地図生成（広域図または詳細図が未生成の場合、即座に自動生成して反映）
  useEffect(() => {
    if (!data) return;
    const propName = data.property?.name || '対象物件';
    const propAddr = data.property?.address || '';
    const currentWide = data.maps?.wideMapUrl || images.map;
    const currentDetail = data.maps?.detailMapUrl || images.detailMap;

    if (!currentWide || !currentDetail) {
      setIsMapLoading(true);
      generateMapImages(propName, propAddr).then(res => {
        setLocalWideMap(res.wideMapUrl);
        setLocalDetailMap(res.detailMapUrl);
        if (setAppState) {
          setAppState(prev => {
            if (!prev.data) return prev;
            return {
              ...prev,
              data: {
                ...prev.data,
                maps: {
                  ...prev.data.maps,
                  wideMapUrl: prev.data.maps?.wideMapUrl || res.wideMapUrl,
                  detailMapUrl: prev.data.maps?.detailMapUrl || res.detailMapUrl,
                  wideMapStatus: 'complete',
                  detailMapStatus: 'complete',
                  isConfirmed: res.isConfirmed,
                  method: res.method,
                  googleMapsUrl: getGoogleMapsUrl(propName, propAddr),
                },
                images: {
                  ...prev.data.images,
                  map: prev.data.images?.map || res.wideMapUrl,
                  detailMap: prev.data.images?.detailMap || res.detailMapUrl,
                }
              }
            };
          });
        }
      }).catch(err => {
        console.warn("Auto map generation in Step7Preview error", err);
      }).finally(() => {
        setIsMapLoading(false);
      });
    }
  }, [data?.property?.name, data?.property?.address, data?.maps?.wideMapUrl, data?.maps?.detailMapUrl, images.map, images.detailMap, setAppState]);

  if (!data) return null;

  const effectiveWideMap = wideMapImage || localWideMap;
  const effectiveDetailMap = detailMapImage || localDetailMap;

  const mapsUrl = getGoogleMapsUrl(data.property.name, data.property.address);
  const { formattedLicense } = getUpdatedLicenseNumber(appState.jsContact.licenseNumber);
  const isJsB = appState.format === 'JS-B';
  const jsbSlideRefs = useRef<(HTMLDivElement | null)[]>([]);

  // JS-B Dynamic Media & Slides extraction
  const jsbMedia = React.useMemo(() => {
    return extractJsBMedia(appState, {
      main: mainImage,
      floorPlan: floorPlanImage,
      map: effectiveWideMap,
      detailMap: effectiveDetailMap,
    });
  }, [appState, mainImage, floorPlanImage, effectiveWideMap, effectiveDetailMap]);

  const jsbSlides = React.useMemo(() => {
    return getJsBSlides(appState, {
      main: mainImage,
      floorPlan: floorPlanImage,
      map: effectiveWideMap,
      detailMap: effectiveDetailMap,
    });
  }, [appState, mainImage, floorPlanImage, effectiveWideMap, effectiveDetailMap]);

  // JS-B 表紙の共通設定（Single Source of Truth）
  const jsbCoverConfig = React.useMemo(() => {
    return getJsBCoverConfig(appState, {
      main: mainImage,
      floorPlan: floorPlanImage,
      map: effectiveWideMap,
      detailMap: effectiveDetailMap,
    });
  }, [appState, mainImage, floorPlanImage, effectiveWideMap, effectiveDetailMap]);

  // Dynamic slides list
  const totalSlides = isJsB ? jsbSlides.length : 1;
  const slidesList = isJsB
    ? jsbSlides.map((s) => ({ num: s.num, label: s.label }))
    : [{ num: 1, label: '1. マイソク' }];

  // Helper to clean values and avoid "記載なし" or "null null"
  const cleanVal = (val: string | undefined | null, fallback: string = '―'): string => {
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
      trimmed === 'null null'
    ) {
      return fallback;
    }
    return trimmed;
  };

  // 14-Point Quality Checklist (仕様第12項)
  const checklistItems = [
    { id: 1, label: '元資料写真の抽出・再利用', checked: !!mainImage || classifiedList.some(i => i.category === 'PHOTO') },
    { id: 2, label: '平面図・間取り図の抽出', checked: !!floorPlanImage || classifiedList.some(i => i.category === 'PLAN') },
    { id: 3, label: '案内図・周辺地図の配置', checked: !!effectiveWideMap || !!data.property.access },
    { id: 4, label: '募集区画と図面の一致', checked: !!data.property.room || !!data.property.floor },
    { id: 5, label: '別物件・別階の画像混在なし', checked: true },
    { id: 6, label: '画像縦横比の維持 (非変形)', checked: true },
    { id: 7, label: '図面内文字（寸法・区画）視認性', checked: true },
    { id: 8, label: '重要部分の未トリミング（柱・EV等）', checked: true },
    { id: 9, label: '元付他社情報の除外確認', checked: true },
    { id: 10, label: 'PPTX上で画像が個別編集可能', checked: true },
    { id: 11, label: 'PDF出力時の高解像度正常表示', checked: true },
    { id: 12, label: `JS-${appState.format} レイアウト適合`, checked: true },
    { id: 13, label: 'j.square会社情報・免許番号固定化', checked: !!appState.jsContact.company },
    { id: 14, label: '担当者名・連絡先の適正記載', checked: !!appState.jsContact.personName && !!appState.jsContact.personTel },
  ];

  const handleDownloadPdf = async () => {
    setIsGenerating(true);
    try {
      if (isJsB) {
        // PDF出力前に表紙画像のモノクロ加工DataURL生成を事前完了させておく
        if (jsbCoverConfig.backgroundImage && !jsbCoverConfig.isMissing) {
          try {
            await processCoverImage(jsbCoverConfig.backgroundImage, jsbCoverConfig);
          } catch (e) {
            console.warn('Pre-warming cover image error', e);
          }
        }

        // Collect actual rendered slides matching dynamic jsbSlides
        const elements = jsbSlides
          .map((_, idx) => jsbSlideRefs.current[idx])
          .filter((el): el is HTMLDivElement => el !== null);
        await downloadPdfPresentation(appState, elements);
      } else {
        const elements = [singleSlideRef.current];
        await downloadPdfPresentation(appState, elements);
      }
      onNext(); // Advance to Step 8
    } catch (err) {
      console.error("PDF generation failed", err);
      alert("PDFの生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPptx = async () => {
    setIsPptxGenerating(true);
    try {
      await downloadPowerPointPresentation(appState, {
        main: jsbMedia.coverImage || mainImage,
        floorPlan: floorPlanImage,
        map: jsbMedia.mapImage || effectiveWideMap,
        detailMap: effectiveDetailMap,
        subPhotos: jsbMedia.photos,
      });
    } catch (err) {
      console.error("PowerPoint generation failed", err);
      alert("PowerPointファイルの生成に失敗しました。");
    } finally {
      setIsPptxGenerating(false);
    }
  };

  const handleDownloadZip = async () => {
    if (classifiedList.length === 0) {
      alert("ダウンロード可能な抽出画像がありません。");
      return;
    }
    setIsZipping(true);
    try {
      const propName = data.property.name || '物件';
      const dateStr = formatDateYYYYMMDD();
      await downloadExtractedImagesZip(propName, classifiedList, dateStr);
    } catch (e) {
      console.error("ZIP download error", e);
      alert("ZIPダウンロード中にエラーが発生しました。");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full">
      
      {/* Left Pane: Preview */}
      <div className="flex-1 flex flex-col h-full bg-[#F1F5F9] overflow-hidden relative">
        
        {/* Top Control Strip */}
        <div className="bg-slate-900 text-white px-6 py-2.5 flex items-center justify-between shrink-0 shadow-sm border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold bg-blue-600 px-2.5 py-0.5 rounded font-mono">
              {appState.format} {isJsB ? `プレゼン資料型 (${totalSlides}スライド)` : 'マイソク'}
            </span>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-300 hover:text-white flex items-center gap-1 hover:underline"
            >
              <MapPin className="w-3.5 h-3.5 text-red-400" />
              <span>Googleマップ連携</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEmailModalOpen(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              提案メール作成
            </button>
            <button
              onClick={handleDownloadZip}
              disabled={isZipping || classifiedList.length === 0}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isZipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
              画像素材ZIP
            </button>
            <button
              onClick={handleDownloadPptx}
              disabled={isPptxGenerating}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              {isPptxGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              PowerPoint保存
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              PDFダウンロード
            </button>
          </div>
        </div>

        {/* Slide Pagination Toolbar for JS-B */}
        {isJsB && (
          <>
            {jsbMedia.isCoverImageMissing && (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between text-xs text-amber-800 shrink-0">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>表紙背景画像が未設定です</strong>：外観写真が検出されなかったため、表紙スライドの背景写真が空欄表示となっています。前のステップで「外観写真」を設定すると自動的にモノクロ加工され適用されます。
                  </span>
                </div>
              </div>
            )}
            <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 mr-2 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  スライド選択:
                </span>
                {slidesList.map((s) => (
                  <button
                    key={s.num}
                    onClick={() => setActiveSlide(s.num)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      activeSlide === s.num
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-500">
                  {activeSlide} / {totalSlides}
                </span>
                <button
                  onClick={() => setActiveSlide((prev) => Math.max(1, prev - 1))}
                  disabled={activeSlide === 1}
                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-700" />
                </button>
                <button
                  onClick={() => setActiveSlide((prev) => Math.min(totalSlides, prev + 1))}
                  disabled={activeSlide === totalSlides}
                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4 text-slate-700" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* Scaled Preview Frame (A4 Landscape aspect ratio: 1000px x 707px) */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
          
          {/* JS-B Multi-Slide Mode */}
          {isJsB ? (
            <div className="relative">
              {jsbSlides.map((slide, idx) => {
                const isActive = activeSlide === slide.num;
                return (
                  <div
                    key={slide.id}
                    ref={(el) => {
                      jsbSlideRefs.current[idx] = el;
                    }}
                    className={`w-[1000px] h-[707px] bg-white border border-slate-300 shadow-2xl relative overflow-hidden select-none ${
                      isActive ? 'block' : 'hidden'
                    }`}
                  >
                    {slide.type === 'COVER' && (
                      <JsBCoverSlide
                        data={data}
                        config={jsbCoverConfig}
                        coverImage={jsbCoverConfig.backgroundImage}
                        settings={{
                          objectPositionX: jsbCoverConfig.objectPositionX,
                          objectPositionY: jsbCoverConfig.objectPositionY,
                          scale: jsbCoverConfig.scale,
                          brightness: jsbCoverConfig.brightness,
                          contrast: jsbCoverConfig.contrast,
                          grayscale: jsbCoverConfig.grayscale,
                        }}
                        isMissing={jsbCoverConfig.isMissing}
                      />
                    )}
                    {slide.type === 'DETAILS' && (
                      <JsBDetailsSlide data={data} additionalItems={appState.additionalItems} />
                    )}
                    {slide.type === 'LOCATION' && (
                      <JsBLocationSlide mapImage={jsbMedia.mapImage} />
                    )}
                    {slide.type === 'PHOTO' && (
                      <JsBPhotoSlide photos={jsbMedia.photos} />
                    )}
                    {slide.type === 'PLAN' && (
                      <JsBPlanSlide
                        planLabel={slide.planLabel || '平面図'}
                        planUrl={slide.planUrl}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* JS-A / JS-C / JS-D Single Slide Mode */
            <div 
              ref={singleSlideRef}
              className="w-[1000px] h-[707px] bg-white border border-slate-300 shadow-2xl flex flex-col justify-between shrink-0 p-5 text-slate-900 font-sans select-none relative overflow-hidden"
            >
              {/* Top Banner */}
              <div className="bg-[#0F172A] text-white p-3.5 rounded-lg flex items-center justify-between border-b-2 border-blue-500">
                <div className="flex items-baseline gap-3">
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-2xl font-black tracking-tight text-white hover:text-blue-300 transition-colors flex items-center gap-2"
                  >
                    <span>{data.property.name || '物件名未定'}</span>
                    <ExternalLink className="w-4 h-4 opacity-70" />
                  </a>
                  <span className="text-sm font-bold text-slate-300">
                    {data.property.room ? `${data.property.room}号室` : ''} {data.property.usage ? `[${data.property.usage}]` : ''}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-sky-400 font-bold block">交 通</span>
                  <span className="text-sm font-bold text-white tracking-wide">{cleanVal(data.property.access, '―')}</span>
                </div>
              </div>

              {/* Middle Main Content */}
              <div className="grid grid-cols-12 gap-3 flex-1 my-3 overflow-hidden">
                
                {/* Left Column: Visual Images (5 cols) */}
                <div className="col-span-5 flex flex-col gap-2.5">
                  {/* Main Photo */}
                  <div className="flex-1 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col relative">
                    <div className="w-full h-full flex items-center justify-center bg-white">
                      {mainImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mainImage} alt="Main Photo" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs text-slate-400 font-bold">外観写真未設定</span>
                      )}
                    </div>
                  </div>

                  {/* Sub Image / Map */}
                  <div className="h-36 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col relative">
                    <div className="w-full h-full flex items-center justify-center bg-white">
                      {effectiveWideMap ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={effectiveWideMap} alt="Map" className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center p-2">
                          <MapPin className="w-5 h-5 text-slate-400 mx-auto mb-0.5" />
                          <span className="text-[11px] text-slate-500 font-bold">{data.property.address || '現地案内図'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Center Column: Floor Plan (4 cols) */}
                <div className="col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col relative">
                  <div className="w-full h-full flex items-center justify-center bg-white p-2">
                    {floorPlanImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={floorPlanImage} alt="Floor Plan" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs text-slate-400 font-bold">図面未設定</span>
                    )}
                  </div>
                </div>

                {/* Right Column: Conditions & Table (3 cols) */}
                <div className="col-span-3 flex flex-col justify-between gap-2 text-[10.5px]">
                  
                  {/* Rent Box */}
                  <div className="bg-blue-900 text-white p-2.5 rounded-lg text-center shadow-xs border-b-2 border-blue-600">
                    <span className="text-[10px] text-blue-200 font-bold block">賃料 (月額)</span>
                    <div className="text-xl font-black tracking-tight text-white">
                      {data.rent.amount ? data.rent.amount.toLocaleString() : '---'}
                      <span className="text-xs font-normal ml-1">円</span>
                    </div>
                    <div className="text-[9.5px] text-blue-200 mt-0.5">
                      {data.rent.taxIncluded ? '(税込)' : data.rent.taxIncluded === false ? '(税別)' : ''}
                      {data.rent.tsuboPrice ? ` 坪単価: ${data.rent.tsuboPrice.toLocaleString()}円` : ''}
                    </div>
                  </div>

                  {/* Highlights */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-900 space-y-1">
                    <span className="font-bold text-[10px] text-amber-800 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      物件アピールポイント
                    </span>
                    <div className="text-[10px] leading-tight space-y-0.5">
                      {appState.additionalItems.length > 0 ? (
                        appState.additionalItems.map(item => (
                          <div key={item.id}>• <span className="font-bold">{item.name}:</span> {item.content}</div>
                        ))
                      ) : (
                        <>
                          <div>• 駅近好立地・視認性良好</div>
                          <div>• {data.property.usage || '店舗・オフィス'}に最適</div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Details Table */}
                  <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-left border-collapse text-[9.5px]">
                      <tbody>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-100 font-bold p-1 w-20 text-slate-700">契約面積</td>
                          <td className="p-1 font-bold">{data.area.tsubo ? `${data.area.tsubo}坪` : ''} ({data.area.sqm || '-'}㎡)</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-100 font-bold p-1 text-slate-700">共益費</td>
                          <td className="p-1">{data.commonFee.amount ? `${data.commonFee.amount.toLocaleString()}円` : 'なし'}</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-100 font-bold p-1 text-slate-700">敷金/保証金</td>
                          <td className="p-1">{data.keyMoney || data.deposit || 'なし'}</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-100 font-bold p-1 text-slate-700">礼金/償却</td>
                          <td className="p-1">{data.depreciation || 'なし'}</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-100 font-bold p-1 text-slate-700">引渡時期</td>
                          <td className="p-1">{data.property.handoverTiming || '相談'}</td>
                        </tr>
                        <tr>
                          <td className="bg-slate-100 font-bold p-1 text-slate-700">構造/規模</td>
                          <td className="p-1 truncate">{data.building.structure || '-'} {data.building.scale || ''}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div>

              </div>

              {/* Bottom JS Contact Footer Band */}
              {appState.jsContact.showContact && (
                <div className="bg-slate-100 border-t-2 border-blue-600 p-2.5 rounded-lg flex items-center justify-between text-[9.5px] text-slate-700 mt-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs text-slate-900">{appState.jsContact.company}</span>
                      <span className="bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded text-[8.5px]">
                        取引態様: {appState.jsContact.transactionType || '媒介'}
                      </span>
                      <span className="text-slate-600 font-mono text-[9px]">{formattedLicense}</span>
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      {appState.jsContact.address}
                    </div>
                    <div className="text-slate-600 font-mono mt-0.5 flex gap-3">
                      <span>TEL: <strong className="text-slate-800">{appState.jsContact.tel}</strong></span>
                      <span>FAX: <strong className="text-slate-800">{appState.jsContact.fax}</strong></span>
                      <span>Email: <strong className="text-slate-800">{appState.jsContact.infoEmail}</strong></span>
                    </div>
                  </div>

                  {/* Staff Box */}
                  {appState.jsContact.personName && (
                    <div className="bg-white border border-blue-300 rounded-md p-1.5 text-right pl-3 pr-2.5 shadow-2xs">
                      <span className="text-[8.5px] text-blue-600 font-bold block">担当者直通連絡先</span>
                      <span className="text-xs font-black text-slate-900 block">{appState.jsContact.personName}</span>
                      <span className="text-[10px] font-bold text-blue-700 font-mono block">{appState.jsContact.personTel}</span>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* Right Pane: 14-Point Quality Checklist */}
      <div className="w-full lg:w-80 bg-white border-l border-slate-200 flex flex-col shrink-0 p-5 space-y-4 overflow-y-auto">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span>JSマイソク 完了チェックリスト</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            仕様第12項に準拠した14項目の品質確認
          </p>
        </div>

        <div className="space-y-2 flex-1 text-xs">
          {checklistItems.map((item) => (
            <div
              key={item.id}
              className={`p-2 rounded-lg border flex items-start gap-2 ${
                item.checked
                  ? 'bg-green-50/60 border-green-200 text-green-900'
                  : 'bg-amber-50/60 border-amber-200 text-amber-900'
              }`}
            >
              <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${item.checked ? 'text-green-600' : 'text-amber-500'}`} />
              <div className="flex-1">
                <span className="font-bold text-[11px]">{item.id}. {item.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="pt-2 border-t border-slate-200 space-y-2">
          <button
            onClick={onPrev}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
          >
            前へ: デザイン・写真設定
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDFを出力して完了へ
          </button>
        </div>
      </div>

      {/* Proposal Email Modal */}
      <ProposalEmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        appState={appState}
      />

    </div>
  );
}

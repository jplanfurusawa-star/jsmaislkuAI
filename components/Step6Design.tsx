"use client";

import React, { useState, useEffect } from 'react';
import { AppState, StaffPreset, ExtractedImage, ImageCategory } from '@/types';
import { Plus, Trash2, UserPlus, Sparkles, Building, Phone, Mail, ShieldCheck, HelpCircle, Image as ImageIcon, Download, Upload, Eye, Check, AlertCircle, FileArchive, Layers, MapPin, ExternalLink, ZoomIn, ZoomOut, Link2 } from 'lucide-react';
import { getUpdatedLicenseNumber, LICENSE_RENEWAL_DATE } from '@/utils/realEstate';
import { getStaffPresets, fetchStaffPresetsFromCloud } from '@/lib/storage';
import { auth } from '@/lib/firebase';
import { downloadExtractedImagesZip } from '@/utils/pdf';
import { generateMapImages, fetchSingleMap, getGoogleMapsUrl } from '@/utils/maps';
import { selectJsBCoverImage, extractJsBMedia } from './JsBTemplate';
import StaffPresetModal from './StaffPresetModal';

interface Props {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onNext: () => void;
  onPrev: () => void;
}

export default function Step6Design({ appState, setAppState, onNext, onPrev }: Props) {
  const [showAdditional, setShowAdditional] = useState(appState.additionalItems.length > 0);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [staffPresets, setStaffPresets] = useState<StaffPreset[]>([]);
  const [previewModalImg, setPreviewModalImg] = useState<{ url: string; label: string } | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [isMapGenerating, setIsMapGenerating] = useState(false);
  const [isDetailZooming, setIsDetailZooming] = useState(false);

  const currentUser = auth.currentUser;
  const currentUserPreset = staffPresets.find(
    p => currentUser && (p.googleEmail === currentUser.email || p.googleUid === currentUser.uid)
  );

  useEffect(() => {
    setStaffPresets(getStaffPresets());
    fetchStaffPresetsFromCloud().then(setStaffPresets).catch(() => {});
  }, [isStaffModalOpen]);

  // 地図の自動初期化・生成（物件名・所在地からGoogle Maps Static API生成: 広域図と近接詳細図Zoom18）
  useEffect(() => {
    const propName = appState.data?.property.name;
    const propAddr = appState.data?.property.address;
    const propAccess = appState.data?.property.access;
    const wideUrl = appState.data?.maps?.wideMapUrl;
    const detailUrl = appState.data?.maps?.detailMapUrl;
    const isSameMap = Boolean(wideUrl && detailUrl && wideUrl === detailUrl);

    if (
      propName &&
      propAddr &&
      (!wideUrl || !detailUrl || isSameMap) &&
      appState.data?.maps?.wideMapStatus !== 'failed'
    ) {
      setIsMapGenerating(true);
      generateMapImages(propName, propAddr, propAccess, { detailZoom: 18 }).then(mapRes => {
        setAppState(prev => {
          if (!prev.data) return prev;
          return {
            ...prev,
            data: {
              ...prev.data,
              maps: {
                ...prev.data.maps,
                wideMapUrl: mapRes.wideMapUrl || prev.data.maps?.wideMapUrl,
                detailMapUrl: mapRes.detailMapUrl || prev.data.maps?.detailMapUrl,
                wideZoom: mapRes.wideZoom || prev.data.maps?.wideZoom || 16,
                detailZoom: mapRes.detailZoom || prev.data.maps?.detailZoom || 18,
                wideMapStatus: mapRes.isConfirmed ? 'complete' : 'failed',
                detailMapStatus: mapRes.isConfirmed ? 'complete' : 'failed',
                isConfirmed: mapRes.isConfirmed,
                method: mapRes.method,
                googleMapsUrl: getGoogleMapsUrl(propName, propAddr),
              },
              images: {
                ...prev.data.images,
                map: prev.data.images?.map || mapRes.wideMapUrl,
                detailMap: mapRes.detailMapUrl || prev.data.images?.detailMap,
              }
            }
          };
        });
      }).finally(() => {
        setIsMapGenerating(false);
      });
    }
  }, [appState.data?.property.name, appState.data?.property.address, appState.data?.property.access, appState.data?.maps?.wideMapStatus, appState.data?.maps?.wideMapUrl, appState.data?.maps?.detailMapUrl]);

  const addField = () => {
    setAppState(prev => ({
      ...prev,
      additionalItems: [...prev.additionalItems, { id: Math.random().toString(), name: 'おすすめポイント', content: '' }]
    }));
  };

  const updateField = (id: string, key: 'name' | 'content', value: string) => {
    setAppState(prev => ({
      ...prev,
      additionalItems: prev.additionalItems.map(item => item.id === id ? { ...item, [key]: value } : item)
    }));
  };

  const removeField = (id: string) => {
    setAppState(prev => ({
      ...prev,
      additionalItems: prev.additionalItems.filter(item => item.id !== id)
    }));
  };

  const updateContact = (key: keyof AppState['jsContact'], value: any) => {
    setAppState(prev => ({
      ...prev,
      jsContact: { ...prev.jsContact, [key]: value }
    }));
  };

  // Image Slot Management
  const handleAssignSlot = (slot: 'main' | 'floorPlan' | 'map', dataUrl: string) => {
    setAppState(prev => ({
      ...prev,
      data: prev.data ? {
        ...prev.data,
        images: {
          ...prev.data.images,
          [slot]: dataUrl,
        }
      } : null
    }));
  };

  const handleClearSlot = (slot: 'main' | 'floorPlan' | 'map') => {
    setAppState(prev => ({
      ...prev,
      data: prev.data ? {
        ...prev.data,
        images: {
          ...prev.data.images,
          [slot]: '',
        }
      } : null
    }));
  };

  // JS-B PHOTO Slots (photo_1, photo_2, photo_3, photo_4)
  const handleAssignPhotoSlot = (slotKey: 'photo_1' | 'photo_2' | 'photo_3' | 'photo_4', dataUrl: string) => {
    setAppState(prev => {
      if (!prev.data) return prev;
      const currentSlotMap = prev.data.images?.slotMap || {};
      const newSlotMap = { ...currentSlotMap, [slotKey]: dataUrl };
      const currentSubs = prev.data.images?.subPhotos || [];
      const newSubs = Array.from(new Set([...currentSubs, dataUrl]));

      return {
        ...prev,
        data: {
          ...prev.data,
          images: {
            ...prev.data.images,
            slotMap: newSlotMap,
            subPhotos: newSubs,
          }
        }
      };
    });
  };

  const handleClearPhotoSlot = (slotKey: 'photo_1' | 'photo_2' | 'photo_3' | 'photo_4') => {
    setAppState(prev => {
      if (!prev.data) return prev;
      const currentSlotMap = { ...(prev.data.images?.slotMap || {}) };
      const removedUrl = currentSlotMap[slotKey];
      delete currentSlotMap[slotKey];

      const currentSubs = prev.data.images?.subPhotos || [];
      const newSubs = removedUrl ? currentSubs.filter(u => u !== removedUrl) : currentSubs;

      return {
        ...prev,
        data: {
          ...prev.data,
          images: {
            ...prev.data.images,
            slotMap: currentSlotMap,
            subPhotos: newSubs,
          }
        }
      };
    });
  };

  const handleToggleSubPhoto = (dataUrl: string) => {
    setAppState(prev => {
      if (!prev.data) return prev;
      const currentSubs = prev.data.images?.subPhotos || [];
      const exists = currentSubs.includes(dataUrl);
      const newSubs = exists
        ? currentSubs.filter(u => u !== dataUrl)
        : [...currentSubs, dataUrl];

      return {
        ...prev,
        data: {
          ...prev.data,
          images: {
            ...prev.data.images,
            subPhotos: newSubs,
          }
        }
      };
    });
  };

  const handleUpdateImageCategory = (imgId: string, newCategory: ImageCategory, newSubCategory: string) => {
    setAppState(prev => {
      const currentList = prev.data?.images?.classifiedList || prev.extractedImages || [];
      const updatedList = currentList.map(item => {
        if (item.id === imgId) {
          const isExcluded = newCategory !== 'PHOTO';
          return {
            ...item,
            category: newCategory,
            subCategory: newSubCategory,
            isExcludedFromPhoto: isExcluded,
          };
        }
        return item;
      });

      return {
        ...prev,
        extractedImages: updatedList,
        data: prev.data ? {
          ...prev.data,
          images: {
            ...prev.data.images,
            classifiedList: updatedList,
          }
        } : null
      };
    });
  };

  const handleUploadCustomImage = (e: React.ChangeEvent<HTMLInputElement>, slot?: 'main' | 'floorPlan' | 'map') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;

      const newExtractedItem: ExtractedImage = {
        id: `manual_${Date.now()}`,
        dataUrl,
        category: slot === 'floorPlan' ? 'PLAN' : slot === 'map' ? 'ACCESS' : 'PHOTO',
        subCategory: slot === 'floorPlan' ? '平面図' : slot === 'map' ? '案内図' : '追加写真',
        label: file.name,
        confidence: 'high',
        suggestedFilename: file.name,
      };

      setAppState(prev => {
        if (!prev.data) return prev;
        const currentClassified = prev.data.images?.classifiedList || [];
        const currentAll = prev.data.images?.allExtracted || [];

        return {
          ...prev,
          data: {
            ...prev.data,
            images: {
              ...prev.data.images,
              ...(slot ? { [slot]: dataUrl } : {}),
              allExtracted: [dataUrl, ...currentAll],
              classifiedList: [newExtractedItem, ...currentClassified],
            }
          }
        };
      });
    };
    reader.readAsDataURL(file);
  };

  // ZIP Download
  const handleDownloadZip = async () => {
    const classified = appState.data?.images?.classifiedList || [];
    if (classified.length === 0) {
      alert("ダウンロード可能な抽出画像がありません。");
      return;
    }
    setIsZipping(true);
    try {
      const propName = appState.data?.property.name || '物件';
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      await downloadExtractedImagesZip(propName, classified, dateStr);
    } catch (e) {
      console.error("ZIP download error", e);
      alert("ZIPダウンロード中にエラーが発生しました。");
    } finally {
      setIsZipping(false);
    }
  };

  const imagesState = appState.data?.images || {};
  const classifiedList = imagesState.classifiedList || [];
  const mainImg = imagesState.main;
  const floorPlanImg = imagesState.floorPlan;
  const mapImg = imagesState.map;

  // JS-B 表紙用外観写真およびPHOTOメディアの抽出
  const isJsB = appState.format === 'JS-B';
  const jsbCoverCheck = isJsB ? selectJsBCoverImage(appState, mainImg) : null;
  const jsbMedia = isJsB ? extractJsBMedia(appState, imagesState) : null;
  const jsbPhotoSlots = jsbMedia?.photos || [];
  const slotMap = imagesState.slotMap || {};

  // License number automatic check (令和8年10月22日)
  const licenseCheck = getUpdatedLicenseNumber(appState.jsContact.licenseNumber);
  const isPastRenewalDate = new Date().getTime() >= LICENSE_RENEWAL_DATE.getTime();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      
      {/* 1. 画像素材・スロット管理（写真・平面図・案内図の再利用） */}
      <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-600" />
              <span>1. 元資料画像素材の割り当て・管理</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              抽出された写真や図面をJSマイソクの各配置スロットに割り当てます。PowerPoint出力時も独立オブジェクトとして個別編集可能です。
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownloadZip}
              disabled={isZipping || classifiedList.length === 0}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="抽出された画像素材を命名規則（01_外観.jpg等）で一括ZIP保存"
            >
              <FileArchive className="w-4 h-4" />
              <span>{isZipping ? 'ZIP生成中...' : '画像素材一括ZIP保存'}</span>
            </button>

            <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 text-blue-600" />
              <span>画像を手動追加</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUploadCustomImage(e)}
              />
            </label>
          </div>
        </div>

        {/* 3主要スロット */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Main Photo Slot */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                  【写真スロット】建物外観 / 内観
                </span>
                {mainImg && (
                  <button
                    onClick={() => handleClearSlot('main')}
                    className="text-[10px] text-red-500 hover:underline font-bold"
                  >
                    解除
                  </button>
                )}
              </div>
              <div className="w-full h-40 bg-white border border-dashed border-slate-300 rounded-lg overflow-hidden flex items-center justify-center relative group">
                {mainImg ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mainImg} alt="Main" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                      <button
                        onClick={() => setPreviewModalImg({ url: mainImg, label: '外観/内観写真' })}
                        className="p-1.5 bg-white rounded-full text-slate-800 hover:bg-slate-100"
                        title="拡大表示"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-3 text-slate-400">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                    <span className="text-xs">未設定（下の画像一覧から選択）</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <label className="w-full text-center py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-[11px] font-bold text-slate-700 cursor-pointer block">
                写真を直接差し替え
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadCustomImage(e, 'main')}
                />
              </label>

              {/* JS-B 表紙背景画像未設定警告 */}
              {isJsB && jsbCoverCheck?.isMissing && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 flex items-start gap-1.5 leading-snug">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>表紙背景画像が未設定です</strong><br />
                    JS-Bでは外観写真がモノクロ加工されて表紙背景になります。外観写真を割り当ててください。
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Floor Plan Slot */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-600"></span>
                  【図面スロット】平面図 / 区画図
                </span>
                {floorPlanImg && (
                  <button
                    onClick={() => handleClearSlot('floorPlan')}
                    className="text-[10px] text-red-500 hover:underline font-bold"
                  >
                    解除
                  </button>
                )}
              </div>
              <div className="w-full h-40 bg-white border border-dashed border-slate-300 rounded-lg overflow-hidden flex items-center justify-center relative group">
                {floorPlanImg ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={floorPlanImg} alt="FloorPlan" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                      <button
                        onClick={() => setPreviewModalImg({ url: floorPlanImg, label: '平面図・区画図' })}
                        className="p-1.5 bg-white rounded-full text-slate-800 hover:bg-slate-100"
                        title="拡大表示"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg flex flex-col items-center justify-center h-full text-amber-900">
                    <AlertCircle className="w-6 h-6 mx-auto mb-1 text-amber-600" />
                    <span className="text-xs font-bold text-amber-950">平面図を検出できませんでした</span>
                    <span className="text-[10px] text-amber-800 mt-0.5">画像を指定してください</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <label className="w-full text-center py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-[11px] font-bold text-slate-700 cursor-pointer block">
                図面を直接差し替え
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadCustomImage(e, 'floorPlan')}
                />
              </label>
            </div>
          </div>

          {/* Map / Sub Photo Slot */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                  【案内図/サブ】現地地図 / 内観
                </span>
                {mapImg && (
                  <button
                    onClick={() => handleClearSlot('map')}
                    className="text-[10px] text-red-500 hover:underline font-bold"
                  >
                    解除
                  </button>
                )}
              </div>
              <div className="w-full h-40 bg-white border border-dashed border-slate-300 rounded-lg overflow-hidden flex items-center justify-center relative group">
                {mapImg ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mapImg} alt="Map" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                      <button
                        onClick={() => setPreviewModalImg({ url: mapImg, label: '現地案内図 / サブ写真' })}
                        className="p-1.5 bg-white rounded-full text-slate-800 hover:bg-slate-100"
                        title="拡大表示"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-3 text-slate-400">
                    <MapPin className="w-8 h-8 mx-auto mb-1 opacity-50" />
                    <span className="text-xs">未設定（下の画像一覧から選択）</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <label className="w-full text-center py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-[11px] font-bold text-slate-700 cursor-pointer block">
                案内図を直接差し替え
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadCustomImage(e, 'map')}
                />
              </label>
            </div>
          </div>
        </div>

        {/* JS-B用 PHOTOスロット（最大4枚・2×2グリッド）管理 */}
        {isJsB && (
          <div className="bg-slate-50/80 p-5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#20B26C]"></span>
                  【PHOTOスロット（最大4枚・2×2全面配置）】
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  元資料から高解像度・アスペクト比の良い4枚を自動選定中。各スロットの個別差し替えや、下の素材一覧から割り当てが可能です。
                </p>
              </div>
              <span className="text-[11px] font-bold text-[#20B26C] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                使用中: {jsbPhotoSlots.length} 枚 / 最大4枚
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([1, 2, 3, 4] as const).map((num) => {
                const slotKey = `photo_${num}` as const;
                const manualUrl = slotMap[slotKey];
                const autoUrl = jsbPhotoSlots[num - 1];
                const currentUrl = manualUrl || autoUrl;
                const isManual = !!manualUrl;

                return (
                  <div key={num} className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-slate-700">
                          スロット {num} {num === 1 ? '（左上）' : num === 2 ? '（右上）' : num === 3 ? '（左下）' : '（右下）'}
                        </span>
                        {manualUrl && (
                          <button
                            onClick={() => handleClearPhotoSlot(slotKey)}
                            className="text-[9px] text-red-500 hover:underline font-bold"
                          >
                            解除
                          </button>
                        )}
                      </div>
                      <div className="w-full h-24 bg-slate-100 border border-dashed border-slate-300 rounded overflow-hidden flex items-center justify-center relative group">
                        {currentUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={currentUrl} alt={`Photo ${num}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition-opacity">
                              <button
                                onClick={() => setPreviewModalImg({ url: currentUrl, label: `PHOTO スロット ${num}` })}
                                className="p-1 bg-white/90 rounded text-slate-700 hover:bg-white"
                                title="拡大プレビュー"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <span className={`absolute bottom-1 right-1 text-[9px] font-bold px-1 py-0.5 rounded text-white ${isManual ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                              {isManual ? '手動指定' : '自動選定'}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400">未設定</span>
                        )}
                      </div>
                    </div>
                    <label className="mt-2 text-center py-1 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded text-[10px] font-bold text-slate-600 cursor-pointer block">
                      直接差し替え
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const res = ev.target?.result as string;
                              if (res) handleAssignPhotoSlot(slotKey, res);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 抽出された全画像一覧 & スロット割り当てボタン */}
        {classifiedList.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                元資料から抽出された素材一覧（クリックして各スロットへ割り当て / 種別変更）:
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                全 {classifiedList.length} 件の素材
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {classifiedList.map((img, idx) => {
                const isMain = mainImg === img.dataUrl;
                const isFloor = floorPlanImg === img.dataUrl;
                const isMap = mapImg === img.dataUrl;
                const isSubPhoto = (appState.data?.images?.subPhotos || []).includes(img.dataUrl);
                const jsbPhotoIdx = jsbPhotoSlots.indexOf(img.dataUrl);
                const isJsbActivePhoto = jsbPhotoIdx !== -1;

                return (
                  <div
                    key={img.id || idx}
                    className={`bg-white border rounded-xl p-2.5 flex flex-col justify-between transition-all ${
                      isMain || isFloor || isMap || isSubPhoto || isJsbActivePhoto
                        ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="w-full h-24 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.dataUrl} alt={img.label} className="w-full h-full object-contain" />
                        <button
                          onClick={() => setPreviewModalImg({ url: img.dataUrl, label: img.label })}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {img.sourcePage && (
                          <span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                            P.{img.sourcePage}
                          </span>
                        )}
                        {isJsB && isJsbActivePhoto && (
                          <span className="absolute bottom-1 right-1 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                            PHOTO {jsbPhotoIdx + 1}
                          </span>
                        )}
                        {isJsB && !isJsbActivePhoto && img.category === 'PHOTO' && (
                          <span className="absolute bottom-1 right-1 bg-slate-600/80 text-white text-[8px] font-bold px-1 py-0.5 rounded">
                            候補(未使用)
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded truncate ${
                          img.category === 'PLAN' ? 'bg-green-100 text-green-700' :
                          img.category === 'ACCESS' ? 'bg-amber-100 text-amber-700' :
                          img.category === 'PHOTO' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {img.subCategory}
                        </span>
                        <a
                          href={img.dataUrl}
                          download={img.suggestedFilename || `image_${idx + 1}.jpg`}
                          className="text-[10px] text-slate-400 hover:text-blue-600 font-bold shrink-0"
                          title="単体ダウンロード"
                        >
                          <Download className="w-3 h-3" />
                        </a>
                      </div>

                      {/* 種別変更（手動オーバーライド） */}
                      <div className="mt-1.5">
                        <select
                          value={img.category === 'PLAN' ? 'PLAN_平面図' : img.category === 'ACCESS' ? 'ACCESS_案内図' : img.subCategory === '内観' ? 'PHOTO_内観' : img.category === 'PHOTO' ? 'PHOTO_外観' : 'OTHER_その他'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'PLAN_平面図') handleUpdateImageCategory(img.id, 'PLAN', '平面図');
                            else if (val === 'PHOTO_内観') handleUpdateImageCategory(img.id, 'PHOTO', '内観');
                            else if (val === 'PHOTO_外観') handleUpdateImageCategory(img.id, 'PHOTO', '外観');
                            else if (val === 'ACCESS_案内図') handleUpdateImageCategory(img.id, 'ACCESS', '案内図');
                            else handleUpdateImageCategory(img.id, 'OTHER', 'その他');
                          }}
                          className="w-full text-[10px] bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-slate-700 font-medium focus:outline-none focus:border-blue-400"
                        >
                          <option value="PHOTO_外観">種別: 外観写真</option>
                          <option value="PHOTO_内観">種別: 内観写真</option>
                          <option value="PLAN_平面図">種別: 平面図/区画図</option>
                          <option value="ACCESS_案内図">種別: 現地案内図</option>
                          <option value="OTHER_その他">種別: その他/除外</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1 mt-2 pt-2 border-t border-slate-100">
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          onClick={() => handleAssignSlot('main', img.dataUrl)}
                          className={`text-[9px] py-1 rounded font-bold transition-colors ${
                            isMain ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-blue-50 text-slate-700'
                          }`}
                          title="外観写真枠（表紙背景）にセット"
                        >
                          表紙
                        </button>
                        <button
                          onClick={() => handleAssignSlot('floorPlan', img.dataUrl)}
                          className={`text-[9px] py-1 rounded font-bold transition-colors ${
                            isFloor ? 'bg-green-600 text-white' : 'bg-slate-100 hover:bg-green-50 text-slate-700'
                          }`}
                          title="平面図枠にセット"
                        >
                          平面図
                        </button>
                        <button
                          onClick={() => handleAssignSlot('map', img.dataUrl)}
                          className={`text-[9px] py-1 rounded font-bold transition-colors ${
                            isMap ? 'bg-amber-600 text-white' : 'bg-slate-100 hover:bg-amber-50 text-slate-700'
                          }`}
                          title="案内図枠にセット"
                        >
                          案内図
                        </button>
                      </div>

                      {/* JS-B PHOTOスロット個別割り当て */}
                      {isJsB ? (
                        <div className="grid grid-cols-4 gap-0.5 pt-0.5">
                          {([1, 2, 3, 4] as const).map((sNum) => {
                            const sKey = `photo_${sNum}` as const;
                            const isThisSlot = slotMap[sKey] === img.dataUrl || (!slotMap[sKey] && jsbPhotoSlots[sNum - 1] === img.dataUrl);
                            return (
                              <button
                                key={sNum}
                                onClick={() => handleAssignPhotoSlot(sKey, img.dataUrl)}
                                className={`text-[8px] py-1 rounded font-bold transition-colors ${
                                  isThisSlot ? 'bg-[#20B26C] text-white' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                                }`}
                                title={`PHOTO スロット ${sNum} に割り当て`}
                              >
                                P{sNum}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleToggleSubPhoto(img.dataUrl)}
                          className={`w-full text-[9px] py-1 rounded font-bold transition-colors ${
                            isSubPhoto ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-emerald-50 text-slate-700'
                          }`}
                          title="PHOTOページの写真一覧に追加/除外"
                        >
                          {isSubPhoto ? 'PHOTO ✓' : 'PHOTO枠'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quality Guidelines Notice */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-blue-900">
          <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">【画像品質・トリミング・他社情報除外ガイドライン】</span>
            <p className="text-blue-800/90 text-[11px] leading-relaxed">
              • 抽出画像内の不要な他社名・他社連絡先・他社ロゴが混在しないようチェックしてください。<br />
              • 平面図・区画図の重要情報（区画番号、寸法、柱位置、EV、階段、方位、凡例）が欠けないよう配置されます。<br />
              • PowerPoint出力後も、社内で各画像を個別に差し替え・サイズ微調整が可能です。
            </p>
          </div>
        </div>
      </div>

      {/* 2. 立地マップ・案内図（広域図・詳細図 / JS-B・銀座並木通り型対応） */}
      <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-600" />
              <span>2. 立地マップ・案内図（広域図 ＆ 詳細図）</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Google Maps Static API または高精度キャンバス生成により、広域図（主要駅・大通り）と詳細図（街区・ピン・縮尺）を自動作成します。
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {appState.data?.property.address && (
              <a
                href={getGoogleMapsUrl(appState.data.property.name, appState.data.property.address)}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Googleマップで開く
              </a>
            )}
            <button
              type="button"
              disabled={isMapGenerating || isDetailZooming || !appState.data?.property.name}
              onClick={async () => {
                const propName = appState.data?.property.name;
                const propAddr = appState.data?.property.address;
                const propAccess = appState.data?.property.access;
                if (!propName || !propAddr) return;
                setIsMapGenerating(true);
                try {
                  const currentDetailZoom = appState.data?.maps?.detailZoom || 18;
                  const mapRes = await generateMapImages(propName, propAddr, propAccess, { detailZoom: currentDetailZoom });
                  setAppState(prev => {
                    if (!prev.data) return prev;
                    return {
                      ...prev,
                      data: {
                        ...prev.data,
                        maps: {
                          ...prev.data.maps,
                          wideMapUrl: mapRes.wideMapUrl,
                          detailMapUrl: mapRes.detailMapUrl,
                          wideZoom: mapRes.wideZoom || 16,
                          detailZoom: mapRes.detailZoom || 18,
                          wideMapStatus: mapRes.isConfirmed ? 'complete' : 'failed',
                          detailMapStatus: mapRes.isConfirmed ? 'complete' : 'failed',
                          isConfirmed: mapRes.isConfirmed,
                          method: mapRes.method,
                          googleMapsUrl: getGoogleMapsUrl(propName, propAddr),
                        },
                        images: {
                          ...prev.data.images,
                          map: mapRes.wideMapUrl || prev.data.images?.map,
                          detailMap: mapRes.detailMapUrl || prev.data.images?.detailMap,
                        }
                      }
                    };
                  });
                } finally {
                  setIsMapGenerating(false);
                }
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isMapGenerating ? 'Google Maps取得中...' : 'Google Mapsを再取得'}
            </button>
          </div>
        </div>

        {/* 広域図・詳細図プレビュー */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 広域図 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                広域図（主要駅・大通りアクセス）
              </span>
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                Zoom {appState.data?.maps?.wideZoom || 16}
              </span>
            </div>

            <div className="w-full h-48 bg-white border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center relative group">
              {appState.data?.maps?.wideMapUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={appState.data.maps.wideMapUrl} alt="広域図" className="w-full h-full object-contain" />
              ) : isMapGenerating ? (
                <div className="text-xs text-slate-400 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  Google Maps取得中...
                </div>
              ) : (
                <div className="text-center p-3 text-amber-800">
                  <p className="text-xs font-bold text-amber-950 mb-1">
                    Google Mapsを取得できませんでした。地図画像を指定してください
                  </p>
                  <p className="text-[10px] text-amber-700 leading-tight">
                    APIキー未設定または通信失敗です。上の【案内図/サブ写真スロット】にGoogle Mapsのスクリーンショット等を指定してください。
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>ステータス: <strong className={appState.data?.maps?.wideMapUrl ? "text-emerald-600" : "text-amber-700"}>{appState.data?.maps?.wideMapUrl ? "広域図取得済み" : "未取得 (要指定)"}</strong></span>
              <span>対象: {appState.data?.property.name || '物件'}</span>
            </div>

            {/* スライド適用ボタン */}
            {appState.data?.maps?.wideMapUrl && (
              <div className="pt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleAssignSlot('map', appState.data?.maps?.wideMapUrl || '')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    appState.data?.images?.map === appState.data?.maps?.wideMapUrl
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 hover:bg-emerald-50 text-slate-700'
                  }`}
                >
                  {appState.data?.images?.map === appState.data?.maps?.wideMapUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      LOCATIONスライドに適用中
                    </>
                  ) : (
                    '広域図をLOCATIONスライドに適用'
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 詳細図 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                詳細図（近接街区・ピン周辺詳細）
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 font-medium mr-1">ズーム調整:</span>
                {[17, 18, 19].map((z) => {
                  const currentZ = appState.data?.maps?.detailZoom || 18;
                  const isSelected = currentZ === z;
                  return (
                    <button
                      key={z}
                      type="button"
                      disabled={isDetailZooming || isMapGenerating || !appState.data?.property.address}
                      onClick={async () => {
                        const addr = appState.data?.property.address;
                        const access = appState.data?.property.access;
                        if (!addr) return;
                        setIsDetailZooming(true);
                        try {
                          const res = await fetchSingleMap(addr, z, 'detail', access);
                          if (res.success && res.dataUrl) {
                            setAppState(prev => {
                              if (!prev.data) return prev;
                              const isCurrentLocationSlide = prev.data.images?.map === prev.data.maps?.detailMapUrl;
                              return {
                                ...prev,
                                data: {
                                  ...prev.data,
                                  maps: {
                                    ...prev.data.maps,
                                    detailMapUrl: res.dataUrl,
                                    detailZoom: z,
                                    detailMapStatus: 'complete',
                                  },
                                  images: {
                                    ...prev.data.images,
                                    detailMap: res.dataUrl,
                                    map: isCurrentLocationSlide ? res.dataUrl : prev.data.images?.map,
                                  }
                                }
                              };
                            });
                          }
                        } finally {
                          setIsDetailZooming(false);
                        }
                      }}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-blue-50'
                      }`}
                      title={z === 18 ? 'Zoom 18 (推奨・街区詳細)' : z === 17 ? 'Zoom 17 (近接)' : 'Zoom 19 (極近接)'}
                    >
                      {z === 18 ? '18(推奨)' : z}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-full h-48 bg-white border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center relative group">
              {appState.data?.maps?.detailMapUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={appState.data.maps.detailMapUrl} alt="詳細図" className="w-full h-full object-contain" />
              ) : isMapGenerating || isDetailZooming ? (
                <div className="text-xs text-slate-400 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                  {isDetailZooming ? 'ズーム変更中...' : 'Google Maps取得中...'}
                </div>
              ) : (
                <div className="text-center p-3 text-amber-800">
                  <p className="text-xs font-bold text-amber-950 mb-1">
                    Google Mapsを取得できませんでした。地図画像を指定してください
                  </p>
                  <p className="text-[10px] text-amber-700 leading-tight">
                    APIキー未設定または通信失敗です。上の【案内図/サブ写真スロット】にGoogle Mapsのスクリーンショット等を指定してください。
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>ステータス: <strong className={appState.data?.maps?.detailMapUrl ? "text-blue-600" : "text-amber-700"}>{appState.data?.maps?.detailMapUrl ? `詳細図取得済み (Zoom ${appState.data?.maps?.detailZoom || 18})` : "未取得 (要指定)"}</strong></span>
              <span>対象: {appState.data?.property.address || '所在地'}</span>
            </div>

            {/* スライド適用ボタン */}
            {appState.data?.maps?.detailMapUrl && (
              <div className="pt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleAssignSlot('map', appState.data?.maps?.detailMapUrl || '')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    appState.data?.images?.map === appState.data?.maps?.detailMapUrl
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 hover:bg-blue-50 text-slate-700'
                  }`}
                >
                  {appState.data?.images?.map === appState.data?.maps?.detailMapUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      LOCATIONスライドに適用中
                    </>
                  ) : (
                    '詳細図をLOCATIONスライドに適用'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. 追加情報 (おすすめポイント・特記) */}
      <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer font-bold text-base text-slate-800">
            <input 
              type="checkbox" 
              checked={showAdditional} 
              onChange={(e) => setShowAdditional(e.target.checked)} 
              className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            3. おすすめポイント・追加アピール項目の設定
          </label>
          <span className="text-xs text-slate-400">※マイソクのハイライト枠に記載されます</span>
        </div>

        {showAdditional && (
          <div className="pl-7 space-y-4 pt-2">
            {appState.additionalItems.map((item) => (
              <div key={item.id} className="flex gap-4 items-start p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-1/3">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">項目名</label>
                  <input 
                    type="text" 
                    value={item.name} 
                    onChange={(e) => updateField(item.id, 'name', e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white font-bold"
                    placeholder="例: おすすめポイント"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">内容</label>
                  <textarea 
                    value={item.content} 
                    onChange={(e) => updateField(item.id, 'content', e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm h-16 resize-none bg-white"
                    placeholder="例: 駅徒歩1分の好立地、視認性抜群、人通り多数の好ロケーション"
                  />
                </div>
                <button 
                  onClick={() => removeField(item.id)}
                  className="mt-6 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="削除"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            <button 
              onClick={addField}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              追加項目を作成
            </button>
          </div>
        )}
      </div>

      {/* 4. 担当者・会社帯情報 */}
      <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <label className="flex items-center gap-2 cursor-pointer font-bold text-base text-slate-800">
            <input 
              type="checkbox" 
              checked={appState.jsContact.showContact} 
              onChange={(e) => updateContact('showContact', e.target.checked)} 
              className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            4. 株式会社j.square 会社帯・担当者情報
          </label>

          <button
            type="button"
            onClick={() => setIsStaffModalOpen(true)}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            担当者マスターから選択/編集
          </button>
        </div>

        {appState.jsContact.showContact && (
          <div className="space-y-6">
            
            {/* Section A: 担当者情報 */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-blue-100 pb-1">
                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  営業担当者情報（マイソク帯・提案メール記載）
                </h4>

                {currentUser && currentUserPreset && appState.jsContact.personName !== currentUserPreset.name && (
                  <button
                    type="button"
                    onClick={() => {
                      setAppState(prev => ({
                        ...prev,
                        jsContact: {
                          ...prev.jsContact,
                          personName: currentUserPreset.name,
                          personTel: currentUserPreset.tel,
                          personEmail: currentUserPreset.email,
                          showContact: true,
                        }
                      }));
                    }}
                    className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <ShieldCheck className="w-3 h-3 text-blue-600" />
                    ログイン中Google担当者「{currentUserPreset.name}」を反映
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">担当者名</label>
                  <input
                    type="text"
                    value={appState.jsContact.personName}
                    onChange={(e) => updateContact('personName', e.target.value)}
                    placeholder="例: 山田 太郎"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">担当者 携帯番号</label>
                  <input
                    type="tel"
                    value={appState.jsContact.personTel}
                    onChange={(e) => updateContact('personTel', e.target.value)}
                    placeholder="例: 090-1234-5678"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">担当者 メールアドレス</label>
                  <input
                    type="email"
                    value={appState.jsContact.personEmail}
                    onChange={(e) => updateContact('personEmail', e.target.value)}
                    placeholder="例: yamada@j-jsquare.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white font-mono"
                  />
                </div>
              </div>

              {/* Matched Google Account Status */}
              {(() => {
                const matched = staffPresets.find(p => p.name === appState.jsContact.personName);
                if (matched?.googleEmail) {
                  return (
                    <div className="mt-2 text-[11px] text-emerald-800 bg-emerald-50/70 border border-emerald-200 rounded-lg px-3 py-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Google連携アカウント: <span className="font-mono font-bold">{matched.googleEmail}</span></span>
                      </div>
                      <span className="text-[10px] bg-white text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                        認証連携済み
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Section B: 会社固定マスター情報 */}
            <div>
              <h4 className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-1">
                <Building className="w-3.5 h-3.5 text-slate-500" />
                会社固定情報（株式会社 j.square）
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">会社名</label>
                  <input
                    type="text"
                    disabled
                    value={appState.jsContact.company}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-600 font-bold cursor-not-allowed"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">所在地</label>
                  <input
                    type="text"
                    disabled
                    value={appState.jsContact.address}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">代表電話 (TEL)</label>
                  <input
                    type="text"
                    disabled
                    value={appState.jsContact.tel}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-600 font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">代表FAX</label>
                  <input
                    type="text"
                    disabled
                    value={appState.jsContact.fax}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-600 font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">インフォメール</label>
                  <input
                    type="text"
                    disabled
                    value={appState.jsContact.infoEmail}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-600 font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">ウェブサイトURL</label>
                  <input
                    type="text"
                    disabled
                    value={appState.jsContact.url}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-600 font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">取引態様</label>
                  <input
                    type="text"
                    value={appState.jsContact.transactionType}
                    onChange={(e) => updateContact('transactionType', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white font-bold"
                  />
                </div>

                {/* 宅建業免許番号（自動更新連動） */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
                    <span>宅建業免許番号</span>
                    <span className="text-[9px] text-green-600 font-normal">自動判定稼働中</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={licenseCheck.formattedLicense}
                      readOnly
                      className="w-full px-3 py-2 border border-green-200 rounded-lg text-sm bg-green-50/50 text-slate-800 font-bold"
                    />
                    <ShieldCheck className="w-4 h-4 text-green-600 absolute right-2.5 top-2.5" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    ※ 令和8年10月22日以降に自動で（2）→（3）へ切り替わります。
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onPrev}
          className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
        >
          戻る
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 transition-colors"
        >
          次へ: マイソクプレビュー
        </button>
      </div>

      {/* Staff Modal */}
      <StaffPresetModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        onSelectStaff={(preset) => {
          setAppState(prev => ({
            ...prev,
            jsContact: {
              ...prev.jsContact,
              personName: preset.name,
              personTel: preset.tel,
              personEmail: preset.email,
              showContact: true,
            }
          }));
        }}
      />

      {/* Image Preview Modal */}
      {previewModalImg && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewModalImg(null)}
        >
          <div
            className="bg-white rounded-2xl p-4 max-w-3xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="font-bold text-slate-800 text-sm">{previewModalImg.label}</h4>
              <button
                onClick={() => setPreviewModalImg(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50 rounded-xl my-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewModalImg.url} alt={previewModalImg.label} className="max-w-full max-h-[60vh] object-contain rounded-lg" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <a
                href={previewModalImg.url}
                download="extracted_image.jpg"
                className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                ダウンロード
              </a>
              <button
                onClick={() => setPreviewModalImg(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-200"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

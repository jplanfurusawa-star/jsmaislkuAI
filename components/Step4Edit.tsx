import React, { useState } from 'react';
import { AppState, PropertyData, FieldReviewState } from '@/types';
import { 
  AlertCircle, 
  MapPin, 
  ExternalLink, 
  CheckCircle2, 
  FileQuestion, 
  FileX2, 
  Sparkles, 
  Check, 
  X, 
  HelpCircle,
  Info
} from 'lucide-react';
import SourceDocumentViewer from './SourceDocumentViewer';
import { getGoogleMapsUrl } from '@/utils/realEstate';

interface Props {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onNext: () => void;
  onPrev: () => void;
  uploadedFiles: { file: File; dataUrl: string }[];
}

// Clean any accidental AI explanatory phrases or placeholder text
const sanitizeInputText = (str: string): string => {
  if (!str) return '';
  let cleaned = str
    .replace(/[（(]\s*※?\s*(?:資料から推定|資料より推測|要確認|推測|推定|未確認|未記載|記載なし|用途未記載)[^)）]*[)）]/g, '')
    .replace(/※\s*(?:資料から推定|資料より推測|要確認|推測|推定|未確認|未記載|記載なし|用途未記載)/g, '')
    .trim();

  if (
    cleaned === '要確認' ||
    cleaned === '記載なし' ||
    cleaned === '未記載' ||
    cleaned === '未入力' ||
    cleaned === 'なし' ||
    cleaned === '-' ||
    cleaned === '―' ||
    cleaned === '不明' ||
    cleaned === '未定' ||
    cleaned === 'null' ||
    cleaned === 'undefined'
  ) {
    return '';
  }
  return cleaned;
};

export default function Step4Edit({ appState, setAppState, onNext, onPrev, uploadedFiles }: Props) {
  const data = appState.data;
  const [showBatchModal, setShowBatchModal] = useState(false);

  if (!data) return null;

  const currentFieldStatus = data.fieldStatus || {};

  // List of all trackable property fields
  const allTrackableFields: { key: string; label: string; getVal: () => any }[] = [
    { key: 'property.name', label: '物件名', getVal: () => data.property?.name },
    { key: 'property.address', label: '所在地', getVal: () => data.property?.address },
    { key: 'property.access', label: '交通', getVal: () => data.property?.access },
    { key: 'property.usage', label: '用途', getVal: () => data.property?.usage },
    { key: 'property.floor', label: '階数', getVal: () => data.property?.floor },
    { key: 'property.room', label: '号室', getVal: () => data.property?.room },
    { key: 'property.currentStatus', label: '現況', getVal: () => data.property?.currentStatus },
    { key: 'property.handoverTiming', label: '引渡時期', getVal: () => data.property?.handoverTiming },
    { key: 'property.handoverStatus', label: '引渡状態', getVal: () => data.property?.handoverStatus },
    { key: 'area.sqm', label: '契約面積(㎡)', getVal: () => data.area?.sqm },
    { key: 'area.tsubo', label: '契約面積(坪)', getVal: () => data.area?.tsubo },
    { key: 'building.structure', label: '構造', getVal: () => data.building?.structure },
    { key: 'building.scale', label: '規模', getVal: () => data.building?.scale },
    { key: 'building.constructionDates', label: '着工/竣工年月', getVal: () => data.building?.constructionDates || data.building?.builtYearMonth },
    { key: 'building.siteAreaSqm', label: '敷地面積(㎡)', getVal: () => data.building?.siteAreaSqm },
    { key: 'building.totalFloorAreaSqm', label: '延床面積(㎡)', getVal: () => data.building?.totalFloorAreaSqm },
    { key: 'building.currentUsage', label: '現用途', getVal: () => data.building?.currentUsage },
    { key: 'building.caption', label: '外観写真キャプション', getVal: () => data.building?.caption },
    { key: 'rent.amount', label: '賃料', getVal: () => data.rent?.amount },
    { key: 'rent.tsuboPrice', label: '賃料坪単価', getVal: () => data.rent?.tsuboPrice },
    { key: 'commonFee.amount', label: '共益費', getVal: () => data.commonFee?.amount },
    { key: 'commonFee.tsuboPrice', label: '共益費坪単価', getVal: () => data.commonFee?.tsuboPrice },
    { key: 'deposit', label: '保証金', getVal: () => data.deposit },
    { key: 'keyMoney', label: '敷金・礼金', getVal: () => data.keyMoney },
    { key: 'depreciation', label: '償却', getVal: () => data.depreciation },
    { key: 'contract', label: '契約期間・形態', getVal: () => data.contract },
  ];

  // Helper to determine field status
  const getFieldStatus = (key: string, val: any): FieldReviewState => {
    if (currentFieldStatus[key]) {
      return currentFieldStatus[key];
    }
    const isEmpty = val === null || val === undefined || (typeof val === 'string' && val.trim() === '') || (typeof val === 'number' && isNaN(val));
    return isEmpty ? 'needs_review' : 'confirmed';
  };

  // State update functions
  const updateNestedState = (category: keyof PropertyData, field: string, value: any, explicitStatus?: FieldReviewState) => {
    setAppState(prev => {
      if (!prev.data) return prev;
      const fullKey = `${category}.${field}`;
      
      let cleanVal = value;
      if (typeof value === 'string') {
        cleanVal = sanitizeInputText(value);
      }

      const isEmpty = cleanVal === null || cleanVal === undefined || (typeof cleanVal === 'string' && cleanVal.trim() === '');
      // If user is editing/typing a value, automatically mark as confirmed
      const newStatus = explicitStatus || (isEmpty ? 'needs_review' : 'confirmed');

      return {
        ...prev,
        data: {
          ...prev.data,
          [category]: {
            ...(prev.data[category] as any),
            [field]: cleanVal
          },
          fieldStatus: {
            ...(prev.data.fieldStatus || {}),
            [fullKey]: newStatus,
          }
        }
      };
    });
  };

  const updateRootState = (field: keyof PropertyData, value: any, explicitStatus?: FieldReviewState) => {
    setAppState(prev => {
      if (!prev.data) return prev;
      const fullKey = String(field);

      let cleanVal = value;
      if (typeof value === 'string') {
        cleanVal = sanitizeInputText(value);
      }

      const isEmpty = cleanVal === null || cleanVal === undefined || (typeof cleanVal === 'string' && cleanVal.trim() === '');
      const newStatus = explicitStatus || (isEmpty ? 'needs_review' : 'confirmed');

      return {
        ...prev,
        data: {
          ...prev.data,
          [field]: cleanVal,
          fieldStatus: {
            ...(prev.data.fieldStatus || {}),
            [fullKey]: newStatus,
          }
        }
      };
    });
  };

  const setFieldStatusExplicit = (fieldKey: string, status: FieldReviewState) => {
    setAppState(prev => {
      if (!prev.data) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          fieldStatus: {
            ...(prev.data.fieldStatus || {}),
            [fieldKey]: status,
          }
        }
      };
    });
  };

  // Mark field as "Not in Source" (sets value to empty and status to not_in_source)
  const markAsNotInSource = (category: keyof PropertyData | null, field: string) => {
    setAppState(prev => {
      if (!prev.data) return prev;
      const fullKey = category ? `${category}.${field}` : field;

      let nextData = { ...prev.data };
      if (category) {
        nextData[category] = {
          ...(nextData[category] as any),
          [field]: typeof (nextData[category] as any)[field] === 'number' ? null : ''
        };
      } else {
        (nextData as any)[field] = typeof (nextData as any)[field] === 'number' ? null : '';
      }

      return {
        ...prev,
        data: {
          ...nextData,
          fieldStatus: {
            ...(prev.data.fieldStatus || {}),
            [fullKey]: 'not_in_source',
          }
        }
      };
    });
  };

  // Batch actions
  const handleBatchConfirmEmptyAsNotInSource = () => {
    setAppState(prev => {
      if (!prev.data) return prev;
      const updatedStatus: Record<string, FieldReviewState> = { ...(prev.data.fieldStatus || {}) };

      allTrackableFields.forEach(f => {
        const curStatus = getFieldStatus(f.key, f.getVal());
        if (curStatus === 'needs_review') {
          const val = f.getVal();
          const isEmpty = val === null || val === undefined || (typeof val === 'string' && val.trim() === '');
          updatedStatus[f.key] = isEmpty ? 'not_in_source' : 'confirmed';
        }
      });

      return {
        ...prev,
        data: {
          ...prev.data,
          fieldStatus: updatedStatus,
        }
      };
    });
    setShowBatchModal(false);
  };

  const handleBatchConfirmAllAsConfirmed = () => {
    setAppState(prev => {
      if (!prev.data) return prev;
      const updatedStatus: Record<string, FieldReviewState> = { ...(prev.data.fieldStatus || {}) };

      allTrackableFields.forEach(f => {
        updatedStatus[f.key] = 'confirmed';
      });

      return {
        ...prev,
        data: {
          ...prev.data,
          fieldStatus: updatedStatus,
        }
      };
    });
    setShowBatchModal(false);
  };

  // Calculations
  const tsuboCalc = data.area.sqm ? Number((data.area.sqm / 3.305785).toFixed(2)) : null;
  const sqmCalc = data.area.tsubo ? Number((data.area.tsubo * 3.305785).toFixed(2)) : null;
  
  const hasAreaMismatch = data.area.sqm && data.area.tsubo && 
    (Math.abs(tsuboCalc! - data.area.tsubo) > 0.1 || Math.abs(sqmCalc! - data.area.sqm) > 0.1);

  const calcTsuboPrice = (amount: number | null, tsubo: number | null) => {
    if (!amount || !tsubo) return null;
    return Math.floor(amount / tsubo);
  };

  const rentTsuboCalc = calcTsuboPrice(data.rent.amount, data.area.tsubo);
  const commonTsuboCalc = calcTsuboPrice(data.commonFee.amount, data.area.tsubo);

  const hasRentTsuboMismatch = data.rent.amount && data.rent.tsuboPrice && data.area.tsubo && 
    Math.abs(rentTsuboCalc! - data.rent.tsuboPrice) > 100;
    
  const hasCommonTsuboMismatch = data.commonFee.amount && data.commonFee.tsuboPrice && data.area.tsubo && 
    Math.abs(commonTsuboCalc! - data.commonFee.tsuboPrice) > 100;

  const mapsUrl = getGoogleMapsUrl(data.property.name, data.property.address);

  // Review Status Counters
  const statusCounts = allTrackableFields.reduce((acc, f) => {
    const st = getFieldStatus(f.key, f.getVal());
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, { needs_review: 0, confirmed: 0, not_in_source: 0 } as Record<FieldReviewState, number>);

  const needsReviewCount = statusCounts.needs_review;

  return (
    <div className="flex h-full w-full">
      {/* Left Pane: Source Document Viewer */}
      <aside className="w-[420px] bg-slate-100 border-r border-slate-200 p-3 flex-col shrink-0 hidden lg:flex">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
            <span>Source Document</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-mono">
              {uploadedFiles.length} files
            </span>
          </h3>
        </div>
        <div className="flex-1 overflow-hidden">
          <SourceDocumentViewer files={uploadedFiles} />
        </div>
        <div className="mt-3 p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
          <div className="flex items-center text-blue-700 font-bold text-xs mb-1">
            <Sparkles className="w-3.5 h-3.5 mr-1" /> 原本確認・編集ガイド
          </div>
          <p className="text-[10px] text-blue-800 leading-relaxed">
            左側の原本資料を見比べながら各項目を確認できます。<br />
            ・<strong className="text-amber-700">要確認</strong>：AIが未確定の項目。手入力で自動確定、または「資料記載なし」を選択。<br />
            ・<strong className="text-slate-700">資料記載なし</strong>：最終成果物（PDF/PPT/メール）では非表示または「―」となります。
          </p>
        </div>
      </aside>

      {/* Main Area */}
      <section className="flex-1 flex flex-col p-6 overflow-hidden bg-white">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800">物件情報確認・編集</h2>
            {data.property.address && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 font-bold inline-flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 transition-colors"
              >
                <MapPin className="w-3 h-3 text-red-500" />
                Googleマップで確認
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
          <div className="flex space-x-2">
            <button onClick={onPrev} className="px-3 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-300 transition-colors">
              戻る
            </button>
            <button onClick={onNext} className="px-4 py-1 bg-blue-600 text-white text-xs font-bold rounded shadow hover:bg-blue-700 transition-colors">
              保存して次へ
            </button>
          </div>
        </div>

        {/* Confirmation Status Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-2.5 text-xs flex-wrap">
            <span className="font-bold text-slate-700">確認ステータス:</span>
            
            {needsReviewCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                要確認: {needsReviewCount} 件
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                すべての項目を確認済み
              </span>
            )}

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Check className="w-3 h-3" />
              確定: {statusCounts.confirmed} 件
            </span>

            {statusCounts.not_in_source > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                <FileX2 className="w-3 h-3" />
                資料記載なし: {statusCounts.not_in_source} 件
              </span>
            )}
          </div>

          {needsReviewCount > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBatchConfirmEmptyAsNotInSource}
                title="空欄の項目を「資料記載なし」にし、入力済み項目を「確定」として一括整理します"
                className="text-[11px] font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 px-2.5 py-1 rounded border border-slate-300 transition-colors shadow-2xs flex items-center gap-1"
              >
                <FileX2 className="w-3 h-3 text-slate-500" />
                空欄を「記載なし」として一括確定
              </button>
              <button
                type="button"
                onClick={() => setShowBatchModal(true)}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-white hover:bg-blue-50 px-2.5 py-1 rounded border border-blue-200 transition-colors shadow-2xs"
              >
                一括確定メニュー
              </button>
            </div>
          )}
        </div>

        {/* Modal for Batch Confirm */}
        {showBatchModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  要確認項目の一括確定
                </h3>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                現在 <strong className="text-amber-700">{needsReviewCount} 件</strong> の要確認項目があります。確定方法を選択してください。
              </p>
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleBatchConfirmEmptyAsNotInSource}
                  className="w-full text-left p-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <p className="text-xs font-bold text-blue-900">① 空欄項目を「資料記載なし」として確定 (推奨)</p>
                  <p className="text-[10px] text-blue-700 mt-0.5">値が入っている項目は確定し、空欄項目は「資料記載なし（出力時非表示）」として確定します。</p>
                </button>
                <button
                  type="button"
                  onClick={handleBatchConfirmAllAsConfirmed}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <p className="text-xs font-bold text-slate-800">② すべての項目をそのまま「確定」にする</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">空欄項目も含め、全項目を確認済み状態にします。</p>
                </button>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800 font-bold"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 基本情報 */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 h-fit">
              <h4 className="text-xs font-bold text-blue-600 mb-3 border-b border-blue-100 pb-1">基本情報</h4>
              <div className="space-y-3">
                <InputField 
                  fieldKey="property.name" 
                  label="物件名" 
                  value={data.property.name} 
                  status={getFieldStatus('property.name', data.property.name)}
                  onSetStatus={(st) => setFieldStatusExplicit('property.name', st)}
                  onMarkNotInSource={() => markAsNotInSource('property', 'name')}
                  onChange={(v) => updateNestedState('property', 'name', v)} 
                />
                <InputField 
                  fieldKey="property.address" 
                  label="所在地" 
                  value={data.property.address} 
                  status={getFieldStatus('property.address', data.property.address)}
                  onSetStatus={(st) => setFieldStatusExplicit('property.address', st)}
                  onMarkNotInSource={() => markAsNotInSource('property', 'address')}
                  onChange={(v) => updateNestedState('property', 'address', v)} 
                />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <InputField 
                    fieldKey="property.access" 
                    label="交通" 
                    value={data.property.access} 
                    status={getFieldStatus('property.access', data.property.access)}
                    onSetStatus={(st) => setFieldStatusExplicit('property.access', st)}
                    onMarkNotInSource={() => markAsNotInSource('property', 'access')}
                    onChange={(v) => updateNestedState('property', 'access', v)} 
                  />
                  <InputField 
                    fieldKey="property.usage" 
                    label="用途" 
                    value={data.property.usage} 
                    status={getFieldStatus('property.usage', data.property.usage)}
                    onSetStatus={(st) => setFieldStatusExplicit('property.usage', st)}
                    onMarkNotInSource={() => markAsNotInSource('property', 'usage')}
                    onChange={(v) => updateNestedState('property', 'usage', v)} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <InputField 
                    fieldKey="property.floor" 
                    label="階数" 
                    value={data.property.floor} 
                    status={getFieldStatus('property.floor', data.property.floor)}
                    onSetStatus={(st) => setFieldStatusExplicit('property.floor', st)}
                    onMarkNotInSource={() => markAsNotInSource('property', 'floor')}
                    onChange={(v) => updateNestedState('property', 'floor', v)} 
                  />
                  <InputField 
                    fieldKey="property.room" 
                    label="号室" 
                    value={data.property.room} 
                    status={getFieldStatus('property.room', data.property.room)}
                    onSetStatus={(st) => setFieldStatusExplicit('property.room', st)}
                    onMarkNotInSource={() => markAsNotInSource('property', 'room')}
                    onChange={(v) => updateNestedState('property', 'room', v)} 
                    optional
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <InputField 
                    fieldKey="property.currentStatus" 
                    label="現況" 
                    value={data.property.currentStatus} 
                    status={getFieldStatus('property.currentStatus', data.property.currentStatus)}
                    onSetStatus={(st) => setFieldStatusExplicit('property.currentStatus', st)}
                    onMarkNotInSource={() => markAsNotInSource('property', 'currentStatus')}
                    onChange={(v) => updateNestedState('property', 'currentStatus', v)} 
                  />
                  <InputField 
                    fieldKey="property.handoverTiming" 
                    label="引渡時期" 
                    value={data.property.handoverTiming} 
                    status={getFieldStatus('property.handoverTiming', data.property.handoverTiming)}
                    onSetStatus={(st) => setFieldStatusExplicit('property.handoverTiming', st)}
                    onMarkNotInSource={() => markAsNotInSource('property', 'handoverTiming')}
                    onChange={(v) => updateNestedState('property', 'handoverTiming', v)} 
                  />
                </div>
                <InputField 
                  fieldKey="property.handoverStatus" 
                  label="引渡状態" 
                  value={data.property.handoverStatus} 
                  status={getFieldStatus('property.handoverStatus', data.property.handoverStatus)}
                  onSetStatus={(st) => setFieldStatusExplicit('property.handoverStatus', st)}
                  onMarkNotInSource={() => markAsNotInSource('property', 'handoverStatus')}
                  onChange={(v) => updateNestedState('property', 'handoverStatus', v)} 
                />
              </div>
            </div>

            {/* 面積・区画 & 建物情報 */}
            <div className="space-y-4 h-fit">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h4 className="text-xs font-bold text-blue-600 mb-3 border-b border-blue-100 pb-1">面積・区画</h4>
                {hasAreaMismatch && (
                  <div className="p-2 bg-orange-50 border border-orange-200 rounded mb-3">
                    <div className="flex items-center text-orange-700 font-bold text-[10px] mb-1 uppercase tracking-tighter">
                      <AlertCircle className="w-3 h-3 mr-1" /> 検算アラート: 面積
                    </div>
                    <div className="flex flex-col text-[10px] text-slate-600">
                      <span>㎡からの計算値: <span className="text-orange-600 font-bold">{tsuboCalc}坪</span></span>
                      <span>坪からの計算値: <span className="text-orange-600 font-bold">{sqmCalc}㎡</span></span>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <NumberField 
                    fieldKey="area.sqm"
                    label="契約面積 (㎡)" 
                    value={data.area.sqm} 
                    status={getFieldStatus('area.sqm', data.area.sqm)}
                    onSetStatus={(st) => setFieldStatusExplicit('area.sqm', st)}
                    onMarkNotInSource={() => markAsNotInSource('area', 'sqm')}
                    onChange={(v: number | null) => updateNestedState('area', 'sqm', v)} 
                  />
                  <NumberField 
                    fieldKey="area.tsubo"
                    label="契約面積 (坪)" 
                    value={data.area.tsubo} 
                    status={getFieldStatus('area.tsubo', data.area.tsubo)}
                    onSetStatus={(st) => setFieldStatusExplicit('area.tsubo', st)}
                    onMarkNotInSource={() => markAsNotInSource('area', 'tsubo')}
                    onChange={(v: number | null) => updateNestedState('area', 'tsubo', v)} 
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h4 className="text-xs font-bold text-blue-600 mb-3 border-b border-blue-100 pb-1">建物概要・詳細情報（JS-Bプレゼン型対応）</h4>
                <div className="grid grid-cols-2 gap-2">
                  <InputField 
                    fieldKey="building.structure"
                    label="構造" 
                    value={data.building.structure} 
                    status={getFieldStatus('building.structure', data.building.structure)}
                    onSetStatus={(st) => setFieldStatusExplicit('building.structure', st)}
                    onMarkNotInSource={() => markAsNotInSource('building', 'structure')}
                    onChange={(v: string) => updateNestedState('building', 'structure', v)} 
                  />
                  <InputField 
                    fieldKey="building.scale"
                    label="規模" 
                    value={data.building.scale} 
                    status={getFieldStatus('building.scale', data.building.scale)}
                    onSetStatus={(st) => setFieldStatusExplicit('building.scale', st)}
                    onMarkNotInSource={() => markAsNotInSource('building', 'scale')}
                    onChange={(v: string) => updateNestedState('building', 'scale', v)} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <NumberField 
                    fieldKey="building.siteAreaSqm"
                    label="敷地面積 (㎡)" 
                    value={data.building.siteAreaSqm ?? null} 
                    status={getFieldStatus('building.siteAreaSqm', data.building.siteAreaSqm)}
                    onSetStatus={(st) => setFieldStatusExplicit('building.siteAreaSqm', st)}
                    onMarkNotInSource={() => markAsNotInSource('building', 'siteAreaSqm')}
                    onChange={(v: number | null) => updateNestedState('building', 'siteAreaSqm', v)} 
                    optional
                  />
                  <NumberField 
                    fieldKey="building.totalFloorAreaSqm"
                    label="延床面積 (㎡)" 
                    value={data.building.totalFloorAreaSqm ?? null} 
                    status={getFieldStatus('building.totalFloorAreaSqm', data.building.totalFloorAreaSqm)}
                    onSetStatus={(st) => setFieldStatusExplicit('building.totalFloorAreaSqm', st)}
                    onMarkNotInSource={() => markAsNotInSource('building', 'totalFloorAreaSqm')}
                    onChange={(v: number | null) => updateNestedState('building', 'totalFloorAreaSqm', v)} 
                    optional
                  />
                </div>
                <div className="mt-2">
                  <InputField 
                    fieldKey="building.currentUsage"
                    label="現用途 (例: 7階〜10階: 事務所、地下1階〜6階: 店舗)" 
                    value={data.building.currentUsage || ''} 
                    status={getFieldStatus('building.currentUsage', data.building.currentUsage)}
                    onSetStatus={(st) => setFieldStatusExplicit('building.currentUsage', st)}
                    onMarkNotInSource={() => markAsNotInSource('building', 'currentUsage')}
                    onChange={(v: string) => updateNestedState('building', 'currentUsage', v)} 
                    optional
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <InputField 
                    fieldKey="building.constructionDates"
                    label="着工/竣工年月" 
                    value={data.building.constructionDates || data.building.builtYearMonth} 
                    status={getFieldStatus('building.constructionDates', data.building.constructionDates || data.building.builtYearMonth)}
                    onSetStatus={(st) => setFieldStatusExplicit('building.constructionDates', st)}
                    onMarkNotInSource={() => markAsNotInSource('building', 'constructionDates')}
                    onChange={(v: string) => updateNestedState('building', 'constructionDates', v)} 
                  />
                  <InputField 
                    fieldKey="building.caption"
                    label="外観写真キャプション" 
                    value={data.building.caption || ''} 
                    status={getFieldStatus('building.caption', data.building.caption)}
                    onSetStatus={(st) => setFieldStatusExplicit('building.caption', st)}
                    onMarkNotInSource={() => markAsNotInSource('building', 'caption')}
                    onChange={(v: string) => updateNestedState('building', 'caption', v)} 
                    optional
                  />
                </div>
              </div>

              {/* テナント構成一覧 (JS-B向け) */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-3">
                  <h4 className="text-xs font-bold text-blue-600">現在のテナント構成一覧</h4>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = data.tenants || [];
                      updateRootState('tenants', [...cur, { floor: '', usage: '店舗', tenantName: '' }]);
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                  >
                    + テナント追加
                  </button>
                </div>
                
                {(!data.tenants || data.tenants.length === 0) ? (
                  <p className="text-[11px] text-slate-500 italic py-2">
                    テナント情報が登録されていません。（元資料にテナント構成一覧がある場合、ここに追加するとJS-Bのスライド4に反映されます）
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {data.tenants.map((tenant, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 bg-white p-1.5 rounded border border-slate-200">
                        <input
                          type="text"
                          value={tenant.floor}
                          onChange={(e) => {
                            const newTenants = [...data.tenants!];
                            newTenants[idx] = { ...newTenants[idx], floor: e.target.value };
                            updateRootState('tenants', newTenants);
                          }}
                          placeholder="階数(例:10階)"
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-200 rounded font-bold"
                        />
                        <input
                          type="text"
                          value={tenant.usage}
                          onChange={(e) => {
                            const newTenants = [...data.tenants!];
                            newTenants[idx] = { ...newTenants[idx], usage: e.target.value };
                            updateRootState('tenants', newTenants);
                          }}
                          placeholder="用途(事務所/飲食/物販)"
                          className="w-24 px-1.5 py-0.5 text-xs border border-slate-200 rounded"
                        />
                        <input
                          type="text"
                          value={tenant.tenantName}
                          onChange={(e) => {
                            const newTenants = [...data.tenants!];
                            newTenants[idx] = { ...newTenants[idx], tenantName: e.target.value };
                            updateRootState('tenants', newTenants);
                          }}
                          placeholder="企業名/店舗名"
                          className="flex-1 px-1.5 py-0.5 text-xs border border-slate-200 rounded font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newTenants = data.tenants!.filter((_, i) => i !== idx);
                            updateRootState('tenants', newTenants);
                          }}
                          className="text-[10px] text-red-500 hover:text-red-700 px-1 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 賃貸条件 */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 h-fit">
            <h4 className="text-xs font-bold text-blue-600 mb-3 border-b border-blue-100 pb-1">賃貸条件</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <NumberField 
                  fieldKey="rent.amount"
                  label="賃料 (円/月額)" 
                  value={data.rent.amount} 
                  status={getFieldStatus('rent.amount', data.rent.amount)}
                  onSetStatus={(st) => setFieldStatusExplicit('rent.amount', st)}
                  onMarkNotInSource={() => markAsNotInSource('rent', 'amount')}
                  onChange={(v: number | null) => updateNestedState('rent', 'amount', v)} 
                  tax={data.rent.taxIncluded} 
                  onTaxChange={(v: boolean) => updateNestedState('rent', 'taxIncluded', v)} 
                />
                <NumberField 
                  fieldKey="rent.tsuboPrice"
                  label="賃料 坪単価 (円/坪)" 
                  value={data.rent.tsuboPrice} 
                  status={getFieldStatus('rent.tsuboPrice', data.rent.tsuboPrice)}
                  onSetStatus={(st) => setFieldStatusExplicit('rent.tsuboPrice', st)}
                  onMarkNotInSource={() => markAsNotInSource('rent', 'tsuboPrice')}
                  onChange={(v: number | null) => updateNestedState('rent', 'tsuboPrice', v)} 
                  warning={hasRentTsuboMismatch ? `AI計算値: ${rentTsuboCalc}円/坪` : undefined} 
                />
                <NumberField 
                  fieldKey="commonFee.amount"
                  label="共益費 (円/月額)" 
                  value={data.commonFee.amount} 
                  status={getFieldStatus('commonFee.amount', data.commonFee.amount)}
                  onSetStatus={(st) => setFieldStatusExplicit('commonFee.amount', st)}
                  onMarkNotInSource={() => markAsNotInSource('commonFee', 'amount')}
                  onChange={(v: number | null) => updateNestedState('commonFee', 'amount', v)} 
                  tax={data.commonFee.taxIncluded} 
                  onTaxChange={(v: boolean) => updateNestedState('commonFee', 'taxIncluded', v)} 
                  optional
                />
                <NumberField 
                  fieldKey="commonFee.tsuboPrice"
                  label="共益費 坪単価 (円/坪)" 
                  value={data.commonFee.tsuboPrice} 
                  status={getFieldStatus('commonFee.tsuboPrice', data.commonFee.tsuboPrice)}
                  onSetStatus={(st) => setFieldStatusExplicit('commonFee.tsuboPrice', st)}
                  onMarkNotInSource={() => markAsNotInSource('commonFee', 'tsuboPrice')}
                  onChange={(v: number | null) => updateNestedState('commonFee', 'tsuboPrice', v)} 
                  warning={hasCommonTsuboMismatch ? `AI計算値: ${commonTsuboCalc}円/坪` : undefined} 
                  optional
                />
              </div>
              <div className="space-y-3">
                <InputField 
                  fieldKey="deposit"
                  label="保証金" 
                  value={data.deposit} 
                  status={getFieldStatus('deposit', data.deposit)}
                  onSetStatus={(st) => setFieldStatusExplicit('deposit', st)}
                  onMarkNotInSource={() => markAsNotInSource(null, 'deposit')}
                  onChange={(v: string) => updateRootState('deposit', v)} 
                />
                <InputField 
                  fieldKey="keyMoney"
                  label="敷金・礼金" 
                  value={data.keyMoney} 
                  status={getFieldStatus('keyMoney', data.keyMoney)}
                  onSetStatus={(st) => setFieldStatusExplicit('keyMoney', st)}
                  onMarkNotInSource={() => markAsNotInSource(null, 'keyMoney')}
                  onChange={(v: string) => updateRootState('keyMoney', v)} 
                />
                <InputField 
                  fieldKey="depreciation"
                  label="償却" 
                  value={data.depreciation} 
                  status={getFieldStatus('depreciation', data.depreciation)}
                  onSetStatus={(st) => setFieldStatusExplicit('depreciation', st)}
                  onMarkNotInSource={() => markAsNotInSource(null, 'depreciation')}
                  onChange={(v: string) => updateRootState('depreciation', v)} 
                />
                <InputField 
                  fieldKey="contract"
                  label="契約期間・形態" 
                  value={data.contract} 
                  status={getFieldStatus('contract', data.contract)}
                  onSetStatus={(st) => setFieldStatusExplicit('contract', st)}
                  onMarkNotInSource={() => markAsNotInSource(null, 'contract')}
                  onChange={(v: string) => updateRootState('contract', v)} 
                />
              </div>
            </div>
          </div>
          
          {/* 設備・特記事項 */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 h-fit">
            <h4 className="text-xs font-bold text-blue-600 mb-3 border-b border-blue-100 pb-1">設備・特記事項</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">設備 (カンマ区切り)</label>
                <input 
                  type="text" 
                  value={data.equipment.join(', ')} 
                  onChange={(e) => updateRootState('equipment', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">特記事項・条件 (カンマ区切り)</label>
                <input 
                  type="text" 
                  value={data.conditions.join(', ')} 
                  onChange={(e) => updateRootState('conditions', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                />
              </div>
            </div>
          </div>

          {/* PROPERTY DETAILS 可変項目（元資料から抽出された個別条件・追加項目） */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 h-fit col-span-1 md:col-span-2">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-1 mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-emerald-700">PROPERTY DETAILS 可変項目（元資料抽出・追加項目）</h4>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                  ※値のない項目は自動非表示
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const current = data.detailItems || [];
                  updateRootState('detailItems', [...current, { label: '', value: '', source: 'user', confirmed: true }]);
                }}
                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-300 transition-colors"
              >
                + 項目追加
              </button>
            </div>
            
            <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
              JS-Bの「PROPERTY DETAILS」スライドは、固定項目ではなく元資料から実際に取得できた項目のみを表示します。<br />
              （礼金、保証金、更新料、解約予告、契約形態、契約年数、看板料、駐車場、営業時間制限、重飲食可否、ダクト、給排水、電気容量、天井高など）
            </p>

            {(!data.detailItems || data.detailItems.length === 0) ? (
              <div className="bg-white p-3 rounded border border-dashed border-slate-200 text-center text-xs text-slate-400">
                追加の個別項目は現在ありません（上記基本情報および特記事項から自動判定されます）。手動で項目を追加したい場合は右上の「+ 項目追加」をクリックしてください。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.detailItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border border-slate-200 shadow-2xs">
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => {
                        const newItems = [...data.detailItems!];
                        newItems[idx] = { ...newItems[idx], label: e.target.value };
                        updateRootState('detailItems', newItems);
                      }}
                      placeholder="項目名 (例: 礼金, 更新料)"
                      className="w-28 px-2 py-1 text-xs border border-slate-200 rounded font-bold text-slate-800 bg-slate-50"
                    />
                    <input
                      type="text"
                      value={item.value}
                      onChange={(e) => {
                        const newItems = [...data.detailItems!];
                        newItems[idx] = { ...newItems[idx], value: e.target.value };
                        updateRootState('detailItems', newItems);
                      }}
                      placeholder="内容 (例: 1ヶ月, なし)"
                      className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = data.detailItems!.filter((_, i) => i !== idx);
                        updateRootState('detailItems', newItems);
                      }}
                      className="text-xs text-red-500 hover:text-red-700 px-1 font-bold"
                      title="削除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </section>

      {/* Right Pane: Validation */}
      <aside className="w-[200px] bg-white border-l border-slate-200 p-4 shrink-0 overflow-y-auto hidden xl:block">
        <h3 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">Validation</h3>
        <div className="space-y-4">
          <ValidationItem 
            title="物件名" 
            status={data.property.name ? 'ok' : 'warn'} 
            message={data.property.name ? '抽出済み' : '要確認'} 
          />
          <ValidationItem 
            title="面積検算" 
            status={hasAreaMismatch ? 'warn' : 'ok'} 
            message={hasAreaMismatch ? '坪/㎡の差異あり' : '問題なし'} 
          />
          <ValidationItem 
            title="賃料坪単価" 
            status={hasRentTsuboMismatch ? 'warn' : 'ok'} 
            message={hasRentTsuboMismatch ? '単価不一致' : '問題なし'} 
          />
          <ValidationItem 
            title="契約期間" 
            status={data.contract ? 'ok' : getFieldStatus('contract', data.contract) === 'not_in_source' ? 'info' : 'warn'} 
            message={data.contract ? '抽出済み' : getFieldStatus('contract', data.contract) === 'not_in_source' ? '記載なし（確認済）' : '要確認'} 
          />
        </div>

        <div className="mt-12 pt-6 border-t border-slate-100">
          <h3 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">Selected Format</h3>
          <div className="p-3 border-2 border-blue-600 rounded bg-blue-50">
            <div className="text-xs font-bold text-blue-600">{appState.format}</div>
            <div className="mt-2 h-16 bg-white border border-blue-200 rounded-sm relative overflow-hidden">
              <div className="absolute top-1 left-1 w-1/2 h-1 bg-slate-200"></div>
              <div className="absolute top-3 left-1 w-1/3 h-1 bg-slate-200"></div>
              <div className="absolute top-1 right-1 w-4 h-4 bg-slate-100"></div>
              <div className="absolute bottom-1 right-1 w-full h-4 bg-blue-100"></div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

// Helper components with 3 distinct review states
interface InputFieldProps {
  fieldKey: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  status: FieldReviewState;
  onSetStatus: (status: FieldReviewState) => void;
  onMarkNotInSource: () => void;
  optional?: boolean;
}

function InputField({ 
  fieldKey,
  label, 
  value, 
  onChange, 
  status,
  onSetStatus,
  onMarkNotInSource,
  optional = false 
}: InputFieldProps) {
  const isNeedsReview = status === 'needs_review';
  const isNotInSource = status === 'not_in_source';
  const isConfirmed = status === 'confirmed';

  // Ensure value never contains placeholder text
  const cleanVal = sanitizeInputText(value);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-bold text-slate-600">{label}</label>
        
        <div className="flex items-center gap-1">
          {isNeedsReview && (
            <>
              <button
                type="button"
                onClick={() => onSetStatus('confirmed')}
                title="この項目を確定済みにする"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition-colors"
              >
                <Check className="w-2.5 h-2.5" />
                確定
              </button>
              <button
                type="button"
                onClick={onMarkNotInSource}
                title="資料に記載がないため空欄として確定（出力時に非表示）"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 rounded transition-colors"
              >
                <X className="w-2.5 h-2.5" />
                記載なし
              </button>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                要確認
              </span>
            </>
          )}

          {isNotInSource && (
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-700 border border-slate-300 rounded">
                <FileX2 className="w-2.5 h-2.5" />
                資料記載なし
              </span>
              <button
                type="button"
                onClick={() => onSetStatus('needs_review')}
                title="要確認に戻す"
                className="text-[9px] text-slate-400 hover:text-slate-600 underline px-1"
              >
                変更
              </button>
            </div>
          )}

          {isConfirmed && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSetStatus('needs_review')}
                title="クリックで要確認に戻す"
                className="text-[9px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 transition-colors"
              >
                <Check className="w-2.5 h-2.5 text-emerald-600" />
                確定
              </button>
            </div>
          )}
        </div>
      </div>

      <input 
        type="text" 
        value={cleanVal} 
        onChange={(e) => {
          const val = sanitizeInputText(e.target.value);
          onChange(val);
          // If user types, automatically mark as confirmed
          if (val.trim() !== '') {
            onSetStatus('confirmed');
          }
        }}
        placeholder={
          isNeedsReview 
            ? "未入力（資料に記載なし・要確認）" 
            : isNotInSource 
            ? "資料記載なし（出力時は非表示となります）" 
            : ""
        }
        className={`w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${
          isNeedsReview 
            ? 'border-amber-300 bg-amber-50/40 text-slate-800 placeholder-amber-600/70' 
            : isNotInSource 
            ? 'border-slate-200 bg-slate-100 text-slate-500 placeholder-slate-400 italic' 
            : 'border-slate-300 bg-white text-slate-800'
        }`}
      />
    </div>
  );
}

interface NumberFieldProps {
  fieldKey: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  status: FieldReviewState;
  onSetStatus: (status: FieldReviewState) => void;
  onMarkNotInSource: () => void;
  tax?: boolean | null;
  onTaxChange?: (v: boolean) => void;
  warning?: string;
  optional?: boolean;
}

function NumberField({ 
  fieldKey,
  label, 
  value, 
  onChange, 
  status,
  onSetStatus,
  onMarkNotInSource,
  tax, 
  onTaxChange, 
  warning, 
  optional = false 
}: NumberFieldProps) {
  const isNeedsReview = status === 'needs_review';
  const isNotInSource = status === 'not_in_source';
  const isConfirmed = status === 'confirmed';

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-1.5">
          <label className="block text-[10px] font-bold text-slate-600">{label}</label>
          
          <div className="flex items-center gap-1">
            {isNeedsReview && (
              <>
                <button
                  type="button"
                  onClick={() => onSetStatus('confirmed')}
                  title="この項目を確定済みにする"
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition-colors"
                >
                  <Check className="w-2.5 h-2.5" />
                  確定
                </button>
                <button
                  type="button"
                  onClick={onMarkNotInSource}
                  title="資料に記載がないため空欄として確定（出力時に非表示）"
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 rounded transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                  記載なし
                </button>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  要確認
                </span>
              </>
            )}

            {isNotInSource && (
              <div className="flex items-center gap-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-700 border border-slate-300 rounded">
                  <FileX2 className="w-2.5 h-2.5" />
                  資料記載なし
                </span>
                <button
                  type="button"
                  onClick={() => onSetStatus('needs_review')}
                  title="要確認に戻す"
                  className="text-[9px] text-slate-400 hover:text-slate-600 underline px-1"
                >
                  変更
                </button>
              </div>
            )}

            {isConfirmed && (
              <button
                type="button"
                onClick={() => onSetStatus('needs_review')}
                title="クリックで要確認に戻す"
                className="text-[9px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 transition-colors"
              >
                <Check className="w-2.5 h-2.5 text-emerald-600" />
                確定
              </button>
            )}
          </div>
        </div>

        {tax !== undefined && onTaxChange && (
          <select 
            value={tax === true ? '税込' : tax === false ? '税別' : ''} 
            onChange={(e) => onTaxChange(e.target.value === '税込')}
            className="px-1 text-[10px] border border-slate-300 rounded bg-white text-slate-600 outline-none"
          >
            <option value="税別">税別</option>
            <option value="税込">税込</option>
            <option value="">未設定</option>
          </select>
        )}
      </div>

      <input 
        type="number" 
        value={value === null || value === undefined || isNaN(value) ? '' : value} 
        onChange={(e) => {
          const val = e.target.value ? Number(e.target.value) : null;
          onChange(val);
          if (val !== null) {
            onSetStatus('confirmed');
          }
        }}
        placeholder={
          isNeedsReview 
            ? "未入力（要確認）" 
            : isNotInSource 
            ? "資料記載なし（出力時非表示）" 
            : ""
        }
        className={`w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${
          isNeedsReview 
            ? 'border-amber-300 bg-amber-50/40 placeholder-amber-600/70' 
            : isNotInSource 
            ? 'border-slate-200 bg-slate-100 text-slate-500 placeholder-slate-400 italic' 
            : 'border-slate-300 bg-white'
        }`}
      />
      {warning && (
        <div className="mt-1 p-1 bg-orange-50 border border-orange-200 rounded">
          <div className="flex items-center text-orange-700 font-bold text-[9px] uppercase tracking-tighter">
            <AlertCircle className="w-2 h-2 mr-1" /> 検算アラート
          </div>
          <div className="text-[9px] text-orange-600 font-bold">{warning}</div>
        </div>
      )}
    </div>
  );
}

function ValidationItem({ title, status, message }: { title: string, status: 'ok' | 'warn' | 'info', message: string }) {
  const bg = status === 'ok' ? 'bg-green-500' : status === 'warn' ? 'bg-orange-500' : 'bg-slate-300';
  const textBg = status === 'warn' ? 'text-orange-600' : 'text-slate-500';
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '!' : '?';
  
  return (
    <div className="flex items-start space-x-2">
      <div className={`w-4 h-4 rounded-full ${bg} shrink-0 mt-0.5 flex items-center justify-center text-[8px] text-white font-bold`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-800">{title}</p>
        <p className={`text-[9px] ${textBg}`}>{message}</p>
      </div>
    </div>
  );
}

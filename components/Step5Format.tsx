"use client";

import React, { useState, useEffect } from 'react';
import { AppState, StaffPreset, AdminSettings, defaultAdminSettings } from '@/types';
import {
  Layout,
  Image as ImageIcon,
  Grid,
  Building2,
  User,
  Phone,
  Mail,
  UserPlus,
  Sparkles,
  Check,
  Layers,
  MapPin,
  Link2,
  ShieldCheck,
  Crown,
  Settings,
  Sliders,
} from 'lucide-react';
import {
  getStaffPresets,
  fetchStaffPresetsFromCloud,
  getAdminSettings,
  fetchAdminSettingsFromCloud,
  isUserAdmin,
} from '@/lib/storage';
import { auth } from '@/lib/firebase';
import { assignSlotByFormat } from '@/utils/pdf';
import StaffPresetModal from './StaffPresetModal';
import AdminDashboardModal from './AdminDashboardModal';

interface Props {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onNext: () => void;
  onPrev: () => void;
}

const formatIcons: Record<string, any> = {
  'JS-A': Layout,
  'JS-B': Building2,
  'JS-C': Grid,
  'JS-D': Building2,
};

export default function Step5Format({ appState, setAppState, onNext, onPrev }: Props) {
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<'staff' | 'formats' | 'analyze' | 'company'>('formats');
  const [staffPresets, setStaffPresets] = useState<StaffPreset[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(defaultAdminSettings);

  const currentUser = auth.currentUser;
  const isAdmin = isUserAdmin(currentUser, staffPresets);

  useEffect(() => {
    setStaffPresets(getStaffPresets());
    setAdminSettings(getAdminSettings());

    fetchStaffPresetsFromCloud().then(setStaffPresets).catch(() => {});
    fetchAdminSettingsFromCloud().then(setAdminSettings).catch(() => {});
  }, [isStaffModalOpen, isAdminModalOpen]);

  const currentUserPreset = staffPresets.find(
    p => currentUser && (p.googleEmail === currentUser.email || p.googleUid === currentUser.uid)
  );

  const handleSelectFormat = (fmtId: string) => {
    setAppState(prev => {
      const classifiedList = prev.data?.images?.classifiedList || [];
      const assigned = assignSlotByFormat(classifiedList, fmtId);
      
      return {
        ...prev,
        format: fmtId as AppState['format'],
        data: prev.data ? {
          ...prev.data,
          images: {
            ...prev.data.images,
            main: assigned.main || prev.data.images?.main || '',
            floorPlan: assigned.floorPlan || prev.data.images?.floorPlan || '',
            map: assigned.map || prev.data.images?.map || '',
            subPhotos: assigned.subPhotos,
          }
        } : null
      };
    });
  };

  const handleSelectPreset = (preset: StaffPreset) => {
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
  };

  const updateContact = (key: keyof AppState['jsContact'], value: any) => {
    setAppState(prev => ({
      ...prev,
      jsContact: { ...prev.jsContact, [key]: value }
    }));
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      
      {/* 1. Format Selection */}
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Layout className="w-5 h-5 text-blue-600" />
              <span>1. JSマイソク フォーマットを選択してください</span>
            </h3>
            <p className="text-slate-500 text-xs mt-0.5">
              選択したフォーマットに合わせて、抽出された画像（外観、平面図、案内図等）の配置優先順位が自動調整されます。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAdminInitialTab('analyze');
                setIsAdminModalOpen(true);
              }}
              className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-300 transition-colors shadow-2xs shrink-0"
              title="見本マイソク（PDF/画像）をアップロードしてレイアウトをAI自動解析"
            >
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span>マイソク見本をAI解析</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAdminInitialTab('formats');
                setIsAdminModalOpen(true);
              }}
              className={`text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
                isAdmin
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-2xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <ShieldCheck className={`w-4 h-4 ${isAdmin ? 'text-amber-600' : 'text-slate-500'}`} />
              <span>管理者設定</span>
              {isAdmin && <Crown className="w-3 h-3 text-amber-500" />}
            </button>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-4">
          {(adminSettings.formats || []).filter(f => f.enabled !== false).map((fmt) => {
            const Icon = formatIcons[fmt.id] || Layout;
            const isSelected = appState.format === fmt.id;
            const isCustom = fmt.isCustom || fmt.id.startsWith('JS-CUSTOM');

            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => handleSelectFormat(fmt.id as AppState['format'])}
                className={`p-5 rounded-xl border-2 text-left transition-all flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/20 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3 w-full">
                  <div className={`p-3 rounded-xl shrink-0 ${
                    isSelected 
                      ? isCustom ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                      : isCustom ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {isCustom ? <Sparkles className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-base">{fmt.name}</h4>
                        {isCustom && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded font-bold flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" /> AI解析
                          </span>
                        )}
                        {fmt.badge && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded font-medium">
                            {fmt.badge}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 text-white ${
                          isCustom ? 'bg-purple-600' : 'bg-blue-600'
                        }`}>
                          <Check className="w-3 h-3" /> 選択中
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-blue-700 block mt-0.5">{fmt.subtitle}</span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {fmt.desc}
                    </p>
                  </div>
                </div>

                {/* 見本画像サムネイルプレビュー（登録されている場合） */}
                {fmt.thumbnailUrl && (
                  <div className="w-full h-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fmt.thumbnailUrl}
                      alt={fmt.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <span className="absolute bottom-1 right-1 text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded font-mono">
                      解析見本
                    </span>
                  </div>
                )}

                <div className="w-full bg-white/80 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-700 space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    <span>画像配置方針:</span>
                  </div>
                  <div className="text-slate-600 text-[11px] leading-tight">
                    {fmt.layoutGuide}
                  </div>
                  {fmt.recommendedFor && (
                    <div className="text-[10px] text-slate-500 pt-0.5">
                      <span className="font-bold text-slate-600">推奨: </span>
                      {fmt.recommendedFor}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Staff / Creator Input & Preset Selection */}
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              2. 作成者・営業担当者の設定
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              マイソク帯情報や提案メールに記載される担当者の名前・連絡先を入力します
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsStaffModalOpen(true)}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            担当者マスター登録・編集
          </button>
        </div>

        {/* Logged in User Quick Banner */}
        {currentUser && currentUserPreset && appState.jsContact.personName !== currentUserPreset.name && (
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <p className="text-xs text-blue-900">
                ログイン中のGoogleアカウントに紐づく担当者: <span className="font-bold">{currentUserPreset.name}</span> ({currentUserPreset.role || '営業担当'})
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSelectPreset(currentUserPreset)}
              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shadow-xs transition-colors shrink-0 flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              ワンクリック適用
            </button>
          </div>
        )}

        {/* Preset Chips */}
        {staffPresets.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              登録済み担当者からワンクリック選択:
            </span>
            <div className="flex flex-wrap gap-2">
              {staffPresets.map((p) => {
                const isSelected = appState.jsContact.personName === p.name;
                const isCurrentUser = currentUser && (p.googleEmail === currentUser.email || p.googleUid === currentUser.uid);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>{p.name}</span>
                    <span className="text-[10px] opacity-80 font-mono">({p.tel})</span>
                    {p.isAdmin && (
                      <span className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.2 rounded font-bold ${
                        isSelected ? 'bg-amber-400 text-amber-950' : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}>
                        <Crown className="w-2.5 h-2.5 text-amber-600" />
                        管理者
                      </span>
                    )}
                    {p.googleEmail && (
                      <span className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.2 rounded font-mono ${
                        isSelected ? 'bg-blue-700 text-blue-100' : 'bg-blue-100 text-blue-700'
                      }`}>
                        <Link2 className="w-2.5 h-2.5" />
                        Google
                      </span>
                    )}
                    {isCurrentUser && (
                      <span className={`text-[9px] font-bold px-1 py-0.2 rounded ${
                        isSelected ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        あなた
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Input Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              担当者のお名前 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={appState.jsContact.personName}
                onChange={(e) => updateContact('personName', e.target.value)}
                placeholder="例: 山田 太郎"
                className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              担当者携帯番号 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="tel"
                value={appState.jsContact.personTel}
                onChange={(e) => updateContact('personTel', e.target.value)}
                placeholder="例: 090-1234-5678"
                className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              担当者メール
            </label>
            <div className="relative">
              <input
                type="email"
                value={appState.jsContact.personEmail}
                onChange={(e) => updateContact('personEmail', e.target.value)}
                placeholder="例: yamada@j-jsquare.com"
                className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Selected Staff Google Link Info */}
        {(() => {
          const matchedPreset = staffPresets.find(p => p.name === appState.jsContact.personName);
          if (matchedPreset?.googleEmail) {
            return (
              <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Googleアカウント連携済み: <span className="font-mono font-bold">{matchedPreset.googleEmail}</span>
                  </span>
                </div>
                <span className="text-[10px] text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200 font-medium">
                  Cloud同期有効
                </span>
              </div>
            );
          }
          return null;
        })()}
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
          次へ: 写真・デザイン設定
        </button>
      </div>

      {/* Staff Modal */}
      <StaffPresetModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        onSelectStaff={handleSelectPreset}
      />

      {/* Admin Dashboard Modal */}
      <AdminDashboardModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        initialTab={adminInitialTab}
        onSettingsUpdated={(newSettings, updatedPresets) => {
          setAdminSettings(newSettings);
          setStaffPresets(updatedPresets);
        }}
      />
    </div>
  );
}

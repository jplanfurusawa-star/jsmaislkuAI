"use client";

import React, { useState, useEffect } from 'react';
import { StaffPreset } from '@/types';
import {
  getStaffPresets,
  addStaffPreset,
  updateStaffPreset,
  deleteStaffPreset,
  fetchStaffPresetsFromCloud,
  linkStaffPresetWithGoogle,
  unlinkStaffPresetGoogle,
  moveStaffPreset,
} from '@/lib/storage';
import { auth } from '@/lib/firebase';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  UserPlus,
  Phone,
  Mail,
  Link2,
  Unlink,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  Crown,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectStaff?: (staff: StaffPreset) => void;
}

export default function StaffPresetModal({ isOpen, onClose, onSelectStaff }: Props) {
  const [presets, setPresets] = useState<StaffPreset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('営業担当');
  const [isAdmin, setIsAdmin] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleUid, setGoogleUid] = useState('');
  const [googleDisplayName, setGoogleDisplayName] = useState('');
  const [googlePhotoUrl, setGooglePhotoUrl] = useState('');

  const currentUser = auth.currentUser;

  const reloadPresets = () => {
    setPresets(getStaffPresets());
  };

  useEffect(() => {
    if (isOpen) {
      reloadPresets();
      setIsAddingNew(false);
      setEditingId(null);
      setIsLoadingCloud(true);
      fetchStaffPresetsFromCloud().then((cloudList) => {
        setPresets(cloudList);
        setIsLoadingCloud(false);
      }).catch(() => {
        setIsLoadingCloud(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const resetFormState = () => {
    setName('');
    setTel('');
    setEmail('');
    setRole('営業担当');
    setIsAdmin(false);
    setGoogleEmail('');
    setGoogleUid('');
    setGoogleDisplayName('');
    setGooglePhotoUrl('');
  };

  const handleStartAdd = () => {
    resetFormState();
    setIsAddingNew(true);
    setEditingId(null);
  };

  const handleStartEdit = (p: StaffPreset) => {
    setName(p.name || '');
    setTel(p.tel || '');
    setEmail(p.email || '');
    setRole(p.role || '営業担当');
    setIsAdmin(!!p.isAdmin);
    setGoogleEmail(p.googleEmail || '');
    setGoogleUid(p.googleUid || '');
    setGoogleDisplayName(p.googleDisplayName || '');
    setGooglePhotoUrl(p.googlePhotoUrl || '');
    setEditingId(String(p.id));
    setIsAddingNew(false);
  };

  const handleCancelForm = () => {
    resetFormState();
    setIsAddingNew(false);
    setEditingId(null);
  };

  const handleApplyCurrentGoogleToForm = () => {
    if (!currentUser) return;
    setGoogleEmail(currentUser.email || '');
    setGoogleUid(currentUser.uid);
    setGoogleDisplayName(currentUser.displayName || '');
    setGooglePhotoUrl(currentUser.photoURL || '');
    if (!name.trim() && currentUser.displayName) {
      setName(currentUser.displayName);
    }
    if (!email.trim() && currentUser.email) {
      setEmail(currentUser.email);
    }
  };

  const handleClearGoogleFromForm = () => {
    setGoogleEmail('');
    setGoogleUid('');
    setGoogleDisplayName('');
    setGooglePhotoUrl('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isAddingNew) {
      const newPreset: Omit<StaffPreset, 'id'> = {
        name: name.trim(),
        tel: tel.trim(),
        email: email.trim(),
        role: role.trim() || '営業担当',
        isAdmin: isAdmin,
      };
      if (googleEmail.trim()) {
        newPreset.googleEmail = googleEmail.trim();
        if (googleUid.trim()) newPreset.googleUid = googleUid.trim();
        if (googleDisplayName.trim()) newPreset.googleDisplayName = googleDisplayName.trim();
        if (googlePhotoUrl.trim()) newPreset.googlePhotoUrl = googlePhotoUrl.trim();
        newPreset.linkedAt = new Date().toISOString();
      }
      const updated = addStaffPreset(newPreset);
      setPresets(updated);
      handleCancelForm();
    } else if (editingId) {
      const existing = presets.find(p => String(p.id) === String(editingId));
      const updatedItem: StaffPreset = {
        id: String(editingId),
        name: name.trim(),
        tel: tel.trim(),
        email: email.trim(),
        role: role.trim() || '営業担当',
        isAdmin: isAdmin,
        order: existing?.order,
        isDefault: existing?.isDefault || false,
      };
      if (googleEmail.trim()) {
        updatedItem.googleEmail = googleEmail.trim();
        if (googleUid.trim()) updatedItem.googleUid = googleUid.trim();
        if (googleDisplayName.trim()) updatedItem.googleDisplayName = googleDisplayName.trim();
        if (googlePhotoUrl.trim()) updatedItem.googlePhotoUrl = googlePhotoUrl.trim();
        updatedItem.linkedAt = existing?.linkedAt || new Date().toISOString();
      }
      const updated = updateStaffPreset(updatedItem);
      setPresets(updated);
      handleCancelForm();
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('この担当者情報を削除しますか？')) {
      const updated = deleteStaffPreset(String(id));
      setPresets(updated);
      if (editingId === String(id)) {
        handleCancelForm();
      }
    }
  };

  const handleMove = (id: string, direction: 'up' | 'down' | 'top') => {
    const updated = moveStaffPreset(String(id), direction);
    setPresets(updated);
  };

  const handleToggleAdmin = (p: StaffPreset) => {
    const updated = updateStaffPreset({
      ...p,
      isAdmin: !p.isAdmin,
    });
    setPresets(updated);
    if (editingId === String(p.id)) {
      setIsAdmin(!p.isAdmin);
    }
  };

  const handleQuickLinkCurrentGoogle = async (presetId: string) => {
    if (!currentUser || !currentUser.email) return;
    const updated = await linkStaffPresetWithGoogle(String(presetId), {
      googleEmail: currentUser.email,
      googleUid: currentUser.uid,
      googleDisplayName: currentUser.displayName || undefined,
      googlePhotoUrl: currentUser.photoURL || undefined,
    });
    setPresets(updated);
  };

  const handleQuickUnlinkGoogle = async (presetId: string) => {
    if (confirm('Googleアカウントの紐づけを解除しますか？')) {
      const updated = await unlinkStaffPresetGoogle(String(presetId));
      setPresets(updated);
    }
  };

  // Check if current user is linked to any preset
  const linkedPresetForCurrentUser = presets.find(
    p => currentUser && (p.googleEmail === currentUser.email || p.googleUid === currentUser.uid)
  );

  // Reusable Form component for both New and Inline Edit
  const renderFormFields = (isEdit: boolean) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm text-blue-950 flex items-center gap-1.5">
          {isEdit ? <Edit2 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-blue-600" />}
          {isEdit ? '担当者情報の編集' : '新規担当者を登録'}
        </h4>
        {currentUser && !googleEmail && (
          <button
            type="button"
            onClick={handleApplyCurrentGoogleToForm}
            className="text-[11px] font-bold text-blue-700 bg-white hover:bg-blue-100 px-2.5 py-1 rounded-md border border-blue-300 transition-colors flex items-center gap-1 shadow-2xs"
          >
            <Sparkles className="w-3 h-3 text-blue-600" />
            ログイン中Google情報を自動反映
          </button>
        )}
      </div>

      {/* Basic Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">氏名 <span className="text-red-500">*</span></label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 古澤 孝典 / 山田 太郎"
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">役職・部署</label>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="例: チーフディレクター / 営業一部"
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">担当携帯番号 <span className="text-red-500">*</span></label>
          <input
            type="tel"
            required
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="例: 090-9876-5432"
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">担当業務メール</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="例: furusawa@j-jsquare.com"
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>
      </div>

      {/* Admin Privilege Toggle */}
      <div className="bg-white/90 border border-amber-200 rounded-lg p-3">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 accent-amber-600 cursor-pointer"
          />
          <div className="flex-1">
            <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              管理者権限を付与する (Admin)
            </span>
            <p className="text-[11px] text-amber-800 mt-0.5">
              マスター設定の変更・編集権限を持ち、ヘッダーに管理者バッジが表示されます
            </p>
          </div>
          {isAdmin && (
            <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-full shrink-0">
              管理者
            </span>
          )}
        </label>
      </div>

      {/* Google Account Linking Section */}
      <div className="bg-white/90 border border-blue-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-blue-600" />
            Googleアカウント紐づけ設定
          </span>
          {googleEmail && (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
              連携中
            </span>
          )}
        </div>

        {googleEmail ? (
          <div className="flex items-center justify-between bg-emerald-50/60 border border-emerald-200 rounded-lg p-2.5">
            <div className="flex items-center gap-2.5">
              {googlePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={googlePhotoUrl} alt="Google Avatar" className="w-7 h-7 rounded-full border border-emerald-300" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  G
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-slate-900 font-mono">{googleEmail}</p>
                {googleDisplayName && (
                  <p className="text-[10px] text-slate-500">Google表示名: {googleDisplayName}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleClearGoogleFromForm}
              className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1 rounded border border-red-200 transition-colors flex items-center gap-1"
            >
              <Unlink className="w-3.5 h-3.5" />
              紐づけ解除
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-600 leading-tight">
              担当者にGoogleアカウントを紐づけると、ログイン時に担当者情報が自動選択され、マイソク帯情報や提案メールに反映されます。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {currentUser && (
                <button
                  type="button"
                  onClick={handleApplyCurrentGoogleToForm}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  ログイン中のGoogle ({currentUser.email}) を紐づける
                </button>
              )}
            </div>
            <div className="pt-1">
              <label className="block text-[10px] text-slate-500 font-bold mb-1">
                手動でGoogleアカウントのメールアドレスを入力:
              </label>
              <input
                type="email"
                value={googleEmail}
                onChange={(e) => setGoogleEmail(e.target.value)}
                placeholder="例: jplan.furusawa@gmail.com"
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Form Buttons */}
      <div className="flex justify-end gap-2 pt-2 border-t border-blue-200">
        <button
          type="button"
          onClick={handleCancelForm}
          className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
        >
          キャンセル
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-xs hover:bg-blue-700 flex items-center gap-1.5 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          保存してCloud同期
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-[#0F172A] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                担当者マスター・管理者権限・並び替え
                {isLoadingCloud && (
                  <span className="text-[10px] font-normal text-slate-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                    Cloud同期中
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">担当者の登録、Googleアカウント連携、管理者権限の付与、並び順の設定を行います</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Top Status: Current Logged In Google Account */}
          {currentUser && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {currentUser.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentUser.photoURL} alt="Google Avatar" className="w-9 h-9 rounded-full border border-slate-300" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">ログイン中Googleアカウント</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      認証済み
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-mono">{currentUser.displayName ? `${currentUser.displayName} (${currentUser.email})` : currentUser.email}</p>
                </div>
              </div>

              {linkedPresetForCurrentUser ? (
                <div className="text-right sm:self-center flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    担当者「{linkedPresetForCurrentUser.name}」と紐づけ済み
                  </span>
                  {linkedPresetForCurrentUser.isAdmin && (
                    <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-1 rounded-lg inline-flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5 text-amber-600" />
                      管理者
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-700 font-medium">未紐づけ</span>
                  {presets.find(p => p.name.includes('古澤') || String(p.id) === '1') && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = presets.find(p => p.name.includes('古澤') || String(p.id) === '1');
                        if (target) handleQuickLinkCurrentGoogle(target.id);
                      }}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      「古澤 孝典」に紐づける
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add New Preset Form (renders at the top when isAddingNew is true) */}
          {isAddingNew && (
            <form onSubmit={handleSave} className="p-4 bg-blue-50/80 border border-blue-300 rounded-xl space-y-4 shadow-sm animate-in fade-in duration-150">
              {renderFormFields(false)}
            </form>
          )}

          {/* List of Registered Staff */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  登録済み担当者マスター ({presets.length}名)
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  並び替え・管理者設定対応
                </span>
              </div>
              {!isAddingNew && (
                <button
                  type="button"
                  onClick={handleStartAdd}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" /> 担当者を追加
                </button>
              )}
            </div>

            {presets.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
                担当者がまだ登録されていません。「担当者を追加」から登録してください。
              </div>
            ) : (
              <div className="space-y-3">
                {presets.map((p, index) => {
                  const isEditingThis = editingId === String(p.id);
                  const isCurrentUserLinked = currentUser && (p.googleEmail === currentUser.email || p.googleUid === currentUser.uid);

                  // If this item is currently being edited, render the edit form INLINE right inside this card!
                  if (isEditingThis) {
                    return (
                      <form
                        key={p.id}
                        onSubmit={handleSave}
                        className="p-4 bg-blue-50/90 border-2 border-blue-400 rounded-xl shadow-md space-y-4 animate-in fade-in duration-150"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                          <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-mono font-bold">#{index + 1}</span>
                            「{p.name}」を編集中
                          </span>
                          <span className="text-[10px] text-blue-600 font-medium">変更後「保存してCloud同期」をクリックしてください</span>
                        </div>
                        {renderFormFields(true)}
                      </form>
                    );
                  }

                  // Normal Preset Card Display
                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 bg-white border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                        isCurrentUserLinked
                          ? 'border-blue-400 shadow-xs ring-2 ring-blue-100'
                          : 'border-slate-200 hover:border-blue-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Reorder Buttons (Up / Down / Top) */}
                        <div className="flex flex-col items-center bg-slate-50 rounded-lg p-0.5 border border-slate-200 shrink-0 select-none">
                          <button
                            type="button"
                            onClick={() => handleMove(p.id, 'up')}
                            disabled={index === 0}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                            title={index === 0 ? '先頭です' : '1つ上に移動'}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] font-mono font-bold text-slate-400 leading-none py-0.5">
                            #{index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleMove(p.id, 'down')}
                            disabled={index === presets.length - 1}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                            title={index === presets.length - 1 ? '末尾です' : '1つ下に移動'}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={() => handleMove(p.id, 'top')}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-white rounded transition-colors"
                              title="先頭へ移動"
                            >
                              <ChevronsUp className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Avatar */}
                        {p.googlePhotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.googlePhotoUrl} alt={p.name} className="w-10 h-10 rounded-full border border-slate-200 shrink-0 mt-0.5" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                            {p.name.slice(0, 1) || '担'}
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-900">{p.name}</span>
                            {p.role && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                                {p.role}
                              </span>
                            )}
                            {p.isAdmin && (
                              <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                                <Crown className="w-3 h-3 text-amber-600" />
                                管理者
                              </span>
                            )}
                            {isCurrentUserLinked && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-300">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                あなたのアカウント
                              </span>
                            )}
                          </div>

                          {/* Contact details */}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-mono">
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-blue-500" /> {p.tel}
                            </span>
                            {p.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3 text-slate-400" /> {p.email}
                              </span>
                            )}
                          </div>

                          {/* Google account badge */}
                          {p.googleEmail ? (
                            <div className="pt-0.5 flex items-center gap-2 text-[11px]">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono border border-blue-200 text-[10px]">
                                <Link2 className="w-3 h-3 text-blue-600" />
                                Google連携: {p.googleEmail}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleQuickUnlinkGoogle(p.id)}
                                className="text-[10px] text-slate-400 hover:text-red-600 underline"
                                title="Google連携を解除"
                              >
                                解除
                              </button>
                            </div>
                          ) : (
                            currentUser && (
                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleQuickLinkCurrentGoogle(p.id)}
                                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-slate-50 hover:bg-blue-50 px-2 py-0.5 rounded border border-slate-200 hover:border-blue-200 transition-colors"
                                >
                                  <Link2 className="w-3 h-3" />
                                  ログイン中のGoogle ({currentUser.email}) を紐づける
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end">
                        {onSelectStaff && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectStaff(p);
                              onClose();
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-xs transition-colors"
                          >
                            この担当者を選択
                          </button>
                        )}
                        
                        {/* Quick Admin Toggle Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleAdmin(p)}
                          className={`p-1.5 rounded transition-colors ${
                            p.isAdmin
                              ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                              : 'text-slate-300 hover:text-amber-600 hover:bg-slate-100'
                          }`}
                          title={p.isAdmin ? '管理者権限を解除' : '管理者権限を付与'}
                        >
                          <Crown className="w-4 h-4" />
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(p)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="編集する"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <span className="text-[11px] text-slate-500">
            ※ 並び順や管理者設定、Google連携情報はFirestoreクラウドに自動保存されます
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
}



"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  StaffPreset,
  AdminSettings,
  FormatDefinition,
  FormatAnalysisResult,
  CompanyMasterContact,
  defaultAdminSettings,
  defaultPromptPresets,
  PromptPreset,
} from '@/types';
import {
  getStaffPresets,
  addStaffPreset,
  updateStaffPreset,
  deleteStaffPreset,
  moveStaffPreset,
  linkStaffPresetWithGoogle,
  unlinkStaffPresetGoogle,
  fetchStaffPresetsFromCloud,
  getAdminSettings,
  saveAdminSettingsToCloud,
  fetchAdminSettingsFromCloud,
  isUserAdmin,
} from '@/lib/storage';
import { auth } from '@/lib/firebase';
import { prepareSampleFormatForAnalysis } from '@/utils/pdf';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Layout,
  Building2,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Save,
  RotateCcw,
  AlertTriangle,
  Crown,
  Link2,
  Unlink,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  Phone,
  Mail,
  Globe,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  Info,
  RefreshCw,
  Palette,
  Upload,
  FileUp,
  FileText,
  AlertCircle,
  ArrowRight,
  Eye,
  Loader2,
  Image as ImageIcon,
  CheckCheck,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSettingsUpdated?: (settings: AdminSettings, presets: StaffPreset[]) => void;
  initialTab?: 'staff' | 'formats' | 'analyze' | 'company';
}

export default function AdminDashboardModal({ isOpen, onClose, onSettingsUpdated, initialTab = 'staff' }: Props) {
  const currentUser = auth.currentUser;

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'staff' | 'formats' | 'analyze' | 'company'>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Staff state
  const [presets, setPresets] = useState<StaffPreset[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [isAddingStaff, setIsAddingStaff] = useState(false);

  // Staff Form state
  const [staffName, setStaffName] = useState('');
  const [staffTel, setStaffTel] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState('営業担当');
  const [staffIsAdmin, setStaffIsAdmin] = useState(false);
  const [staffIsDefault, setStaffIsDefault] = useState(false);
  const [staffGoogleEmail, setStaffGoogleEmail] = useState('');

  // Admin & Format Settings state
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(defaultAdminSettings);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Format Upload & Analysis State
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [samplePreviewUrl, setSamplePreviewUrl] = useState<string | null>(null);
  const [samplePdfText, setSamplePdfText] = useState<string>('');
  const [isPreparingFile, setIsPreparingFile] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<FormatAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [preAnalysisPrompt, setPreAnalysisPrompt] = useState<string>('');
  const [saveOption, setSaveOption] = useState<'new' | 'overwrite'>('new');
  const [overwriteTargetId, setOverwriteTargetId] = useState<string>('JS-B');
  const [setAsDefaultAfterSave, setSetAsDefaultAfterSave] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [imagePreviewModalUrl, setImagePreviewModalUrl] = useState<{ url: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [deletingStaff, setDeletingStaff] = useState<StaffPreset | null>(null);

  // Load staff & settings
  const loadData = async () => {
    setIsLoadingStaff(true);
    setIsLoadingSettings(true);

    const localPresets = getStaffPresets();
    setPresets(localPresets);
    const localSettings = getAdminSettings();
    setAdminSettings(localSettings);

    try {
      const [cloudPresets, cloudSettings] = await Promise.all([
        fetchStaffPresetsFromCloud(),
        fetchAdminSettingsFromCloud(),
      ]);
      setPresets(cloudPresets);
      setAdminSettings(cloudSettings);
    } catch (e) {
      console.warn("Failed to fetch cloud data in AdminDashboardModal:", e);
    } finally {
      setIsLoadingStaff(false);
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setIsAddingStaff(false);
      setEditingStaffId(null);
      setDeletingStaff(null);
      setSaveSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Check admin authorization
  const hasAdminPermission = isUserAdmin(currentUser, presets);

  // -------------------------------------------------------------
  // Staff Handlers
  // -------------------------------------------------------------
  const resetStaffForm = () => {
    setStaffName('');
    setStaffTel('');
    setStaffEmail('');
    setStaffRole('営業担当');
    setStaffIsAdmin(false);
    setStaffIsDefault(false);
    setStaffGoogleEmail('');
    setEditingStaffId(null);
    setIsAddingStaff(false);
  };

  const handleStartAddStaff = () => {
    resetStaffForm();
    setIsAddingStaff(true);
  };

  const handleStartEditStaff = (p: StaffPreset) => {
    setStaffName(p.name || '');
    setStaffTel(p.tel || '');
    setStaffEmail(p.email || '');
    setStaffRole(p.role || '営業担当');
    setStaffIsAdmin(!!p.isAdmin);
    setStaffIsDefault(!!p.isDefault);
    setStaffGoogleEmail(p.googleEmail || '');
    setEditingStaffId(String(p.id));
    setIsAddingStaff(false);
  };

  const handleSaveStaffForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !staffTel.trim()) return;

    if (isAddingStaff) {
      const newPreset: Omit<StaffPreset, 'id'> = {
        name: staffName.trim(),
        tel: staffTel.trim(),
        email: staffEmail.trim(),
        role: staffRole.trim(),
        isAdmin: staffIsAdmin,
        isDefault: staffIsDefault,
        googleEmail: staffGoogleEmail.trim() || undefined,
      };
      const updated = addStaffPreset(newPreset);
      setPresets(updated);
      onSettingsUpdated?.(adminSettings, updated);
    } else if (editingStaffId) {
      const current = presets.find(p => String(p.id) === editingStaffId);
      const updatedItem: StaffPreset = {
        id: editingStaffId,
        name: staffName.trim(),
        tel: staffTel.trim(),
        email: staffEmail.trim(),
        role: staffRole.trim(),
        isAdmin: staffIsAdmin,
        isDefault: staffIsDefault,
        order: current?.order ?? 0,
        googleEmail: staffGoogleEmail.trim() || undefined,
        googleUid: current?.googleUid,
        googleDisplayName: current?.googleDisplayName,
        googlePhotoUrl: current?.googlePhotoUrl,
        linkedAt: current?.linkedAt,
      };
      const updated = updateStaffPreset(updatedItem);
      setPresets(updated);
      onSettingsUpdated?.(adminSettings, updated);
    }
    resetStaffForm();
    showNotification("担当者情報を保存しました");
  };

  const handleDeleteStaffConfirm = () => {
    if (!deletingStaff) return;
    const adminCount = presets.filter(p => p.isAdmin).length;
    if (deletingStaff.isAdmin && adminCount <= 1) {
      alert("最後の管理者を削除することはできません。別の担当者に管理者権限を付与してから削除してください。");
      setDeletingStaff(null);
      return;
    }
    const updated = deleteStaffPreset(String(deletingStaff.id));
    setPresets(updated);
    setDeletingStaff(null);
    onSettingsUpdated?.(adminSettings, updated);
    showNotification(`「${deletingStaff.name}」を削除しました`);
  };

  const handleMoveStaff = (id: string, direction: 'up' | 'down' | 'top') => {
    const updated = moveStaffPreset(String(id), direction);
    setPresets(updated);
    onSettingsUpdated?.(adminSettings, updated);
  };

  const handleToggleStaffAdmin = (p: StaffPreset) => {
    const adminCount = presets.filter(item => item.isAdmin).length;
    if (p.isAdmin && adminCount <= 1) {
      alert("最後の管理者の権限を解除することはできません。");
      return;
    }
    const updated = updateStaffPreset({
      ...p,
      isAdmin: !p.isAdmin,
    });
    setPresets(updated);
    onSettingsUpdated?.(adminSettings, updated);
    showNotification(`「${p.name}」の管理者権限を${!p.isAdmin ? '有効' : '解除'}にしました`);
  };

  const handleToggleStaffDefault = (p: StaffPreset) => {
    const updated = presets.map(item => ({
      ...item,
      isDefault: String(item.id) === String(p.id) ? !p.isDefault : false,
    }));
    // Update target
    updateStaffPreset({
      ...p,
      isDefault: !p.isDefault,
    });
    setPresets(updated);
    onSettingsUpdated?.(adminSettings, updated);
    showNotification(
      !p.isDefault ? `「${p.name}」を標準（デフォルト）担当者に設定しました` : `標準担当者設定を解除しました`
    );
  };

  const handleLinkCurrentGoogle = async (presetId: string) => {
    if (!currentUser) return;
    const updated = await linkStaffPresetWithGoogle(String(presetId), {
      email: currentUser.email || '',
      uid: currentUser.uid,
      displayName: currentUser.displayName || undefined,
      photoUrl: currentUser.photoURL || undefined,
    });
    setPresets(updated);
    onSettingsUpdated?.(adminSettings, updated);
    showNotification("現在のGoogleアカウントと紐付けました");
  };

  const handleUnlinkGoogle = async (presetId: string) => {
    const updated = await unlinkStaffPresetGoogle(String(presetId));
    setPresets(updated);
    onSettingsUpdated?.(adminSettings, updated);
    showNotification("Googleアカウントの連携を解除しました");
  };

  // -------------------------------------------------------------
  // Format & Company Settings Handlers
  // -------------------------------------------------------------
  const handleUpdateFormatField = (id: string, key: keyof FormatDefinition, value: any) => {
    setAdminSettings(prev => ({
      ...prev,
      formats: prev.formats.map(fmt => fmt.id === id ? { ...fmt, [key]: value } : fmt),
    }));
  };

  const handleToggleFormatEnabled = (id: string) => {
    const activeFormats = adminSettings.formats.filter(f => f.enabled);
    const target = adminSettings.formats.find(f => f.id === id);
    if (target?.enabled && activeFormats.length <= 1) {
      alert("少なくとも1つのフォーマットを有効にする必要があります。");
      return;
    }
    setAdminSettings(prev => ({
      ...prev,
      formats: prev.formats.map(fmt => fmt.id === id ? { ...fmt, enabled: !fmt.enabled } : fmt),
    }));
  };

  const handleDeleteCustomFormat = async (id: string) => {
    const target = adminSettings.formats.find(f => f.id === id);
    if (!confirm(`カスタムフォーマット「${target?.name || id}」を削除しますか？`)) return;
    const remaining = adminSettings.formats.filter(f => f.id !== id);
    const updatedDefault = adminSettings.defaultFormat === id ? 'JS-B' : adminSettings.defaultFormat;
    const updated: AdminSettings = {
      ...adminSettings,
      formats: remaining,
      defaultFormat: updatedDefault,
    };
    setAdminSettings(updated);
    try {
      await saveAdminSettingsToCloud(updated);
      onSettingsUpdated?.(updated, presets);
      showNotification(`フォーマット「${target?.name || id}」を削除しました`);
    } catch (e) {
      console.error("Delete custom format error", e);
    }
  };

  // -------------------------------------------------------------
  // Format Upload & AI Analysis Handlers
  // -------------------------------------------------------------
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = async (file: File) => {
    setIsPreparingFile(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const prepared = await prepareSampleFormatForAnalysis(file);
      setSampleFile(file);
      setSamplePreviewUrl(prepared.previewDataUrl);
      setSamplePdfText(prepared.pdfText);
    } catch (err: any) {
      console.error("Failed to prepare sample format file:", err);
      setAnalysisError("ファイルの読み込み・プレビュー生成に失敗しました: " + (err.message || ''));
    } finally {
      setIsPreparingFile(false);
    }
  };

  const handleRunFormatAnalysis = async () => {
    if (!samplePreviewUrl) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStep('アップロード資料の解像度とテキスト層を準備中...');

    try {
      setAnalysisStep('Gemini AIが図面・写真・条件表の配置バランスをスキャン中...');
      const res = await fetch('/api/analyze-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: samplePreviewUrl,
          mimeType: 'image/jpeg',
          pdfText: samplePdfText,
          fileName: sampleFile?.name || 'sample-format',
          userPromptInstruction: preAnalysisPrompt,
        }),
      });

      setAnalysisStep('配色パレットとフォーマット定義を生成中...');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `解析APIエラー (${res.status})`);
      }

      setAnalysisResult({
        ...data.result,
        usagePrompt: data.result.usagePrompt || preAnalysisPrompt || '',
        thumbnailUrl: samplePreviewUrl,
        sourceFileName: sampleFile?.name,
      });
      showNotification("マイソク見本の解析が完了しました！内容を確認して登録してください。");
    } catch (err: any) {
      console.error("Format analysis error:", err);
      setAnalysisError(err.message || "フォーマットの解析に失敗しました。");
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const handleSaveAnalyzedFormat = async () => {
    if (!analysisResult) return;
    setIsSaving(true);
    try {
      let updatedFormats = [...adminSettings.formats];
      let targetId = '';

      if (saveOption === 'new') {
        const customCount = adminSettings.formats.filter(f => f.id.startsWith('JS-CUSTOM')).length + 1;
        targetId = `JS-CUSTOM-${customCount.toString().padStart(2, '0')}`;
        const newFormatDef: FormatDefinition = {
          id: targetId,
          name: analysisResult.formatName || `JS-Custom-${customCount} | 独自フォーマット`,
          subtitle: analysisResult.subtitle || 'AI解析・独自見本フォーマット',
          desc: analysisResult.desc || 'アップロードされたマイソク見本から解析されたフォーマット',
          layoutGuide: analysisResult.layoutGuide || '【構成】平面図、写真、条件表の独自配置',
          recommendedFor: analysisResult.recommendedFor || '標準・特化案件',
          enabled: true,
          order: adminSettings.formats.length,
          badge: analysisResult.badge || 'AI解析',
          themeColor: analysisResult.themeColor || '#0F172A',
          secondaryColor: analysisResult.secondaryColor || '#1E3A8A',
          accentColor: analysisResult.accentColor || '#D97706',
          thumbnailUrl: samplePreviewUrl || undefined,
          sourceFileName: sampleFile?.name,
          analyzedAt: new Date().toISOString(),
          isCustom: true,
          designNotes: analysisResult.designNotes,
          layoutStructure: analysisResult.layoutStructure,
          usagePrompt: analysisResult.usagePrompt || '',
        };
        updatedFormats.push(newFormatDef);
      } else {
        // Overwrite existing format (JS-A / JS-B / JS-C / JS-D)
        targetId = overwriteTargetId;
        updatedFormats = updatedFormats.map(fmt => {
          if (fmt.id === targetId) {
            return {
              ...fmt,
              name: analysisResult.formatName || fmt.name,
              subtitle: analysisResult.subtitle || fmt.subtitle,
              desc: analysisResult.desc || fmt.desc,
              layoutGuide: analysisResult.layoutGuide || fmt.layoutGuide,
              recommendedFor: analysisResult.recommendedFor || fmt.recommendedFor,
              badge: `${fmt.badge || '標準'}・AI更新`,
              themeColor: analysisResult.themeColor || fmt.themeColor,
              secondaryColor: analysisResult.secondaryColor || fmt.secondaryColor,
              accentColor: analysisResult.accentColor || fmt.accentColor,
              thumbnailUrl: samplePreviewUrl || fmt.thumbnailUrl,
              sourceFileName: sampleFile?.name,
              analyzedAt: new Date().toISOString(),
              designNotes: analysisResult.designNotes,
              layoutStructure: analysisResult.layoutStructure,
              usagePrompt: analysisResult.usagePrompt !== undefined ? analysisResult.usagePrompt : fmt.usagePrompt,
            };
          }
          return fmt;
        });
      }

      const updatedSettings: AdminSettings = {
        ...adminSettings,
        formats: updatedFormats,
        defaultFormat: setAsDefaultAfterSave ? targetId : adminSettings.defaultFormat,
        brandColorTheme: analysisResult.themeColor || adminSettings.brandColorTheme,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.email || currentUser?.displayName || 'admin',
      };

      const saved = await saveAdminSettingsToCloud(updatedSettings);
      setAdminSettings(saved);
      onSettingsUpdated?.(saved, presets);
      showNotification(`フォーマット「${analysisResult.formatName}」を登録・保存しました！`);
      setActiveTab('formats');
    } catch (err: any) {
      console.error("Save analyzed format error:", err);
      alert("フォーマット保存中にエラーが発生しました: " + (err?.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAnalysis = () => {
    setSampleFile(null);
    setSamplePreviewUrl(null);
    setSamplePdfText('');
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisStep('');
    setPreAnalysisPrompt('');
  };

  const handleUpdateCompanyField = (key: keyof CompanyMasterContact, value: string) => {
    setAdminSettings(prev => ({
      ...prev,
      companyContact: {
        ...prev.companyContact,
        [key]: value,
      }
    }));
  };

  const handleSaveAllSettings = async () => {
    setIsSaving(true);
    try {
      const saved = await saveAdminSettingsToCloud(adminSettings);
      setAdminSettings(saved);
      onSettingsUpdated?.(saved, presets);
      showNotification("管理者設定を保存し、クラウドと同期しました");
    } catch (err) {
      console.error("Save settings error:", err);
      alert("設定の保存中にエラーが発生しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    if (confirm("フォーマット設定および会社情報を初期値にリセットしますか？（登録済みの担当者リストは保持されます）")) {
      setAdminSettings(defaultAdminSettings);
      showNotification("初期設定に戻しました。適用するには「変更を保存」をクリックしてください");
    }
  };

  const showNotification = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 4000);
  };

  // Color theme presets
  const colorPresets = [
    { label: 'J.Square Navy', value: '#0F172A' },
    { label: 'Corporate Blue', value: '#2563EB' },
    { label: 'Luxury Amber', value: '#B45309' },
    { label: 'Forest Green', value: '#047857' },
    { label: 'Royal Violet', value: '#7C3AED' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden border border-slate-300">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between border-b border-slate-700 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                  管理者コントロールパネル
                </h2>
                <span className="text-[10px] bg-amber-500/30 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-300" />
                  ADMIN PRIVILEGES
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                担当者マスターの追加・削除、マイソクフォーマット設定、会社基本情報の統合管理
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Access Barrier if not admin */}
        {!hasAdminPermission ? (
          <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
            <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-xl text-center space-y-5">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">管理者権限が必要です</h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  現在ログイン中のアカウント（<span className="font-mono font-bold text-slate-800">{currentUser?.email || '未ログイン'}</span>）には、管理者権限が付与されていません。
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-left space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-500" />
                  現在の登録管理者:
                </div>
                <div className="space-y-1.5">
                  {presets.filter(p => p.isAdmin).map(admin => (
                    <div key={admin.id} className="text-xs flex items-center justify-between text-slate-600">
                      <span className="font-bold text-slate-800">{admin.name} ({admin.role || '管理者'})</span>
                      <span className="font-mono text-[11px] text-slate-500">{admin.email}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                担当者の追加・削除やフォーマットの変更を行う場合は、登録された管理者アカウントでGoogleログインしてください。
              </p>

              <button
                onClick={onClose}
                className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-colors shadow-sm"
              >
                閉じる
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Sub Tabs */}
            <div className="flex items-center justify-between px-6 bg-slate-100 border-b border-slate-200 shrink-0">
              <div className="flex space-x-1 py-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('staff')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'staff'
                      ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>1. 担当者マスター管理</span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full font-mono">
                    {presets.length}名
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('formats')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'formats'
                      ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Layout className="w-4 h-4 text-indigo-600" />
                  <span>2. フォーマット設定・一覧</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-mono">
                    初期: {adminSettings.defaultFormat}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('analyze')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all relative ${
                    activeTab === 'analyze'
                      ? 'bg-white text-purple-700 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>3. 見本アップロード＆AI解析</span>
                  <span className="text-[9px] bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold px-1.5 py-0.5 rounded-full shadow-xs">
                    AI
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('company')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'company'
                      ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-slate-700" />
                  <span>4. 会社基本情報・免許マスター</span>
                </button>
              </div>

              {/* Toast / Notification */}
              {saveSuccessMsg && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg animate-in fade-in font-medium">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#F8FAFC]">
              
              {/* ============================================================ */}
              {/* TAB 1: 担当者マスター管理 */}
              {/* ============================================================ */}
              {activeTab === 'staff' && (
                <div className="space-y-6">
                  {/* Action bar */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <span>社内担当者リスト</span>
                        <span className="text-xs font-normal text-slate-500">
                          （追加・編集・削除、並び替え、管理者権限の付与・解除が可能です）
                        </span>
                      </h3>
                    </div>

                    {!isAddingStaff && !editingStaffId && (
                      <button
                        type="button"
                        onClick={handleStartAddStaff}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span>新しい担当者を追加</span>
                      </button>
                    )}
                  </div>

                  {/* Add / Edit Form Modal/Box */}
                  {(isAddingStaff || editingStaffId) && (
                    <form
                      onSubmit={handleSaveStaffForm}
                      className="bg-white p-6 rounded-2xl border-2 border-blue-500 shadow-lg space-y-4 animate-in fade-in"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          {isAddingStaff ? <Plus className="w-4 h-4 text-blue-600" /> : <Edit2 className="w-4 h-4 text-blue-600" />}
                          <span>{isAddingStaff ? '新規担当者の登録' : '担当者情報の編集'}</span>
                        </h4>
                        <button
                          type="button"
                          onClick={resetStaffForm}
                          className="text-slate-400 hover:text-slate-600 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            氏名 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={staffName}
                            onChange={(e) => setStaffName(e.target.value)}
                            placeholder="例: 古澤 孝典"
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            役職・部署
                          </label>
                          <input
                            type="text"
                            value={staffRole}
                            onChange={(e) => setStaffRole(e.target.value)}
                            placeholder="例: 営業担当、チーフディレクター"
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            直通電話番号 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={staffTel}
                            onChange={(e) => setStaffTel(e.target.value)}
                            placeholder="例: 090-9876-5432"
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            メールアドレス
                          </label>
                          <input
                            type="email"
                            value={staffEmail}
                            onChange={(e) => setStaffEmail(e.target.value)}
                            placeholder="例: furusawa@j-jsquare.com"
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            連携用Googleメールアドレス（任意）
                          </label>
                          <input
                            type="email"
                            value={staffGoogleEmail}
                            onChange={(e) => setStaffGoogleEmail(e.target.value)}
                            placeholder="例: furusawa@j-jsquare.com または Gmailアドレス"
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">
                            Googleログイン時にこのメールアドレスと一致すると、マイソク作成時に自動的に担当者として選択されます。
                          </p>
                        </div>
                      </div>

                      {/* Permissions and Toggles */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                        <label className="flex items-center gap-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={staffIsAdmin}
                            onChange={(e) => setStaffIsAdmin(e.target.checked)}
                            className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                          />
                          <div>
                            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                              <Crown className="w-3.5 h-3.5 text-amber-600" />
                              管理者権限（ADMIN）を付与する
                            </span>
                            <p className="text-[10px] text-amber-700 mt-0.5">
                              この管理者コントロールパネルで担当者やフォーマットの設定変更が許可されます
                            </p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-blue-50/60 border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={staffIsDefault}
                            onChange={(e) => setStaffIsDefault(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <div>
                            <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5 text-blue-600" />
                              全社標準（デフォルト）担当者に設定
                            </span>
                            <p className="text-[10px] text-blue-700 mt-0.5">
                              未指定の場合にマイソク資料へ最初に適用される標準担当者です
                            </p>
                          </div>
                        </label>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={resetStaffForm}
                          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors"
                        >
                          キャンセル
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-sm transition-colors flex items-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isAddingStaff ? '登録を実行' : '更新を保存'}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Staff Table / Cards */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="divide-y divide-slate-100">
                      {presets.map((staff, idx) => {
                        const isCurrentLinked = currentUser && (
                          (staff.googleEmail && staff.googleEmail.toLowerCase() === currentUser.email?.toLowerCase()) ||
                          (staff.googleUid && staff.googleUid === currentUser.uid)
                        );
                        return (
                          <div
                            key={staff.id}
                            className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${
                              staff.isAdmin ? 'bg-amber-50/20' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* Left: Info */}
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold shrink-0">
                                {staff.name.slice(0, 1)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-slate-900">{staff.name}</span>
                                  {staff.role && (
                                    <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                                      {staff.role}
                                    </span>
                                  )}
                                  {staff.isAdmin && (
                                    <span className="text-[10px] bg-amber-500/20 text-amber-800 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                      <Crown className="w-3 h-3 text-amber-600" />
                                      管理者
                                    </span>
                                  )}
                                  {staff.isDefault && (
                                    <span className="text-[10px] bg-blue-500/15 text-blue-700 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                      標準担当者
                                    </span>
                                  )}
                                  {isCurrentLinked && (
                                    <span className="text-[10px] bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                      <Link2 className="w-3 h-3 text-green-600" />
                                      あなたのアカウントと連携中
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-600 flex-wrap">
                                  <span className="flex items-center gap-1 font-mono">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    {staff.tel}
                                  </span>
                                  {staff.email && (
                                    <span className="flex items-center gap-1 font-mono">
                                      <Mail className="w-3 h-3 text-slate-400" />
                                      {staff.email}
                                    </span>
                                  )}
                                  {staff.googleEmail && (
                                    <span className="text-[11px] text-blue-700 font-mono flex items-center gap-1 bg-blue-50 px-1.5 py-0.2 rounded">
                                      <Link2 className="w-2.5 h-2.5" />
                                      {staff.googleEmail}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Reorder buttons */}
                              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs mr-1">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveStaff(String(staff.id), 'up')}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100"
                                  title="上へ"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === presets.length - 1}
                                  onClick={() => handleMoveStaff(String(staff.id), 'down')}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 border-l border-slate-200"
                                  title="下へ"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Toggle Admin */}
                              <button
                                type="button"
                                onClick={() => handleToggleStaffAdmin(staff)}
                                className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                                  staff.isAdmin
                                    ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                                title={staff.isAdmin ? "管理者権限を解除" : "管理者権限を付与"}
                              >
                                <Crown className="w-3.5 h-3.5 text-amber-600" />
                              </button>

                              {/* Toggle Default */}
                              <button
                                type="button"
                                onClick={() => handleToggleStaffDefault(staff)}
                                className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                  staff.isDefault
                                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {staff.isDefault ? '標準' : '標準化'}
                              </button>

                              {/* Google Link/Unlink */}
                              {currentUser && (
                                isCurrentLinked ? (
                                  <button
                                    type="button"
                                    onClick={() => handleUnlinkGoogle(String(staff.id))}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                                    title="Google連携を解除"
                                  >
                                    <Unlink className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleLinkCurrentGoogle(String(staff.id))}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                                    title="現在のGoogleアカウントをこの担当者に紐付け"
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}

                              {/* Edit */}
                              <button
                                type="button"
                                onClick={() => handleStartEditStaff(staff)}
                                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200"
                                title="編集"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => setDeletingStaff(staff)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-slate-200"
                                title="削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 2: フォーマット設定・一覧 */}
              {/* ============================================================ */}
              {activeTab === 'formats' && (
                <div className="space-y-6">
                  {/* AI Analysis Quick Jump Banner */}
                  <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200/80 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-900">マイソク見本のアップロード＆AI解析</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-xs">
                            AI新機能
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          お手持ちのPDF・画像マイソク見本をアップロードすると、Gemini AIが図面・写真・条件表の配置や配色を自動解析し、新フォーマットとして即時登録できます。
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('analyze')}
                      className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shrink-0 transition-all shadow-sm cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>見本をアップロードして解析</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Default Format Setting */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Layout className="w-4 h-4 text-blue-600" />
                        <span>初期選択フォーマットの指定（全社デフォルト）</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        新規マイソク作成時にデフォルトで選択されるフォーマットを指定します。
                      </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {adminSettings.formats.filter(f => f.enabled !== false).map((fmt) => {
                        const isDefault = adminSettings.defaultFormat === fmt.id;
                        return (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => setAdminSettings(prev => ({ ...prev, defaultFormat: fmt.id }))}
                            className={`p-4 rounded-xl border-2 text-left transition-all relative ${
                              isDefault
                                ? 'border-blue-600 bg-blue-50/70 shadow-sm ring-1 ring-blue-600'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-sm text-slate-900 font-mono">{fmt.id}</span>
                              {isDefault && (
                                <span className="text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> デフォルト
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-bold text-blue-700 block truncate">
                              {fmt.name.split('|')[1] || fmt.name}
                            </span>
                            <span className="text-[10px] text-slate-500 block mt-1 line-clamp-1">
                              {fmt.subtitle}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Brand Color Theme Setting */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Palette className="w-4 h-4 text-indigo-600" />
                          <span>全社ブランドアクセントカラー</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          マイソク上部ヘッダーや賃料帯バナー、区画タイトルの共通メインカラーを設定できます。
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-lg border border-slate-300 shadow-xs"
                          style={{ backgroundColor: adminSettings.brandColorTheme }}
                        />
                        <span className="font-mono text-xs font-bold text-slate-700">
                          {adminSettings.brandColorTheme}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {colorPresets.map(preset => {
                        const isSelected = adminSettings.brandColorTheme.toLowerCase() === preset.value.toLowerCase();
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => setAdminSettings(prev => ({ ...prev, brandColorTheme: preset.value }))}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                              isSelected
                                ? 'border-slate-800 bg-slate-900 text-white shadow-xs'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="w-3.5 h-3.5 rounded-full border border-white/40" style={{ backgroundColor: preset.value }} />
                            <span>{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Format Detail Customization Cards */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-600" />
                        <span>登録フォーマット一覧（標準 ＆ AI解析カスタム）</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setActiveTab('analyze')}
                        className="text-xs text-purple-700 hover:text-purple-800 font-bold flex items-center gap-1 hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>新しい見本からフォーマットを追加</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {adminSettings.formats.map((fmt) => {
                        const isCustom = Boolean(fmt.isCustom || fmt.id.startsWith('JS-CUSTOM'));
                        return (
                          <div
                            key={fmt.id}
                            className={`bg-white p-5 rounded-2xl border transition-all ${
                              fmt.enabled ? 'border-slate-200 shadow-sm' : 'border-slate-200 bg-slate-50/70 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                                  isCustom ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {fmt.id}
                                </span>
                                {isCustom && (
                                  <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                                    <Sparkles className="w-2.5 h-2.5" /> AI解析
                                  </span>
                                )}
                                {fmt.id === adminSettings.defaultFormat && (
                                  <span className="text-amber-600 font-bold text-xs ml-1">★初期デフォルト</span>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium">
                                  <input
                                    type="checkbox"
                                    checked={fmt.enabled}
                                    onChange={() => handleToggleFormatEnabled(fmt.id)}
                                    className="w-3.5 h-3.5 text-blue-600 rounded"
                                  />
                                  <span className={fmt.enabled ? 'text-slate-700 font-bold' : 'text-slate-400'}>
                                    {fmt.enabled ? '有効' : '無効'}
                                  </span>
                                </label>

                                {isCustom && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCustomFormat(fmt.id)}
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                    title="このカスタムフォーマットを削除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Thumbnail Preview if present */}
                            {fmt.thumbnailUrl && (
                              <div className="mb-3 p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 overflow-hidden">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={fmt.thumbnailUrl}
                                    alt={fmt.name}
                                    className="w-14 h-10 object-cover rounded-lg border border-slate-300 shrink-0 bg-white"
                                  />
                                  <div className="min-w-0">
                                    <span className="text-[11px] font-bold text-slate-700 block truncate">
                                      見本資料: {fmt.sourceFileName || '解析見本'}
                                    </span>
                                    {fmt.analyzedAt && (
                                      <span className="text-[10px] text-slate-400 block font-mono">
                                        解析日: {new Date(fmt.analyzedAt).toLocaleDateString('ja-JP')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setImagePreviewModalUrl({ url: fmt.thumbnailUrl!, title: fmt.name })}
                                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 text-xs font-bold flex items-center gap-1 shrink-0"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>見本確認</span>
                                </button>
                              </div>
                            )}

                            <div className="space-y-3">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  表示タイトル名
                                </label>
                                <input
                                  type="text"
                                  value={fmt.name}
                                  onChange={(e) => handleUpdateFormatField(fmt.id, 'name', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  サブタイトル
                                </label>
                                <input
                                  type="text"
                                  value={fmt.subtitle}
                                  onChange={(e) => handleUpdateFormatField(fmt.id, 'subtitle', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  説明文
                                </label>
                                <textarea
                                  rows={2}
                                  value={fmt.desc}
                                  onChange={(e) => handleUpdateFormatField(fmt.id, 'desc', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  構成ガイド
                                </label>
                                <input
                                  type="text"
                                  value={fmt.layoutGuide}
                                  onChange={(e) => handleUpdateFormatField(fmt.id, 'layoutGuide', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-[11px]"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  推奨用途・対象案件
                                </label>
                                <input
                                  type="text"
                                  value={fmt.recommendedFor}
                                  onChange={(e) => handleUpdateFormatField(fmt.id, 'recommendedFor', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>運用指示プロンプト（どういう風に使ってほしいか）</span>
                                    <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">
                                      AI連携ルール
                                    </span>
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-mono">{(fmt.usagePrompt || '').length}文字</span>
                                </label>
                                <textarea
                                  rows={3}
                                  value={fmt.usagePrompt || ''}
                                  onChange={(e) => handleUpdateFormatField(fmt.id, 'usagePrompt', e.target.value)}
                                  placeholder="このフォーマット適用時にAIへどういう風に作ってほしいかの指示・ルール（例: 外観写真を最優先で配置、高級感のある配色、条件表を右側に集約など）"
                                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans shadow-2xs leading-relaxed"
                                />
                                <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px]">
                                  <span className="text-slate-400 font-medium shrink-0">挿入:</span>
                                  {defaultPromptPresets.slice(0, 4).map((p, pIdx) => (
                                    <button
                                      key={pIdx}
                                      type="button"
                                      onClick={() => {
                                        const cur = fmt.usagePrompt ? fmt.usagePrompt.trim() + '\n' : '';
                                        handleUpdateFormatField(fmt.id, 'usagePrompt', cur + p.text);
                                      }}
                                      className="px-2 py-0.5 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border border-slate-200 rounded-md transition-colors shrink-0"
                                      title={p.text}
                                    >
                                      + {p.label.split(' ')[1] || p.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Color theme swatches */}
                              {(fmt.themeColor || fmt.accentColor) && (
                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                                  <span className="font-bold text-[11px]">フォーマット配色:</span>
                                  <div className="flex items-center gap-2">
                                    {fmt.themeColor && (
                                      <div className="flex items-center gap-1">
                                        <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-xs" style={{ backgroundColor: fmt.themeColor }} />
                                        <span className="font-mono text-[10px] text-slate-500">{fmt.themeColor}</span>
                                      </div>
                                    )}
                                    {fmt.accentColor && (
                                      <div className="flex items-center gap-1">
                                        <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-xs" style={{ backgroundColor: fmt.accentColor }} />
                                        <span className="font-mono text-[10px] text-slate-500">{fmt.accentColor}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 3: マイソク見本アップロード＆AI解析 */}
              {/* ============================================================ */}
              {activeTab === 'analyze' && (
                <div className="space-y-6">
                  {/* Header / Guide */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-slate-900">
                            マイソク見本のアップロード ＆ AIフォーマット構造解析
                          </h3>
                          <p className="text-xs text-slate-500">
                            自社・他社のマイソク見本PDFまたは画像をアップロードすると、Gemini 2.5 Flashが図面・写真・条件表の配置比率や配色を抽出し、ワンクリックで新フォーマットとして登録します。
                          </p>
                        </div>
                      </div>
                      {analysisResult && (
                        <button
                          type="button"
                          onClick={handleResetAnalysis}
                          className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>別の見本を解析</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Upload Dropzone */}
                  {!samplePreviewUrl ? (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                      onDragLeave={() => setIsDragActive(false)}
                      onDrop={handleFileDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                        isDragActive
                          ? 'border-purple-500 bg-purple-50/80 scale-[0.99]'
                          : 'border-slate-300 hover:border-purple-400 bg-white hover:bg-purple-50/20'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,image/png,image/jpeg,image/webp"
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                      <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-3 shadow-xs">
                        {isPreparingFile ? (
                          <Loader2 className="w-7 h-7 animate-spin text-purple-600" />
                        ) : (
                          <FileUp className="w-7 h-7" />
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mb-1">
                        {isPreparingFile
                          ? '見本ファイルの高解像度レンダリングを実行中...'
                          : 'マイソク見本ファイル（PDF / 画像）をドラッグ＆ドロップ'}
                      </h4>
                      <p className="text-xs text-slate-500 max-w-md mb-4 leading-relaxed">
                        またはクリックしてファイルを選択してください。<br />
                        A4横（推奨）または縦の募集図面、プレゼン資料（PDF, PNG, JPG, WebP）に対応しています。
                      </p>

                      <div className="flex items-center gap-2 flex-wrap justify-center text-[11px] text-slate-400 font-medium">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md font-mono">PDF (1ページ目自動描画)</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md font-mono">PNG / JPEG / WebP</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md">最大 30MB</span>
                      </div>
                    </div>
                  ) : (
                    /* File Selected & Ready for Analysis */
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="flex items-center gap-3.5 overflow-hidden">
                          <div className="relative group shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={samplePreviewUrl}
                              alt="Sample Preview"
                              className="w-16 h-12 object-cover rounded-lg border border-slate-300 shadow-xs bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => setImagePreviewModalUrl({ url: samplePreviewUrl, title: sampleFile?.name || '見本プレビュー' })}
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white rounded-lg transition-opacity"
                              title="拡大プレビュー"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900 truncate">
                                {sampleFile?.name}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                                プレビュー準備完了
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 font-mono">
                              サイズ: {((sampleFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB
                              {samplePdfText ? ` | 抽出テキスト: ${samplePdfText.length}文字` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSampleFile(null);
                              setSamplePreviewUrl(null);
                              setSamplePdfText('');
                              setAnalysisResult(null);
                              setPreAnalysisPrompt('');
                            }}
                            disabled={isAnalyzing}
                            className="px-3 py-2 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            別のファイルを選択
                          </button>

                          {!analysisResult && (
                            <button
                              type="button"
                              onClick={handleRunFormatAnalysis}
                              disabled={isAnalyzing}
                              className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span>AI解析実行中...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4 text-amber-300" />
                                  <span>Gemini AIでフォーマット解析を開始</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Optional Pre-analysis user guidance */}
                      {!analysisResult && !isAnalyzing && (
                        <div className="p-4 bg-purple-50/40 border border-purple-200/80 rounded-2xl space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                              <span>解析・運用指示の事前プロンプト（任意）</span>
                            </label>
                            <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full font-medium">
                              解析時にAIへ自動反映
                            </span>
                          </div>
                          <input
                            type="text"
                            value={preAnalysisPrompt}
                            onChange={(e) => setPreAnalysisPrompt(e.target.value)}
                            placeholder="例: 高級路面店向けに外観写真・パースの配置を大きくしてほしい、オフィス向けに条件表を充実させたい など"
                            className="w-full px-3.5 py-2 text-xs border border-purple-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs placeholder:text-slate-400"
                          />
                          <p className="text-[10.5px] text-slate-500 leading-tight">
                            ※ 解析完了後にも、より詳細なフォーマット運用プロンプトを編集・追加できます。
                          </p>
                        </div>
                      )}

                      {/* Loading Step Animation */}
                      {isAnalyzing && (
                        <div className="p-6 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-4 animate-in fade-in">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center animate-pulse">
                              <Sparkles className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-purple-900">
                                マルチモーダルAIがマイソク構造を解析しています
                              </h4>
                              <p className="text-xs text-purple-700 mt-0.5">
                                {analysisStep || 'Gemini 2.5 Flashがレイアウト・カラー・要素比率を計算中...'}
                              </p>
                            </div>
                          </div>

                          <div className="w-full bg-purple-200/60 rounded-full h-2 overflow-hidden">
                            <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 h-2 rounded-full animate-pulse w-3/4 transition-all duration-500" />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-purple-800">
                            <div className="flex items-center gap-1.5 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>1. 高解像度プレビュー変換</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-medium">
                              <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin shrink-0" />
                              <span>2. 図面・写真・テーブル比率認識</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-medium text-purple-400">
                              <span className="w-3.5 h-3.5 rounded-full border border-purple-300 flex items-center justify-center text-[9px]">3</span>
                              <span>3. 配色パレット＆定義生成</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Error Banner */}
                      {analysisError && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-900">
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-1">
                            <span className="font-bold block">解析中にエラーが発生しました</span>
                            <p className="text-red-700 leading-relaxed">{analysisError}</p>
                            <button
                              type="button"
                              onClick={handleRunFormatAnalysis}
                              className="mt-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5 shadow-xs"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>もう一度解析を実行する</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ======================================================== */}
                      {/* Analysis Result Review & Registration Form */}
                      {/* ======================================================== */}
                      {analysisResult && (
                        <div className="space-y-6 pt-2">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                              <h4 className="text-base font-black text-slate-900">
                                AI解析結果レビュー ＆ フォーマット登録設定
                              </h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                                解析完了
                              </span>
                            </div>
                            <span className="text-xs text-slate-500 font-mono">
                              推奨ベース: <strong className="text-slate-800">{analysisResult.suggestedBaseFormat || 'JS-B'}</strong>
                            </span>
                          </div>

                          {/* 🌟 PROMINENT SPOTLIGHT: フォーマット運用指示プロンプト入力欄（どういう風に使ってほしいか） */}
                          <div className="p-5 bg-gradient-to-br from-indigo-50/95 via-purple-50/80 to-blue-50/70 border-2 border-indigo-400/80 rounded-2xl shadow-sm space-y-3.5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="flex items-start sm:items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                                  <Sparkles className="w-5 h-5 text-amber-300" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h5 className="text-sm font-black text-indigo-950">
                                      フォーマット運用指示プロンプト（どういう風に使ってほしいか）
                                    </h5>
                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md">
                                      AI作成・レイアウト運用ルール
                                    </span>
                                  </div>
                                  <p className="text-xs text-indigo-900/70 mt-0.5 leading-relaxed">
                                    アップロードした見本を元に、マイソク作成時にAIへどういう意図・優先順位・ターゲット層・構成方針で作ってほしいかの指示プロンプトを入力してください。
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 self-end sm:self-center">
                                <span className="text-[11px] font-mono text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 font-bold shadow-2xs">
                                  {(analysisResult.usagePrompt || '').length} 文字
                                </span>
                                {analysisResult.usagePrompt && (
                                  <button
                                    type="button"
                                    onClick={() => setAnalysisResult(prev => prev ? ({ ...prev, usagePrompt: '' }) : null)}
                                    className="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-white/80 transition-colors"
                                  >
                                    クリア
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="relative">
                              <textarea
                                rows={4}
                                value={analysisResult.usagePrompt || ''}
                                onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, usagePrompt: e.target.value }) : null)}
                                placeholder="例:&#10;・都心高級商業エリアの路面店舗向け。外観写真やファサードパースの縦横比を崩さず大きく配置し、高級感とファサード視認性を最優先にする。&#10;・賃料だけでなく坪単価や保証金月数を目立たせ、視線誘導を上部から右側概要表へ自然に流す。&#10;・図面内の有効間口や天井高などの重要テキストが隠れないようにスロットを調整する。"
                                className="w-full px-4 py-3 text-xs sm:text-sm font-sans border-2 border-indigo-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs leading-relaxed text-slate-800 placeholder:text-slate-400"
                              />
                            </div>

                            {/* Quick Insert Preset Chips */}
                            <div className="space-y-1.5 pt-1 border-t border-indigo-100">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-indigo-900 flex items-center gap-1">
                                  <span>💡 ワンクリックでプロンプト指示を追加・挿入:</span>
                                </span>
                                <span className="text-indigo-400 text-[10px]">クリックした指示がプロンプト末尾に追加されます</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {defaultPromptPresets.map((preset, pIdx) => (
                                  <button
                                    key={pIdx}
                                    type="button"
                                    onClick={() => {
                                      const current = analysisResult.usagePrompt ? analysisResult.usagePrompt.trim() + '\n' : '';
                                      setAnalysisResult(prev => prev ? ({ ...prev, usagePrompt: current + preset.text }) : null);
                                    }}
                                    className="text-[11px] px-2.5 py-1.5 bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1 font-medium"
                                  >
                                    <span className="text-indigo-500 font-bold">+</span>
                                    <span>{preset.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Left Column: Visual Wireframe & Color Palette (5 cols) */}
                            <div className="lg:col-span-5 space-y-4">
                              {/* Wireframe Mockup */}
                              <div className="bg-slate-900 p-4 rounded-2xl text-white space-y-3 shadow-md">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold flex items-center gap-1.5">
                                    <Layout className="w-3.5 h-3.5 text-purple-400" />
                                    レイアウト骨格プレビュー（A4横モデル）
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {analysisResult.layoutStructure?.orientation === 'portrait' ? 'A4 縦向き' : 'A4 横向き'}
                                  </span>
                                </div>

                                {/* Mini A4 Canvas Mockup */}
                                <div className="w-full aspect-[1.414/1] bg-slate-950 rounded-xl border border-slate-800 p-2.5 flex flex-col justify-between relative overflow-hidden shadow-inner">
                                  {/* Header Band */}
                                  <div
                                    className="w-full h-6 rounded px-2 flex items-center justify-between text-[9px] font-bold text-white shadow-xs"
                                    style={{ backgroundColor: analysisResult.themeColor || '#0F172A' }}
                                  >
                                    <span className="truncate">{analysisResult.formatName}</span>
                                    <span className="text-[8px] opacity-80 font-mono">JS-MYSOKU</span>
                                  </div>

                                  {/* Body Split */}
                                  <div className="flex-1 my-2 grid grid-cols-12 gap-1.5">
                                    {/* Left Area (Plan or Photos) */}
                                    <div className="col-span-7 bg-slate-800/80 rounded border border-slate-700/80 p-1.5 flex flex-col justify-between">
                                      <div className="flex items-center justify-between text-[8px] text-slate-300">
                                        <span className="font-bold">図面区画（{analysisResult.layoutStructure?.floorPlanPosition || '左側'}）</span>
                                        <span className="text-[7px] text-purple-400 font-mono">
                                          {analysisResult.layoutStructure?.floorPlanWidthRatio || 50}%
                                        </span>
                                      </div>
                                      <div className="w-full flex-1 bg-slate-900/90 rounded border border-dashed border-slate-700 flex items-center justify-center my-1">
                                        <span className="text-[8px] text-slate-400 font-mono">間取り・区画図面</span>
                                      </div>
                                      <div className="text-[7px] text-slate-400 truncate">
                                        案内図位置: {analysisResult.layoutStructure?.mapPosition || '図面下部'}
                                      </div>
                                    </div>

                                    {/* Right Area (Photos & Table) */}
                                    <div className="col-span-5 flex flex-col gap-1.5">
                                      {/* Photos slot */}
                                      <div className="flex-1 bg-slate-800/80 rounded border border-slate-700/80 p-1 flex flex-col justify-between">
                                        <span className="text-[8px] font-bold text-slate-300">
                                          写真枠（{analysisResult.layoutStructure?.photosPosition || '右側'}）
                                        </span>
                                        <div className="grid grid-cols-2 gap-0.5 my-0.5">
                                          {[1, 2, 3, 4].map(n => (
                                            <div key={n} className="h-4 bg-slate-900 rounded flex items-center justify-center text-[6px] text-slate-500 font-mono">
                                              P{n}
                                            </div>
                                          ))}
                                        </div>
                                        <span className="text-[7px] text-purple-300 text-right">
                                          最大{analysisResult.layoutStructure?.photoSlotCount || 4}枚枠
                                        </span>
                                      </div>

                                      {/* Specs Table slot */}
                                      <div className="h-10 bg-slate-800/80 rounded border border-slate-700/80 p-1 flex flex-col justify-between">
                                        <span className="text-[7px] font-bold text-slate-300">募集条件詳細テーブル</span>
                                        <div className="space-y-0.5">
                                          <div className="h-1 bg-slate-700 rounded-xs" />
                                          <div className="h-1 bg-slate-700 rounded-xs w-4/5" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Footer Band */}
                                  <div
                                    className="w-full h-4 rounded-xs px-2 flex items-center justify-between text-[7px] font-bold text-white shadow-xs"
                                    style={{ backgroundColor: analysisResult.themeColor || '#0F172A' }}
                                  >
                                    <span>J.Square 取引条件・会社概要帯</span>
                                    <span className="font-mono">TEL: 03-3454-7000</span>
                                  </div>
                                </div>
                              </div>

                              {/* Extracted Color Palette */}
                              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                  <Palette className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>抽出カラースキーム（編集可能）</span>
                                </h4>

                                <div className="space-y-2.5">
                                  {/* Theme Color */}
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="color"
                                        value={analysisResult.themeColor || '#0F172A'}
                                        onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, themeColor: e.target.value }) : null)}
                                        className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                                      />
                                      <div>
                                        <span className="font-bold text-slate-700 block">メインテーマ色</span>
                                        <span className="text-[10px] text-slate-400">ヘッダー帯・主要見出し</span>
                                      </div>
                                    </div>
                                    <input
                                      type="text"
                                      value={analysisResult.themeColor || '#0F172A'}
                                      onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, themeColor: e.target.value }) : null)}
                                      className="w-24 px-2 py-1 text-xs font-mono border border-slate-300 rounded-lg text-center"
                                    />
                                  </div>

                                  {/* Secondary Color */}
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="color"
                                        value={analysisResult.secondaryColor || '#1E3A8A'}
                                        onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, secondaryColor: e.target.value }) : null)}
                                        className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                                      />
                                      <div>
                                        <span className="font-bold text-slate-700 block">サブカラー</span>
                                        <span className="text-[10px] text-slate-400">区画枠線・サブ見出し</span>
                                      </div>
                                    </div>
                                    <input
                                      type="text"
                                      value={analysisResult.secondaryColor || '#1E3A8A'}
                                      onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, secondaryColor: e.target.value }) : null)}
                                      className="w-24 px-2 py-1 text-xs font-mono border border-slate-300 rounded-lg text-center"
                                    />
                                  </div>

                                  {/* Accent Color */}
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="color"
                                        value={analysisResult.accentColor || '#D97706'}
                                        onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, accentColor: e.target.value }) : null)}
                                        className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                                      />
                                      <div>
                                        <span className="font-bold text-slate-700 block">アクセント色</span>
                                        <span className="text-[10px] text-slate-400">賃料・注目バッジ</span>
                                      </div>
                                    </div>
                                    <input
                                      type="text"
                                      value={analysisResult.accentColor || '#D97706'}
                                      onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, accentColor: e.target.value }) : null)}
                                      className="w-24 px-2 py-1 text-xs font-mono border border-slate-300 rounded-lg text-center"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Right Column: Metadata & Save Target Form (7 cols) */}
                            <div className="lg:col-span-7 space-y-4">
                              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">
                                    フォーマット表示タイトル名
                                  </label>
                                  <input
                                    type="text"
                                    value={analysisResult.formatName}
                                    onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, formatName: e.target.value }) : null)}
                                    className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="例: JS-銀座並木通り型 | 高級商業ビル"
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                      サブタイトル
                                    </label>
                                    <input
                                      type="text"
                                      value={analysisResult.subtitle}
                                      onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, subtitle: e.target.value }) : null)}
                                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                      placeholder="例: 写真4枠・詳細条件テーブル特化型"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                      バッジ表示名
                                    </label>
                                    <input
                                      type="text"
                                      value={analysisResult.badge}
                                      onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, badge: e.target.value }) : null)}
                                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                      placeholder="例: AI解析・銀座型"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">
                                    構成ガイド（要約）
                                  </label>
                                  <input
                                    type="text"
                                    value={analysisResult.layoutGuide}
                                    onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, layoutGuide: e.target.value }) : null)}
                                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="例: 【構成】左に平面図・案内図 / 右に写真4枠・条件テーブル"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">
                                    推奨用途・対象物件
                                  </label>
                                  <input
                                    type="text"
                                    value={analysisResult.recommendedFor}
                                    onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, recommendedFor: e.target.value }) : null)}
                                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="例: 都心商業店舗、ラグジュアリー新築オフィス"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">
                                    説明文
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={analysisResult.desc}
                                    onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, desc: e.target.value }) : null)}
                                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                                  />
                                </div>

                                {/* AI Design Notes */}
                                {analysisResult.designNotes && analysisResult.designNotes.length > 0 && (
                                  <div className="p-3 bg-purple-50/60 border border-purple-200/80 rounded-xl space-y-1.5">
                                    <span className="text-[11px] font-bold text-purple-900 flex items-center gap-1">
                                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                      AIデザイン講評・抽出ポイント
                                    </span>
                                    <ul className="text-[11px] text-purple-800 space-y-1 pl-4 list-disc">
                                      {analysisResult.designNotes.map((note, idx) => (
                                        <li key={idx} className="leading-relaxed">{note}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Format Usage Prompt Input Section (Synced with Spotlight Card) */}
                                <div className="p-4 bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-white border border-indigo-200/90 rounded-2xl space-y-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <label className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                                        <Sparkles className="w-4 h-4 text-indigo-600" />
                                        <span>フォーマット運用指示プロンプト（AI作成ルール）</span>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
                                          上部と同期
                                        </span>
                                      </label>
                                      <p className="text-[11px] text-indigo-900/70 mt-0.5 leading-relaxed">
                                        上部のハイライト入力欄と双方向で同期しています。ここからでも追記・編集できます。
                                      </p>
                                    </div>
                                    <span className="text-[10px] font-mono text-indigo-500 shrink-0">
                                      {(analysisResult.usagePrompt || '').length} 文字
                                    </span>
                                  </div>

                                  <textarea
                                    rows={3}
                                    value={analysisResult.usagePrompt || ''}
                                    onChange={(e) => setAnalysisResult(prev => prev ? ({ ...prev, usagePrompt: e.target.value }) : null)}
                                    className="w-full px-3.5 py-2 text-xs font-sans border border-indigo-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs leading-relaxed"
                                    placeholder="例: 高級路面店向けに外観写真を大きく配置、条件表を右側にコンパクトに配置など"
                                  />
                                </div>
                              </div>

                              {/* Registration Target Selection & Save */}
                              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                                <div className="space-y-2">
                                  <span className="text-xs font-bold text-slate-800 block">
                                    フォーマットの登録先を選択:
                                  </span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <label className={`p-3 rounded-xl border-2 flex items-start gap-2.5 cursor-pointer transition-all ${
                                      saveOption === 'new'
                                        ? 'border-purple-600 bg-white shadow-xs'
                                        : 'border-slate-200 bg-white/70 hover:bg-white'
                                    }`}>
                                      <input
                                        type="radio"
                                        name="saveOption"
                                        checked={saveOption === 'new'}
                                        onChange={() => setSaveOption('new')}
                                        className="mt-0.5 text-purple-600"
                                      />
                                      <div>
                                        <span className="font-bold text-xs text-slate-900 block">新規カスタムとして追加</span>
                                        <span className="text-[10px] text-slate-500">
                                          JS-CUSTOMフォーマットとして全社共有
                                        </span>
                                      </div>
                                    </label>

                                    <label className={`p-3 rounded-xl border-2 flex items-start gap-2.5 cursor-pointer transition-all ${
                                      saveOption === 'overwrite'
                                        ? 'border-purple-600 bg-white shadow-xs'
                                        : 'border-slate-200 bg-white/70 hover:bg-white'
                                    }`}>
                                      <input
                                        type="radio"
                                        name="saveOption"
                                        checked={saveOption === 'overwrite'}
                                        onChange={() => setSaveOption('overwrite')}
                                        className="mt-0.5 text-purple-600"
                                      />
                                      <div className="flex-1">
                                        <span className="font-bold text-xs text-slate-900 block">既存フォーマットを上書き</span>
                                        <select
                                          value={overwriteTargetId}
                                          onChange={(e) => {
                                            setSaveOption('overwrite');
                                            setOverwriteTargetId(e.target.value);
                                          }}
                                          className="mt-1 w-full text-xs font-mono font-bold px-2 py-1 bg-white border border-slate-300 rounded"
                                        >
                                          <option value="JS-B">JS-B (推奨・写真充実型)</option>
                                          <option value="JS-A">JS-A (標準・図面特化型)</option>
                                          <option value="JS-C">JS-C (モダン・プレミアム型)</option>
                                          <option value="JS-D">JS-D (スタイリッシュ・表紙型)</option>
                                        </select>
                                      </div>
                                    </label>
                                  </div>
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 select-none">
                                  <input
                                    type="checkbox"
                                    checked={setAsDefaultAfterSave}
                                    onChange={(e) => setSetAsDefaultAfterSave(e.target.checked)}
                                    className="w-4 h-4 text-purple-600 rounded"
                                  />
                                  <span>このフォーマットを全社初期選択（デフォルト）に設定する</span>
                                </label>

                                <div className="pt-2 flex items-center justify-end gap-3">
                                  <button
                                    type="button"
                                    onClick={handleResetAnalysis}
                                    className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors"
                                  >
                                    破棄して再解析
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveAnalyzedFormat}
                                    disabled={isSaving}
                                    className="px-6 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:opacity-95 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    {isSaving ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>クラウド保存中...</span>
                                      </>
                                    ) : (
                                      <>
                                        <CheckCheck className="w-4 h-4" />
                                        <span>このフォーマットを登録・クラウドに保存</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 3: 会社基本情報・免許マスター */}
              {/* ============================================================ */}
              {activeTab === 'company' && (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        <span>会社概要・取引条件マスター</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        マイソク下部および提案書の会社帯に自動配置される基本情報です。
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          商号（会社名）
                        </label>
                        <input
                          type="text"
                          value={adminSettings.companyContact.company}
                          onChange={(e) => handleUpdateCompanyField('company', e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          取引態様
                        </label>
                        <input
                          type="text"
                          value={adminSettings.companyContact.transactionType}
                          onChange={(e) => handleUpdateCompanyField('transactionType', e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          所在地（本社・営業所）
                        </label>
                        <input
                          type="text"
                          value={adminSettings.companyContact.address}
                          onChange={(e) => handleUpdateCompanyField('address', e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          代表電話番号
                        </label>
                        <input
                          type="text"
                          value={adminSettings.companyContact.tel}
                          onChange={(e) => handleUpdateCompanyField('tel', e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          代表FAX番号
                        </label>
                        <input
                          type="text"
                          value={adminSettings.companyContact.fax}
                          onChange={(e) => handleUpdateCompanyField('fax', e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          代表・問合せメールアドレス
                        </label>
                        <input
                          type="email"
                          value={adminSettings.companyContact.infoEmail}
                          onChange={(e) => handleUpdateCompanyField('infoEmail', e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          ホームページURL
                        </label>
                        <input
                          type="url"
                          value={adminSettings.companyContact.url}
                          onChange={(e) => handleUpdateCompanyField('url', e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          宅地建物取引業者免許番号
                        </label>
                        <input
                          type="text"
                          value={adminSettings.companyContact.licenseNumber}
                          onChange={(e) => handleUpdateCompanyField('licenseNumber', e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl mt-2 flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-blue-800 leading-relaxed">
                            【免許番号の自動更新ロジック適用中】令和8年10月22日以降の資料作成時には、自動的に『東京都知事（3）第99830号』へ引き上げ表示されます。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={handleResetToDefaults}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>フォーマット・会社情報を初期値に戻す</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  閉じる
                </button>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveAllSettings}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>保存中...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>全設定を保存して適用</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Full Image Preview Modal */}
        {imagePreviewModalUrl && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-70 p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-600" />
                  <h4 className="text-sm font-bold text-slate-900 truncate">
                    {imagePreviewModalUrl.title}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setImagePreviewModalUrl(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreviewModalUrl.url}
                  alt={imagePreviewModalUrl.title}
                  className="max-h-[75vh] w-auto object-contain rounded shadow-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deletingStaff && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-60 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="text-center">
                <h4 className="text-sm font-bold text-slate-900">担当者を削除しますか？</h4>
                <p className="text-xs text-slate-600 mt-1">
                  「<span className="font-bold text-slate-800">{deletingStaff.name}</span>」をマスターから削除します。この操作は取り消せません。
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingStaff(null)}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleDeleteStaffConfirm}
                  className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
                >
                  削除する
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

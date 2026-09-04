"use client";

import { useState, useEffect } from "react";
import { AppState, defaultAppState, PropertyData, SavedMySoku } from "@/types";
import { FileUp, Sparkles, LayoutTemplate, Edit, Layout, FileType2, FileSearch, Download, LogIn, Loader2, LogOut, History, UserPlus, Settings } from "lucide-react";
import Step1Upload from "@/components/Step1Upload";
import Step2Extracting from "@/components/Step2Extracting";
import Step3Method from "@/components/Step3Method";
import Step4Edit from "@/components/Step4Edit";
import Step5Format from "@/components/Step5Format";
import Step6Design from "@/components/Step6Design";
import Step7Preview from "@/components/Step7Preview";
import Step8Output from "@/components/Step8Output";
import HistoryModal from "@/components/HistoryModal";
import StaffPresetModal from "@/components/StaffPresetModal";
import { auth, loginWithGoogle, logout } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

const steps = [
  { id: 1, title: "資料アップロード", icon: FileUp },
  { id: 2, title: "AI情報抽出", icon: Sparkles },
  { id: 3, title: "作成方法選択", icon: LayoutTemplate },
  { id: 4, title: "物件情報確認・編集", icon: Edit },
  { id: 5, title: "フォーマット・担当者", icon: Layout },
  { id: 6, title: "デザイン・会社情報", icon: FileType2 },
  { id: 7, title: "マイソクプレビュー", icon: FileSearch },
  { id: 8, title: "出力・完了", icon: Download },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [appState, setAppState] = useState<AppState>(defaultAppState);
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; dataUrl: string }[]>([]);

  // Modals
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleNext = () => setCurrentStep((s) => Math.min(s + 1, 8));
  const handlePrev = () => setCurrentStep((s) => Math.max(s - 1, 1));
  const goToStep = (step: number) => setCurrentStep(step);

  const handleLoadSavedMySoku = (item: SavedMySoku) => {
    setAppState({
      data: item.data,
      creationMethod: 'convert',
      format: item.format,
      extractedImages: item.data?.images?.classifiedList || [],
      additionalItems: item.additionalItems || [],
      coverImageSettings: item.data?.images?.coverImageSettings,
      jsContact: item.jsContact || defaultAppState.jsContact,
    });
    setCurrentStep(4); // Jump directly to edit / review step
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="bg-white p-12 rounded-xl shadow-lg text-center max-w-md w-full border border-slate-200">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center font-bold text-3xl text-white mx-auto mb-6 shadow-md">JS</div>
          <h1 className="text-2xl font-black text-slate-800 mb-2">JSマイソク作成AI</h1>
          <p className="text-slate-500 mb-8 font-medium">Googleアカウントでログインして利用を開始してください。</p>
          <button
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 text-slate-700 font-bold py-3 px-4 rounded shadow-sm hover:bg-slate-50 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-[#1E293B] font-sans overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-[#0F172A] text-white border-b border-slate-700 shadow-lg shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm">JS</div>
          <div>
            <h1 className="text-base font-bold tracking-tight flex items-center gap-2">
              JSマイソク作成AI <span className="text-[10px] bg-blue-500/30 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded font-mono">Professional Suite</span>
            </h1>
            <p className="text-[10px] text-slate-400">不動産マイソク自動生成・提案メール・PPTX出力システム</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <nav className="flex space-x-2 text-xs font-medium">
            <button
              onClick={() => setIsStaffModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-400" />
              <span>担当者マスター</span>
            </button>
            <button
              onClick={() => setIsHistoryModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <History className="w-3.5 h-3.5 text-green-400" />
              <span>保存履歴 (HSTRAGE)</span>
            </button>
          </nav>

          <div className="flex items-center space-x-3 border-l border-slate-700 pl-4">
            <div className="flex items-center space-x-2">
              {user.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full" />
              )}
              <span className="text-xs font-bold hidden sm:inline">{user.displayName || user.email}</span>
            </div>
            <button onClick={logout} className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors" title="ログアウト">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Steps Navigation */}
      <nav className="flex bg-white border-b border-slate-200 shrink-0 px-2 overflow-x-auto shadow-xs">
        <div className="flex flex-1 justify-around min-w-max">
          {steps.map((step) => {
            const isActive = currentStep === step.id;
            const isPast = currentStep > step.id;
            return (
              <button
                key={step.id}
                disabled={!isPast && !isActive}
                onClick={() => isPast && goToStep(step.id)}
                className={`py-2.5 px-1 border-b-2 flex flex-col items-center transition-colors w-32 ${
                  isActive
                    ? "border-blue-600 text-blue-600 font-bold"
                    : isPast
                    ? "border-transparent text-slate-700 hover:text-blue-500 cursor-pointer"
                    : "border-transparent text-slate-400 opacity-50 cursor-not-allowed"
                }`}
              >
                <span className="text-[9px] uppercase tracking-wider">{isActive ? 'Current' : `STEP ${step.id}`}</span>
                <span className="text-xs font-bold truncate max-w-[120px]">{step.title}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto relative bg-[#F8FAFC]">
          {currentStep === 1 && (
            <Step1Upload files={uploadedFiles} setFiles={setUploadedFiles} onNext={handleNext} />
          )}
          {currentStep === 2 && (
            <Step2Extracting files={uploadedFiles} appState={appState} setAppState={setAppState} onNext={handleNext} />
          )}
          {currentStep === 3 && (
            <Step3Method appState={appState} setAppState={setAppState} onNext={handleNext} onPrev={handlePrev} />
          )}
          {currentStep === 4 && (
            <Step4Edit appState={appState} setAppState={setAppState} onNext={handleNext} onPrev={handlePrev} uploadedFiles={uploadedFiles} />
          )}
          {currentStep === 5 && (
            <Step5Format appState={appState} setAppState={setAppState} onNext={handleNext} onPrev={handlePrev} />
          )}
          {currentStep === 6 && (
            <Step6Design appState={appState} setAppState={setAppState} onNext={handleNext} onPrev={handlePrev} />
          )}
          {currentStep === 7 && (
            <Step7Preview appState={appState} setAppState={setAppState} uploadedFiles={uploadedFiles} onNext={handleNext} onPrev={handlePrev} />
          )}
          {currentStep === 8 && (
            <Step8Output appState={appState} onPrev={handlePrev} onOpenHistory={() => setIsHistoryModalOpen(true)} />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="h-7 bg-slate-900 text-white flex items-center justify-between px-4 shrink-0 text-[10px]">
        <div className="flex items-center space-x-4">
          <span className="flex items-center text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5"></span>
            Cloud Storage & Database Sync Online
          </span>
          <span className="opacity-50">|</span>
          <span>宅建業免許番号更新ルール: 令和8年10月22日以降 (2)→(3) 自動適用</span>
        </div>
        <div>
          &copy; 株式会社j.square. All rights reserved.
        </div>
      </footer>

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onLoadMySoku={handleLoadSavedMySoku}
      />

      {/* Staff Preset Modal */}
      <StaffPresetModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
      />
    </div>
  );
}

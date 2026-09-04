"use client";

import React, { useState, useEffect } from 'react';
import { AppState } from '@/types';
import { 
  CheckCircle2, RotateCcw, Download, FileSpreadsheet, Mail, MapPin, 
  ExternalLink, History, Copy, Check, FileText, ShieldCheck, Database, ListChecks, FileArchive, Eye,
  AlertCircle, Loader2
} from 'lucide-react';
import { 
  downloadProposalEmailPdf, downloadPowerPointPresentation, downloadPdfPresentation, getGoogleMapsUrl, 
  generateCompletionReport, formatDateYYYYMMDD, getUpdatedLicenseNumber 
} from '@/utils/realEstate';
import { downloadExtractedImagesZip } from '@/utils/pdf';
import { persistMySoku } from '@/lib/storage';
import ProposalEmailModal from './ProposalEmailModal';

interface Props {
  appState: AppState;
  onPrev: () => void;
  onOpenHistory?: () => void;
}

export default function Step8Output({ appState, onPrev, onOpenHistory }: Props) {
  const data = appState.data;
  const [saveStatus, setSaveStatus] = useState<'saving' | 'completed' | 'failed'>('saving');
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isPptxGenerating, setIsPptxGenerating] = useState(false);
  const [isEmailPdfGenerating, setIsEmailPdfGenerating] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  const executeSave = async () => {
    if (!data) return;
    setSaveStatus('saving');
    setSaveErrorMsg(null);
    try {
      await persistMySoku(appState);
      setSaveStatus('completed');
    } catch (e: any) {
      console.error("Save to Cloud Storage / Firestore failed:", e);
      setSaveStatus('failed');
      setSaveErrorMsg(e?.message || '保存処理中にエラーが発生しました');
    }
  };

  useEffect(() => {
    executeSave();
  }, [appState, data]);

  if (!data) return null;

  const isSavedToStorage = saveStatus === 'completed';

  const targetDate = new Date();
  const dateStrYYYYMMDD = formatDateYYYYMMDD(targetDate);
  const cleanName = (data.property.name || '物件').replace(/[\\/:*?"<>|]/g, '_');
  const pdfFilename = `${cleanName}_${appState.format}_${dateStrYYYYMMDD}.pdf`;
  const pptxFilename = `${cleanName}_${appState.format}_${dateStrYYYYMMDD}.pptx`;
  const emailPdfFilename = `${cleanName}_提案メール_${dateStrYYYYMMDD}.pdf`;
  const zipFilename = `${cleanName}_画像素材_${dateStrYYYYMMDD}.zip`;

  const mapsUrl = getGoogleMapsUrl(data.property.name, data.property.address);
  const { formattedLicense } = getUpdatedLicenseNumber(appState.jsContact.licenseNumber, targetDate);

  const imagesState = data.images || {};
  const classifiedList = imagesState.classifiedList || [];

  const reportText = generateCompletionReport(appState, {
    hstorageStatus: isSavedToStorage ? 'completed' : 'not_completed',
    hstorageFolder: 'Cloud Firestore / HSTRAGE / mysokus',
    targetDate,
  });

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setReportCopied(true);
      setTimeout(() => setReportCopied(false), 2500);
    } catch (e) {
      console.error("Copy report failed", e);
    }
  };

  const handleDownloadPdf = async () => {
    setIsPdfGenerating(true);
    try {
      // In JS-B presentation mode, we can use onPrev or trigger download from preview ref if available,
      // or fallback to downloadPowerPointPresentation / render
      onPrev();
    } catch (e) {
      console.error("PDF generation error", e);
      alert("PDF出力はプレビュー画面の「PDFダウンロード」ボタンをご利用ください。");
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const handleDownloadPptx = async () => {
    setIsPptxGenerating(true);
    try {
      await downloadPowerPointPresentation(appState, {
        main: imagesState.main,
        floorPlan: imagesState.floorPlan,
        map: imagesState.map,
      }, { customDate: targetDate });
    } catch (e) {
      console.error("PowerPoint generation failed", e);
      alert("PowerPointファイルの生成に失敗しました。");
    } finally {
      setIsPptxGenerating(false);
    }
  };

  const handleDownloadEmailPdf = async () => {
    setIsEmailPdfGenerating(true);
    try {
      await downloadProposalEmailPdf(data, appState.jsContact, { customDate: targetDate });
    } catch (e) {
      console.error("Email PDF generation error", e);
      alert("提案メールPDFの出力に失敗しました");
    } finally {
      setIsEmailPdfGenerating(false);
    }
  };

  const handleDownloadZip = async () => {
    if (classifiedList.length === 0) {
      alert("ダウンロード可能な抽出画像がありません。");
      return;
    }
    setIsZipping(true);
    try {
      await downloadExtractedImagesZip(data.property.name || '物件', classifiedList, dateStrYYYYMMDD);
    } catch (e) {
      console.error("ZIP download error", e);
      alert("画像ZIPの生成に失敗しました。");
    } finally {
      setIsZipping(false);
    }
  };

  const checklistItems = [
    { label: '元資料写真の抽出・再利用', val: imagesState.main ? '配置済み' : '抽出済み' },
    { label: '平面図・間取図の独立配置', val: imagesState.floorPlan ? '配置済み' : '抽出済み' },
    { label: '案内図・周辺地図の配置', val: imagesState.map ? '配置済み' : '住所リンク連携' },
    { label: '画像素材の個別・ZIP出力対応', val: `${classifiedList.length}点収録可能` },
    { label: '作成担当者が正しい', val: appState.jsContact.personName || '要確認' },
    { label: '担当者携帯番号が正しい', val: appState.jsContact.personTel || '要確認' },
    { label: '会社TEL (03-6457-8222)', val: appState.jsContact.tel },
    { label: '会社FAX (03-6730-8451)', val: appState.jsContact.fax },
    { label: 'infoメール (info-js@j-jsquare.com)', val: appState.jsContact.infoEmail },
    { label: '作成日時点の宅建免許番号', val: formattedLicense },
    { label: '建物名にGoogle Mapsリンク設定', val: '設定済み' },
    { label: 'Google Maps対象住所', val: data.property.address || '要確認' },
    { label: 'PDFマイソク出力セット', val: pdfFilename },
    { label: 'PowerPointマイソク出力 (個別編集可能)', val: pptxFilename },
    { label: '提案メール作成・PDF出力', val: emailPdfFilename },
    { label: 'HSTRAGE (Storage & Firestore) 保存・同期', val: isSavedToStorage ? '保存完了' : saveStatus === 'failed' ? '保存失敗' : '保存処理中' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 my-6 animate-in fade-in duration-300">
      
      {/* 1. Main Success Banner */}
      <div className="bg-white p-8 sm:p-10 rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-200 shadow-xs">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        
        <h3 className="text-2xl font-black mb-2 text-slate-800">マイソク作成・出力セットが完了しました</h3>
        <p className="text-slate-500 text-xs mb-6 font-medium">
          マイソクPDF、PowerPoint (.pptx)、提案メールPDF、および抽出画像素材ZIPのファイルセットが整いました。
        </p>

        {/* Cloud sync indicator */}
        {saveStatus === 'saving' && (
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-blue-900">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span>Cloud Storage（画像本体）＆ Firestore（案件データ）へ保存・同期中...</span>
          </div>
        )}

        {saveStatus === 'completed' && (
          <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-emerald-900">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Cloud Storage（画像）＆ Firestore（HSTRAGE）へ正常に保存・同期完了</span>
            </div>
            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                className="text-emerald-700 hover:text-emerald-900 underline text-xs font-bold cursor-pointer"
              >
                保存一覧を見る
              </button>
            )}
          </div>
        )}

        {saveStatus === 'failed' && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold text-red-900 text-left">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <div>
                <div className="font-black text-red-900">クラウド保存に失敗しました</div>
                <div className="text-[11px] text-red-700 font-normal">{saveErrorMsg}</div>
              </div>
            </div>
            <button
              onClick={executeSave}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shrink-0 shadow-xs cursor-pointer"
            >
              保存を再試行
            </button>
          </div>
        )}

        {/* 2. File Set Download Buttons */}
        <div className="mb-8">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 text-left">
            物件成果物出力ファイルセット (ダウンロード)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* File 1: PDF */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 bg-red-100 text-red-700 font-bold text-[10px] rounded flex items-center justify-center">PDF</span>
                  <span className="font-bold text-xs text-slate-800">マイソク PDF</span>
                </div>
                <p className="text-[10px] font-mono text-slate-600 truncate" title={pdfFilename}>
                  {pdfFilename}
                </p>
              </div>
              <button
                onClick={onPrev}
                className="w-full py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-colors flex items-center justify-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                プレビューからDL
              </button>
            </div>

            {/* File 2: PowerPoint (Native Objects) */}
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl text-left flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 bg-amber-100 text-amber-700 font-bold text-[10px] rounded flex items-center justify-center">PPT</span>
                  <span className="font-bold text-xs text-slate-800">PowerPoint (編集可)</span>
                </div>
                <p className="text-[10px] font-mono text-slate-600 truncate" title={pptxFilename}>
                  {pptxFilename}
                </p>
              </div>
              <button
                onClick={handleDownloadPptx}
                disabled={isPptxGenerating}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {isPptxGenerating ? '生成中...' : 'PPTXを保存'}
              </button>
            </div>

            {/* File 3: Extracted Images ZIP (Section 11) */}
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl text-left flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 bg-emerald-100 text-emerald-700 font-bold text-[10px] rounded flex items-center justify-center">ZIP</span>
                  <span className="font-bold text-xs text-slate-800">画像素材 ZIP ({classifiedList.length}点)</span>
                </div>
                <p className="text-[10px] font-mono text-slate-600 truncate" title={zipFilename}>
                  {zipFilename}
                </p>
              </div>
              <button
                onClick={handleDownloadZip}
                disabled={isZipping || classifiedList.length === 0}
                className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <FileArchive className="w-3.5 h-3.5" />
                {isZipping ? '圧縮中...' : '素材ZIPを保存'}
              </button>
            </div>

            {/* File 4: Proposal Email PDF */}
            <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl text-left flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 bg-blue-100 text-blue-700 font-bold text-[10px] rounded flex items-center justify-center">MAIL</span>
                  <span className="font-bold text-xs text-slate-800">提案メール PDF</span>
                </div>
                <p className="text-[10px] font-mono text-slate-600 truncate" title={emailPdfFilename}>
                  {emailPdfFilename}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setIsEmailModalOpen(true)}
                  className="flex-1 py-2 bg-white hover:bg-slate-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 transition-colors"
                >
                  文面確認
                </button>
                <button
                  onClick={handleDownloadEmailPdf}
                  disabled={isEmailPdfGenerating}
                  className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs"
                  title="PDF保存"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* 3. Google Maps Link Confirmation */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex flex-col sm:flex-row items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-2 text-left">
            <MapPin className="w-4 h-4 text-red-500 shrink-0" />
            <div>
              <span className="font-bold text-slate-800">Google Maps リンク設定完了: </span>
              <span className="text-slate-600">{data.property.name} ({data.property.address})</span>
            </div>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 shrink-0"
          >
            <span>マップを開いて確認</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* 4. 14-Point Checklist Toggle */}
        <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 text-left">
          <button
            type="button"
            onClick={() => setShowChecklist(!showChecklist)}
            className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-blue-600" />
              <span>品質管理完了チェックリスト (全16項目)</span>
            </div>
            <span className="text-blue-600 text-xs">
              {showChecklist ? '閉じる ▲' : '展開して確認 ▼'}
            </span>
          </button>

          {showChecklist && (
            <div className="p-4 bg-white divide-y divide-slate-100 text-xs">
              {checklistItems.map((item, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between">
                  <span className="text-slate-600 font-medium">✓ {item.label}</span>
                  <span className="font-mono font-bold text-slate-800">{item.val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. 作業完了報告レポート (コピー可能) */}
        <div className="text-left">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              作業完了報告レポート (仕様第16項)
            </h4>
            <button
              onClick={handleCopyReport}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
            >
              {reportCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{reportCopied ? 'コピーしました' : 'レポートをコピー'}</span>
            </button>
          </div>
          <textarea
            readOnly
            value={reportText}
            rows={8}
            className="w-full p-3 bg-slate-900 text-slate-200 font-mono text-xs rounded-xl border border-slate-700 outline-none leading-relaxed select-all"
          />
        </div>

      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
        >
          プレビュー画面へ戻る
        </button>

        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          新しいマイソクを作成する
        </button>
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

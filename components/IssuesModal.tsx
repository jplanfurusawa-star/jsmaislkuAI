"use client";

import React, { useState } from 'react';
import { X, Download, AlertTriangle, FileText, CheckCircle2, Copy, Check } from 'lucide-react';

interface IssuesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function IssuesModal({ isOpen, onClose }: IssuesModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    window.location.href = '/api/issues';
  };

  const handleOpenRaw = () => {
    window.open('/api/issues-view', '_blank');
  };

  const issuesList = [
    {
      category: "TypeScript 型エラー",
      count: 11,
      items: [
        { file: "app/api/analyze-format/route.ts", code: "TS2344", desc: "Route Handler規約違反: PRIMARY_MODEL が export されているため型エラー" },
        { file: "app/api/extract/route.ts", code: "TS2344", desc: "Route Handler規約違反: PRIMARY_MODEL が export されているため型エラー" },
        { file: "components/AdminDashboardModal.tsx:301", code: "TS2353", desc: "管理者オブジェクトのプロパティ不一致 (email ではなく googleEmail)" },
        { file: "components/AdminDashboardModal.tsx:1797", code: "TS2339", desc: "FormatLayoutStructure に floorPlanWidthRatio が存在しない" },
        { file: "components/AdminDashboardModal.tsx:1823", code: "TS2551", desc: "FormatLayoutStructure の photoSlotCount タイポ (正: photoCount)" },
        { file: "components/JsBTemplate.tsx:1422", code: "TS2304", desc: "ImageIcon コンポーネントがインポートされていない" },
        { file: "components/Step7Preview.tsx:322", code: "TS2353", desc: "downloadPowerPointPresentation の引数に subPhotos が定義されていない" },
        { file: "lib/storage.ts:870", code: "TS2322", desc: "SavedMySoku.format への代入時の型キャスト不足 ('JS-A'|'JS-B'|'JS-C'|'JS-D')" },
        { file: "utils/pdf.ts:870", code: "TS2769", desc: "new ImageData におけるバッファの型不一致 (Uint8ClampedArray)" },
        { file: "utils/pdf.ts:1490", code: "TS2552", desc: "JSZip がインポートされていない" },
        { file: "utils/realEstate.ts:1393", code: "TS2353", desc: "html2canvas の非推奨オプション letterRendering: false" }
      ]
    },
    {
      category: "ESLint パーサー環境エラー",
      count: 31,
      desc: "ESLint CLI が TypeScriptパーサーを経由せず標準JavaScriptパーサーで評価したことによる構文指摘（型アノテーション、interface定義など）",
      items: [
        { file: "app/api/analyze-format/route.ts", code: "Parsing", desc: "Unexpected token : (型アノテーション)" },
        { file: "app/api/extract/route.ts", code: "Parsing", desc: "Unexpected token < (ジェネリクス)" },
        { file: "app/api/map/route.ts", code: "Parsing", desc: "Unexpected token : (型アノテーション)" },
        { file: "components/AdminDashboardModal.tsx", code: "Parsing", desc: "The keyword 'interface' is reserved" },
        { file: "components/HistoryModal.tsx", code: "Parsing", desc: "The keyword 'interface' is reserved" },
        { file: "components/Step1Upload.tsx 〜 Step8Output.tsx", code: "Parsing", desc: "各コンポーネントの interface 予約語エラー (計14ファイル)" },
        { file: "utils/pdf.ts, utils/realEstate.ts, lib/storage.ts 等", code: "Parsing", desc: "TypeScript 型構文のパースエラー (計10ファイル)" }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                静的解析・型エラー一覧レポート (Issues まとめ)
                <span className="text-xs bg-red-500/30 text-red-200 px-2 py-0.5 rounded-full font-mono">
                  全問題集約
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                プロジェクト内で検出されたすべてのエラー・指摘事項を画面上で閲覧および直接ダウンロードできます
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-600 font-medium">
            全指摘まとめファイル: <code className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">ALL_ISSUES_REPORT.md</code>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenRaw}
              className="px-3 py-1.5 text-xs font-bold bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              別タブで全文表示
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Markdownファイルとしてダウンロード
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700">
          
          {issuesList.map((sec, idx) => (
            <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  {sec.category} ({sec.count}件)
                </span>
                {sec.desc && <span className="text-[11px] text-slate-500">{sec.desc}</span>}
              </div>
              <div className="divide-y divide-slate-100">
                {sec.items.map((item, i) => (
                  <div key={i} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start sm:items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-mono text-[10px] font-bold shrink-0">
                        {item.code}
                      </span>
                      <code className="text-slate-800 font-semibold font-mono text-[11px]">
                        {item.file}
                      </code>
                    </div>
                    <span className="text-slate-600 text-[11px] sm:text-right">
                      {item.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-1">ワンクリックでダウンロードまたはコピー可能</p>
              <p className="text-emerald-800 leading-relaxed">
                上の「Markdownファイルとしてダウンロード」ボタンを押すと、お使いのPCへ直接ファイル保存されます。また、AIエージェントに「これらのエラーを修正してください」と指示いただければ、全件の自動修復も即座に実行可能です。
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs hover:bg-slate-50 transition-colors"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from 'react';
import { PropertyData, AppState } from '@/types';
import { generateProposalEmail, downloadProposalEmailPdf, getGoogleMapsUrl } from '@/utils/realEstate';
import { X, Copy, Check, Download, Mail, Sparkles, MapPin } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  appState: AppState;
}

export default function ProposalEmailModal({ isOpen, onClose, appState }: Props) {
  const data = appState.data;
  const [emailText, setEmailText] = useState('');
  const [copied, setCopied] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  useEffect(() => {
    if (isOpen && data) {
      const generated = generateProposalEmail(data, appState.jsContact);
      setEmailText(generated);
      setCopied(false);
    }
  }, [isOpen, data, appState.jsContact]);

  if (!isOpen || !data) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(emailText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  const handleDownloadPdf = async () => {
    setIsPdfGenerating(true);
    try {
      await downloadProposalEmailPdf(data, appState.jsContact);
    } catch (err) {
      console.error("PDF generation error", err);
      alert("PDFの生成に失敗しました");
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const mapsUrl = getGoogleMapsUrl(data.property.name, data.property.address);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-[#0F172A] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                お客様提案メール作成
                <span className="text-[10px] bg-blue-500/30 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded-full font-mono">
                  自動生成
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                マイソク抽出項目を反映した貴社限り提案フォーマットです。
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-3 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-blue-900 font-medium">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                物件名・GoogleマップURL・賃料・面積・引渡条件などを自動反映済みです。
              </span>
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 bg-white px-2 py-1 rounded shadow-xs border border-blue-200 shrink-0"
            >
              <MapPin className="w-3 h-3 text-red-500" />
              マップ確認
            </a>
          </div>

          <div className="relative">
            <textarea
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              rows={16}
              className="w-full p-4 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs leading-relaxed text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-inner resize-y"
              placeholder="提案メール文面..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500">
            ※ 内容を直接編集してからコピーまたはPDF出力できます
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-xs ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-800 text-white hover:bg-slate-900'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'コピー完了！' : '文面をコピー'}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isPdfGenerating}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Download className="w-4 h-4" />
              {isPdfGenerating ? 'PDF出力中...' : '提案書PDFを出力'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

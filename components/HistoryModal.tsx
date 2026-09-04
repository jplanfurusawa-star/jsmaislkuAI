"use client";

import React, { useState, useEffect } from 'react';
import { SavedMySoku, SavedMySokuSummary, AppState } from '@/types';
import { fetchAllMySokus, deleteLocalMySoku, fetchMySokuById, migrateLegacyLocalStorageData } from '@/lib/storage';
import { downloadProposalEmailPdf, downloadPowerPointPresentation, getGoogleMapsUrl } from '@/utils/realEstate';
import { X, History, Trash2, Download, FileText, Calendar, User, Building, MapPin, Loader2, CloudCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLoadMySoku: (item: SavedMySoku) => void;
}

export default function HistoryModal({ isOpen, onClose, onLoadMySoku }: Props) {
  const [items, setItems] = useState<SavedMySokuSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // Safely migrate any legacy localStorage items
      await migrateLegacyLocalStorageData();
      const summaries = await fetchAllMySokus();
      setItems(summaries);
    } catch (e) {
      console.error("Failed to load history summaries:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = async (id: string) => {
    if (confirm('このマイソク履歴を削除しますか？')) {
      await deleteLocalMySoku(id);
      setItems(prev => prev.filter(x => x.id !== id));
    }
  };

  const handleOpenEdit = async (item: SavedMySokuSummary) => {
    setActionLoadingId(item.id);
    try {
      const full = await fetchMySokuById(item.id);
      if (!full) {
        alert('案件詳細データをクラウドから取得できませんでした。');
        return;
      }
      onLoadMySoku(full);
      onClose();
    } catch (err) {
      console.error("Error opening mysoku:", err);
      alert('案件の読み込み中にエラーが発生しました。');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDownloadEmailPdf = async (item: SavedMySokuSummary) => {
    setActionLoadingId(item.id);
    try {
      const full = await fetchMySokuById(item.id);
      if (!full) {
        alert('案件詳細データをクラウドから取得できませんでした。');
        return;
      }
      await downloadProposalEmailPdf(full.data, full.jsContact);
    } catch (e) {
      console.error(e);
      alert('提案メールPDFの出力に失敗しました');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDownloadPptx = async (item: SavedMySokuSummary) => {
    setActionLoadingId(item.id);
    try {
      const full = await fetchMySokuById(item.id);
      if (!full) {
        alert('案件詳細データをクラウドから取得できませんでした。');
        return;
      }
      const pseudoAppState: AppState = {
        data: full.data,
        creationMethod: 'convert',
        format: full.format,
        additionalItems: full.additionalItems || [],
        jsContact: full.jsContact,
      };
      await downloadPowerPointPresentation(pseudoAppState);
    } catch (e) {
      console.error(e);
      alert('PowerPointの出力に失敗しました');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-[#0F172A] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                作成済みマイソク履歴・保存一覧
                <span className="text-[10px] bg-green-500/20 text-green-300 border border-green-400/30 px-2 py-0.5 rounded-full font-mono">
                  Cloud Storage & Firestore Sync
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                作成したマイソクデータの確認・再編集・PDF/PPTX再出力・提案メール発行を行えます。
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List Content */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
          {loading ? (
            <div className="p-12 text-center text-slate-500 font-bold flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span>履歴一覧を読み込み中...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <History className="w-10 h-10 mx-auto opacity-30" />
              <p className="font-bold text-sm text-slate-600">保存されたマイソクはありません</p>
              <p className="text-xs text-slate-400">マイソクを完成・出力すると自動的にCloud Storage / Firestoreへ保存されます。</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((item) => {
                const mapsUrl = getGoogleMapsUrl(item.propertyName, item.address);
                const dateStr = new Date(item.createdAt).toLocaleString('ja-JP', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isItemActionLoading = actionLoadingId === item.id;

                return (
                  <div
                    key={item.id}
                    className="p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                          {item.format}
                        </span>
                        <h4 className="font-bold text-base text-slate-900">
                          {item.propertyName} {item.room ? `${item.room}号室` : ''}
                        </h4>
                        {item.status === 'completed' ? (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                            クラウド保存済
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                            未完了
                          </span>
                        )}
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200"
                        >
                          <MapPin className="w-2.5 h-2.5 text-red-500" />
                          Map
                        </a>
                      </div>

                      <p className="text-xs text-slate-600 flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        {item.address || '所在地未設定'}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span className="font-bold text-slate-900">
                          賃料: {item.rentAmount ? `${item.rentAmount.toLocaleString()}円/月` : '未設定'}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          担当: {item.staffName || '営業担当'}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                          <Calendar className="w-3 h-3" />
                          {dateStr}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        disabled={isItemActionLoading}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        {isItemActionLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileText className="w-3.5 h-3.5" />
                        )}
                        編集画面で開く
                      </button>
                      <button
                        onClick={() => handleDownloadEmailPdf(item)}
                        disabled={isItemActionLoading}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1 border border-slate-200 cursor-pointer"
                        title="提案メールPDFを出力"
                      >
                        提案PDF
                      </button>
                      <button
                        onClick={() => handleDownloadPptx(item)}
                        disabled={isItemActionLoading}
                        className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 text-orange-700 text-xs font-bold rounded-lg flex items-center gap-1 border border-orange-200 cursor-pointer"
                        title="PowerPointを出力"
                      >
                        PPTX
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isItemActionLoading}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                        title="履歴を削除"
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

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
}

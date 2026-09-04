"use client";

import React, { useState, useEffect } from 'react';
import { StaffPreset } from '@/types';
import { getStaffPresets, addStaffPreset, updateStaffPreset, deleteStaffPreset } from '@/lib/storage';
import { X, Plus, Trash2, Edit2, Check, UserPlus, Phone, Mail, Building } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectStaff?: (staff: StaffPreset) => void;
}

export default function StaffPresetModal({ isOpen, onClose, onSelectStaff }: Props) {
  const [presets, setPresets] = useState<StaffPreset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('営業担当');

  useEffect(() => {
    if (isOpen) {
      setPresets(getStaffPresets());
      setIsAddingNew(false);
      setEditingId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setName('');
    setTel('');
    setEmail('');
    setRole('営業担当');
    setIsAddingNew(true);
    setEditingId(null);
  };

  const handleStartEdit = (p: StaffPreset) => {
    setName(p.name);
    setTel(p.tel);
    setEmail(p.email);
    setRole(p.role || '営業担当');
    setEditingId(p.id);
    setIsAddingNew(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isAddingNew) {
      const updated = addStaffPreset({ name, tel, email, role });
      setPresets(updated);
      setIsAddingNew(false);
    } else if (editingId) {
      const updated = updateStaffPreset({ id: editingId, name, tel, email, role });
      setPresets(updated);
      setEditingId(null);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('この担当者情報を削除しますか？')) {
      const updated = deleteStaffPreset(id);
      setPresets(updated);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-[#0F172A] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base">担当者・連絡先マスター管理</h3>
              <p className="text-xs text-slate-400">作成者や営業担当の連絡先を登録し、ワンクリックで反映できます</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          
          {/* Add / Edit Form */}
          {(isAddingNew || editingId) && (
            <form onSubmit={handleSave} className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl space-y-3">
              <h4 className="font-bold text-sm text-blue-900 flex items-center gap-1.5">
                {isAddingNew ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                {isAddingNew ? '新規担当者を登録' : '担当者情報の編集'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">氏名 *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: 山田 太郎"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">役職・部署</label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="例: 営業一部 / チーフ"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">担当携帯番号 *</label>
                  <input
                    type="tel"
                    required
                    value={tel}
                    onChange={(e) => setTel(e.target.value)}
                    placeholder="例: 090-1234-5678"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">担当メールアドレス</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="例: yamada@jsquare.co.jp"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsAddingNew(false); setEditingId(null); }}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow hover:bg-blue-700 flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> 保存する
                </button>
              </div>
            </form>
          )}

          {/* List of Registered Staff */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">登録済み担当者 ({presets.length})</span>
              {!isAddingNew && !editingId && (
                <button
                  onClick={handleStartAdd}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200"
                >
                  <Plus className="w-3.5 h-3.5" /> 担当者を追加
                </button>
              )}
            </div>

            {presets.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
                担当者がまだ登録されていません。「担当者を追加」から登録してください。
              </div>
            ) : (
              <div className="grid gap-2">
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between hover:border-blue-300 hover:shadow-xs transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{p.name}</span>
                        {p.role && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                            {p.role}
                          </span>
                        )}
                      </div>
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
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onSelectStaff && (
                        <button
                          onClick={() => {
                            onSelectStaff(p);
                            onClose();
                          }}
                          className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 shadow-xs"
                        >
                          この担当者を選択
                        </button>
                      )}
                      <button
                        onClick={() => handleStartEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="編集"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
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

import React from 'react';
import { AppState } from '@/types';
import { FilePlus2, RefreshCw } from 'lucide-react';

interface Props {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onNext: () => void;
  onPrev: () => void;
}

export default function Step3Method({ appState, setAppState, onNext, onPrev }: Props) {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-xl font-bold mb-6 text-center text-slate-800">作成方法を選択してください</h3>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Zero base */}
          <button
            onClick={() => setAppState(prev => ({ ...prev, creationMethod: 'zero' }))}
            className={`p-6 rounded-xl border-2 text-left transition-all ${
              appState.creationMethod === 'zero'
                ? 'border-blue-600 bg-blue-50 ring-4 ring-blue-600/10'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 rounded-lg ${appState.creationMethod === 'zero' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                <FilePlus2 className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-slate-800">ゼロベースで作成</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              抽出したテキスト情報や写真を使用して、新しいマイソクをJSフォーマットで一から作成します。
            </p>
          </button>

          {/* Convert */}
          <button
            onClick={() => setAppState(prev => ({ ...prev, creationMethod: 'convert' }))}
            className={`p-6 rounded-xl border-2 text-left transition-all ${
              appState.creationMethod === 'convert'
                ? 'border-blue-600 bg-blue-50 ring-4 ring-blue-600/10'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 rounded-lg ${appState.creationMethod === 'convert' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                <RefreshCw className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-slate-800">既存マイソクを変換</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              アップロードされた既存マイソクの情報・写真・図面を使用し、既存デザインをコピーせずJS指定フォーマットに再構成します。
            </p>
          </button>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded shadow-sm hover:bg-slate-50 transition-colors"
        >
          戻る
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700 transition-colors"
        >
          次へ: 物件情報確認・編集
        </button>
      </div>
    </div>
  );
}

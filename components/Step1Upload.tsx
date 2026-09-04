import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, X, FileImage, FileText } from 'lucide-react';

interface Props {
  files: { file: File; dataUrl: string }[];
  setFiles: React.Dispatch<React.SetStateAction<{ file: File; dataUrl: string }[]>>;
  onNext: () => void;
}

export default function Step1Upload({ files, setFiles, onNext }: Props) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setFiles((prev) => [...prev, { file, dataUrl: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    });
  }, [setFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf']
    }
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-2">物件資料をアップロードしてください</h3>
        <p className="text-slate-500 text-sm mb-6">
          募集図面PDF、既存マイソクPDF、物件写真、平面図、案内図、別紙条件表などをまとめてアップロードできます。
        </p>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <input {...getInputProps()} />
          <UploadCloud className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-700 font-bold">ドラッグ＆ドロップ、またはクリックしてファイルを選択</p>
          <p className="text-slate-500 text-sm mt-2">対応形式: PDF, JPG, PNG, WEBP</p>
        </div>

        {files.length > 0 && (
          <div className="mt-8 space-y-3">
            <h4 className="text-sm font-bold text-slate-700">アップロードされたファイル ({files.length})</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {files.map((f, i) => (
                <div key={i} className="relative group rounded-lg border border-slate-200 overflow-hidden bg-slate-50 p-3 flex flex-col items-center justify-center aspect-square">
                  {f.file.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.dataUrl} alt={f.file.name} className="max-h-full max-w-full object-contain mb-2" />
                  ) : (
                    <FileText className="w-10 h-10 text-slate-400 mb-2" />
                  )}
                  <p className="text-xs text-slate-600 truncate w-full text-center font-medium">{f.file.name}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={files.length === 0}
          className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          次へ: AI情報抽出
        </button>
      </div>
    </div>
  );
}

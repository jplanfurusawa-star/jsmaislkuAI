'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-xl font-bold text-slate-800 mb-2">エラーが発生しました</h2>
      <p className="text-slate-500 mb-6 text-sm">処理の実行中に問題が発生しました。</p>
      <button
        onClick={() => reset()}
        className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        もう一度試す
      </button>
    </div>
  );
}

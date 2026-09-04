import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">ページが見つかりませんでした</h2>
      <p className="text-slate-500 mb-6">お探しのページは移動または削除された可能性があります。</p>
      <Link
        href="/"
        className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors"
      >
        トップに戻る
      </Link>
    </div>
  );
}

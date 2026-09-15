import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'JSマイソク作成AI',
  description: '事業用不動産の募集図面・マイソクをアップロードし、GeminiのAI画像解析を利用して物件情報を抽出。自動検算、デザインプレビュー、PDF出力を一気通貫で行う作成業務支援アプリです。',
  openGraph: {
    title: 'JSマイソク作成AI',
    description: '事業用不動産の募集図面・マイソクをアップロードし、GeminiのAI画像解析を利用して物件情報を抽出。自動検算、デザインプレビュー、PDF出力を一気通貫で行う作成業務支援アプリです。',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JSマイソク作成AI',
    description: '事業用不動産の募集図面・マイソクをアップロードし、GeminiのAI画像解析を利用して物件情報を抽出。自動検算、デザインプレビュー、PDF出力を一気通貫で行う作成業務支援アプリです。',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="ja">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

# 検証・静的解析エラー・指摘一覧（全まとめ）

このファイルは、プロジェクト内の静的解析（TypeScriptコンパイラ、ESLint、ビルド時型検証）で検出されているすべての問題点（Issues / Errors）を1つに集約・整理したものです。

---

## 1. TypeScript型チェックエラー (11件)
`npx tsc --noEmit` で検出される型エラーの詳細です。

### Issue 1: App Router APIルートでの余剰エクスポート (analyze-format)
- **ファイル**: `app/api/analyze-format/route.ts`
- **エラーコード**: `TS2344`
- **詳細**: Next.js App RouterのRoute Handler規約では、HTTPメソッド名（GET, POSTなど）以外の定数を `export` すると型エラーになります。`PRIMARY_MODEL` が export されているため、制約 `{ [x: string]: never; }` に違反しています。
- **対処案**: `export const PRIMARY_MODEL` を `const PRIMARY_MODEL` に変更（または別ファイルへ移動）。

### Issue 2: App Router APIルートでの余剰エクスポート (extract)
- **ファイル**: `app/api/extract/route.ts`
- **エラーコード**: `TS2344`
- **詳細**: 上記と同様に、`export const PRIMARY_MODEL` が Route Handler の許可エクスポート外のためエラー。
- **対処案**: `export` を外してモジュール内スコープにする。

### Issue 3: 管理者ユーザー登録のプロパティ不一致
- **ファイル**: `components/AdminDashboardModal.tsx:301`
- **エラーコード**: `TS2353`
- **詳細**: `{ googleEmail: string, ... }` の型に対して `email: currentUser.email || ''` を指定しているため、プロパティ名不一致。
- **対処案**: `googleEmail: currentUser.email || ''` に修正。

### Issue 4: フォーマット解析レイアウト定義の未定義プロパティ (floorPlanWidthRatio)
- **ファイル**: `components/AdminDashboardModal.tsx:1797`
- **エラーコード**: `TS2339`
- **詳細**: `FormatLayoutStructure` 型に `floorPlanWidthRatio` が存在しない。
- **対処案**: `types.ts` の `FormatLayoutStructure` に `floorPlanWidthRatio?: number;` を追加するか、該当プロパティ参照を見直し。

### Issue 5: 写真枠数のプロパティ名タイポ (photoSlotCount)
- **ファイル**: `components/AdminDashboardModal.tsx:1823`
- **エラーコード**: `TS2551`
- **詳細**: `FormatLayoutStructure` には `photoSlotCount` はなく `photoCount` が定義されています。
- **対処案**: `photoCount` に名称統一。

### Issue 6: 未インポートのアイコンコンポーネント
- **ファイル**: `components/JsBTemplate.tsx:1422`
- **エラーコード**: `TS2304`
- **詳細**: `<ImageIcon ... />` を使用していますが、`lucide-react` からの `ImageIcon`（または `Image as ImageIcon`）がインポートされていません。
- **対処案**: `import { Image as ImageIcon } from 'lucide-react';` を追加。

### Issue 7: PowerPoint出力関数の引数型不一致 (subPhotos)
- **ファイル**: `components/Step7Preview.tsx:322`
- **エラーコード**: `TS2353`
- **詳細**: `downloadPowerPointPresentation` の第2引数オブジェクト型に `subPhotos` が定義されていません（定義されているのは `main`, `floorPlan`, `map`, `detailMap`）。
- **対処案**: `utils/realEstate.ts` の型定義に `subPhotos?: string[];` を追加。

### Issue 8: マイソク保存時のフォーマット型チェック
- **ファイル**: `lib/storage.ts:870`
- **エラーコード**: `TS2322`
- **詳細**: `appState.format`（型: `string`）を `SavedMySoku.format`（型: `'JS-A' | 'JS-B' | 'JS-C' | 'JS-D'`）へ代入する際の型キャスト不足。
- **対処案**: `format: (appState.format as 'JS-A' | 'JS-B' | 'JS-C' | 'JS-D') || 'JS-A'` で安全にキャスト。

### Issue 9: ImageData生成時のバッファ型不整合
- **ファイル**: `utils/pdf.ts:870`
- **エラーコード**: `TS2769`
- **詳細**: `new ImageData(rgba, width, height)` において、`Uint8ClampedArray<ArrayBufferLike>` のバッファ型が Node/ブラウザ環境定義で `SharedArrayBuffer` 許容と衝突。
- **対処案**: `new ImageData(new Uint8ClampedArray(rgba.buffer), width, height)` とする。

### Issue 10: JSZipの参照エラー
- **ファイル**: `utils/pdf.ts:1490`
- **エラーコード**: `TS2552`
- **詳細**: `new JSZip()` を呼び出していますが、ファイル先頭で `import JSZip from 'jszip';` が未宣言。
- **対処案**: `import JSZip from 'jszip';` を追加。

### Issue 11: html2canvas オプションの非推奨プロパティ
- **ファイル**: `utils/realEstate.ts:1393`
- **エラーコード**: `TS2353`
- **詳細**: html2canvasの型定義に存在しない `letterRendering: false` が指定されています。
- **対処案**: 該当行を削除または `(options as any)` で対応。

---

## 2. ESLint パーサー・ルール設定エラー (31件)
ESLint CLIがTypeScriptパーサー（`@typescript-eslint/parser`）を通さずに標準Espree（JavaScriptパーサー）で `.ts` / `.tsx` を直接パースしようとした際に発生する構文エラー一覧です。

| # | 対象ファイル | 行:列 | エラー内容 |
|---|---|---|---|
| 1 | `app/api/analyze-format/route.ts` | 9:29 | Parsing error: Unexpected token : (TypeScript型アノテーション) |
| 2 | `app/api/extract/route.ts` | 12:49 | Parsing error: Unexpected token < (TypeScriptジェネリクス) |
| 3 | `app/api/map/route.ts` | 4:38 | Parsing error: Unexpected token : (TypeScript型アノテーション) |
| 4 | `app/error.tsx` | 8:2 | Parsing error: Unexpected token : |
| 5 | `app/global-error.tsx` | 5:2 | Parsing error: Unexpected token : |
| 6 | `app/layout.tsx` | 1:13 | Parsing error: Unexpected token { |
| 7 | `app/not-found.tsx` | 5:5 | Parsing error: Unexpected token < |
| 8 | `app/page.tsx` | 5:13 | Parsing error: Unexpected token { |
| 9 | `components/AdminDashboardModal.tsx` | 71:1 | Parsing error: The keyword 'interface' is reserved |
| 10 | `components/HistoryModal.tsx` | 9:1 | Parsing error: The keyword 'interface' is reserved |
| 11 | `components/JsBTemplate.tsx` | 10:47 | Parsing error: Unexpected token : |
| 12 | `components/ProposalEmailModal.tsx` | 8:1 | Parsing error: The keyword 'interface' is reserved |
| 13 | `components/SourceDocumentViewer.tsx` | 6:1 | Parsing error: The keyword 'interface' is reserved |
| 14 | `components/StaffPresetModal.tsx` | 37:1 | Parsing error: The keyword 'interface' is reserved |
| 15 | `components/Step1Upload.tsx` | 5:1 | Parsing error: The keyword 'interface' is reserved |
| 16 | `components/Step2Extracting.tsx` | 11:1 | Parsing error: The keyword 'interface' is reserved |
| 17 | `components/Step3Method.tsx` | 5:1 | Parsing error: The keyword 'interface' is reserved |
| 18 | `components/Step4Edit.tsx` | 27:1 | Parsing error: The keyword 'interface' is reserved |
| 19 | `components/Step5Format.tsx` | 36:1 | Parsing error: The keyword 'interface' is reserved |
| 20 | `components/Step6Design.tsx` | 14:1 | Parsing error: The keyword 'interface' is reserved |
| 21 | `components/Step7Preview.tsx` | 22:1 | Parsing error: The keyword 'interface' is reserved |
| 22 | `components/Step8Output.tsx` | 18:1 | Parsing error: The keyword 'interface' is reserved |
| 23 | `hooks/use-mobile.ts` | 14:5 | Definition for rule 'react-hooks/set-state-in-effect' was not found |
| 24 | `lib/storage.ts` | 5:13 | Parsing error: Unexpected token { |
| 25 | `lib/utils.ts` | 1:21 | Parsing error: Unexpected token ClassValue |
| 26 | `next.config.ts` | 1:13 | Parsing error: Unexpected token { |
| 27 | `types.ts` | 1:8 | Parsing error: Unexpected token type |
| 28 | `utils/imageCropper.ts` | 1:13 | Parsing error: Unexpected token { |
| 29 | `utils/maps.ts` | 15:38 | Parsing error: Unexpected token : |
| 30 | `utils/pdf.ts` | 1:13 | Parsing error: Unexpected token { |
| 31 | `utils/realEstate.ts` | 25:51 | Parsing error: Unexpected token : |

---

## 3. 補足・総合サマリー
- **TypeScript型エラー**: 合計 11件
- **ESLintパーサーエラー**: 合計 31件
- 合計すると約 34〜42件の静的指摘事項が存在します。
- 一括で確認・修正できるように、本書 `ALL_ISSUES_REPORT.md` としてプロジェクトルートに保存しました。

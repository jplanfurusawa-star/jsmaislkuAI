import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const PRIMARY_MODEL = "gemini-2.5-flash";
export const FALLBACK_MODELS: readonly string[] = [
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];
export const CANDIDATE_MODELS: readonly string[] = [
  PRIMARY_MODEL,
  ...FALLBACK_MODELS,
];

function getGeminiClient(): GoogleGenAI {
  const rawKey = process.env.GEMINI_API_KEY || '';
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');

  if (!apiKey) {
    console.error("[Gemini API Configuration Error] GEMINI_API_KEY is not set.");
    const missingErr: any = new Error("サーバー環境変数 GEMINI_API_KEY が未設定です。");
    missingErr.status = 500;
    missingErr.code = "GEMINI_API_KEY_MISSING";
    throw missingErr;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build-format-analyzer',
      },
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image, mimeType = 'image/jpeg', pdfText = '', fileName = '' } = body;

    if (!image) {
      return NextResponse.json(
        { error: "解析対象の画像またはPDFデータ（base64）が送信されていません。" },
        { status: 400 }
      );
    }

    // Extract base64 payload if it has a data URL prefix
    let cleanBase64 = image;
    let actualMime = mimeType;
    if (typeof image === 'string' && image.startsWith('data:')) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        actualMime = match[1];
        cleanBase64 = match[2];
      } else {
        cleanBase64 = image.replace(/^data:[^;]+;base64,/, '');
      }
    }

    const ai = getGeminiClient();

    const systemPrompt = `
あなたは日本の商業用・事業用・居住用不動産マイソク（募集図面・リーシング提案書・プレゼンテーション資料）の意匠設計およびレイアウト解析のエキスパートです。
提供された「マイソク見本資料（画像）」を視覚的に細部まで詳細に分析し、そのデザインの骨格、構成比率、スロット配置、カラーパレット、推奨用途を抽出し、指定のJSON形式で出力してください。

【解析すべき必須ポイント】
1. フォーマット名とスタイル区分:
   - 例: "JS-Custom | 銀座並木通り型プレゼン", "JS-Custom | ワンフロアオフィス特化型", "JS-Custom | 商業ラグジュアリー型", "JS-Custom | 複数区画一覧型"
2. 推奨用途 (recommendedFor):
   - ビル一棟貸し、路面店舗、高級ブランド物販、オフィス、飲食店、医療モール等、このレイアウトが最も映える物件種別。
3. カラーパレット抽出:
   - themeColor: 資料のヘッダー帯や主要タイトルに使われているメインカラー (16進数 Hex, 例: "#0F172A", "#1E3A8A", "#B45309", "#047857", "#111827" など)。
   - secondaryColor: サブカラーや区画見出し、枠線に使われている色 (Hex)。
   - accentColor: 賃料や「礼金0」「駅徒歩1分」等の強調バッジに使われている色 (Hex, 例: "#DC2626", "#D97706", "#2563EB" など)。
4. 各要素の配置バランス (layoutStructure):
   - orientation: "landscape" (横長 A4) または "portrait" (縦長 A4)
   - headerPosition: "top-full" (上部全幅) | "top-left" | "top-banner"
   - headerStyle: "luxury" (重厚・高級) | "modern-minimal" (モダン・シンプル) | "standard"
   - floorPlanPosition: "top-left" | "center-large" | "bottom-left" | "right-column" | "slide-2"
   - floorPlanSize: "large" (大) | "medium" (中) | "standard"
   - photosPosition: "bottom-row" (下部横並び) | "left-column" | "grid-3" | "grid-4" | "center-split"
   - photoCount: 推奨写真枚数 (2〜6)
   - mapPosition: "bottom-right" | "top-right" | "bottom-left" | "right-column"
   - tablePosition: "right-column" (右側縦型) | "bottom-full" (下部全幅表) | "grid-table"
   - footerPosition: "bottom-fixed" (最下部帯)
5. 構成ガイド (layoutGuide):
   - 【構成】から始まる1行のわかりやすいレイアウト要約（例: 「【構成】上部: 物件名・条件帯 / 左: 平面図（大） / 右: 物件概要表 / 下部: 外観写真＋案内図」）
6. デザイン解説と特筆事項 (designNotes):
   - 視線誘導、余白の使い方、フォント感、フォントウェイト、写真と図面の面積比率など、このフォーマットの優れたデザイン特徴を3〜4点箇条書きで具体的に記述。
`;

    const userPrompt = `
以下のマイソク見本資料（ファイル名: ${fileName || '見本資料'}）を解析してください。
${pdfText ? `\n[抽出された資料内テキスト参考情報]:\n${pdfText.slice(0, 1500)}` : ''}

以下のJSONスキーマに従って厳密なJSONオブジェクトのみを出力してください。Markdownコードブロック(\`\`\`json)で囲んで出力してください。

{
  "formatName": "string（例: JS-Custom | 銀座路面店・プレゼン型）",
  "subtitle": "string（例: 高級ブランド・路面店舗・一棟ビル向け）",
  "badge": "string（例: AI解析, プレゼン型, 路面店特化 など 2〜6文字）",
  "themeColor": "string（Hexコード #RRGGBB）",
  "secondaryColor": "string（Hexコード #RRGGBB）",
  "accentColor": "string（Hexコード #RRGGBB）",
  "desc": "string（このフォーマットのレイアウト思想・特徴の解説 100〜160文字）",
  "layoutGuide": "string（例: 【構成】上部: 物件タイトル・キャッチ / 左側: 平面図（大） / 右側: 物件概要表 / 下部: 写真3枚＋案内図）",
  "recommendedFor": "string（例: 高級商業施設・路面店舗・銀座等のハイエンドビル・リーシング提案）",
  "suggestedBaseFormat": "JS-A | JS-B | JS-C | JS-D のいずれか最も近いもの",
  "layoutStructure": {
    "orientation": "landscape または portrait",
    "headerPosition": "top-full または top-left",
    "headerStyle": "luxury または modern-minimal または standard",
    "floorPlanPosition": "top-left または center-large または bottom-left または right-column",
    "floorPlanSize": "large または medium または standard",
    "photosPosition": "bottom-row または left-column または grid-3 または grid-4",
    "photoCount": 3,
    "mapPosition": "bottom-right または top-right または bottom-left",
    "tablePosition": "right-column または bottom-full",
    "footerPosition": "bottom-fixed"
  },
  "designNotes": [
    "string（デザイン特徴1）",
    "string（デザイン特徴2）",
    "string（デザイン特徴3）"
  ]
}
`;

    let lastError: any = null;
    let responseText = '';

    for (const model of CANDIDATE_MODELS) {
      try {
        console.log(`[Format Analyzer] Attempting analysis with model: ${model}`);
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: actualMime,
                    data: cleanBase64,
                  },
                },
                {
                  text: systemPrompt + "\n\n" + userPrompt,
                },
              ],
            },
          ],
        });

        if (response?.text) {
          responseText = response.text;
          console.log(`[Format Analyzer] Successfully analyzed format with model: ${model}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Format Analyzer] Model ${model} failed:`, err?.message || err);
      }
    }

    if (!responseText) {
      throw lastError || new Error("Gemini AI によるフォーマット解析応答が得られませんでした。");
    }

    // Clean JSON markdown block
    const cleanedText = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsedResult: any;
    try {
      parsedResult = JSON.parse(cleanedText);
    } catch (parseErr) {
      // Attempt regex extract if surrounded by extra text
      const match = cleanedText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedResult = JSON.parse(match[0]);
      } else {
        throw new Error("フォーマット解析結果のJSONパースに失敗しました。");
      }
    }

    // Ensure fallback fields exist
    const normalizedResult = {
      formatName: parsedResult.formatName || `JS-Custom | ${fileName ? fileName.replace(/\.[^/.]+$/, '') : 'カスタム型'}`,
      subtitle: parsedResult.subtitle || '独自アップロード資料解析フォーマット',
      badge: parsedResult.badge || 'AI解析',
      themeColor: parsedResult.themeColor?.startsWith('#') ? parsedResult.themeColor : '#0F172A',
      secondaryColor: parsedResult.secondaryColor?.startsWith('#') ? parsedResult.secondaryColor : '#1E3A8A',
      accentColor: parsedResult.accentColor?.startsWith('#') ? parsedResult.accentColor : '#D97706',
      desc: parsedResult.desc || 'アップロードされたマイソク見本資料からレイアウト構成と色彩を解析したフォーマット。',
      layoutGuide: parsedResult.layoutGuide || '【構成】左: 平面図 / 右: 物件概要 / 下部: 写真＋案内図',
      recommendedFor: parsedResult.recommendedFor || '標準的な商業・オフィス・店舗物件',
      suggestedBaseFormat: ['JS-A', 'JS-B', 'JS-C', 'JS-D'].includes(parsedResult.suggestedBaseFormat)
        ? parsedResult.suggestedBaseFormat
        : 'JS-B',
      layoutStructure: {
        orientation: parsedResult.layoutStructure?.orientation || 'landscape',
        headerPosition: parsedResult.layoutStructure?.headerPosition || 'top-full',
        headerStyle: parsedResult.layoutStructure?.headerStyle || 'luxury',
        floorPlanPosition: parsedResult.layoutStructure?.floorPlanPosition || 'top-left',
        floorPlanSize: parsedResult.layoutStructure?.floorPlanSize || 'large',
        photosPosition: parsedResult.layoutStructure?.photosPosition || 'bottom-row',
        photoCount: typeof parsedResult.layoutStructure?.photoCount === 'number' ? parsedResult.layoutStructure.photoCount : 3,
        mapPosition: parsedResult.layoutStructure?.mapPosition || 'bottom-right',
        tablePosition: parsedResult.layoutStructure?.tablePosition || 'right-column',
        footerPosition: parsedResult.layoutStructure?.footerPosition || 'bottom-fixed',
      },
      designNotes: Array.isArray(parsedResult.designNotes) && parsedResult.designNotes.length > 0
        ? parsedResult.designNotes
        : ['見本資料の配色とレイアウト比率を継承', '平面図を視認性の高い位置に自動配置'],
      sourceFileName: fileName || '見本資料',
      analyzedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      result: normalizedResult,
    });
  } catch (error: any) {
    console.error("[Format Analyzer API Error]:", error);
    return NextResponse.json(
      {
        error: error?.message || "マイソクフォーマットの解析中にエラーが発生しました。",
        statusCode: error?.status || 500,
      },
      { status: error?.status || 500 }
    );
  }
}

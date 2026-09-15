import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Vercel Serverless Function & Next.js App Router runtime configurations
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Extend Vercel function execution timeout to 60s

// In-Flight Request Deduplication & In-Memory Result Cache
// Prevents redundant Gemini API calls for identical files and concurrent requests
const inFlightRequests = new Map<string, Promise<any>>();
const extractionCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

// Candidate models in priority order:
// 1. gemini-2.5-flash: high speed, multimodal extraction
// 2. gemini-flash-latest: standard GA flash alias
// 3. gemini-3.1-flash-lite: lightweight resilient fallback
const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

/**
 * Lazy initialization of GoogleGenAI client with strict verification of GEMINI_API_KEY.
 * Prevents build-time crashes and cleans whitespace/quotes from environment variables.
 */
function getGeminiClient(): GoogleGenAI {
  const rawKey = process.env.GEMINI_API_KEY || '';
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');

  if (!apiKey) {
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("[Gemini API Configuration Error]");
    console.error("HTTP Status: 500");
    console.error("Error: process.env.GEMINI_API_KEY is not set or empty.");
    console.error("Vercel Setup Instructions:");
    console.error("1. Go to Vercel Project Settings > Environment Variables");
    console.error("2. Add 'GEMINI_API_KEY' for Production, Preview, and Development");
    console.error("3. Trigger a redeploy after saving the environment variable");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const missingErr: any = new Error("サーバー環境変数 GEMINI_API_KEY が未設定です。Vercelの環境変数設定をご確認の上、再デプロイしてください。");
    missingErr.status = 500;
    missingErr.code = "GEMINI_API_KEY_MISSING";
    throw missingErr;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface GeminiErrorAnalysis {
  httpStatus: number | string;
  statusCode: number;
  errorCode: string;
  errorMessage: string;
  isDailyQuota: boolean;
  isRateLimit: boolean;
  isTransient: boolean;
  isAuthError: boolean;
  isModelNotFound: boolean;
  userMessage: string;
}

/**
 * Parses Gemini API error, classifies it, and outputs high-visibility server logs
 * with the exact HTTP status and error details for Vercel / server monitoring.
 */
function analyzeAndLogGeminiError(context: string, model: string, error: any): GeminiErrorAnalysis {
  const errMsg = String(error?.message || error || '');
  const rawStatus = error?.status || error?.statusCode || error?.response?.status || '';
  const rawCode = error?.code || error?.error?.code || '';

  let numericStatus = 500;
  let httpStatusDisplay: string | number = rawStatus;

  if (typeof rawStatus === 'number') {
    numericStatus = rawStatus;
  } else {
    const match = errMsg.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
    if (match) {
      numericStatus = parseInt(match[1], 10);
      httpStatusDisplay = numericStatus;
    } else if (rawStatus) {
      httpStatusDisplay = rawStatus;
    } else {
      httpStatusDisplay = '500 (Internal Error)';
    }
  }

  const isDailyQuota = 
    errMsg.includes("GenerateRequestsPerDay") ||
    errMsg.includes("PerDay") ||
    errMsg.includes("limit: 20") ||
    errMsg.includes("quota exceeded for the day") ||
    (errMsg.includes("RESOURCE_EXHAUSTED") && errMsg.includes("FreeTier"));

  const isRateLimit = 
    !isDailyQuota && (
      rawStatus === "RESOURCE_EXHAUSTED" ||
      numericStatus === 429 ||
      errMsg.includes("429") ||
      errMsg.includes("RESOURCE_EXHAUSTED") ||
      errMsg.includes("Rate limit exceeded") ||
      errMsg.includes("Quota exceeded")
    );

  const isAuthError =
    numericStatus === 401 ||
    numericStatus === 403 ||
    rawStatus === "PERMISSION_DENIED" ||
    rawStatus === "UNAUTHENTICATED" ||
    errMsg.includes("API_KEY_INVALID") ||
    errMsg.includes("API key not valid") ||
    errMsg.includes("PERMISSION_DENIED") ||
    errMsg.includes("has not been used in project") ||
    errMsg.includes("it is disabled");

  const isModelNotFound =
    numericStatus === 404 ||
    rawStatus === "NOT_FOUND" ||
    errMsg.includes("not found") ||
    errMsg.includes("models/");

  const isTransient = 
    rawStatus === "UNAVAILABLE" ||
    numericStatus === 503 ||
    numericStatus === 504 ||
    numericStatus === 502 ||
    errMsg.includes("503") ||
    errMsg.includes("504") ||
    errMsg.includes("high demand") ||
    errMsg.includes("temporarily unavailable") ||
    errMsg.includes("overloaded");

  let userMessage = `AI解析モデルへの接続に失敗しました (Status: ${httpStatusDisplay})。時間をおいて再試行してください。`;
  if (isDailyQuota) {
    userMessage = "Gemini APIの本日の無料利用枠（1日20リクエスト上限）に達しました。時間をおいて再試行するか、有料APIキーまたは別プロジェクトの設定をご確認ください。";
    numericStatus = 429;
  } else if (isRateLimit) {
    userMessage = "AI解析リクエストが集中しています（短時間レート制限: HTTP 429）。1分ほど時間をおいてから再試行してください。";
    numericStatus = 429;
  } else if (isAuthError) {
    if (errMsg.includes("has not been used in project") || errMsg.includes("it is disabled")) {
      userMessage = "Google Cloudで『Generative Language API』が有効化されていません。Google Cloud ConsoleのAPIとサービスから有効化してください。";
    } else {
      userMessage = `Gemini APIキーの認証に失敗しました (Status: ${httpStatusDisplay})。VercelのGEMINI_API_KEY環境変数の値をご確認ください。`;
    }
    numericStatus = numericStatus === 401 ? 401 : 403;
  } else if (isModelNotFound) {
    userMessage = `AIモデル (${model}) が見つかりませんでした (Status: 404)。`;
    numericStatus = 404;
  }

  // サーバーログへ実際のHTTPステータスとエラー詳細を出力
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error(`[Gemini API Server Error] Context: ${context}`);
  console.error(`[Gemini API Server Error] Target Model: ${model}`);
  console.error(`[Gemini API Server Error] HTTP Status: ${httpStatusDisplay} (Code: ${numericStatus})`);
  console.error(`[Gemini API Server Error] Error Code: ${rawCode || rawStatus || 'NONE'}`);
  console.error(`[Gemini API Server Error] Error Message: ${errMsg}`);
  if (error?.errorDetails || error?.details || error?.response?.data) {
    const details = error?.errorDetails || error?.details || error?.response?.data;
    try {
      console.error(`[Gemini API Server Error] Detailed Response:`, typeof details === 'object' ? JSON.stringify(details, null, 2) : details);
    } catch {
      console.error(`[Gemini API Server Error] Detailed Response:`, details);
    }
  }
  if (error?.stack) {
    console.error(`[Gemini API Server Error] Stack Trace:`, error.stack);
  }
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return {
    httpStatus: httpStatusDisplay,
    statusCode: numericStatus,
    errorCode: String(rawCode || rawStatus || ''),
    errorMessage: errMsg,
    isDailyQuota,
    isRateLimit,
    isTransient,
    isAuthError,
    isModelNotFound,
    userMessage,
  };
}

async function callGeminiSinglePass(contents: any, schema: any) {
  const ai = getGeminiClient();
  let lastAnalysis: GeminiErrorAnalysis | null = null;

  // Try candidate models in order with resilient fallback
  for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
    const model = CANDIDATE_MODELS[i];
    const isLast = i === CANDIDATE_MODELS.length - 1;

    try {
      console.log(`[Gemini API] Requesting extraction with model: ${model} (${i + 1}/${CANDIDATE_MODELS.length})...`);
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        }
      });

      const text = response.text;
      if (text) {
        console.log(`[Gemini API] Successfully received extraction response from model: ${model}`);
        return JSON.parse(text);
      }
      throw new Error(`AI解析モデル (${model}) からの応答が空でした。`);
    } catch (err: any) {
      const analysis = analyzeAndLogGeminiError(`Extraction Attempt [Model: ${model}]`, model, err);
      lastAnalysis = analysis;

      // If Daily Quota is exceeded, fail immediately without trying other models
      if (analysis.isDailyQuota) {
        const quotaErr: any = new Error(analysis.userMessage);
        quotaErr.isDailyQuota = true;
        quotaErr.status = 429;
        quotaErr.httpStatus = analysis.httpStatus;
        throw quotaErr;
      }

      // If Auth error (invalid API key or disabled API), fail immediately
      if (analysis.isAuthError) {
        const authErr: any = new Error(analysis.userMessage);
        authErr.status = analysis.statusCode;
        authErr.httpStatus = analysis.httpStatus;
        authErr.isAuthError = true;
        throw authErr;
      }

      // If more candidate models exist, wait briefly and retry with next model
      if (!isLast) {
        const waitMs = analysis.isRateLimit || analysis.isTransient ? 1500 : 600;
        console.warn(`[Gemini API] Model ${model} failed (Status: ${analysis.httpStatus}). Trying fallback model in ${waitMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
    }
  }

  const finalErr: any = new Error(lastAnalysis?.userMessage || "AI解析モデルへの接続に失敗しました。");
  finalErr.status = lastAnalysis?.statusCode || 500;
  finalErr.httpStatus = lastAnalysis?.httpStatus || 500;
  finalErr.isDailyQuota = !!lastAnalysis?.isDailyQuota;
  throw finalErr;
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const files = data.files; // Array of { mimeType, data (base64) }
    const extractedText = data.extractedText || ''; // Optional raw text extracted from PDF
    const forceRefresh = !!data.forceRefresh; // True when user explicitly clicks "Re-extract"

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: "ファイルが提供されていません。" }, { status: 400 });
    }

    // Generate SHA-256 fingerprint from files and text to uniquely identify this document
    const hash = crypto.createHash('sha256');
    for (const f of files) {
      hash.update(f.mimeType || '');
      // Use length and sampled content for fast yet deterministic hashing
      const dataStr = f.data || '';
      hash.update(String(dataStr.length));
      hash.update(dataStr.slice(0, 1000));
      hash.update(dataStr.slice(-1000));
    }
    if (extractedText) {
      hash.update(extractedText.slice(0, 2000));
    }
    const documentHash = hash.digest('hex');

    // 1. Check in-memory cache if not forced refresh
    if (!forceRefresh) {
      const cached = extractionCache.get(documentHash);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[API /api/extract] Cache HIT for document hash: ${documentHash.slice(0, 8)}`);
        return NextResponse.json({ success: true, data: cached.result, ...cached.result });
      }
    }

    // 2. In-Flight Request Deduplication
    // If another request for the exact same document is currently executing, wait for it
    if (inFlightRequests.has(documentHash) && !forceRefresh) {
      console.log(`[API /api/extract] Joining in-flight extraction for hash: ${documentHash.slice(0, 8)}`);
      try {
        const inFlightResult = await inFlightRequests.get(documentHash);
        return NextResponse.json({ success: true, data: inFlightResult, ...inFlightResult });
      } catch (err: any) {
        // If the in-flight failed, proceed to try a fresh execution below
        console.warn(`[API /api/extract] In-flight request failed, retrying independently:`, err?.message);
      }
    }

    const parts: any[] = files.map((file: any) => ({
      inlineData: {
        mimeType: file.mimeType || 'image/jpeg',
        data: file.data,
      }
    }));

    if (extractedText && typeof extractedText === 'string' && extractedText.trim().length > 0) {
      parts.push({
        text: `【元資料から抽出されたテキストレイヤー情報】\n${extractedText.slice(0, 15000)}`
      });
    }

    parts.push({
      text: `
      あなたは株式会社j.squareの事業用不動産マイソク・プレゼン資料作成AIエキスパートです。
      提供された画像・資料（募集図面、マイソクチラシ、写真、図面、PDFレンダリング画像、およびテキスト情報）を徹底的に精査し、以下の【物件情報】および【視覚パーツ】を高精度に抽出してください。

      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      【最重要：物件情報・募集条件の抽出ルール（100%徹底抽出）】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      元資料が他社作成のマイソクや仲介図面であっても、そこに記載されている物件スペック・条件は【すべて今回の作成対象となる物件データ】です。資料内の大見出し、物件概要欄、条件表、特記事項から漏れなく抽出してください。
      （※「他社情報」とは、帯やフッターにある「他社仲介業者名・他社電話番号・他社ロゴ」のみを指します。物件スペックそのものは必ず抽出してください）

      各項目の抽出要領:
      1. property.name（物件名）:
         ・資料の最上部、大見出し、タイトルバナー、物件概要欄に大きく書かれているビル名・施設名・マンション名を抽出してください。
         ・例: 「GINZA NAMIKI BUILDING」「第15森ビル」「第2溝呂木ビル」「渋谷スクエアビル」「ワイエム代官山」など。
         ・タイトルに「〇〇ビル 4階 402号室」のように階数や号室が含まれる場合、ビル名のみを name に、階数・号室を floor, room に分けてください。

      2. property.address（所在地）:
         ・「所在地」「住所」「物件所在地」の記載、または「東京都」「〇〇府」「〇〇県」から始まる住所文字列を番地・号まで正確に抽出してください。

      3. property.access（交通・アクセス）:
         ・「交通」「最寄駅」「アクセス」欄に記載された路線名・駅名・出口・徒歩分数をすべて連結して抽出してください（複数路線ある場合はすべて含める）。

      4. property.floor / property.room（階数・号室）:
         ・【超重要：複数階・複数区画の一体募集対応】
           元資料に複数区画・複数階（例: 「1F」「B1F」の2フロア一体貸し、1F・2Fの一括募集など）が記載されている場合は、すべての募集対象階を連結して抽出してください（例: 「1F・B1F」「1F・2F」「1F/B1F」など）。
           決して1階部分（1F）のみで切り捨てないこと。

      5. property.usage（用途）:
         ・「店舗」「事務所」「物販店舗」「飲食店舗」「クリニック」「住宅」など純粋な用途名。

      6. property.currentStatus（現況）および property.handoverStatus（引渡状態）:
         ・【重複防止ルール】
           元資料上で「現況」と「引渡状態」が別情報の場合のみそれぞれ抽出してください（例: 現況: 「営業中」、引渡状態: 「スケルトン」）。
           同一意味・同一値（例: 両方とも「居抜き」または「スケルトン」）の場合は、handoverStatus（引渡状態）側に設定し、無意味な重複表示を避けてください。

      7. property.handoverTiming（引渡時期）:
         ・「即時」「相談」「2025年4月」「即日」「成約後〇ヶ月」など。

      8. area（面積）:
         ・【超重要：複数区画・複数階の合算ルール】
           複数階・複数区画の一体募集の場合、面積（sqm, tsubo）には【全募集対象区画の合計値】を設定してください。
           例: 1Fが46.40㎡（14.04坪）、B1Fが18.30㎡（5.53坪）の場合:
               合計平米数: 64.70 (46.40 + 18.30)
               合計坪数: 19.57 (14.04 + 5.53)
           ・breakdownText には「1F：46.40㎡（14.04坪） B1F：18.30㎡（5.53坪）」のように内訳テキストを格納してください。
           ・資料に片方（坪または㎡）しか記載がない場合、1坪 ＝ 3.30578㎡（1㎡ ＝ 0.3025坪）で換算して両方の数値を必ず算出してください。

      9. rent（賃料・坪単価）:
         ・amount: 月額賃料の金額を数値型で設定（例: 600000）。「〇〇万円」表記は円単位の数値に換算（例: 「60万円」→ 600000）。
         ・taxIncluded: 「税込」なら true、「税別」なら false、不明なら null。
         ・tsuboPrice（坪単価）:
           【重要ルール】
           ① 元資料に坪単価が明記されている場合は、原資料の数値を最優先してください。
           ② 元資料に坪単価の記載がない場合のみ、月額賃料 ÷ 【合計坪数】 で計算してください。
              （例: 600,000円 ÷ 19.57坪 ≒ 30,659円/坪。1Fの14.04坪だけで割って42,735円としないこと！）
           ③ 賃料の対象範囲を確定できない場合は、勝手に計算せず null としてください。

      10. commonFee（共益費・管理費）:
          ・amount: 金額を数値で設定。「なし」「賃料に含む」「込」の場合は 0 に設定。
          ・taxIncluded: 税込なら true、税別なら false。
          ・tsuboPrice: 坪単価の数値。

      11. deposit（敷金・保証金）:
          ・「賃料の6ヶ月分」「10ヶ月」「1,500,000円」「相談」等の文字列。

      12. keyMoney（礼金）:
          ・「なし」「1ヶ月」「0ヶ月」「2ヶ月」等の文字列。「なし」と書かれている場合は「なし」と抽出してください（空文字にしない）。

      13. depreciation（償却）:
          ・「解約時20%」「1ヶ月」「敷金の10%」「なし」等の文字列。

      14. contract（契約期間・形態）:
          ・「定期借家契約 5年」「普通借家契約 2年」等。

      15. building（建物概要）:
          ・structure: 構造（「鉄骨鉄筋コンクリート造」「SRC造」「RC造」「鉄骨造」「S造」等）
          ・scale: 規模（「地上9階地下1階建」「5階建」等）
          ・builtYearMonth: 築年月（和暦表記の場合は西暦に換算して「1998年3月」「2020年10月」のように表記）
          ・siteAreaSqm / siteAreaTsubo: 敷地面積（記載があれば数値）
          ・totalFloorAreaSqm / totalFloorAreaTsubo: 延床面積（記載があれば数値）
          ・currentUsage: 現用途（記載があれば）

      16. equipment（設備一覧）:
          ・エレベーター、個別空調、男女別トイレ、光ファイバー、オートロック、給排水など設備名の配列。

      17. conditions（特記事項・諸条件）:
          ・飲食不可、深夜営業制限、看板料、更新料、保証会社加入要などの条件の配列。

      18. tenants（フロア構成・テナント一覧）:
          ・階数ごとのテナント名や用途が記載されている場合のみ抽出（記載がなければ空配列 []）。

      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      【画像・パース・図面抽出ルール（visualElements）】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      各ページのタイトル・テキスト文脈に基づき、正確に矩形境界（ymin, xmin, ymax, xmax：0〜1000の正規化座標）とfileIndex（0始まりのページ番号）を返却してください：
      
      【ページ文脈に応じた分類】
      1. PLAN（図面）:
         ・ページタイトルが「■平面図」「平面図」「間取」「PLAN」「区画図」等のページにある主たる図面。
         ・図面に複数階（例: 1FとB1F）が1枚に掲載されている場合は、label を「1F・B1F」や該当する募集階名に設定してください（単なる「平面図」や「1F」だけにしない）。
         ・【超重要】図面がページの大部分を占めていても絶対に除外せず、category: 'PLAN', subCategory: '平面図' として抽出してください。
      2. PHOTO（写真・パース）:
         ・外観写真・外観パース: 建物全景、ファサード等（subCategory: '外観' または '外観パース'）。
         ・内観写真: ページタイトルが「■内装」「内観」「引渡し状況」「写真」等のページにある室内・店舗内写真群（subCategory: '内観'）。
      3. ACCESS（地図）:
         ・現地案内図、周辺地図、アクセスマップ（category: 'ACCESS', subCategory: '現地案内図'）。
      
      【絶対に抽出・混入させてはならない禁止対象】
      ・「募集条件の表」「賃料・敷金の文字表」「物件概要のテキスト領域」は絶対に PHOTO や PLAN として抽出しないこと！
      ・「会社情報」「仲介会社ロゴ」「ロゴマーク」は PHOTO や PLAN として抽出しないこと（category: 'OTHER', subCategory: '会社ロゴ'）！
      ・文字や表を写真と誤認してはなりません。純粋な図面・写真・地図のみを切り出してください。
      `
    });

    const schema = {
      type: Type.OBJECT,
      properties: {
        property: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            address: { type: Type.STRING },
            access: { type: Type.STRING },
            floor: { type: Type.STRING },
            room: { type: Type.STRING },
            usage: { type: Type.STRING },
            currentStatus: { type: Type.STRING },
            handoverTiming: { type: Type.STRING },
            handoverStatus: { type: Type.STRING },
          }
        },
        area: {
          type: Type.OBJECT,
          properties: {
            sqm: { type: Type.NUMBER, nullable: true },
            tsubo: { type: Type.NUMBER, nullable: true },
            breakdownText: { type: Type.STRING },
          }
        },
        detailItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              value: { type: Type.STRING },
            }
          }
        },
        rent: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER, nullable: true },
            taxIncluded: { type: Type.BOOLEAN, nullable: true },
            tsuboPrice: { type: Type.NUMBER, nullable: true },
          }
        },
        commonFee: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER, nullable: true },
            taxIncluded: { type: Type.BOOLEAN, nullable: true },
            tsuboPrice: { type: Type.NUMBER, nullable: true },
          }
        },
        deposit: { type: Type.STRING },
        keyMoney: { type: Type.STRING },
        depreciation: { type: Type.STRING },
        contract: { type: Type.STRING },
        handover: { type: Type.STRING },
        building: {
          type: Type.OBJECT,
          properties: {
            structure: { type: Type.STRING },
            scale: { type: Type.STRING },
            builtYearMonth: { type: Type.STRING },
            siteAreaSqm: { type: Type.NUMBER, nullable: true },
            siteAreaTsubo: { type: Type.NUMBER, nullable: true },
            totalFloorAreaSqm: { type: Type.NUMBER, nullable: true },
            totalFloorAreaTsubo: { type: Type.NUMBER, nullable: true },
            currentUsage: { type: Type.STRING },
            constructionDates: { type: Type.STRING },
            subTitle: { type: Type.STRING },
            caption: { type: Type.STRING },
          }
        },
        equipment: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        conditions: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        tenants: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              floor: { type: Type.STRING },
              usage: { type: Type.STRING },
              tenantName: { type: Type.STRING },
            }
          }
        },
        contact: {
          type: Type.OBJECT,
          properties: {
            company: { type: Type.STRING },
            address: { type: Type.STRING },
            tel: { type: Type.STRING },
            fax: { type: Type.STRING },
            personName: { type: Type.STRING },
            licenseNumber: { type: Type.STRING },
            transactionType: { type: Type.STRING },
          }
        },
        visualElements: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              box2d: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER }
              },
              fileIndex: { type: Type.NUMBER },
              category: { type: Type.STRING },
              subCategory: { type: Type.STRING },
              label: { type: Type.STRING },
              confidence: { type: Type.STRING },
            }
          }
        },
      }
    };

    // Execute with In-Flight promise tracking
    const executionPromise = (async () => {
      console.log(`[API /api/extract] Starting Gemini API call (model: ${PRIMARY_MODEL}) for doc: ${documentHash.slice(0, 8)}`);
      const rawResult = await callGeminiSinglePass({ parts }, schema);

      // Deep sanitize strings to ensure only pure business values are preserved
      // Strips AI explanatory notes such as (※資料から推定), (要確認), 用途未記載 etc.
      const sanitizeFieldValue = (str: string, fieldKey?: string): string => {
        let cleaned = str.trim();
        if (!cleaned) return '';

        cleaned = cleaned
          .replace(/[（(]\s*※?\s*(?:資料から推定|資料より推測|要確認|推測|推定|未確認|未記載|記載なし|用途未記載)[^)）]*[)）]/g, '')
          .replace(/※\s*(?:資料から推定|資料より推測|要確認|推測|推定|未確認|未記載|記載なし|用途未記載)/g, '')
          .trim();

        const lower = cleaned.toLowerCase();
        const isNegativeAllowed = fieldKey === 'keyMoney' || fieldKey === 'depreciation' || fieldKey === 'deposit';

        if (
          cleaned === '' ||
          cleaned === '要確認' ||
          cleaned === '記載なし' ||
          cleaned === '未記載' ||
          cleaned === '未入力' ||
          (!isNegativeAllowed && cleaned === 'なし') ||
          cleaned === '-' ||
          cleaned === '―' ||
          cleaned === '不明' ||
          cleaned === '未定' ||
          cleaned === '用途未記載' ||
          cleaned === 'null' ||
          cleaned === 'undefined' ||
          cleaned === 'null null' ||
          lower === 'null' ||
          lower === 'undefined'
        ) {
          return '';
        }
        return cleaned;
      };

      const cleanExtractedData = (obj: any, parentKey?: string): any => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'string') {
          return sanitizeFieldValue(obj, parentKey);
        }
        if (Array.isArray(obj)) {
          return obj.map((item) => cleanExtractedData(item, parentKey));
        }
        if (typeof obj === 'object') {
          const cleaned: any = {};
          for (const key of Object.keys(obj)) {
            cleaned[key] = cleanExtractedData(obj[key], key);
          }
          return cleaned;
        }
        return obj;
      };

      const result = cleanExtractedData(rawResult);

      // 【データ整合性・重複排除処理】
      if (result.property) {
        const current = (result.property.currentStatus || '').trim().toLowerCase();
        const handover = (result.property.handoverStatus || '').trim().toLowerCase();
        if (current && handover && (current === handover || current.includes(handover) || handover.includes(current))) {
          result.property.currentStatus = '';
        }
      }

      // 坪単価の整合性（元資料の坪単価が未指定で、月額賃料と合計坪数がある場合のみ計算）
      if (result.rent && result.rent.amount && result.area && result.area.tsubo && result.area.tsubo > 0) {
        const calculatedTsuboPrice = Math.round(result.rent.amount / result.area.tsubo);
        if (!result.rent.tsuboPrice) {
          result.rent.tsuboPrice = calculatedTsuboPrice;
        } else {
          const ratio = result.rent.tsuboPrice / calculatedTsuboPrice;
          if (ratio > 1.25 || ratio < 0.75) {
            result.rent.tsuboPrice = calculatedTsuboPrice;
          }
        }
      }

      // Save to memory cache
      extractionCache.set(documentHash, {
        result,
        timestamp: Date.now(),
      });

      return result;
    })();

    inFlightRequests.set(documentHash, executionPromise);

    try {
      const finalResult = await executionPromise;
      return NextResponse.json({ success: true, data: finalResult, ...finalResult });
    } finally {
      inFlightRequests.delete(documentHash);
    }
  } catch (error: any) {
    const rawStatus = error?.status || error?.statusCode;
    const numericStatus = typeof rawStatus === 'number' ? rawStatus : (error?.isDailyQuota ? 429 : 500);
    const displayStatus = error?.httpStatus || rawStatus || numericStatus;
    const errorMessage = error?.message || "AI解析処理中にエラーが発生しました。時間をおいて再試行してください。";

    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("[API /api/extract] Execution handler caught error:");
    console.error(`[API /api/extract] HTTP Response Status: ${numericStatus} (Reported: ${displayStatus})`);
    console.error(`[API /api/extract] Error Message: ${errorMessage}`);
    if (error?.stack) {
      console.error(`[API /api/extract] Stack:`, error.stack);
    }
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return NextResponse.json({ 
      success: false, 
      error: errorMessage, 
      isDailyQuota: !!error?.isDailyQuota,
      httpStatus: displayStatus,
    }, { status: numericStatus });
  }
}

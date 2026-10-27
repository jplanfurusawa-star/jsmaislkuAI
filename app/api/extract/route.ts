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
// 1. PRIMARY_MODEL (gemini-2.5-flash): high speed, multimodal extraction
// 2. FALLBACK_MODELS (gemini-flash-latest, gemini-3.1-flash-lite): resilient fallback
export const PRIMARY_MODEL = "gemini-2.5-flash";
export const FALLBACK_MODELS: readonly string[] = [
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];
export const CANDIDATE_MODELS: readonly string[] = [
  PRIMARY_MODEL,
  ...FALLBACK_MODELS,
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

    const missingErr: any = new Error(
      "サーバー環境変数 GEMINI_API_KEY が未設定です。Vercelの環境変数設定をご確認の上、再デプロイしてください。"
    );

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
function analyzeAndLogGeminiError(
  context: string,
  model: string,
  error: any
): GeminiErrorAnalysis {
  const errMsg = String(error?.message || error || '');
  const rawStatus =
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    '';

  const rawCode =
    error?.code ||
    error?.error?.code ||
    '';

  let numericStatus = 500;
  let httpStatusDisplay: string | number = rawStatus;

  if (typeof rawStatus === 'number') {
    numericStatus = rawStatus;
  } else {
    const match = errMsg.match(
      /\b(400|401|403|404|429|500|502|503|504)\b/
    );

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
    (
      errMsg.includes("RESOURCE_EXHAUSTED") &&
      errMsg.includes("FreeTier")
    );

  const isRateLimit =
    !isDailyQuota &&
    (
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

  let userMessage =
    `AI解析モデルへの接続に失敗しました (Status: ${httpStatusDisplay})。時間をおいて再試行してください。`;

  if (isDailyQuota) {
    userMessage =
      "Gemini APIの本日の無料利用枠（1日20リクエスト上限）に達しました。時間をおいて再試行するか、有料APIキーまたは別プロジェクトの設定をご確認ください。";

    numericStatus = 429;

  } else if (isRateLimit) {
    userMessage =
      "AI解析リクエストが集中しています（短時間レート制限: HTTP 429）。1分ほど時間をおいてから再試行してください。";

    numericStatus = 429;

  } else if (isAuthError) {
    if (
      errMsg.includes("has not been used in project") ||
      errMsg.includes("it is disabled")
    ) {
      userMessage =
        "Google Cloudで『Generative Language API』が有効化されていません。Google Cloud ConsoleのAPIとサービスから有効化してください。";
    } else {
      userMessage =
        `Gemini APIキーの認証に失敗しました (Status: ${httpStatusDisplay})。VercelのGEMINI_API_KEY環境変数の値をご確認ください。`;
    }

    numericStatus =
      numericStatus === 401
        ? 401
        : 403;

  } else if (isModelNotFound) {
    userMessage =
      `AIモデル (${model}) が見つかりませんでした (Status: 404)。`;

    numericStatus = 404;
  }

  console.error(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

  console.error(
    `[Gemini API Server Error] Context: ${context}`
  );

  console.error(
    `[Gemini API Server Error] Target Model: ${model}`
  );

  console.error(
    `[Gemini API Server Error] HTTP Status: ${httpStatusDisplay} (Code: ${numericStatus})`
  );

  console.error(
    `[Gemini API Server Error] Error Code: ${rawCode || rawStatus || 'NONE'}`
  );

  console.error(
    `[Gemini API Server Error] Error Message: ${errMsg}`
  );

  if (
    error?.errorDetails ||
    error?.details ||
    error?.response?.data
  ) {
    const details =
      error?.errorDetails ||
      error?.details ||
      error?.response?.data;

    try {
      console.error(
        `[Gemini API Server Error] Detailed Response:`,
        typeof details === 'object'
          ? JSON.stringify(details, null, 2)
          : details
      );
    } catch {
      console.error(
        `[Gemini API Server Error] Detailed Response:`,
        details
      );
    }
  }

  if (error?.stack) {
    console.error(
      `[Gemini API Server Error] Stack Trace:`,
      error.stack
    );
  }

  console.error(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

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

async function callGeminiSinglePass(
  contents: any,
  schema: any
) {
  const ai = getGeminiClient();

  let lastAnalysis:
    GeminiErrorAnalysis |
    null = null;

  for (
    let i = 0;
    i < CANDIDATE_MODELS.length;
    i++
  ) {
    const model =
      CANDIDATE_MODELS[i];

    const isLast =
      i ===
      CANDIDATE_MODELS.length - 1;

    try {
      console.log(
        `[Gemini API] Requesting extraction with model: ${model} (${i + 1}/${CANDIDATE_MODELS.length})...`
      );

      const response =
        await ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType:
              "application/json",

            responseSchema:
              schema,
          }
        });

      const text =
        response.text;

      if (text) {
        console.log(
          `[Gemini API] Successfully received extraction response from model: ${model}`
        );

        return JSON.parse(text);
      }

      throw new Error(
        `AI解析モデル (${model}) からの応答が空でした。`
      );

    } catch (err: any) {
      const analysis =
        analyzeAndLogGeminiError(
          `Extraction Attempt [Model: ${model}]`,
          model,
          err
        );

      lastAnalysis =
        analysis;

      if (
        analysis.isDailyQuota
      ) {
        const quotaErr: any =
          new Error(
            analysis.userMessage
          );

        quotaErr.isDailyQuota =
          true;

        quotaErr.status =
          429;

        quotaErr.httpStatus =
          analysis.httpStatus;

        throw quotaErr;
      }

      if (
        analysis.isAuthError
      ) {
        const authErr: any =
          new Error(
            analysis.userMessage
          );

        authErr.status =
          analysis.statusCode;

        authErr.httpStatus =
          analysis.httpStatus;

        authErr.isAuthError =
          true;

        throw authErr;
      }

      if (!isLast) {
        const waitMs =
          analysis.isRateLimit ||
          analysis.isTransient
            ? 1500
            : 600;

        console.warn(
          `[Gemini API] Model ${model} failed (Status: ${analysis.httpStatus}). Trying fallback model in ${waitMs}ms...`
        );

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              waitMs
            )
        );

        continue;
      }
    }
  }

  const finalErr: any =
    new Error(
      lastAnalysis?.userMessage ||
      "AI解析モデルへの接続に失敗しました。"
    );

  finalErr.status =
    lastAnalysis?.statusCode ||
    500;

  finalErr.httpStatus =
    lastAnalysis?.httpStatus ||
    500;

  finalErr.isDailyQuota =
    !!lastAnalysis?.isDailyQuota;

  throw finalErr;
}

export async function POST(
  req: NextRequest
) {
  try {
    const data =
      await req.json();

    const files =
      data.files;

    const extractedText =
      data.extractedText ||
      '';

    const forceRefresh =
      !!data.forceRefresh;

    if (
      !files ||
      files.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ファイルが提供されていません。"
        },
        {
          status: 400
        }
      );
    }

    const hash =
      crypto.createHash(
        'sha256'
      );

    for (const f of files) {
      hash.update(
        f.mimeType ||
        ''
      );

      const dataStr =
        f.data ||
        '';

      hash.update(
        String(
          dataStr.length
        )
      );

      hash.update(
        dataStr.slice(
          0,
          1000
        )
      );

      hash.update(
        dataStr.slice(
          -1000
        )
      );
    }

    if (extractedText) {
      hash.update(
        extractedText.slice(
          0,
          2000
        )
      );
    }

    const documentHash =
      hash.digest(
        'hex'
      );

    if (!forceRefresh) {
      const cached =
        extractionCache.get(
          documentHash
        );

      if (
        cached &&
        Date.now() -
          cached.timestamp <
          CACHE_TTL_MS
      ) {
        console.log(
          `[API /api/extract] Cache HIT for document hash: ${documentHash.slice(0, 8)}`
        );

        return NextResponse.json({
          success: true,
          data:
            cached.result,
          ...cached.result
        });
      }
    }

    if (
      inFlightRequests.has(
        documentHash
      ) &&
      !forceRefresh
    ) {
      console.log(
        `[API /api/extract] Joining in-flight extraction for hash: ${documentHash.slice(0, 8)}`
      );

      try {
        const inFlightResult =
          await inFlightRequests.get(
            documentHash
          );

        return NextResponse.json({
          success: true,
          data:
            inFlightResult,
          ...inFlightResult
        });

      } catch (
        err: any
      ) {
        console.warn(
          `[API /api/extract] In-flight request failed, retrying independently:`,
          err?.message
        );
      }
    }

    const parts:
      any[] =
      files.map(
        (file: any) => ({
          inlineData: {
            mimeType:
              file.mimeType ||
              'image/jpeg',

            data:
              file.data,
          }
        })
      );

    if (
      extractedText &&
      typeof extractedText ===
        'string' &&
      extractedText
        .trim()
        .length > 0
    ) {
      parts.push({
        text:
          `【元資料から抽出されたテキストレイヤー情報】\n${extractedText.slice(0, 15000)}`
      });
    }

    parts.push({
      text: `
      あなたは株式会社j.squareの事業用不動産マイソク・プレゼン資料作成AIエキスパートです。
      入力資料は完成済みのマイソクとは限らず、以下のような複数の資料が別々に提供されることを前提として、それらを統合し、1つの正確な物件情報として整理してください。
      ・物件概要書
      ・賃貸条件表
      ・平面図
      ・配置図
      ・立面図、断面図
      ・外観写真、外観パース
      ・内観写真、内観パース
      ・エントランス写真
      ・周辺地図
      ・その他参考資料

      最終的に「JS-A｜1枚シンプル型」をはじめとするマイソク・プレゼン資料を作成します。

      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      【最重要：情報の優先順位】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      同じ項目について複数資料に記載がある場合は、以下の優先順位で採用してください。
      1. 物件概要書・賃貸条件表
      2. 募集条件が明記された資料
      3. 元マイソクの募集条件欄
      4. 平面図・配置図等に記載された物件情報
      5. 図面内の注記・寸法
      6. パース・写真内の文字情報

      特に以下の「契約・金銭条件」は、原則として【1〜3の資料からのみ】取得してください。
      ・賃料
      ・共益費、管理費
      ・保証金、敷金
      ・礼金
      ・償却
      ・更新料
      ・契約期間
      ・契約形態
      ・フリーレント
      ・違約金

      【絶対禁止】
      平面図、配置図、立面図、断面図、パース画像内に記載された数値から、これらの金銭条件を推測・補完してはいけません！
      例：
      「CH=3,000」「天井高3,000mm」「3,000」という図面上の数値を「賃料3,000,000円」として解釈しては絶対にいけません。
      金銭条件が条件表に記載されていない場合は、勝手に推測せず null（未記載）としてください。

      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      【数値の整合性チェック】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      抽出した数値は必ず文脈と単位を確認してください。
      ・mm、m、㎡、坪 → 寸法・面積
      ・円、万円、月額、税別、税込 → 金銭
      ・ヶ月、年 → 契約条件
      ・A、V、kW → 電気容量
      ・CH → 天井高
      単位が異なる数値を別項目へ転用しないでください。
      特に賃料については、「円」「万円」「月額」「賃料」等の明示がない数値を賃料として採用してはいけません。

      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      【面積の抽出ルール】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ㎡・坪の両方が資料に記載されている場合は、原資料の数値を最優先してください。
      片方のみの場合に限り、1坪 ＝ 3.30578㎡（1㎡ ＝ 0.3025坪）で換算してください。
      図面上の寸法から勝手に面積を逆算しないでください。
      複数階・複数区画の一体募集の場合、面積（sqm, tsubo）には【全募集対象区画の合計値】を設定してください。
      breakdownText には「1F：46.40㎡（14.04坪） B1F：18.30㎡（5.53坪）」のように内訳テキストを格納してください。

      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      【各項目の抽出要領（必ず原文一致で抽出）】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      【最重要：主要募集条件の原文一致ルール】
      JS-Aの主要条件欄（募集階・面積・賃料・共益費・保証金または敷金・礼金・償却・契約形態・引渡状態・入居可能時期）では、
      物件概要書・賃貸条件表に明記された項目を、表現・数値を勝手に変更せず原文そのまま抽出してください。
      原資料と異なる情報を推測して補完するくらいなら、空欄（nullまたは空文字）としてください。

      1. property.name（物件名）:
         【最重要：物件名の採用優先順位】
         1. 物件概要書・賃貸条件表に明記された正式物件名（最優先）
         2. 募集条件資料のタイトル
         3. 図面タイトル
         4. 外観パース・写真内の看板文字
         ※ パースや写真内の英字表記を、条件表に記載された正式物件名より優先してはいけません！
         ・タイトルに「〇〇ビル 4階 402号室」のように階数や号室が含まれる場合、ビル名のみを name に、階数・号室を floor, room に分けてください。
         ・例: 「GINZA NAMIKI BUILDING」「第15森ビル」「第2溝呂木ビル」「渋谷スクエアビル」「ワイエム代官山」など。

      2. property.address（所在地）:
         ・「所在地」「住所」「物件所在地」の記載、または「東京都」「〇〇府」「〇〇県」から始まる住所文字列を番地・号まで正確に抽出してください。

      3. property.access（交通・アクセス）:
         ・「交通」「最寄駅」「アクセス」欄に記載された路線名・駅名・出口・徒歩分数をすべて連結して抽出してください（複数路線ある場合はすべて含める）。

      4. property.floor / property.room（募集階・号室）:
         ・【超重要：複数階・複数区画の一体募集対応】
           元資料に複数区画・複数階（例: 「1F」「B1F」の2フロア一体貸し、1F・2Fの一括募集など）が記載されている場合は、すべての募集対象階を連結して抽出してください（例: 「1F・B1F」「1F・2F」「1F/B1F」など）。
           決して1階部分（1F）のみで切り捨てないこと。

      5. property.usage（用途）:
         ・「店舗」「事務所」「物販店舗」「飲食店舗」「クリニック」「住宅」など純粋な用途名。

      6. property.currentStatus（現況）および property.handoverStatus（引渡状態）:
         ・【引渡状態の原文一致】元資料に「スケルトン」「居抜き」「現況渡し」「現況有姿」等の記載がある場合、表現を勝手に改変せず原文のまま抽出してください。
         ・【重複防止ルール】
           元資料上で「現況」と「引渡状態」が別情報の場合のみそれぞれ抽出してください（例: 現況: 「営業中」、引渡状態: 「スケルトン」）。
           同一意味・同一値（例: 両方とも「居抜き」または「スケルトン」）の場合は、handoverStatus（引渡状態）側に設定し、無意味な重複表示を避けてください。

      7. property.handoverTiming（入居可能時期・引渡時期）:
         ・【原文一致の徹底】「即日」「即時」「2025年4月」「相談」「成約後〇ヶ月」など元資料の記載そのままを抽出してください。
         ・【禁止】条件表に「即日」と記載されている場合、「相談」へ勝手に変更しては絶対にいけません！
         ・条件表に記載がない場合は、推測で「相談」などと補完せず、必ず null または空文字（""）としてください。

      8. area（面積）:
         ・上記の面積抽出ルールに従い、合計坪数と合計平米数を設定してください。
         ・㎡・坪の両方が資料に記載されている場合は、原資料の数値を最優先。勝手な再計算や丸めを行わないこと。

      9. rent（賃料・坪単価）:
         ・【最重要】物件概要書・賃貸条件表に賃料が明記されている場合は、絶対に省略してはいけません！「情報を減らす」という理由で賃料を抜くことは厳禁です。
         ・amount: 月額賃料の金額を数値型で設定（例: 1120000）。「〇〇万円」表記は円単位の数値に換算（例: 「112万円」→ 1120000）。
         ・taxIncluded: 「税込」なら true、「税別」なら false、不明なら null。
         ・tsuboPrice（坪単価）:
           ① 元資料に坪単価が明記されている場合は、原資料の数値を最優先。
           ② 元資料に坪単価の記載がない場合のみ、月額賃料 ÷ 【合計坪数】 で計算。
           ③ 賃料の対象範囲を確定できない場合は、勝手に計算せず null としてください。
         ・【重要】条件表に賃料の記載がない場合のみ推測せず null としてください。

      10. commonFee（共益費・管理費）:
          ・amount: 金額を数値で設定。「なし」「賃料に含む」「込」の場合は 0 に設定（JS-Aでは「共益費 なし」として明示表示されます）。
          ・taxIncluded: 税込なら true、税別なら false。
          ・tsuboPrice: 坪単価の数値。
          ・条件表に記載がない場合のみ null としてください。

      11. deposit（保証金・敷金）:
          ・【原文一致】「賃料10ヶ月」「10ヶ月」「賃料の6ヶ月分」「1,500,000円」「敷金 3ヶ月」等の元資料の表現そのままを抽出してください。条件表に記載がない場合は空文字（""）または null とし、推測で「ご相談」などと補完しないこと。

      12. keyMoney（礼金）:
          ・【原文一致】「賃料1ヶ月」「1ヶ月」「なし」「0ヶ月」「2ヶ月」等、元資料の表現そのままを抽出してください。「なし」と書かれている場合は必ず「なし」と抽出すること。条件表にない場合は空文字（""）または null。

      13. depreciation（償却）:
          ・【原文一致】「解約時2ヶ月」「2ヶ月」「敷金の20%」「なし」等の元資料の記述そのままを抽出してください。
          ・【禁止】「解約時2ヶ月」と記載されている場合、「20%」等へ換算・推測しては絶対にいけません！条件表にない場合は空文字（""）または null。

      14. contract（契約形態および契約期間）:
          ・【原文一致】「定期建物賃貸借契約5年」「定期借家契約5年」「普通借家契約2年」等、元資料の表記そのままを抽出してください。
          ・【禁止】条件表に「定期建物賃貸借契約5年」と記載されている場合、「普通借家契約」へ変更したり、契約期間を勝手に省略してはいけません！条件表にない場合は空文字（""）または null。

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
      【画像・図面の分類ルール（visualElements）】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      各ページのタイトル・テキスト文脈に基づき、正確に矩形境界（ymin, xmin, ymax, xmax：0〜1000の正規化座標）とfileIndex（0始まりのページ番号）を返却してください：
      
      各素材は以下のカテゴリで分類してください：
      ・PHOTO_EXTERIOR ＝ 建物外観、店舗ファサード、建物全景 (category: 'PHOTO', subCategory: '外観')
      ・PHOTO_EXTERIOR_RENDER ＝ 外観パース、完成予想図 (category: 'PHOTO', subCategory: '外観パース')
      ・PHOTO_ENTRANCE ＝ 入口、エントランス、共用部入口 (category: 'PHOTO', subCategory: 'エントランス')
      ・PHOTO_INTERIOR ＝ 室内、店舗内、内観パース (category: 'PHOTO', subCategory: '内観')
      ・PHOTO_SURROUNDING ＝ 前面道路、街並み、眺望 (category: 'PHOTO', subCategory: '周辺')
      ・PLAN ＝ 平面図、間取図、区画図 (category: 'PLAN', subCategory: '平面図')
      ・SITE_PLAN ＝ 配置図 (category: 'PLAN', subCategory: '配置図')
      ・ELEVATION ＝ 立面図 (category: 'PLAN', subCategory: '立面図')
      ・SECTION ＝ 断面図 (category: 'PLAN', subCategory: '断面図')
      ・ACCESS ＝ 案内図、地図、アクセスマップ (category: 'ACCESS', subCategory: '現地案内図')
      ・OTHER ＝ その他参考資料 (category: 'OTHER', subCategory: 'その他')
      ・LOGO ＝ 会社ロゴ、社章、会社名画像 (category: 'OTHER', subCategory: '会社ロゴ')

      【重要ルール】
      ・会社ロゴ、社章、会社名、広告バナー、仲介会社情報をPHOTOとして扱っては絶対にいけません。
      ・メイン画像優先度: 1. 実写の建物外観 → 2. 外観パース → 3. 店舗ファサード → 4. エントランス → 5. 内観。「外観」「外観パース」が存在する場合、エントランスや内観をメイン画像にしないでください。
      ・JS-Aでは平面図（PLAN）を原則1点掲載します。配置図、立面図、断面図は資料として保持しますが、JS-Aのメイン構成には原則使用しません。
      
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      【最重要：複数フロア・複数区画・複数平面図の配列抽出ルール】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      1物件に複数の募集フロア・複数区画・複数平面図が存在することを前提として設計してください。
      「1物件＝1区画＝1平面図」として処理してはいけません！
      
      例:
        1F 20.00坪
        2F 30.00坪
        元資料内に1F平面図、2F平面図がそれぞれ存在する場合、
        必ず 1F 20.00坪 → 1F平面図（plan_1F）、2F 30.00坪 → 2F平面図（plan_2F）として紐付けてください。
        片方の平面図のみを使用したり、同じ平面図を両フロアへ使い回すことは厳禁です！

      1. units（募集区画配列）:
         ・必ず配列（units: [...]）で抽出してください。
         ・同一フロアに複数区画がある場合（例: 1F A区画 10坪、1F B区画 15坪）:
           unitId: "1F-A", unitId: "1F-B" のように個別に分離してください（勝手に合算しない）。
         ・各区画のプロパティ:
           - unitId: "1F", "2F", "1F-A", "1F-B" 等の区画識別子
           - floor: "1F", "2F", "B1F" 等
           - unitName: "A区画", "101号室", "南側" 等
           - areaSqm / areaTsubo: 当該区画の面積（数値）
           - rent: 当該区画の月額賃料（数値または円表記）
           - rentTsuboPrice: 当該区画の坪単価
           - commonFee: 当該区画の共益費
           - commonFeeTsuboPrice: 当該区画の共益費坪単価
           - deposit: 保証金・敷金
           - keyMoney: 礼金
           - contractType: 契約期間・形態
           - handoverCondition: 引渡状態（スケルトン、居抜き等）
           - handoverDate: 引渡時期（即時、相談等）
           - planAssetId: 紐付く平面図の assetId（例: "plan_1F"）
           - status: "available"
           - linkStatus: "linked" または "needs_review"

      2. plans（平面図配列）:
         ・資料内に存在するすべての平面図を配列（plans: [...]）で抽出してください。
         ・各平面図のプロパティ:
           - assetId: "plan_1F", "plan_2F", "plan_1F_A" などの一意識別子
           - floor: "1F", "2F" など
           - unitName: "A区画" など
           - areaTsubo / areaSqm: 平面図内に記載されている面積数値
           - sourcePage: 元資料のページ番号（1始まり）
           - caption: キャプション（例: "1階 区画平面図"）
           - matchedUnitId: 紐付いた募集区画の unitId（例: "1F"）
           - confidence: "high" | "medium" | "low"（判定確信度）

      3. 平面図と区画の自動紐付け優先順位:
         1. 平面図内に明記された階数（1F、2F、B1Fなど）
         2. 平面図内に明記された区画番号・号室（A区画、101など）
         3. 平面図内に明記された面積（20.00坪、66.12㎡など）
         4. 募集条件表に記載された階数と面積
         5. 元PDFのページタイトル（例: 「1F平面図」）
         6. 元PDFのページ順
         ※ 上記で確定できない曖昧な場合は、勝手に確定させず confidence: "low", matchedUnitId: null としてください。

      4. leasePatterns（一括貸し・分割パターン）:
         ・元資料に一括貸し（例: 1F・2F一括 50坪）の記載がある場合、個別の区画（1F, 2F）を units に保持した上で、
           leasePatterns 配列に patternId: "ALL", name: "1F・2F一括", unitIds: ["1F", "2F"], totalTsubo: 50.00 を抽出してください。
         ・一括貸しの記載がないのに勝手に合算区画を作ってはなりません。

      【絶対に抽出・混入させてはならない禁止対象】
      ・「募集条件の表」「賃料・敷金の文字表」「物件概要のテキスト領域」は絶対に PHOTO や PLAN として抽出しないこと！
      ・「会社情報」「仲介会社ロゴ」「ロゴマーク」「社章」「会社名だけの画像」「広告バナー」は PHOTO や PLAN として抽出しないこと（category: 'OTHER', subCategory: '会社ロゴ'）！
      ・文字や表を写真と誤認してはなりません。純粋な図面・写真・地図のみを切り出してください。
      ・visualElements は「代表3件」ではなく、資料中で判別できる個別の図面・写真・地図・ロゴをすべて列挙してください。
      ・分類に確信が低くても視覚素材自体を無視せず、confidence: 'low' として返してください。ただしロゴ等をPHOTOに昇格させないでください。
      `
    });

    const schema = {
      type: Type.OBJECT,

      properties: {
        units: {
          type: Type.ARRAY,

          items: {
            type: Type.OBJECT,

            properties: {
              unitId: {
                type: Type.STRING
              },

              floor: {
                type: Type.STRING
              },

              unitName: {
                type: Type.STRING
              },

              areaSqm: {
                type: Type.NUMBER,
                nullable: true
              },

              areaTsubo: {
                type: Type.NUMBER,
                nullable: true
              },

              rent: {
                type: Type.NUMBER,
                nullable: true
              },

              rentTsuboPrice: {
                type: Type.NUMBER,
                nullable: true
              },

              commonFee: {
                type: Type.NUMBER,
                nullable: true
              },

              commonFeeTsuboPrice: {
                type: Type.NUMBER,
                nullable: true
              },

              deposit: {
                type: Type.STRING
              },

              keyMoney: {
                type: Type.STRING
              },

              contractType: {
                type: Type.STRING
              },

              handoverCondition: {
                type: Type.STRING
              },

              handoverDate: {
                type: Type.STRING
              },

              planAssetId: {
                type: Type.STRING
              },

              status: {
                type: Type.STRING
              },

              linkStatus: {
                type: Type.STRING
              },
            }
          }
        },

        plans: {
          type: Type.ARRAY,

          items: {
            type: Type.OBJECT,

            properties: {
              assetId: {
                type: Type.STRING
              },

              floor: {
                type: Type.STRING
              },

              unitName: {
                type: Type.STRING
              },

              areaTsubo: {
                type: Type.NUMBER,
                nullable: true
              },

              areaSqm: {
                type: Type.NUMBER,
                nullable: true
              },

              sourcePage: {
                type: Type.NUMBER
              },

              caption: {
                type: Type.STRING
              },

              matchedUnitId: {
                type: Type.STRING
              },

              confidence: {
                type: Type.STRING
              },
            }
          }
        },

        leasePatterns: {
          type: Type.ARRAY,

          items: {
            type: Type.OBJECT,

            properties: {
              patternId: {
                type: Type.STRING
              },

              name: {
                type: Type.STRING
              },

              unitIds: {
                type: Type.ARRAY,

                items: {
                  type: Type.STRING
                }
              },

              totalTsubo: {
                type: Type.NUMBER,
                nullable: true
              },

              totalSqm: {
                type: Type.NUMBER,
                nullable: true
              },

              totalRent: {
                type: Type.NUMBER,
                nullable: true
              },

              totalCommonFee: {
                type: Type.NUMBER,
                nullable: true
              },
            }
          }
        },

        property: {
          type: Type.OBJECT,

          properties: {
            name: {
              type: Type.STRING
            },

            address: {
              type: Type.STRING
            },

            access: {
              type: Type.STRING
            },

            floor: {
              type: Type.STRING
            },

            room: {
              type: Type.STRING
            },

            usage: {
              type: Type.STRING
            },

            currentStatus: {
              type: Type.STRING
            },

            handoverTiming: {
              type: Type.STRING
            },

            handoverStatus: {
              type: Type.STRING
            },
          }
        },

        area: {
          type: Type.OBJECT,

          properties: {
            sqm: {
              type: Type.NUMBER,
              nullable: true
            },

            tsubo: {
              type: Type.NUMBER,
              nullable: true
            },

            breakdownText: {
              type: Type.STRING
            },
          }
        },

        detailItems: {
          type: Type.ARRAY,

          items: {
            type: Type.OBJECT,

            properties: {
              label: {
                type: Type.STRING
              },

              value: {
                type: Type.STRING
              },
            }
          }
        },

        rent: {
          type: Type.OBJECT,

          properties: {
            amount: {
              type: Type.NUMBER,
              nullable: true
            },

            taxIncluded: {
              type: Type.BOOLEAN,
              nullable: true
            },

            tsuboPrice: {
              type: Type.NUMBER,
              nullable: true
            },
          }
        },

        commonFee: {
          type: Type.OBJECT,

          properties: {
            amount: {
              type: Type.NUMBER,
              nullable: true
            },

            taxIncluded: {
              type: Type.BOOLEAN,
              nullable: true
            },

            tsuboPrice: {
              type: Type.NUMBER,
              nullable: true
            },
          }
        },

        deposit: {
          type: Type.STRING
        },

        keyMoney: {
          type: Type.STRING
        },

        depreciation: {
          type: Type.STRING
        },

        contract: {
          type: Type.STRING
        },

        handover: {
          type: Type.STRING
        },

        building: {
          type: Type.OBJECT,

          properties: {
            structure: {
              type: Type.STRING
            },

            scale: {
              type: Type.STRING
            },

            builtYearMonth: {
              type: Type.STRING
            },

            siteAreaSqm: {
              type: Type.NUMBER,
              nullable: true
            },

            siteAreaTsubo: {
              type: Type.NUMBER,
              nullable: true
            },

            totalFloorAreaSqm: {
              type: Type.NUMBER,
              nullable: true
            },

            totalFloorAreaTsubo: {
              type: Type.NUMBER,
              nullable: true
            },

            currentUsage: {
              type: Type.STRING
            },

            constructionDates: {
              type: Type.STRING
            },

            subTitle: {
              type: Type.STRING
            },

            caption: {
              type: Type.STRING
            },
          }
        },

        equipment: {
          type: Type.ARRAY,

          items: {
            type: Type.STRING
          }
        },

        conditions: {
          type: Type.ARRAY,

          items: {
            type: Type.STRING
          }
        },

        tenants: {
          type: Type.ARRAY,

          items: {
            type: Type.OBJECT,

            properties: {
              floor: {
                type: Type.STRING
              },

              usage: {
                type: Type.STRING
              },

              tenantName: {
                type: Type.STRING
              },
            }
          }
        },

        contact: {
          type: Type.OBJECT,

          properties: {
            company: {
              type: Type.STRING
            },

            address: {
              type: Type.STRING
            },

            tel: {
              type: Type.STRING
            },

            fax: {
              type: Type.STRING
            },

            personName: {
              type: Type.STRING
            },

            licenseNumber: {
              type: Type.STRING
            },

            transactionType: {
              type: Type.STRING
            },
          }
        },

        visualElements: {
          type: Type.ARRAY,

          items: {
            type: Type.OBJECT,

            properties: {
              box2d: {
                type: Type.ARRAY,

                items: {
                  type: Type.NUMBER
                }
              },

              fileIndex: {
                type: Type.NUMBER
              },

              category: {
                type: Type.STRING
              },

              subCategory: {
                type: Type.STRING
              },

              label: {
                type: Type.STRING
              },

              confidence: {
                type: Type.STRING
              },
            }
          }
        },
      }
    };

    const executionPromise =
      (async () => {
        console.log(
          `[API /api/extract] Starting Gemini API call (primary: ${PRIMARY_MODEL}, fallbacks: ${FALLBACK_MODELS.join(', ')}) for doc: ${documentHash.slice(0, 8)}`
        );

        const rawResult =
          await callGeminiSinglePass(
            { parts },
            schema
          );

        const sanitizeFieldValue =
          (
            str: string,
            fieldKey?: string
          ): string => {
            let cleaned =
              str.trim();

            if (!cleaned) {
              return '';
            }

            cleaned =
              cleaned
                .replace(
                  /[（(]\s*※?\s*(?:資料から推定|資料より推測|要確認|推測|推定|未確認|未記載|記載なし|用途未記載)[^)）]*[)）]/g,
                  ''
                )
                .replace(
                  /※\s*(?:資料から推定|資料より推測|要確認|推測|推定|未確認|未記載|記載なし|用途未記載)/g,
                  ''
                )
                .trim();

            const lower =
              cleaned.toLowerCase();

            const isNegativeAllowed =
              fieldKey === 'keyMoney' ||
              fieldKey === 'depreciation' ||
              fieldKey === 'deposit';

            if (
              cleaned === '' ||
              cleaned === '要確認' ||
              cleaned === '記載なし' ||
              cleaned === '未記載' ||
              cleaned === '未入力' ||
              (
                !isNegativeAllowed &&
                cleaned === 'なし'
              ) ||
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

        const cleanExtractedData =
          (
            obj: any,
            parentKey?: string
          ): any => {
            if (
              obj === null ||
              obj === undefined
            ) {
              return obj;
            }

            if (
              typeof obj ===
              'string'
            ) {
              return sanitizeFieldValue(
                obj,
                parentKey
              );
            }

            if (
              Array.isArray(
                obj
              )
            ) {
              return obj.map(
                item =>
                  cleanExtractedData(
                    item,
                    parentKey
                  )
              );
            }

            if (
              typeof obj ===
              'object'
            ) {
              const cleaned:
                any = {};

              for (
                const key of
                Object.keys(obj)
              ) {
                cleaned[key] =
                  cleanExtractedData(
                    obj[key],
                    key
                  );
              }

              return cleaned;
            }

            return obj;
          };

        const result =
          cleanExtractedData(
            rawResult
          );

        if (result.property) {
          const current =
            (
              result.property.currentStatus ||
              ''
            )
              .trim()
              .toLowerCase();

          const handover =
            (
              result.property.handoverStatus ||
              ''
            )
              .trim()
              .toLowerCase();

          if (
            current &&
            handover &&
            (
              current === handover ||
              current.includes(
                handover
              ) ||
              handover.includes(
                current
              )
            )
          ) {
            result.property.currentStatus =
              '';
          }
        }

        if (
          result.rent &&
          result.rent.amount &&
          result.area &&
          result.area.tsubo &&
          result.area.tsubo > 0
        ) {
          const calculatedTsuboPrice =
            Math.round(
              result.rent.amount /
              result.area.tsubo
            );

          if (
            !result.rent.tsuboPrice
          ) {
            result.rent.tsuboPrice =
              calculatedTsuboPrice;
          }
        }

        if (
          !Array.isArray(
            result.plans
          )
        ) {
          result.plans =
            [];
        }

        if (
          result.plans.length === 0 &&
          Array.isArray(
            result.visualElements
          )
        ) {
          const planVisuals =
            result.visualElements.filter(
              (ve: any) =>
                ve.category ===
                  'PLAN' ||
                (
                  ve.subCategory &&
                  ve.subCategory.includes(
                    '平面図'
                  )
                )
            );

          planVisuals.forEach(
            (
              pv: any,
              pIdx: number
            ) => {
              const rawLabel =
                pv.label ||
                '';

              const floorMatch =
                rawLabel.match(
                  /(?:B\d+|\d+)[F階]/i
                );

              const detectedFloor =
                floorMatch
                  ? floorMatch[0]
                      .toUpperCase()
                      .replace(
                        '階',
                        'F'
                      )
                  : (
                      pIdx === 0
                        ? '1F'
                        : `${pIdx + 1}F`
                    );

              const assetId =
                `plan_${detectedFloor.replace(/[^a-zA-Z0-9]/g, '_')}_${pIdx + 1}`;

              result.plans.push({
                assetId,

                floor:
                  detectedFloor,

                unitName:
                  rawLabel.includes(
                    '区画'
                  )
                    ? rawLabel
                    : '',

                areaTsubo:
                  null,

                areaSqm:
                  null,

                sourcePage:
                  typeof pv.fileIndex ===
                    'number'
                    ? pv.fileIndex + 1
                    : 1,

                caption:
                  rawLabel ||
                  `${detectedFloor} 平面図`,

                matchedUnitId:
                  null,

                confidence:
                  'medium',
              });
            }
          );
        }

        result.plans.forEach(
          (
            p: any,
            idx: number
          ) => {
            if (
              !p.assetId
            ) {
              const fl =
                (
                  p.floor ||
                  `${idx + 1}F`
                )
                  .replace(
                    /[^a-zA-Z0-9]/g,
                    '_'
                  );

              p.assetId =
                `plan_${fl}_${idx + 1}`;
            }
          }
        );

        if (
          !Array.isArray(
            result.units
          ) ||
          result.units.length === 0
        ) {
          result.units = [
            {
              unitId:
                (
                  result.property?.floor ||
                  result.property?.room ||
                  '1F'
                )
                  .trim() ||
                '1F',

              floor:
                (
                  result.property?.floor ||
                  '1F'
                )
                  .trim() ||
                '1F',

              unitName:
                (
                  result.property?.room ||
                  ''
                )
                  .trim(),

              areaSqm:
                result.area?.sqm ??
                null,

              areaTsubo:
                result.area?.tsubo ??
                null,

              rent:
                result.rent?.amount ??
                null,

              rentTsuboPrice:
                result.rent?.tsuboPrice ??
                null,

              commonFee:
                result.commonFee?.amount ??
                null,

              commonFeeTsuboPrice:
                result.commonFee?.tsuboPrice ??
                null,

              deposit:
                result.deposit ||
                '',

              keyMoney:
                result.keyMoney ||
                '',

              contractType:
                result.contract ||
                '',

              handoverCondition:
                result.property
                  ?.handoverStatus ||
                '',

              handoverDate:
                result.property
                  ?.handoverTiming ||
                '',

              planAssetId:
                result.plans[0]
                  ?.assetId ||
                null,

              status:
                'available',

              linkStatus:
                result.plans.length > 0
                  ? 'linked'
                  : 'no_plan',
            }
          ];

        } else {
          result.units.forEach(
            (
              unit: any,
              uIdx: number
            ) => {
              if (
                !unit.unitId
              ) {
                unit.unitId =
                  `${
                    unit.floor ||
                    `${uIdx + 1}F`
                  }${
                    unit.unitName
                      ? `-${unit.unitName}`
                      : ''
                  }`;
              }

              if (
                !unit.floor
              ) {
                unit.floor =
                  `${uIdx + 1}F`;
              }

              unit.status =
                unit.status ||
                'available';

              if (
                (
                  !unit.rentTsuboPrice ||
                  unit.rentTsuboPrice === 0
                ) &&
                unit.rent &&
                unit.areaTsubo &&
                unit.areaTsubo > 0
              ) {
                const rVal =
                  typeof unit.rent ===
                    'number'
                    ? unit.rent
                    : parseFloat(
                        String(
                          unit.rent
                        ).replace(
                          /[^0-9.]/g,
                          ''
                        )
                      );

                if (
                  !isNaN(
                    rVal
                  ) &&
                  rVal > 0
                ) {
                  unit.rentTsuboPrice =
                    Math.round(
                      rVal /
                      unit.areaTsubo
                    );
                }
              }
            }
          );
        }

        const normalizeFloorStr =
          (
            f: string
          ) =>
            (
              f ||
              ''
            )
              .toUpperCase()
              .replace(
                /階/g,
                'F'
              )
              .replace(
                /地下/g,
                'B'
              )
              .trim();

        const usedPlanIds =
          new Set<string>();

        result.units.forEach(
          (
            unit: any
          ) => {
            const uFloorNorm =
              normalizeFloorStr(
                unit.floor
              );

            const uName =
              (
                unit.unitName ||
                ''
              )
                .toLowerCase()
                .trim();

            const uTsubo =
              typeof unit.areaTsubo ===
                'number'
                ? unit.areaTsubo
                : null;

            const uSqm =
              typeof unit.areaSqm ===
                'number'
                ? unit.areaSqm
                : null;

            let bestPlan:
              any = null;

            let highestScore =
              0;

            let isAmbiguous =
              false;

            result.plans.forEach(
              (
                plan: any
              ) => {
                let score =
                  0;

                const pFloorNorm =
                  normalizeFloorStr(
                    plan.floor
                  );

                const pUnitName =
                  (
                    plan.unitName ||
                    ''
                  )
                    .toLowerCase()
                    .trim();

                const pCaption =
                  (
                    plan.caption ||
                    ''
                  )
                    .toLowerCase()
                    .trim();

                if (
                  uFloorNorm &&
                  pFloorNorm &&
                  (
                    uFloorNorm ===
                      pFloorNorm ||
                    pCaption.includes(
                      uFloorNorm
                        .toLowerCase()
                    )
                  )
                ) {
                  score +=
                    100;
                }

                if (
                  uName &&
                  (
                    pUnitName ===
                      uName ||
                    pCaption.includes(
                      uName
                    )
                  )
                ) {
                  score +=
                    80;
                }

                if (
                  uTsubo &&
                  plan.areaTsubo
                ) {
                  const diffRatio =
                    Math.abs(
                      uTsubo -
                      plan.areaTsubo
                    ) /
                    uTsubo;

                  if (
                    diffRatio <
                    0.02
                  ) {
                    score +=
                      60;

                  } else if (
                    diffRatio <
                    0.06
                  ) {
                    score +=
                      30;
                  }
                }

                if (
                  uSqm &&
                  plan.areaSqm
                ) {
                  const diffRatio =
                    Math.abs(
                      uSqm -
                      plan.areaSqm
                    ) /
                    uSqm;

                  if (
                    diffRatio <
                    0.02
                  ) {
                    score +=
                      60;

                  } else if (
                    diffRatio <
                    0.06
                  ) {
                    score +=
                      30;
                  }
                }

                if (
                  unit.planAssetId &&
                  unit.planAssetId ===
                    plan.assetId
                ) {
                  score +=
                    40;
                }

                if (
                  score >
                  highestScore
                ) {
                  highestScore =
                    score;

                  bestPlan =
                    plan;

                  isAmbiguous =
                    false;

                } else if (
                  score > 0 &&
                  score ===
                    highestScore
                ) {
                  isAmbiguous =
                    true;
                }
              }
            );

            if (
              bestPlan &&
              highestScore >=
                100 &&
              !isAmbiguous &&
              !usedPlanIds.has(
                bestPlan.assetId
              )
            ) {
              unit.planAssetId =
                bestPlan.assetId;

              bestPlan.matchedUnitId =
                unit.unitId;

              bestPlan.confidence =
                highestScore >=
                  160
                  ? 'high'
                  : 'medium';

              unit.linkStatus =
                'linked';

              usedPlanIds.add(
                bestPlan.assetId
              );

            } else if (
              bestPlan &&
              isAmbiguous
            ) {
              unit.planAssetId =
                bestPlan.assetId;

              bestPlan.matchedUnitId =
                unit.unitId;

              bestPlan.confidence =
                'low';

              unit.linkStatus =
                'needs_review';

            } else if (
              result.plans.length ===
                1 &&
              result.units.length ===
                1
            ) {
              unit.planAssetId =
                result.plans[0]
                  .assetId;

              result.plans[0]
                .matchedUnitId =
                unit.unitId;

              result.plans[0]
                .confidence =
                'high';

              unit.linkStatus =
                'linked';

              usedPlanIds.add(
                result.plans[0]
                  .assetId
              );

            } else {
              unit.linkStatus =
                result.plans.length > 0
                  ? 'needs_review'
                  : 'no_plan';
            }
          }
        );

        if (
          result.units.length >
          1
        ) {
          let totalSqm =
            0;

          let totalTsubo =
            0;

          const breakdownParts:
            string[] = [];

          const floorList:
            string[] = [];

          result.units.forEach(
            (
              u: any
            ) => {
              if (
                typeof u.areaSqm ===
                  'number' &&
                !isNaN(
                  u.areaSqm
                )
              ) {
                totalSqm +=
                  u.areaSqm;
              }

              if (
                typeof u.areaTsubo ===
                  'number' &&
                !isNaN(
                  u.areaTsubo
                )
              ) {
                totalTsubo +=
                  u.areaTsubo;
              }

              const uLabel =
                u.floor
                  ? (
                      u.unitName
                        ? `${u.floor} ${u.unitName}`
                        : u.floor
                    )
                  : u.unitId;

              if (
                u.areaTsubo
              ) {
                breakdownParts.push(
                  `${uLabel}：${
                    u.areaSqm
                      ? `${u.areaSqm.toFixed(2)}㎡（`
                      : ''
                  }${
                    u.areaTsubo.toFixed(2)
                  }坪${
                    u.areaSqm
                      ? '）'
                      : ''
                  }`
                );
              }

              if (
                u.floor &&
                !floorList.includes(
                  u.floor
                )
              ) {
                floorList.push(
                  u.floor
                );
              }
            }
          );

          if (
            totalTsubo >
            0
          ) {
            result.area =
              result.area ||
              {};

            result.area.tsubo =
              Math.round(
                totalTsubo *
                100
              ) /
              100;

            if (
              totalSqm >
              0
            ) {
              result.area.sqm =
                Math.round(
                  totalSqm *
                  100
                ) /
                100;
            }

            result.area.breakdownText =
              breakdownParts.join(
                ' / '
              );
          }

          if (
            floorList.length >
              0 &&
            result.property
          ) {
            result.property.floor =
              floorList.join(
                '・'
              );
          }
        }

        if (
          !Array.isArray(
            result.leasePatterns
          )
        ) {
          result.leasePatterns =
            [];
        }

        extractionCache.set(
          documentHash,
          {
            result,
            timestamp:
              Date.now(),
          }
        );

        return result;
      })();

    inFlightRequests.set(
      documentHash,
      executionPromise
    );

    try {
      const finalResult =
        await executionPromise;

      return NextResponse.json({
        success: true,
        data:
          finalResult,
        ...finalResult
      });

    } finally {
      inFlightRequests.delete(
        documentHash
      );
    }

  } catch (
    error: any
  ) {
    const rawStatus =
      error?.status ||
      error?.statusCode;

    const numericStatus =
      typeof rawStatus ===
        'number'
        ? rawStatus
        : (
            error
              ?.isDailyQuota
              ? 429
              : 500
          );

    const displayStatus =
      error?.httpStatus ||
      rawStatus ||
      numericStatus;

    const errorMessage =
      error?.message ||
      "AI解析処理中にエラーが発生しました。時間をおいて再試行してください。";

    console.error(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );

    console.error(
      "[API /api/extract] Execution handler caught error:"
    );

    console.error(
      `[API /api/extract] HTTP Response Status: ${numericStatus} (Reported: ${displayStatus})`
    );

    console.error(
      `[API /api/extract] Error Message: ${errorMessage}`
    );

    if (
      error?.stack
    ) {
      console.error(
        `[API /api/extract] Stack:`,
        error.stack
      );
    }

    console.error(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );

    return NextResponse.json(
      {
        success: false,

        error:
          errorMessage,

        isDailyQuota:
          !!error?.isDailyQuota,

        httpStatus:
          displayStatus,
      },
      {
        status:
          numericStatus
      }
    );
  }
}
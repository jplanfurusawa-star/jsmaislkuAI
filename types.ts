export type ImageCategory = 'PHOTO' | 'PLAN' | 'ACCESS' | 'OTHER';

export interface CoverImageSettings {
  imageId?: string;
  imageUrl?: string;
  objectPositionX?: number; // 0 - 100 %, default 50
  objectPositionY?: number; // 0 - 100 %, default 50
  scale?: number;           // 1.0 - 2.0, default 1.0
  brightness?: number;      // % default 100
  contrast?: number;        // % default 105
  grayscale?: number;       // % default 100
}

export type ExtractedImage = {
  id: string;
  dataUrl: string;
  category: ImageCategory;
  subCategory: string; // '外観' | '外観パース' | '内観' | '内観パース' | 'エントランス' | '共用部' | '周辺' | '平面図' | '区画図' | '配置図' | 'フロアマップ' | '現地案内図' | '周辺地図' | '会社ロゴ' | '募集条件・文字領域' | 'その他' | '使用しない'
  label: string;
  width?: number;
  height?: number;
  confidence?: 'high' | 'medium' | 'low';
  sourcePage?: number;
  pageTitle?: string;
  reason?: string; // 分類理由（例: ページ2「■平面図」の最大画像より抽出）
  assignedSlot?: 'main' | 'floorPlan' | 'map' | 'photo' | 'none'; // 使用スロット
  isEmbedded?: boolean; // PDF内部の埋め込み画像
  isExcludedFromPhoto?: boolean; // PHOTOスライドへの配置除外（ロゴ、地図、文字領域等）
  pageOccupancy?: number; // ページ内占有率 (0.0 - 1.0)
  notes?: string;
  suggestedFilename?: string;
};

export type TenantInfo = {
  floor: string;
  usage: string;
  tenantName: string;
};

export type FieldReviewState = 'confirmed' | 'needs_review' | 'not_in_source';

export interface PropertyUnit {
  unitId: string; // 例: "1F", "2F", "1F-A", "1F-B"
  floor: string; // 例: "1F", "2F", "B1F"
  unitName?: string; // 例: "A区画", "101号室", "南側区画"
  areaSqm?: number | null; // 面積（平米）
  areaTsubo?: number | null; // 面積（坪）
  rent?: number | string | null; // 賃料（円または数値文字列）
  rentTsuboPrice?: number | null; // 坪単価
  commonFee?: number | string | null; // 共益費・管理費
  commonFeeTsuboPrice?: number | null; // 共益費坪単価
  deposit?: string | null; // 敷金・保証金
  keyMoney?: string | null; // 礼金
  contractType?: string | null; // 契約期間・形態
  handoverCondition?: string | null; // 引渡状態（スケルトン、居抜き等）
  handoverDate?: string | null; // 引渡時期・入居時期
  planAssetId?: string | null; // 紐付く平面図の assetId（例: "plan_1F"）互換用
  primaryPlanAssetId?: string | null; // 主平面図 assetId
  relatedPlanAssetIds?: string[]; // 関連平面図 assetId配列
  status?: string; // "available" | "occupied" | "contracted"
  isOutputTarget?: boolean; // 出力対象フラグ
  floorGroup?: string;
  linkStatus?: 'linked' | 'needs_review' | 'no_plan'; // 紐付け状態
}

export interface FloorPlanAsset {
  assetId: string; // 例: "plan_1F", "plan_2F", "plan_1F_A"
  floor: string; // 例: "1F", "2F"
  unitName?: string; // 例: "A区画"
  variant?: '2分割' | '3分割' | 'standard' | string; // 分割案
  areaTsubo?: number | null; // 平面図内記載の坪数
  areaSqm?: number | null; // 平面図内記載の平米数
  sourcePage?: number; // 元PDFのページ番号（1始まり）
  imagePath?: string; // 画像URL / DataURL
  imageSource?: 'embedded_image' | 'rendered_pdf_page' | 'classified_image' | string;
  caption?: string; // キャプション
  matchedUnitId?: string | null; // 紐付く募集区画の unitId
  appliesToUnitIds?: string[]; // 適用される区画ID一覧
  confidence?: 'high' | 'medium' | 'low' | 'manual'; // 紐付けの確信度
  isOutputTarget?: boolean; // 出力対象フラグ
}

export interface LeasePattern {
  patternId: string; // 例: "ALL", "1F_2F_SET", "1F_ONLY"
  name?: string; // 例: "1F・2F一括", "1F単独"
  unitIds: string[]; // ["1F", "2F"]
  totalTsubo?: number | null;
  totalSqm?: number | null;
  totalRent?: number | string | null;
  totalCommonFee?: number | string | null;
}

export type PropertyDetailItem = {
  label: string;
  value: string;
  source?: string;
  confirmed?: boolean;
};

export type PropertyData = {
  // 複数フロア・複数区画・複数平面図の配列管理（最重要）
  units?: PropertyUnit[];
  plans?: FloorPlanAsset[];
  leasePatterns?: LeasePattern[];

  property: {
    name: string;
    address: string;
    access: string;
    floor: string;
    room: string;
    usage: string;
    currentStatus: string;
    handoverTiming: string;
    handoverStatus: string;
  };
  area: {
    sqm: number | null;
    tsubo: number | null;
    breakdownText?: string;
  };
  rent: {
    amount: number | null;
    taxIncluded: boolean | null;
    tsuboPrice: number | null;
  };
  commonFee: {
    amount: number | null;
    taxIncluded: boolean | null;
    tsuboPrice: number | null;
  };
  deposit: string;
  keyMoney: string;
  depreciation: string;
  contract: string;
  handover: string;
  building: {
    structure: string;
    scale: string;
    builtYearMonth: string;
    siteAreaSqm?: number | null;
    siteAreaTsubo?: number | null;
    totalFloorAreaSqm?: number | null;
    totalFloorAreaTsubo?: number | null;
    currentUsage?: string;
    constructionDates?: string;
    subTitle?: string;
    caption?: string;
  };
  equipment: string[];
  conditions: string[];
  tenants?: TenantInfo[];
  detailItems?: PropertyDetailItem[];
  fieldStatus?: {
    [fieldKey: string]: FieldReviewState;
  };
  maps?: {
    wideMapUrl?: string;
    detailMapUrl?: string;
    wideZoom?: number;
    detailZoom?: number;
    scale?: string;
    wideMapStatus?: string;
    detailMapStatus?: string;
    isConfirmed?: boolean;
    method?: string;
    googleMapsUrl?: string;
  };
  images: {
    main?: string;
    floorPlan?: string;
    map?: string;
    detailMap?: string;
    subPhotos: string[];
    allExtracted?: string[];
    classifiedList?: ExtractedImage[];
  };
  contact: {
    companyName: string;
    license: string;
    phone: string;
    fax: string;
    address: string;
    personInCharge?: string;
    feeDistribution?: string;
    transactionType?: string;
  };
  catchcopy?: {
    main: string;
    sub: string;
  };
  customTexts?: {
    [key: string]: string;
  };
};

export type AppFormat = 'JS-A' | 'JS-B' | 'JS-C' | 'JS-D' | 'CUSTOM' | 'NEW_FORMAT';

export type AppState = {
  step: 1 | 2 | 3 | 4 | 5;
  format: AppFormat;
  data: PropertyData | null;
  sourceFiles: File[];
  extractedImages: ExtractedImage[];
  isGenerating: boolean;
  coverSettings?: CoverImageSettings;
};

export const defaultPropertyData: PropertyData = {
  units: [],
  plans: [],
  leasePatterns: [],
  property: {
    name: '',
    address: '',
    access: '',
    floor: '',
    room: '',
    usage: '店舗・事務所',
    currentStatus: '空室',
    handoverTiming: '即時',
    handoverStatus: 'スケルトン',
  },
  area: {
    sqm: null,
    tsubo: null,
  },
  rent: {
    amount: null,
    taxIncluded: false,
    tsuboPrice: null,
  },
  commonFee: {
    amount: null,
    taxIncluded: false,
    tsuboPrice: null,
  },
  deposit: '',
  keyMoney: '',
  depreciation: '',
  contract: '普通借家契約 3年',
  handover: '即時（スケルトン）',
  building: {
    structure: '鉄骨鉄筋コンクリート造（SRC）',
    scale: '地上8階地下1階建',
    builtYearMonth: '',
  },
  equipment: [
    'エレベーター',
    '個別空調',
    '光ファイバー対応',
    '専用トイレ',
    '給湯室',
    '24時間利用可能',
  ],
  conditions: [
    '保証会社加入必須',
    '火災保険加入要',
    '業種相談（飲食不可）',
    '看板使用料別途',
  ],
  fieldStatus: {},
  images: {
    subPhotos: [],
    allExtracted: [],
    classifiedList: [],
  },
  contact: {
    companyName: '株式会社ジェイ・スクエア',
    license: '東京都知事（3）第93512号',
    phone: '03-5759-4180',
    fax: '03-5759-4181',
    address: '東京都品川区西五反田1-11-1 アイオス五反田駅前',
    personInCharge: '営業担当',
    feeDistribution: '手数料: 分かれ (手数料率: 50% : 50%)',
    transactionType: '取引態様: 仲介',
  },
  catchcopy: {
    main: '駅徒歩1分の好立地！視認性抜群の角地オフィスビル',
    sub: 'クリニック・各種スクール・サービス店舗等に最適な整形無柱空間',
  },
};

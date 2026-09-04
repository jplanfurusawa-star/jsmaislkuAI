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

export type PropertyDetailItem = {
  label: string;
  value: string;
  source?: string;
  confirmed?: boolean;
};

export type PropertyData = {
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
    scale?: string;
    wideMapStatus?: string;
    detailMapStatus?: string;
    isConfirmed?: boolean;
    method?: string;
    googleMapsUrl?: string;
  };
  images?: {
    main?: string;          // メイン物件写真（外観・パースなど）
    floorPlan?: string;     // 平面図・間取り図
    map?: string;           // 案内図・周辺地図・広域図
    detailMap?: string;     // 詳細図・周辺道路図
    subPhotos?: string[];   // その他抽出写真・パース
    allExtracted?: string[]; // 抽出された全画像リスト
    classifiedList?: ExtractedImage[]; // カテゴリ分類済み画像リスト
    slotMap?: { [slotKey: string]: string }; // フォーマット別のスロット割り当て
    coverImageSettings?: CoverImageSettings; // JS-B 表紙背景画像設定（焦点位置・補正など）
  };
  contact: {
    company: string;
    address: string;
    tel: string;
    fax: string;
    personName: string;
    licenseNumber: string;
    transactionType: string;
  };
};

export type StaffPreset = {
  id: string;
  name: string;
  tel: string;
  email: string;
  role?: string;
  isDefault?: boolean;
};

export interface StoredImageRef {
  imageId: string;
  storagePath: string;
  downloadUrl: string;
  category: ImageCategory | string;
  subCategory?: string;
  label?: string;
  sourcePage?: number;
  width?: number;
  height?: number;
}

export interface SavedMySokuSummary {
  id: string;
  userId?: string;
  propertyName: string;
  room: string;
  address: string;
  rentAmount: number | null;
  format: 'JS-A' | 'JS-B' | 'JS-C' | 'JS-D';
  createdAt: string;
  updatedAt?: string;
  staffName?: string;
  status?: 'completed' | 'failed' | 'not_completed';
}

export type SavedMySoku = {
  id: string;
  userId?: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  format: 'JS-A' | 'JS-B' | 'JS-C' | 'JS-D';
  propertyName: string;
  room: string;
  address: string;
  rentAmount: number | null;
  staffName: string;
  data: PropertyData;
  additionalItems: { id: string; name: string; content: string }[];
  jsContact: AppState['jsContact'];
  thumbnail?: string;
  storedImages?: StoredImageRef[];
  status?: 'completed' | 'failed' | 'not_completed';
};

export type AppState = {
  data: PropertyData | null;
  creationMethod: 'zero' | 'convert';
  format: 'JS-A' | 'JS-B' | 'JS-C' | 'JS-D';
  extractedImages?: ExtractedImage[];
  additionalItems: { id: string; name: string; content: string }[];
  coverImageSettings?: CoverImageSettings;
  jsContact: {
    company: string;
    address: string;
    tel: string;
    fax: string;
    infoEmail: string;
    url: string;
    licenseNumber: string;
    transactionType: string;
    personName: string;
    personTel: string;
    personEmail: string;
    showContact: boolean;
  };
};

export const defaultPropertyData: PropertyData = {
  property: { name: "", address: "", access: "", floor: "", room: "", usage: "", currentStatus: "", handoverTiming: "", handoverStatus: "" },
  area: { sqm: null, tsubo: null },
  rent: { amount: null, taxIncluded: null, tsuboPrice: null },
  commonFee: { amount: null, taxIncluded: null, tsuboPrice: null },
  deposit: "", keyMoney: "", depreciation: "", contract: "", handover: "",
  building: { structure: "", scale: "", builtYearMonth: "" },
  equipment: [], conditions: [],
  tenants: [],
  maps: {},
  images: {
    main: "",
    floorPlan: "",
    map: "",
    subPhotos: [],
    allExtracted: [],
    classifiedList: [],
    slotMap: {}
  },
  contact: { company: "", address: "", tel: "", fax: "", personName: "", licenseNumber: "", transactionType: "" }
};

export const defaultStaffPresets: StaffPreset[] = [
  { id: '1', name: '古澤 孝典', tel: '090-9876-5432', email: 'furusawa@j-jsquare.com', role: 'チーフディレクター', isDefault: true },
  { id: '2', name: '山田 太郎', tel: '090-1234-5678', email: 'yamada@j-jsquare.com', role: '営業担当' },
  { id: '3', name: '佐藤 花子', tel: '080-2345-6789', email: 'sato@j-jsquare.com', role: '営業担当' },
];

export const defaultAppState: AppState = {
  data: null,
  creationMethod: 'zero',
  format: 'JS-B', // デフォルトをJS-B (プレゼン資料型・銀座並木通り型) に設定
  extractedImages: [],
  additionalItems: [],
  jsContact: {
    company: "株式会社 j.square",
    address: "〒160-0022 東京都新宿区新宿一丁目4-13 溝呂木第2ビル 3F",
    tel: "03-6457-8222",
    fax: "03-6730-8451",
    infoEmail: "info-js@j-jsquare.com",
    url: "http://www.j-jsquare.com",
    licenseNumber: "東京都知事（2）第99830号",
    transactionType: "媒介",
    personName: "古澤 孝典",
    personTel: "090-9876-5432",
    personEmail: "furusawa@j-jsquare.com",
    showContact: true
  }
};

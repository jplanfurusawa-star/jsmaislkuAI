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
  planAssetId?: string | null; // 互換用：主に紐付く平面図 assetId
  primaryPlanAssetId?: string | null; // 主平面図 assetId
  relatedPlanAssetIds?: string[]; // 関連平面図 assetId 配列
  status?: string; // "available" | "occupied" | "contracted"
  isOutputTarget?: boolean; // 出力対象フラグ
  floorGroup?: string; // 例: 2F北/南を同一2Fグループとして扱う際に使用
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
  matchedUnitId?: string | null; // 互換用
  appliesToUnitIds?: string[]; // 同じ平面図を共有する募集区画ID
  confidence?: 'high' | 'medium' | 'low' | 'manual'; // 紐付けの確信度
  isOutputTarget?: boolean; // PLANページ出力対象
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
    // 旧/AI抽出スキーマとの互換用
    companyName?: string;
    license?: string;
    phone?: string;
    personInCharge?: string;
    feeDistribution?: string;
  };
  catchcopy?: {
    main: string;
    sub: string;
  };
  customTexts?: {
    [key: string]: string;
  };
};

export type StaffPreset = {
  id: string;
  name: string;
  tel: string;
  email: string;
  role?: string;
  isDefault?: boolean;
  isAdmin?: boolean;
  order?: number;
  googleEmail?: string;
  googleUid?: string;
  googlePhotoUrl?: string;
  googleDisplayName?: string;
  linkedAt?: string;
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
  format: 'JS-A' | 'JS-B' | 'JS-C' | 'JS-D' | string;
  formatUsagePrompt?: string; // 選択フォーマットのAI運用指示プロンプト（どういう風に使ってほしいか）
  extractedImages?: ExtractedImage[];
  additionalItems: { id: string; name: string; content: string }[];
  coverImageSettings?: CoverImageSettings;
  // AI Studioの一部処理との互換用（現行UIでは未使用でも可）
  step?: number;
  sourceFiles?: File[];
  isGenerating?: boolean;
  coverSettings?: CoverImageSettings;
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
  units: [],
  plans: [],
  leasePatterns: [],
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

export interface FormatLayoutStructure {
  orientation?: 'landscape' | 'portrait';
  headerPosition?: string;
  headerStyle?: string;
  floorPlanPosition?: string;
  floorPlanSize?: 'large' | 'medium' | 'standard';
  photosPosition?: string;
  photoCount?: number;
  mapPosition?: string;
  tablePosition?: string;
  footerPosition?: string;
}

export interface FormatDefinition {
  id: string; // 'JS-A' | 'JS-B' | 'JS-C' | 'JS-D' | 'JS-CUSTOM-...'
  name: string;
  subtitle: string;
  desc: string;
  layoutGuide: string;
  recommendedFor: string;
  enabled: boolean;
  order: number;
  badge?: string;
  themeColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  thumbnailUrl?: string;
  sourceFileName?: string;
  analyzedAt?: string;
  isCustom?: boolean;
  designNotes?: string[];
  layoutStructure?: FormatLayoutStructure;
  usagePrompt?: string; // 運用指示プロンプト / 適用ルール（例: 高級路面店向けに写真を大きく配置、条件表との対比重視など）
}

export interface FormatAnalysisResult {
  formatName: string;
  subtitle: string;
  badge: string;
  themeColor: string;
  secondaryColor?: string;
  accentColor?: string;
  desc: string;
  layoutGuide: string;
  recommendedFor: string;
  suggestedBaseFormat?: string;
  layoutStructure?: FormatLayoutStructure;
  designNotes?: string[];
  thumbnailUrl?: string;
  sourceFileName?: string;
  usagePrompt?: string; // 運用指示プロンプト / 適用ルール
}

export interface CompanyMasterContact {
  company: string;
  address: string;
  tel: string;
  fax: string;
  infoEmail: string;
  url: string;
  licenseNumber: string;
  transactionType: string;
}

export interface AdminSettings {
  id?: string;
  defaultFormat: string;
  brandColorTheme: string;
  formats: FormatDefinition[];
  companyContact: CompanyMasterContact;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PromptPreset {
  label: string;
  category: string;
  text: string;
}

export const defaultPromptPresets: PromptPreset[] = [
  { label: '🏢 高級路面・ブランド店向け', category: '店舗', text: '都心高級商業エリアの路面店舗向け。外観写真やファサードパースの縦横比を崩さず大きく配置し、高級感とファサード視認性を最優先にする。' },
  { label: '🏬 飲食・居抜き設備条件重視', category: '店舗', text: '飲食・サービス店舗向け。引渡状態（スケルトン/居抜き）やダクト・給排水設備条件を強調し、間取りと設備表の視認性を高める。' },
  { label: '🏢 オフィス大型フロア・スペック重視', category: 'オフィス', text: 'オフィス・大型フロア向け。基準階平面図と天井高・床荷重などのスペックを強調し、条件テーブルを端正に整理する。' },
  { label: '📋 複数区画・一覧性重視', category: '複合', text: '複数区画・フロア募集向け。号室別賃料・坪単価テーブルの一覧性を最優先にし、各階区画図と対比しやすく配置する。' },
  { label: '📸 ビジュアル写真重視', category: '写真', text: '外観・内観写真の比率を最大化し、キャッチコピーとビジュアルで第一印象を訴求する構成にする。' },
  { label: '🗺️ 現地案内図・アクセス拡大', category: '地図', text: '最寄り駅からのアクセス動線と現地案内図を大きく表示し、視認性と来客誘導性を高める。' },
  { label: '📑 契約条件・業態制限明記', category: '条件', text: '業態制限、看板設置条件、引き渡し時期等の重要特記事項を条件枠内に目立たせる。' },
];

export const defaultFormatsList: FormatDefinition[] = [
  {
    id: 'JS-A',
    name: 'JS-A | バランス型',
    subtitle: '単一区画・標準案件向け',
    desc: '平面図を大きく配置し、外観・内観写真3〜4枚と現地案内図をバランス良く配置。右側に条件表を集約。',
    layoutGuide: '【構成】左上: 平面図（大） / 左下: 写真3〜4枚（外観・内観） / 右側: 物件情報・賃料',
    recommendedFor: 'オフィス・店舗・レジデンスの標準的な単一区画募集',
    enabled: true,
    order: 0,
    badge: '標準型',
    themeColor: '#1E40AF',
    usagePrompt: '標準的な単一区画向け。平面図の視認性を重視し、外観・内観写真をバランスよく配置。賃料・共益費・坪単価を明確に提示する。',
  },
  {
    id: 'JS-B',
    name: 'JS-B | プレゼン資料型（銀座並木通り型）',
    subtitle: '複数ページ営業提案・立地プレゼン',
    desc: '「銀座並木通りビル」を基準見本とした複数スライド提案書。表紙・建物概要・広域図＆詳細図・テナント構成を整理。',
    layoutGuide: '【構成】PAGE1: 表紙 / PAGE2: 建物概要（左:概要 右:外観写真） / PAGE3: 広域図・詳細図 / PAGE4: テナント構成',
    recommendedFor: 'ビル一棟紹介・商業施設・オーナー提案・リーシング提案・周辺立地説明',
    enabled: true,
    order: 1,
    badge: '推奨',
    themeColor: '#0F172A',
    usagePrompt: '都心・高級商業ビルやプレゼン資料向け。表紙から建物概要・立地・写真まで高級感と信頼感のある構成にし、フォントや配色を落ち着いたトーンにする。',
  },
  {
    id: 'JS-C',
    name: 'JS-C | 複数区画型',
    subtitle: 'フロア別・複数号室一覧',
    desc: '募集条件一覧を最優先。建物外観、全体区画図、各階平面図を中心に配置し、号室別の賃料・面積を一覧化。',
    layoutGuide: '【構成】上部: 外観・全体区画図 / 中央: 募集区画一覧テーブル / 下部: 各階平面図',
    recommendedFor: '一棟ビル・商業ビル・フロア分割募集・空室複数案件',
    enabled: true,
    order: 2,
    badge: '一括・フロア別',
    themeColor: '#047857',
    usagePrompt: '複数区画・フロア募集向け。号室別賃料・坪単価テーブルの一覧性を最優先にし、各階区画図と対比しやすく配置する。',
  },
  {
    id: 'JS-D',
    name: 'JS-D | 商業・大型案件型',
    subtitle: '大型商業施設・複数フロア',
    desc: '建物外観、商業区画全体図、各階区画図、配置図、周辺環境図を整理して配置。複雑な案件を視覚的に整理。',
    layoutGuide: '【構成】左側: 外観・周辺マップ / 中央: 全体配置図・各階区画図 / 右側: 条件表',
    recommendedFor: '大型商業施設・複合施設・ロードサイド店舗・一括貸し',
    enabled: true,
    order: 3,
    badge: '商業・大型',
    themeColor: '#7C3AED',
    usagePrompt: '大型商業施設・複合施設向け。建物外観と商業区画全体図、周辺環境図を視覚的に整理し、業態制限や引き渡し条件を明確にする。',
  },
];

export const defaultCompanyMasterContact: CompanyMasterContact = {
  company: "株式会社 j.square",
  address: "〒160-0022 東京都新宿区新宿一丁目4-13 溝呂木第2ビル 3F",
  tel: "03-6457-8222",
  fax: "03-6730-8451",
  infoEmail: "info-js@j-jsquare.com",
  url: "http://www.j-jsquare.com",
  licenseNumber: "東京都知事（2）第99830号",
  transactionType: "媒介",
};

export const defaultAdminSettings: AdminSettings = {
  id: 'format_and_company',
  defaultFormat: 'JS-B',
  brandColorTheme: '#0F172A',
  formats: defaultFormatsList,
  companyContact: defaultCompanyMasterContact,
};

export const defaultStaffPresets: StaffPreset[] = [
  { id: '1', name: '古澤 孝典', tel: '090-9876-5432', email: 'furusawa@j-jsquare.com', role: 'チーフディレクター', isDefault: true, isAdmin: true, order: 0 },
  { id: '2', name: '山田 太郎', tel: '090-1234-5678', email: 'yamada@j-jsquare.com', role: '営業担当', isAdmin: false, order: 1 },
  { id: '3', name: '佐藤 花子', tel: '080-2345-6789', email: 'sato@j-jsquare.com', role: '営業担当', isAdmin: false, order: 2 },
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

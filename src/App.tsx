import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Coordinate = [number, number];
type Ring = Coordinate[];
type Polygon = Ring[];

type Geometry = {
  type: string;
  coordinates?: unknown;
};

type Feature = {
  properties?: {
    iso3?: string;
    name?: string;
  };
  geometry?: Geometry;
};

type FeatureCollection = {
  type?: string;
  features?: Feature[];
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MapPath = {
  key: string;
  d: string;
  iso3: string;
  countryName: string | null;
  isAsean: boolean;
  bounds: Bounds;
};

type LabelPhase = "entering" | "visible" | "exiting";

type ActiveLabel = {
  countryName: string;
  phase: LabelPhase;
};

type EditorialLabelSpec = {
  headline: string;
  official: string;
  tracking: string;
  ruleWidth: number;
  ruleOffset: number;
  nudgeX: number;
  nudgeY: number;
};

type ProductCategory = {
  abbr: string;
  productName: string;
  scope: string;
  ratingRange: string;
  iecStandard: string;
  usage: string;
};

type CountryRequirementRow = {
  product: string;
  requirement: string;
  standard: string;
  authority: string;
  note: string;
};

type CountryRequirement = {
  country: string;
  footnoteLabel: string;
  footnote: string;
  rows: CountryRequirementRow[];
};

type LegendRow = {
  category: string;
  meaning: string;
};

type SummaryRow = {
  country: string;
  acb: string;
  mccb: string;
  mcb: string;
  rccb: string;
  rcbo: string;
};

type ResidentialQuickRow = {
  country: string;
  mcb: string;
  rccb: string;
  rcbo: string;
};

type IndustrialQuickRow = {
  country: string;
  reference: string;
  mandatory: string;
};

const MAP_WIDTH = 960;
const MAP_HEIGHT = 620;
const MAP_PADDING = 24;
const ASEAN_FOCUS_PADDING = 1.0;
const COUNTRY_PADDING_FACTOR = 1.22;
const INDONESIA_PADDING_FACTOR = 0.9;
const INDONESIA_MIN_SCALE = 1.58;
const MIN_COUNTRY_SCALE = 1.0;
const MAX_COUNTRY_SCALE = 10;
const ZOOM_ANIMATION_MS = 360;
const RESET_ANIMATION_MS = 500;
const LABEL_EXIT_TOTAL_MS = 860;
const FULL_VIEWBOX: ViewBox = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };

const ISO3_TO_JA = new Map<string, string>([
  ["BRN", "ブルネイ"],
  ["MMR", "ミャンマー"],
  ["KHM", "カンボジア"],
  ["IDN", "インドネシア"],
  ["LAO", "ラオス"],
  ["MYS", "マレーシア"],
  ["PHL", "フィリピン"],
  ["SGP", "シンガポール"],
  ["THA", "タイ"],
  ["VNM", "ベトナム"],
]);

const PRODUCT_CATEGORIES: ProductCategory[] = [
  {
    abbr: "ACB",
    productName: "Air Circuit Breaker（気中遮断器）",
    scope: "産業用途",
    ratingRange: "630A〜6300A",
    iecStandard: "IEC 60947-2",
    usage: "産業用主幹・大型商業施設",
  },
  {
    abbr: "MCCB",
    productName: "Molded Case Circuit Breaker（配線用遮断器）",
    scope: "産業用途",
    ratingRange: "32A〜1600A",
    iecStandard: "IEC 60947-2",
    usage: "産業用・商業用配電盤",
  },
  {
    abbr: "MCB",
    productName: "Miniature Circuit Breaker（小型遮断器）",
    scope: "家庭・類似用途 / 産業用途",
    ratingRange: "〜125A",
    iecStandard: "IEC 60898-1（家庭）/ IEC 60947-2（産業）",
    usage: "住宅・軽商業用分電盤、産業・盤内用途",
  },
  {
    abbr: "RCCB",
    productName: "Residual Current Circuit Breaker（漏電遮断器）",
    scope: "家庭・類似用途",
    ratingRange: "〜125A（63Aは典型）",
    iecStandard: "IEC 61008-1",
    usage: "漏電保護（過電流保護なし）",
  },
  {
    abbr: "RCBO",
    productName: "Residual Current Breaker with Overcurrent",
    scope: "家庭・類似用途",
    ratingRange: "〜125A（63Aは典型）",
    iecStandard: "IEC 61009-1",
    usage: "漏電＋過電流保護",
  },
];

const PRODUCT_CATEGORY_NOTES = [
  "MCBは用途で適用規格が分かれます。家庭・類似用途はIEC 60898-1、産業用途はIEC 60947-2系の適用が一般的です。",
  "RCCB/RCBOの定格電流は実務上63A帯が多い一方、規格上限は125Aまでを想定した整理です。",
  "ELCB/ELBは現場呼称として広く使われます。本表ではIEC用語に合わせ、RCCB/RCBOで分類しています。",
];

const LEGEND_ROWS: LegendRow[] = [
  { category: "必須", meaning: "強制認証：販売・輸入前に認証取得必須" },
  { category: "条件付き", meaning: "入札・プロジェクト仕様で要求される場合あり" },
  { category: "対象外", meaning: "現時点で強制認証リストに含まれず" },
  { category: "登録制", meaning: "製品登録・届出が必要" },
];

const COUNTRY_REQUIREMENTS: CountryRequirement[] = [
  {
    country: "インドネシア",
    footnoteLabel: "必要手続き",
    footnote: "SPPT-SNI認証取得 → NPB（製品登録番号）取得 → SNIマーク貼付",
    rows: [
      {
        product: "ACB",
        requirement: "対象外",
        standard: "IEC 60947-2参照",
        authority: "-",
        note: "SNI強制リスト対象外",
      },
      {
        product: "MCCB",
        requirement: "対象外",
        standard: "IEC 60947-2参照",
        authority: "-",
        note: "SNI強制リスト対象外",
      },
      {
        product: "MCB",
        requirement: "必須",
        standard: "SNI IEC 60898-1:2009",
        authority: "LSPro（認定CB）",
        note: "HS: 85362091, 85362099",
      },
      {
        product: "RCCB",
        requirement: "必須",
        standard: "SNI IEC 61008-1:2017",
        authority: "LSPro（認定CB）",
        note: "HS: 85362091, 85362099",
      },
      {
        product: "RCBO",
        requirement: "必須",
        standard: "SNI IEC 61009関連",
        authority: "LSPro（認定CB）",
        note: "HS: 85362091, 85362099",
      },
    ],
  },
  {
    country: "マレーシア",
    footnoteLabel: "必要手続き",
    footnote: "SIRIM製品認証 → ST（Energy Commission）ラベル取得 → CoA発行",
    rows: [
      {
        product: "ACB",
        requirement: "条件付き",
        standard: "MS IEC 60947-2",
        authority: "SIRIM QAS",
        note: "プロジェクト仕様で要求多し",
      },
      {
        product: "MCCB",
        requirement: "条件付き",
        standard: "MS IEC 60947-2",
        authority: "SIRIM QAS",
        note: "プロジェクト仕様でSIRIM CoA要求",
      },
      {
        product: "MCB",
        requirement: "必須",
        standard: "MS IEC 60898",
        authority: "SIRIM QAS",
        note: "ST-SIRIM CoA必須",
      },
      {
        product: "RCCB",
        requirement: "必須",
        standard: "MS IEC 61008",
        authority: "SIRIM QAS",
        note: "ST-SIRIM CoA必須",
      },
      {
        product: "RCBO",
        requirement: "必須",
        standard: "MS IEC 61009",
        authority: "SIRIM QAS",
        note: "ST-SIRIM CoA必須",
      },
    ],
  },
  {
    country: "シンガポール",
    footnoteLabel: "特記",
    footnote: "2023年7月より全住宅にRCCB設置義務化。1985年以前建築は2025年7月1日までに設置要。",
    rows: [
      { product: "ACB", requirement: "対象外", standard: "IEC 60947-2参照", authority: "-", note: "Controlled Goods対象外" },
      { product: "MCCB", requirement: "対象外", standard: "IEC 60947-2参照", authority: "-", note: "Controlled Goods対象外" },
      { product: "MCB", requirement: "対象外", standard: "IEC 60898参照", authority: "-", note: "Controlled Goods対象外" },
      { product: "RCCB", requirement: "必須", standard: "SS 97:2016", authority: "認定CAB", note: "全住宅義務化（2025年7月期限）" },
      { product: "RCBO", requirement: "条件付き", standard: "IEC 61009参照", authority: "-", note: "RCCBに準じて要求される場合あり" },
    ],
  },
  {
    country: "タイ",
    footnoteLabel: "必要手続き",
    footnote: "TISI認証申請 → タイ国内または認定海外ラボで試験 → TISIマーク取得",
    rows: [
      { product: "ACB", requirement: "対象外", standard: "IEC 60947-2参照", authority: "-", note: "TISI強制リスト対象外" },
      { product: "MCCB", requirement: "対象外", standard: "IEC 60947-2参照", authority: "-", note: "TISI強制リスト対象外" },
      { product: "MCB", requirement: "対象外", standard: "IEC 60898参照", authority: "-", note: "TISI強制リスト対象外" },
      { product: "RCCB", requirement: "必須", standard: "TIS 2425-2560 (2017)", authority: "TISI", note: "施行日：2021年1月10日" },
      { product: "RCBO", requirement: "必須", standard: "TIS 909-2548 (2005)", authority: "TISI", note: "施行日：2007年11月19日" },
    ],
  },
  {
    country: "フィリピン",
    footnoteLabel: "特記",
    footnote: "周波数60Hz（ASEAN唯一）。50Hz製品は適合確認要。ICC（Import Commodity Clearance）必須。",
    rows: [
      { product: "ACB", requirement: "条件付き", standard: "PNS IEC 60947-2参照", authority: "BPS", note: "プロジェクト仕様で要求される場合あり" },
      { product: "MCCB", requirement: "必須", standard: "PNS 1573-2:1997 (IEC 947-2:1995)", authority: "BPS", note: "ICC必須" },
      { product: "MCB", requirement: "必須", standard: "PNS IEC 60898", authority: "BPS", note: "ICC必須" },
      { product: "RCCB", requirement: "必須", standard: "PNS IEC 61008", authority: "BPS", note: "ICC必須" },
      { product: "RCBO", requirement: "必須", standard: "PNS IEC 61009", authority: "BPS", note: "ICC必須" },
    ],
  },
  {
    country: "ベトナム",
    footnoteLabel: "特記",
    footnote: "QCVN 25:2025/BKHCN適用。2025年10月1日完全施行。短絡試験は除外可。",
    rows: [
      { product: "ACB", requirement: "対象外", standard: "IEC 60947-2参照", authority: "-", note: "QCVN 25対象外（産業用）" },
      { product: "MCCB", requirement: "対象外", standard: "IEC 60947-2参照", authority: "-", note: "QCVN 25対象外（産業用）" },
      { product: "MCB", requirement: "必須", standard: "TCVN 6434-1:2018 (IEC 60898-1:2015)", authority: "認定CB", note: "定格63A以下が対象" },
      { product: "RCCB", requirement: "必須", standard: "TCVN 6950-1:2007 (IEC 61008-1:2006)", authority: "認定CB", note: "定格63A以下が対象" },
      { product: "RCBO", requirement: "必須", standard: "TCVN 6951-1:2007 (IEC 61009-1:2003)", authority: "認定CB", note: "定格63A以下が対象" },
    ],
  },
  {
    country: "ブルネイ",
    footnoteLabel: "特記",
    footnote: "強制認証リストなし。IEC/BS規格準拠が基本。プラグはType G（英国型）。",
    rows: [
      { product: "ACB", requirement: "条件付き", standard: "IEC 60947-2 / BS規格", authority: "-", note: "プロジェクト仕様で要求" },
      { product: "MCCB", requirement: "条件付き", standard: "IEC 60947-2 / BS規格", authority: "-", note: "プロジェクト仕様で要求" },
      { product: "MCB", requirement: "条件付き", standard: "IEC 60898 / BS規格", authority: "-", note: "プロジェクト仕様で要求" },
      { product: "RCCB", requirement: "条件付き", standard: "IEC 61008 / BS規格", authority: "-", note: "プロジェクト仕様で要求" },
      { product: "RCBO", requirement: "条件付き", standard: "IEC 61009 / BS規格", authority: "-", note: "プロジェクト仕様で要求" },
    ],
  },
  {
    country: "カンボジア",
    footnoteLabel: "特記",
    footnote: "CS0010-2003〜CS0050-2003（強制規格）。地域・案件差が大きい。現地パートナー経由で確認要。",
    rows: [
      { product: "ACB", requirement: "登録制", standard: "IEC 60947-2参照", authority: "ISC/MISTI", note: "登録が必要な場合あり" },
      { product: "MCCB", requirement: "登録制", standard: "IEC 60947-2参照", authority: "ISC/MISTI", note: "登録が必要な場合あり" },
      { product: "MCB", requirement: "登録制", standard: "CS規格（IEC準拠）", authority: "ISC/MISTI", note: "ISC登録制" },
      { product: "RCCB", requirement: "登録制", standard: "CS規格（IEC準拠）", authority: "ISC/MISTI", note: "ISC登録制" },
      { product: "RCBO", requirement: "登録制", standard: "CS規格（IEC準拠）", authority: "ISC/MISTI", note: "ISC登録制" },
    ],
  },
  {
    country: "ラオス",
    footnoteLabel: "特記",
    footnote: "強制認証制度は未整備。DSM（Department of Standard and Metrology）管轄。IEC適合証明で通関可能。",
    rows: [
      { product: "ACB", requirement: "条件付き", standard: "IEC 60947-2参照", authority: "DSM/MoIC", note: "プロジェクト仕様で要求" },
      { product: "MCCB", requirement: "条件付き", standard: "IEC 60947-2参照", authority: "DSM/MoIC", note: "プロジェクト仕様で要求" },
      { product: "MCB", requirement: "条件付き", standard: "IEC 60898参照", authority: "DSM/MoIC", note: "輸入時認証要求の場合あり" },
      { product: "RCCB", requirement: "条件付き", standard: "IEC 61008参照", authority: "DSM/MoIC", note: "輸入時認証要求の場合あり" },
      { product: "RCBO", requirement: "条件付き", standard: "IEC 61009参照", authority: "DSM/MoIC", note: "輸入時認証要求の場合あり" },
    ],
  },
  {
    country: "ミャンマー",
    footnoteLabel: "特記",
    footnote: "EID（Electrical Inspection Department）への登録制。BS・JIS・IEC等を受容。MNBC 2020にIEC規格引用。制度変更頻発。",
    rows: [
      { product: "ACB", requirement: "登録制", standard: "IEC 60947-2 / BS / JIS", authority: "EID", note: "登録制・制度流動的" },
      { product: "MCCB", requirement: "登録制", standard: "IEC 60947-2 / BS / JIS", authority: "EID", note: "登録制・制度流動的" },
      { product: "MCB", requirement: "登録制", standard: "IEC 60898 / BS / JIS", authority: "EID", note: "EID登録必要" },
      { product: "RCCB", requirement: "登録制", standard: "IEC 61008 / BS / JIS", authority: "EID", note: "EID登録必要" },
      { product: "RCBO", requirement: "登録制", standard: "IEC 61009 / BS / JIS", authority: "EID", note: "EID登録必要" },
    ],
  },
];

const CERT_SUMMARY_ROWS: SummaryRow[] = [
  { country: "インドネシア", acb: "対象外", mccb: "対象外", mcb: "必須", rccb: "必須", rcbo: "必須" },
  { country: "マレーシア", acb: "条件付き", mccb: "条件付き", mcb: "必須", rccb: "必須", rcbo: "必須" },
  { country: "シンガポール", acb: "対象外", mccb: "対象外", mcb: "対象外", rccb: "必須", rcbo: "条件付き" },
  { country: "タイ", acb: "対象外", mccb: "対象外", mcb: "対象外", rccb: "必須", rcbo: "必須" },
  { country: "フィリピン", acb: "条件付き", mccb: "必須", mcb: "必須", rccb: "必須", rcbo: "必須" },
  { country: "ベトナム", acb: "対象外", mccb: "対象外", mcb: "必須", rccb: "必須", rcbo: "必須" },
  { country: "ブルネイ", acb: "条件付き", mccb: "条件付き", mcb: "条件付き", rccb: "条件付き", rcbo: "条件付き" },
  { country: "カンボジア", acb: "登録制", mccb: "登録制", mcb: "登録制", rccb: "登録制", rcbo: "登録制" },
  { country: "ラオス", acb: "条件付き", mccb: "条件付き", mcb: "条件付き", rccb: "条件付き", rcbo: "条件付き" },
  { country: "ミャンマー", acb: "登録制", mccb: "登録制", mcb: "登録制", rccb: "登録制", rcbo: "登録制" },
];

const RESIDENTIAL_QUICK_ROWS: ResidentialQuickRow[] = [
  { country: "インドネシア", mcb: "SNI IEC 60898-1:2009", rccb: "SNI IEC 61008-1:2017", rcbo: "SNI IEC 61009" },
  { country: "マレーシア", mcb: "MS IEC 60898", rccb: "MS IEC 61008", rcbo: "MS IEC 61009" },
  { country: "シンガポール", mcb: "-", rccb: "SS 97:2016", rcbo: "-" },
  { country: "タイ", mcb: "-", rccb: "TIS 2425-2560", rcbo: "TIS 909-2548" },
  { country: "フィリピン", mcb: "PNS IEC 60898", rccb: "PNS IEC 61008", rcbo: "PNS IEC 61009" },
  { country: "ベトナム", mcb: "TCVN 6434-1:2018", rccb: "TCVN 6950-1:2007", rcbo: "TCVN 6951-1:2007" },
];

const INDUSTRIAL_QUICK_ROWS: IndustrialQuickRow[] = [
  { country: "インドネシア", reference: "IEC 60947-2", mandatory: "なし" },
  { country: "マレーシア", reference: "MS IEC 60947-2", mandatory: "プロジェクト依存" },
  { country: "シンガポール", reference: "IEC 60947-2", mandatory: "なし" },
  { country: "タイ", reference: "IEC 60947-2", mandatory: "なし" },
  { country: "フィリピン", reference: "PNS 1573-2:1997", mandatory: "MCCB：ICC必須" },
  { country: "ベトナム", reference: "IEC 60947-2", mandatory: "なし" },
];

const IMPORTANT_NOTES = [
  "産業用ACB/MCCBは多くの国で強制認証対象外だが、入札・プロジェクト仕様でIEC適合証明やCBスキーム証明書を要求されるケースが多い。",
  "フィリピンの60Hz問題：ASEAN唯一の60Hz国。50Hz仕様製品のトリップ特性等を確認必要。",
  "ベトナムの定格制限：QCVN 25は63A以下の住宅用製品が対象。それ以上は現時点で強制対象外。",
  "CLMV諸国（カンボジア・ラオス・ミャンマー・ベトナム）は制度が流動的。最新情報を現地で確認要。",
  "シンガポールRCCB義務化：2025年7月1日が設置期限。住宅向け需要増加見込み。",
];

const EDITORIAL_LABELS = new Map<string, EditorialLabelSpec>([
  [
    "ブルネイ",
    {
      headline: "BRUNEI",
      official: "Brunei Darussalam",
      tracking: "0.42em",
      ruleWidth: 58,
      ruleOffset: -7,
      nudgeX: -0.012,
      nudgeY: -0.015,
    },
  ],
  [
    "ミャンマー",
    {
      headline: "MYANMAR",
      official: "Republic of the Union of Myanmar",
      tracking: "0.39em",
      ruleWidth: 63,
      ruleOffset: -9,
      nudgeX: -0.018,
      nudgeY: -0.01,
    },
  ],
  [
    "カンボジア",
    {
      headline: "CAMBODIA",
      official: "Kingdom of Cambodia",
      tracking: "0.41em",
      ruleWidth: 59,
      ruleOffset: -6,
      nudgeX: -0.006,
      nudgeY: -0.012,
    },
  ],
  [
    "インドネシア",
    {
      headline: "INDONESIA",
      official: "Republic of Indonesia",
      tracking: "0.36em",
      ruleWidth: 62,
      ruleOffset: -10,
      nudgeX: 0.013,
      nudgeY: -0.009,
    },
  ],
  [
    "ラオス",
    {
      headline: "LAOS",
      official: "Lao People's Democratic Republic",
      tracking: "0.45em",
      ruleWidth: 56,
      ruleOffset: -5,
      nudgeX: -0.015,
      nudgeY: -0.014,
    },
  ],
  [
    "マレーシア",
    {
      headline: "MALAYSIA",
      official: "Malaysia",
      tracking: "0.4em",
      ruleWidth: 60,
      ruleOffset: -8,
      nudgeX: -0.01,
      nudgeY: -0.008,
    },
  ],
  [
    "フィリピン",
    {
      headline: "PHILIPPINES",
      official: "Republic of the Philippines",
      tracking: "0.34em",
      ruleWidth: 64,
      ruleOffset: -11,
      nudgeX: 0.01,
      nudgeY: -0.016,
    },
  ],
  [
    "シンガポール",
    {
      headline: "SINGAPORE",
      official: "Republic of Singapore",
      tracking: "0.38em",
      ruleWidth: 57,
      ruleOffset: -7,
      nudgeX: -0.008,
      nudgeY: -0.004,
    },
  ],
  [
    "タイ",
    {
      headline: "THAILAND",
      official: "Kingdom of Thailand",
      tracking: "0.43em",
      ruleWidth: 61,
      ruleOffset: -9,
      nudgeX: -0.014,
      nudgeY: -0.012,
    },
  ],
  [
    "ベトナム",
    {
      headline: "VIET NAM",
      official: "Socialist Republic of Viet Nam",
      tracking: "0.44em",
      ruleWidth: 60,
      ruleOffset: -8,
      nudgeX: 0.012,
      nudgeY: -0.02,
    },
  ],
]);

function clampLat(latDeg: number): number {
  return Math.max(-85, Math.min(85, latDeg));
}

function mercatorProject(coord: Coordinate): Coordinate {
  const lonRad = (coord[0] * Math.PI) / 180;
  const latRad = (clampLat(coord[1]) * Math.PI) / 180;
  return [lonRad, Math.log(Math.tan(Math.PI / 4 + latRad / 2))];
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function geometryToPolygons(geometry?: Geometry): Polygon[] {
  if (!geometry || !geometry.coordinates) {
    return [];
  }

  if (geometry.type === "Polygon") {
    const polygon = geometry.coordinates;
    if (!Array.isArray(polygon)) {
      return [];
    }
    return [polygon as Polygon];
  }

  if (geometry.type === "MultiPolygon") {
    const multiPolygon = geometry.coordinates;
    if (!Array.isArray(multiPolygon)) {
      return [];
    }
    return multiPolygon as Polygon[];
  }

  return [];
}

function collectProjectedBounds(features: Feature[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const feature of features) {
    const polygons = geometryToPolygons(feature.geometry);
    for (const polygon of polygons) {
      for (const ring of polygon) {
        if (!Array.isArray(ring)) {
          continue;
        }
        for (const point of ring) {
          if (!isCoordinate(point)) {
            continue;
          }
          const [x, y] = mercatorProject(point);
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    const [left, top] = mercatorProject([-180, 85]);
    const [right, bottom] = mercatorProject([180, -85]);
    return {
      minX: left,
      minY: bottom,
      maxX: right,
      maxY: top,
    };
  }

  return { minX, minY, maxX, maxY };
}

function expandBounds(bounds: Bounds, factor: number): Bounds {
  const dx = bounds.maxX - bounds.minX || 1;
  const dy = bounds.maxY - bounds.minY || 1;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const halfW = (dx * factor) / 2;
  const halfH = (dy * factor) / 2;

  return {
    minX: cx - halfW,
    minY: cy - halfH,
    maxX: cx + halfW,
    maxY: cy + halfH,
  };
}

function createProjector(features: Feature[], focusFeatures: Feature[], focusPadding = 1): (coord: Coordinate) => Coordinate {
  const baseBounds = collectProjectedBounds(focusFeatures);
  const bounds = focusPadding > 1 ? expandBounds(baseBounds, focusPadding) : baseBounds;

  const dx = bounds.maxX - bounds.minX || 1;
  const dy = bounds.maxY - bounds.minY || 1;
  const innerWidth = MAP_WIDTH - MAP_PADDING * 2;
  const innerHeight = MAP_HEIGHT - MAP_PADDING * 2;
  const scale = Math.min(innerWidth / dx, innerHeight / dy);
  const usedWidth = dx * scale;
  const usedHeight = dy * scale;
  const offsetX = (MAP_WIDTH - usedWidth) / 2;
  const offsetY = (MAP_HEIGHT - usedHeight) / 2;

  if (!features.length) {
    return (coord: Coordinate) => coord;
  }

  return (coord: Coordinate) => {
    const [x, y] = mercatorProject(coord);
    const sx = (x - bounds.minX) * scale + offsetX;
    const sy = (bounds.maxY - y) * scale + offsetY;
    return [sx, sy];
  };
}

function fmt(num: number): number {
  return Number(num.toFixed(2));
}

function polygonToPathData(polygon: Polygon, project: (coord: Coordinate) => Coordinate): { d: string; bounds: Bounds } | null {
  let d = "";
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const ring of polygon) {
    if (!Array.isArray(ring) || ring.length < 2) {
      continue;
    }

    let hasPoint = false;
    for (let i = 0; i < ring.length; i += 1) {
      const point = ring[i];
      if (!isCoordinate(point)) {
        continue;
      }
      const [x, y] = project(point);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      d += `${i === 0 ? "M" : "L"}${fmt(x)} ${fmt(y)} `;
      hasPoint = true;
    }

    if (hasPoint) {
      d += "Z ";
    }
  }

  if (!d || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    d: d.trim(),
    bounds: { minX, minY, maxX, maxY },
  };
}

function mergeBounds(base: Bounds, next: Bounds): Bounds {
  return {
    minX: Math.min(base.minX, next.minX),
    minY: Math.min(base.minY, next.minY),
    maxX: Math.max(base.maxX, next.maxX),
    maxY: Math.max(base.maxY, next.maxY),
  };
}

function buildMapPaths(features: Feature[]): { paths: MapPath[]; countryBounds: Map<string, Bounds> } {
  const aseanFeatures = features.filter((feature) => {
    const iso3 = feature.properties?.iso3;
    return Boolean(iso3 && ISO3_TO_JA.has(iso3));
  });

  const focusFeatures = aseanFeatures.length ? aseanFeatures : features;
  const project = createProjector(features, focusFeatures, ASEAN_FOCUS_PADDING);
  const paths: MapPath[] = [];
  const countryBounds = new Map<string, Bounds>();

  features.forEach((feature, featureIndex) => {
    const iso3 = feature.properties?.iso3 ?? `F-${featureIndex}`;
    const countryName = ISO3_TO_JA.get(iso3) ?? null;
    const isAsean = Boolean(countryName);
    const polygons = geometryToPolygons(feature.geometry);

    polygons.forEach((polygon, polygonIndex) => {
      const pathData = polygonToPathData(polygon, project);
      if (!pathData) {
        return;
      }

      const path: MapPath = {
        key: `${iso3}-${featureIndex}-${polygonIndex}`,
        d: pathData.d,
        iso3,
        countryName,
        isAsean,
        bounds: pathData.bounds,
      };

      paths.push(path);

      if (!countryName) {
        return;
      }

      const currentBounds = countryBounds.get(countryName);
      countryBounds.set(countryName, currentBounds ? mergeBounds(currentBounds, pathData.bounds) : pathData.bounds);
    });
  });

  return { paths, countryBounds };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function viewBoxForCountry(countryName: string, bounds: Bounds): ViewBox {
  const width = Math.max(bounds.maxX - bounds.minX, MAP_WIDTH * 0.05);
  const height = Math.max(bounds.maxY - bounds.minY, MAP_HEIGHT * 0.05);
  const paddingFactor = countryName === "インドネシア" ? INDONESIA_PADDING_FACTOR : COUNTRY_PADDING_FACTOR;
  const fitWidthRatio = countryName === "インドネシア" ? 1.0 : 0.9;
  const fitHeightRatio = countryName === "インドネシア" ? 0.92 : 0.9;

  const fitScale = Math.min(
    (MAP_WIDTH * fitWidthRatio) / (width * paddingFactor),
    (MAP_HEIGHT * fitHeightRatio) / (height * paddingFactor)
  );

  const minScale = countryName === "インドネシア" ? INDONESIA_MIN_SCALE : MIN_COUNTRY_SCALE;
  const scale = clamp(Math.max(minScale, fitScale), MIN_COUNTRY_SCALE, MAX_COUNTRY_SCALE);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const zoomWidth = MAP_WIDTH / scale;
  const zoomHeight = MAP_HEIGHT / scale;

  return {
    x: clamp(centerX - zoomWidth / 2, 0, MAP_WIDTH - zoomWidth),
    y: clamp(centerY - zoomHeight / 2, 0, MAP_HEIGHT - zoomHeight),
    width: zoomWidth,
    height: zoomHeight,
  };
}

function boxesAlmostEqual(a: ViewBox, b: ViewBox): boolean {
  const eps = 0.01;
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  );
}

async function loadMapFeatures(): Promise<Feature[]> {
  const candidates = ["/data/asean_context_10m.geojson", "/data/asean_10m.geojson"];

  for (const path of candidates) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) {
        continue;
      }
      const payload = (await res.json()) as FeatureCollection;
      if (Array.isArray(payload.features) && payload.features.length > 0) {
        return payload.features;
      }
    } catch {
      // Try next source.
    }
  }

  throw new Error("地図データを読み込めませんでした");
}

export default function App(): JSX.Element {
  const [geoFeatures, setGeoFeatures] = useState<Feature[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<ActiveLabel | null>(null);
  const [mapError, setMapError] = useState<string>("");
  const [viewBox, setViewBox] = useState<ViewBox>(FULL_VIEWBOX);

  const viewBoxRef = useRef<ViewBox>(FULL_VIEWBOX);
  const viewBoxAnimationRef = useRef<number | null>(null);
  const viewBoxAnimationResolveRef = useRef<(() => void) | null>(null);
  const activeLabelRef = useRef<ActiveLabel | null>(null);
  const labelExitTimerRef = useRef<number | null>(null);
  const transitionRunRef = useRef(0);

  useEffect(() => {
    viewBoxRef.current = viewBox;
  }, [viewBox]);

  useEffect(() => {
    activeLabelRef.current = activeLabel;
  }, [activeLabel]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const loadedFeatures = await loadMapFeatures();
        if (active) {
          setGeoFeatures(loadedFeatures);
          setMapError("");
        }
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : "地図データの読み込みに失敗しました";
          setMapError(message);
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (viewBoxAnimationRef.current !== null) {
        cancelAnimationFrame(viewBoxAnimationRef.current);
        viewBoxAnimationRef.current = null;
      }
      if (viewBoxAnimationResolveRef.current) {
        viewBoxAnimationResolveRef.current();
        viewBoxAnimationResolveRef.current = null;
      }
      if (labelExitTimerRef.current !== null) {
        window.clearTimeout(labelExitTimerRef.current);
        labelExitTimerRef.current = null;
      }
    };
  }, []);

  const { paths, countryBounds } = useMemo(() => buildMapPaths(geoFeatures), [geoFeatures]);

  useEffect(() => {
    if (selectedCountry !== "all" && !countryBounds.has(selectedCountry)) {
      setSelectedCountry("all");
    }
  }, [countryBounds, selectedCountry]);

  const visibleCountryRequirements = useMemo(() => {
    if (selectedCountry === "all") {
      return COUNTRY_REQUIREMENTS;
    }
    return COUNTRY_REQUIREMENTS.filter((item) => item.country === selectedCountry);
  }, [selectedCountry]);

  const animateViewBox = useCallback((target: ViewBox, durationMs = ZOOM_ANIMATION_MS): Promise<void> => {
    return new Promise((resolve) => {
      if (boxesAlmostEqual(viewBoxRef.current, target)) {
        viewBoxRef.current = target;
        setViewBox(target);
        resolve();
        return;
      }

      if (viewBoxAnimationRef.current !== null) {
        cancelAnimationFrame(viewBoxAnimationRef.current);
        viewBoxAnimationRef.current = null;
      }
      if (viewBoxAnimationResolveRef.current) {
        viewBoxAnimationResolveRef.current();
        viewBoxAnimationResolveRef.current = null;
      }

      viewBoxAnimationResolveRef.current = resolve;

      const startAt = performance.now();
      const from = { ...viewBoxRef.current };
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const step = (now: number) => {
        const t = Math.min(1, (now - startAt) / durationMs);
        const e = easeOutCubic(t);

        const next: ViewBox = {
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          width: from.width + (target.width - from.width) * e,
          height: from.height + (target.height - from.height) * e,
        };

        viewBoxRef.current = next;
        setViewBox(next);

        if (t < 1) {
          viewBoxAnimationRef.current = requestAnimationFrame(step);
          return;
        }

        viewBoxRef.current = target;
        setViewBox(target);
        viewBoxAnimationRef.current = null;

        if (viewBoxAnimationResolveRef.current) {
          const done = viewBoxAnimationResolveRef.current;
          viewBoxAnimationResolveRef.current = null;
          done();
        } else {
          resolve();
        }
      };

      viewBoxAnimationRef.current = requestAnimationFrame(step);
    });
  }, []);

  const hideEditorialLabel = useCallback((runId: number): Promise<void> => {
    return new Promise((resolve) => {
      const currentLabel = activeLabelRef.current;
      if (!currentLabel) {
        resolve();
        return;
      }

      setActiveLabel({ countryName: currentLabel.countryName, phase: "exiting" });

      if (labelExitTimerRef.current !== null) {
        window.clearTimeout(labelExitTimerRef.current);
      }
      labelExitTimerRef.current = window.setTimeout(() => {
        if (runId !== transitionRunRef.current) {
          resolve();
          return;
        }
        setActiveLabel(null);
        labelExitTimerRef.current = null;
        resolve();
      }, LABEL_EXIT_TOTAL_MS);
    });
  }, []);

  const showEditorialLabel = useCallback((countryName: string, runId: number) => {
    setActiveLabel({ countryName, phase: "entering" });
    requestAnimationFrame(() => {
      if (runId !== transitionRunRef.current) {
        return;
      }
      setActiveLabel((prev) => (prev && prev.countryName === countryName ? { countryName, phase: "visible" } : prev));
    });
  }, []);

  useEffect(() => {
    const runId = transitionRunRef.current + 1;
    transitionRunRef.current = runId;

    const execute = async () => {
      if (labelExitTimerRef.current !== null) {
        window.clearTimeout(labelExitTimerRef.current);
        labelExitTimerRef.current = null;
      }

      if (selectedCountry === "all") {
        setActiveLabel(null);
        await animateViewBox(FULL_VIEWBOX, RESET_ANIMATION_MS);
        return;
      }

      await hideEditorialLabel(runId);
      if (runId !== transitionRunRef.current) {
        return;
      }

      const bounds = countryBounds.get(selectedCountry);
      if (!bounds) {
        await animateViewBox(FULL_VIEWBOX);
        return;
      }

      await animateViewBox(viewBoxForCountry(selectedCountry, bounds));
      if (runId !== transitionRunRef.current) {
        return;
      }

      showEditorialLabel(selectedCountry, runId);
    };

    void execute();
  }, [animateViewBox, countryBounds, hideEditorialLabel, selectedCountry, showEditorialLabel]);

  const { contextPaths, aseanPaths } = useMemo(() => {
    const context = paths.filter((path) => !path.isAsean);
    const asean = paths.filter((path) => path.isAsean);

    const rank = (path: MapPath): number => {
      if (path.countryName && selectedCountry !== "all" && path.countryName === selectedCountry) {
        return 2;
      }
      if (path.countryName && hoveredCountry === path.countryName) {
        return 1;
      }
      return 0;
    };

    asean.sort((a, b) => rank(a) - rank(b));

    return {
      contextPaths: context,
      aseanPaths: asean,
    };
  }, [hoveredCountry, paths, selectedCountry]);

  const onSelectCountry = useCallback((countryName: string) => {
    setHoveredCountry(null);
    setSelectedCountry((prev) => (prev === countryName ? "all" : countryName));
  }, []);

  const editorialLabel = useMemo(() => {
    if (!activeLabel) {
      return null;
    }

    const spec = EDITORIAL_LABELS.get(activeLabel.countryName);
    const bounds = countryBounds.get(activeLabel.countryName);
    if (!spec || !bounds) {
      return null;
    }

    const countryWidth = Math.max(1, bounds.maxX - bounds.minX);
    const countryHeight = Math.max(1, bounds.maxY - bounds.minY);
    const isTall = countryHeight > countryWidth * 1.12;
    const isWide = countryWidth > countryHeight * 1.15;

    let anchorX = (bounds.minX + bounds.maxX) / 2;
    let anchorY = (bounds.minY + bounds.maxY) / 2 - (isTall ? countryHeight * 0.2 : countryHeight * 0.16);

    if (isWide) {
      anchorX -= countryWidth * 0.03;
    }

    anchorX += viewBox.width * spec.nudgeX;
    anchorY += viewBox.height * spec.nudgeY;

    const left = clamp(((anchorX - viewBox.x) / viewBox.width) * 100, 14, 86);
    const top = clamp(((anchorY - viewBox.y) / viewBox.height) * 100, 10, 76);

    const style = {
      left: `${left}%`,
      top: `${top}%`,
      "--label-tracking": spec.tracking,
      "--rule-offset": `${spec.ruleOffset}px`,
    } as CSSProperties & Record<string, string>;

    return {
      ...spec,
      phase: activeLabel.phase,
      style,
    };
  }, [activeLabel, countryBounds, viewBox]);

  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>(".fade-in");
    if (targets.length === 0) {
      return;
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      targets.forEach((target) => target.classList.add("visible"));
      return;
    }

    if (!("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, []);

  const renderMapBody = () => {
    if (mapError) {
      return (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="map-error-text">
          {mapError}
        </text>
      );
    }

    if (paths.length === 0) {
      return (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="map-error-text">
          地図を読み込み中...
        </text>
      );
    }

    return (
      <g className="map-group">
        <g className="context-layer">
          {contextPaths.map((path) => (
            <path key={path.key} d={path.d} className="context-shape" aria-hidden="true" />
          ))}
        </g>
        <g className="asean-layer">
          {aseanPaths.map((path) => {
            const countryName = path.countryName;
            if (!countryName) {
              return null;
            }

            const active = selectedCountry !== "all" && selectedCountry === countryName;
            const hover = !active && hoveredCountry === countryName;
            const className = `country-shape${hover ? " hover" : ""}${active ? " active" : ""}`;

            return (
              <path
                key={path.key}
                d={path.d}
                data-iso3={path.iso3}
                data-country={countryName}
                className={className}
                tabIndex={0}
                aria-label={countryName}
                onMouseEnter={() => setHoveredCountry(countryName)}
                onFocus={() => setHoveredCountry(countryName)}
                onBlur={() => setHoveredCountry((prev) => (prev === countryName ? null : prev))}
                onClick={(event) => {
                  event.preventDefault();
                  onSelectCountry(countryName);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  onSelectCountry(countryName);
                }}
              />
            );
          })}
        </g>
      </g>
    );
  };

  return (
    <>
      <nav className="global-nav" aria-label="Global navigation">
        <div className="nav-inner">
          <a className="nav-logo" href="#top" aria-label="Top">
            ASEAN
          </a>
          <div className="nav-links">
            <a href="#top">ホーム</a>
            <a href="#map-section">マップ</a>
            <a href="#table-section">比較表</a>
          </div>
          <div className="nav-actions" aria-hidden="true">
            <span>EN</span>
          </div>
        </div>
      </nav>

      <header id="top" className="hero hero--light fade-in">
        <p className="hero-kicker">ASEAN LOW VOLTAGE BUSINESS PORTAL</p>
        <h1>ASEAN低圧配制事業ポータル</h1>
      </header>

      <main>
        <section id="map-section" className="hero hero--gray fade-in">
          <div className="map-stage" aria-label="ASEAN map navigation">
            <svg
              id="asean-map-svg"
              viewBox={`${fmt(viewBox.x)} ${fmt(viewBox.y)} ${fmt(viewBox.width)} ${fmt(viewBox.height)}`}
              role="img"
              aria-label="ASEAN countries map"
              onMouseLeave={() => setHoveredCountry(null)}
            >
              {renderMapBody()}
            </svg>
            {editorialLabel ? (
              <div className={`editorial-label phase-${editorialLabel.phase}`} style={editorialLabel.style} aria-hidden="true">
                <div className="label-title-wrap">
                  <p className="label-headline">{editorialLabel.headline}</p>
                  <span className="label-rule" />
                </div>
                <p className="label-official">{editorialLabel.official}</p>
              </div>
            ) : null}
          </div>
        </section>

        <section id="table-section" className="content-block fade-in">
          <p className="section-kicker">PRODUCT-CATEGORY CERTIFICATION REQUIREMENTS</p>
          <h2>ASEAN低圧遮断器 製品別規格認証対応表</h2>
          <p className="section-subline">Product-Category Certification Requirements for Low-Voltage Circuit Breakers in ASEAN</p>

          <article className="reference-block">
            <h3>製品カテゴリ定義</h3>
            <div className="table-wrap">
              <table className="definition-table">
                <thead>
                  <tr>
                    <th>略称</th>
                    <th>製品名</th>
                    <th>適用スコープ</th>
                    <th>定格範囲</th>
                    <th>主要IEC規格</th>
                    <th>用途</th>
                  </tr>
                </thead>
                <tbody>
                  {PRODUCT_CATEGORIES.map((item) => (
                    <tr key={item.abbr}>
                      <td>
                        <strong>{item.abbr}</strong>
                      </td>
                      <td>{item.productName}</td>
                      <td>{item.scope}</td>
                      <td>{item.ratingRange}</td>
                      <td>
                        {item.abbr === "MCB" ? (
                          <>
                            IEC 60898-1（家庭）
                            <br />
                            IEC 60947-2（産業）
                          </>
                        ) : (
                          item.iecStandard
                        )}
                      </td>
                      <td>{item.usage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="notes-list product-category-notes">
              {PRODUCT_CATEGORY_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>

          <article className="reference-block">
            <h3>凡例</h3>
            <div className="legend-inline" role="list" aria-label="凡例">
              {LEGEND_ROWS.map((item) => (
                <p className="legend-inline-item" role="listitem" key={item.category}>
                  <strong>{item.category}</strong>
                  <span>{item.meaning}</span>
                </p>
              ))}
            </div>
          </article>

          {visibleCountryRequirements.map((country) => (
            <article className="country-block" key={country.country}>
              <h3>{country.country}</h3>
              <div className="table-wrap">
                <table className="requirements-table">
                  <thead>
                    <tr>
                      <th>製品</th>
                      <th>認証</th>
                      <th>適用規格</th>
                      <th>認証機関</th>
                      <th>備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {country.rows.map((row) => (
                      <tr key={`${country.country}-${row.product}`}>
                        <td>
                          <strong>{row.product}</strong>
                        </td>
                        <td>{row.requirement}</td>
                        <td>{row.standard}</td>
                        <td>{row.authority}</td>
                        <td>{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="country-procedure">
                <strong>{country.footnoteLabel}：</strong>
                {country.footnote}
              </p>
            </article>
          ))}

          <article className="reference-block">
            <h3>製品別・国別 認証要否サマリー</h3>
            <div className="table-wrap">
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>国</th>
                    <th>ACB</th>
                    <th>MCCB</th>
                    <th>MCB</th>
                    <th>RCCB</th>
                    <th>RCBO</th>
                  </tr>
                </thead>
                <tbody>
                  {CERT_SUMMARY_ROWS.map((row) => (
                    <tr key={row.country}>
                      <td>{row.country}</td>
                      <td>{row.acb}</td>
                      <td>{row.mccb}</td>
                      <td>{row.mcb}</td>
                      <td>{row.rccb}</td>
                      <td>{row.rcbo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="reference-block">
            <h3>規格番号クイックリファレンス</h3>
            <h4>住宅用（MCB/RCCB/RCBO）</h4>
            <div className="table-wrap">
              <table className="quick-table">
                <thead>
                  <tr>
                    <th>国</th>
                    <th>MCB規格</th>
                    <th>RCCB規格</th>
                    <th>RCBO規格</th>
                  </tr>
                </thead>
                <tbody>
                  {RESIDENTIAL_QUICK_ROWS.map((row) => (
                    <tr key={row.country}>
                      <td>{row.country}</td>
                      <td>{row.mcb}</td>
                      <td>{row.rccb}</td>
                      <td>{row.rcbo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4>産業用（ACB/MCCB）</h4>
            <div className="table-wrap">
              <table className="quick-table">
                <thead>
                  <tr>
                    <th>国</th>
                    <th>参照規格</th>
                    <th>強制認証</th>
                  </tr>
                </thead>
                <tbody>
                  {INDUSTRIAL_QUICK_ROWS.map((row) => (
                    <tr key={row.country}>
                      <td>{row.country}</td>
                      <td>{row.reference}</td>
                      <td>{row.mandatory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="reference-block">
            <h3>重要注意事項</h3>
            <ol className="notes-list">
              {IMPORTANT_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ol>
          </article>
        </section>
      </main>

      <footer className="footer fade-in">
        <div className="footer-inner">
          <p className="footer-note">注意: 法令・制度は更新されるため、最終判断前に必ず一次情報を確認してください。</p>
          <p className="footer-note">最終更新：2026年2月11日</p>
          <div className="footer-line" />
          <small>ASEAN Low Voltage Business Portal</small>
        </div>
      </footer>
    </>
  );
}

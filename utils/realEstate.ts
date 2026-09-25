import { PropertyData, AppState } from '@/types';
import {
  getJsBSlides,
  extractJsBMedia,
  getJsBCoverConfig,
  processCoverImage,
  processCoverImageForPptx,
  formatRentalArea,
  formatRent,
  formatCommonFee,
  cleanVal,
  buildDynamicPropertyDetailItems,
  isValidDetailValue,
} from '@/components/JsBTemplate';

/**
 * 宅建業免許更新日: 令和8年 (2026年) 10月22日
 * この日付以降は免許番号の (2) を (3) に自動更新
 * 
 * 2026年10月21日まで: 東京都知事（2）第99830号
 * 2026年10月22日以降: 東京都知事（3）第99830号
 */
export const LICENSE_RENEWAL_DATE = new Date(2026, 9, 22); // Month is 0-indexed (9 = Oct)

export function getUpdatedLicenseNumber(licenseStr: string = '東京都知事（2）第99830号', asOfDate: Date = new Date()): {
  formattedLicense: string;
  isAutoUpdated: boolean;
} {
  const currentLicense = licenseStr || '東京都知事（2）第99830号';
  const isPastRenewal = asOfDate.getTime() >= LICENSE_RENEWAL_DATE.getTime();

  if (isPastRenewal) {
    const regex2 = /(\(|（)(2|２)(\)|）)/;
    if (regex2.test(currentLicense)) {
      const updated = currentLicense.replace(regex2, '（3）');
      return { formattedLicense: updated, isAutoUpdated: true };
    }
  }

  return { formattedLicense: currentLicense, isAutoUpdated: false };
}

/**
 * YYYYMMDD 形式の日付文字列を生成 (例: 20260827)
 */
export function formatDateYYYYMMDD(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 物件名・所在地からGoogle Maps検索URLを自動生成
 * 検索対象: 物件名＋完全な所在地
 */
export function getGoogleMapsUrl(name: string = '', address: string = ''): string {
  const cleanName = (name && name !== '要確認') ? name.trim() : '';
  const cleanAddr = (address && address !== '要確認') ? address.trim() : '';
  const query = `${cleanName} ${cleanAddr}`.trim();
  if (!query) return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * 提案メール文面の自動作成（仕様第9項・第10項の固定フォーマット準拠）
 */
export function generateProposalEmail(data: PropertyData, jsContact: AppState['jsContact'], customUrl?: string): string {
  const { property, area, rent, deposit, keyMoney, depreciation, contract, handover } = data;

  const buildingName = property.name || '［物件名］';
  const address = property.address || '［所在地］';
  const googleMapsUrl = customUrl || getGoogleMapsUrl(property.name, property.address);

  // 階数・面積 (例: 3階301号室／49.02㎡（14.80坪）)
  let floorAndArea = '―';
  if (data.units && data.units.length > 1) {
    const unitLines = data.units.map(u => {
      const f = u.floor || u.unitId;
      const r = u.unitName ? ` ${u.unitName}` : '';
      const a = u.areaTsubo ? `／${u.areaTsubo}坪${u.areaSqm ? `（${u.areaSqm}㎡）` : ''}` : '';
      const rentInfo = u.rent ? `／賃料: ${typeof u.rent === 'number' ? `${u.rent.toLocaleString()}円` : u.rent}` : '';
      return `・${f}${r} ${a} ${rentInfo}`.trim();
    }).join('\n');
    floorAndArea = `複数区画募集（全${data.units.length}区画）\n${unitLines}`;
  } else {
    const floorPart = [property.floor ? `${property.floor}` : '', property.room ? `${property.room}号室` : ''].filter(Boolean).join(' ');
    const areaPart = [
      area.sqm !== null && area.sqm !== undefined ? `${area.sqm}㎡` : '',
      area.tsubo !== null && area.tsubo !== undefined ? `（${area.tsubo}坪）` : ''
    ].filter(Boolean).join('');
    
    if (floorPart && areaPart) {
      floorAndArea = `${floorPart}／${areaPart}`;
    } else if (floorPart || areaPart) {
      floorAndArea = `${floorPart}${areaPart}`;
    }
  }

  // 契約形態 (例: 定期借家3年、普通借家等)
  const contractType = contract || 'ご相談';

  // 賃料 (元資料表記に従い税込・税別を明記)
  let rentStr = 'ご相談';
  if (rent.amount !== null && rent.amount !== undefined && rent.amount > 0) {
    const taxStr = rent.taxIncluded === true ? '（税込）' : rent.taxIncluded === false ? '（税別）' : '';
    rentStr = `${rent.amount.toLocaleString()}円 / 月額 ${taxStr}`.trim();
    if (rent.tsuboPrice) {
      rentStr += `（坪単価: ${rent.tsuboPrice.toLocaleString()}円）`;
    }
  }

  // 保証金 / 礼金 / 償却
  const depositStr = deposit || 'ご相談';
  const keyMoneyStr = keyMoney || 'なし';
  const depreciationStr = depreciation || 'なし';

  // 引き渡し（状態）と引き渡し時期を分離 (仕様第11項)
  const handoverStatus = property.handoverStatus || (handover && !handover.includes('即日') && !handover.includes('退去') ? handover : '現況有姿（相談）');
  const handoverTiming = property.handoverTiming || (handover && (handover.includes('即日') || handover.includes('相談') || handover.includes('予定')) ? handover : '相談');

  const staffName = jsContact.personName || '［作成担当者］';
  const staffTel = jsContact.personTel || '［担当者携帯番号］';

  return `【本情報は貴社限りにてお願いいたします】

建物名：${buildingName}

住所：${address}

URL: ${googleMapsUrl}

階数・面積：${floorAndArea}

契約形態：${contractType}

賃料：${rentStr}

保証金：${depositStr}

礼金：${keyMoneyStr}

償却：${depreciationStr}

引き渡し：${handoverStatus}

引き渡し時期：${handoverTiming}

※　情報取り扱いには最大限ご注意いただきたい旨、ご留意くださいませ

※　契約面積は現況優先な為、若干変動する可能性がございます

ーーーーーーーーーーーーーーーー
${jsContact.company}

${jsContact.address}

TEL：${jsContact.tel}
FAX：${jsContact.fax}
MAIL：${jsContact.infoEmail}

担当：${staffName}
MOBILE：${staffTel}`;
}

/**
 * 提案メールPDFの生成・ダウンロード (仕様第12項)
 * ファイル名: ［物件名］_提案メール_YYYYMMDD.pdf
 */
export async function downloadProposalEmailPdf(
  data: PropertyData,
  jsContact: AppState['jsContact'],
  options?: { customDate?: Date; customUrl?: string }
): Promise<string> {
  const { jsPDF } = await import('jspdf');

  const targetDate = options?.customDate || new Date();
  const dateStrYYYYMMDD = formatDateYYYYMMDD(targetDate);
  const { formattedLicense } = getUpdatedLicenseNumber(jsContact.licenseNumber, targetDate);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const buildingName = data.property.name || '物件';
  const mapsUrl = options?.customUrl || getGoogleMapsUrl(data.property.name, data.property.address);

  // Document Title Header
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42); // slate-900
  pdf.text('PROPERTY PROPOSAL / 物件ご提案書', 20, 22);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139); // slate-500
  const displayDateStr = targetDate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  pdf.text(`作成日: ${displayDateStr} | ${jsContact.company}`, 20, 28);

  // Top Divider
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.5);
  pdf.line(20, 32, 190, 32);

  // Confidential Banner
  pdf.setFillColor(239, 246, 255); // blue-50
  pdf.roundedRect(20, 36, 170, 10, 1.5, 1.5, 'F');
  pdf.setTextColor(30, 64, 175); // blue-800
  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text('【本情報は貴社限りにてお願いいたします】', 25, 42.5);

  // Content Items
  let y = 53;
  const floorPart = [data.property.floor ? `${data.property.floor}` : '', data.property.room ? `${data.property.room}号室` : ''].filter(Boolean).join(' ');
  const areaPart = [
    data.area.sqm !== null && data.area.sqm !== undefined ? `${data.area.sqm}㎡` : '',
    data.area.tsubo !== null && data.area.tsubo !== undefined ? `（${data.area.tsubo}坪）` : ''
  ].filter(Boolean).join('');
  const floorAndArea = (floorPart && areaPart) ? `${floorPart}／${areaPart}` : (floorPart || areaPart || '―');

  let rentStr = 'ご相談';
  if (data.rent.amount !== null && data.rent.amount !== undefined && data.rent.amount > 0) {
    const taxStr = data.rent.taxIncluded === true ? '（税込）' : data.rent.taxIncluded === false ? '（税別）' : '';
    rentStr = `${data.rent.amount.toLocaleString()}円 / 月額 ${taxStr}`.trim();
    if (data.rent.tsuboPrice) {
      rentStr += `（坪単価: ${data.rent.tsuboPrice.toLocaleString()}円）`;
    }
  }

  const items = [
    { label: '建物名', value: data.property.name || '―' },
    { label: '住所', value: data.property.address || '―' },
    { label: 'URL', value: mapsUrl, isUrl: true },
    { label: '階数・面積', value: floorAndArea },
    { label: '契約形態', value: data.contract || 'ご相談' },
    { label: '賃料', value: rentStr },
    { label: '保証金', value: data.deposit || 'ご相談' },
    { label: '礼金', value: data.keyMoney || 'なし' },
    { label: '償却', value: data.depreciation || 'なし' },
    { label: '引き渡し', value: data.property.handoverStatus || data.handover || '現況有姿（相談）' },
    { label: '引き渡し時期', value: data.property.handoverTiming || '相談' },
  ];

  items.forEach((item, idx) => {
    if (idx % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(20, y - 4, 170, 7.5, 'F');
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(item.label, 24, y + 1.2);

    if (item.isUrl) {
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(37, 99, 235);
      const splitVal = pdf.splitTextToSize(item.value, 115);
      pdf.text(splitVal, 68, y + 1.2);
      // Add clickable link
      pdf.link(68, y - 3, 115, 6, { url: item.value });
      y += Math.max(7.5, splitVal.length * 4.5);
    } else {
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(15, 23, 42);
      const splitVal = pdf.splitTextToSize(item.value, 115);
      pdf.text(splitVal, 68, y + 1.2);
      y += Math.max(7.5, splitVal.length * 4.5);
    }
  });

  // Notes Section
  y += 2;
  pdf.setFillColor(254, 242, 242);
  pdf.roundedRect(20, y, 170, 16, 1.5, 1.5, 'F');
  pdf.setTextColor(185, 28, 28);
  pdf.setFontSize(8);
  pdf.text('※ 情報取り扱いには最大限ご注意いただきたい旨、ご留意くださいませ。', 24, y + 5.5);
  pdf.text('※ 契約面積は現況優先な為、若干変動する可能性がございます。', 24, y + 11);

  // Company & Staff Contact Box (Section 4 specifications)
  y += 20;
  pdf.setDrawColor(203, 213, 225);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(20, y, 170, 36, 2, 2, 'D');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  pdf.text(jsContact.company, 25, y + 7.5);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.text(jsContact.address, 25, y + 13);
  pdf.text(`TEL：${jsContact.tel}   FAX：${jsContact.fax}   MAIL：${jsContact.infoEmail}`, 25, y + 18.5);

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 64, 175);
  pdf.text(`担当：${jsContact.personName || '［未選択］'}`, 25, y + 25.5);
  pdf.text(`MOBILE：${jsContact.personTel || '［未入力］'}   免許番号: ${formattedLicense}`, 25, y + 31);

  const cleanFilenameName = (buildingName || '物件').replace(/[\\/:*?"<>|]/g, '_');
  const filename = `${cleanFilenameName}_提案メール_${dateStrYYYYMMDD}.pdf`;
  pdf.save(filename);
  return filename;
}

/**
 * PowerPoint (.pptx) の生成・ダウンロード
 * - JS-B (プレゼン資料型・銀座並木通り型): 4スライド構成
 *   [Slide 1: 表紙 / Slide 2: 建物概要・外観 / Slide 3: 広域図・詳細図 / Slide 4: テナント構成・写真]
 * - JS-A / JS-C / JS-D: 1スライドマイソク構成
 * - 全てネイティブオブジェクト（テキスト・表・図形・画像）として出力
 */
export async function downloadPowerPointPresentation(
  appState: AppState,
  images: { main?: string; floorPlan?: string; map?: string; detailMap?: string } = {},
  options?: { customDate?: Date }
): Promise<string> {
  const data = appState.data;
  if (!data) throw new Error('物件データがありません');

  const targetDate = options?.customDate || new Date();
  const dateStrYYYYMMDD = formatDateYYYYMMDD(targetDate);
  const displayDateStr = targetDate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
  const { formattedLicense } = getUpdatedLicenseNumber(appState.jsContact.licenseNumber, targetDate);
  const mapsUrl = getGoogleMapsUrl(data.property.name, data.property.address);

  const pptxModule = await import('pptxgenjs');
  const PptxGenJS = (pptxModule as any).default || pptxModule;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  const cleanFilenameName = (data.property.name || '物件').replace(/[\\/:*?"<>|]/g, '_');
  const targetImages = {
    main: images.main || data.images?.main,
    floorPlan: images.floorPlan || data.images?.floorPlan,
    map: images.map || data.images?.map || data.maps?.wideMapUrl,
    detailMap: images.detailMap || data.images?.detailMap || data.maps?.detailMapUrl,
    subPhotos: data.images?.subPhotos || [],
    classifiedList: data.images?.classifiedList || [],
  };

  if (appState.format === 'JS-B') {
    // ==========================================
    // JS-B: プレゼン資料型（動的スライド構成）
    // COVER, PROPERTY DETAILS, LOCATION, PHOTO, PLAN(区画ごと)
    // ==========================================
    const media = extractJsBMedia(appState, targetImages);
    const jsbSlides = getJsBSlides(appState, targetImages);

    for (const slideDef of jsbSlides) {
      if (slideDef.type === 'COVER') {
        // ------------------------------------------
        // COVER: 表紙 (JsBCoverSlide と同一の getJsBCoverConfig から生成)
        // ------------------------------------------
        const coverConfig = getJsBCoverConfig(appState, targetImages);
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };

        if (coverConfig.backgroundImage && !coverConfig.isMissing) {
          let coverDataUrl = coverConfig.backgroundImage;
          try {
            coverDataUrl = await processCoverImage(coverConfig.backgroundImage, coverConfig);
          } catch (err) {
            console.warn('Cover image grayscale processing error', err);
          }

          slide.addImage({
            data: coverDataUrl,
            x: 0,
            y: 0,
            w: 13.33,
            h: 7.5,
            sizing: { type: 'cover', w: 13.33, h: 7.5 },
          });
        } else {
          // 外観写真未設定時の背景プレースホルダー
          slide.addShape(pptx.ShapeType.rect, {
            x: 0,
            y: 0,
            w: 13.33,
            h: 7.5,
            fill: { color: 'F1F5F9' },
            line: { color: 'CBD5E1' },
          });
          slide.addText('【表紙背景画像が未設定です】\n外観写真が設定されると自動的にモノクロ調で全面配置されます', {
            x: 2.0,
            y: 2.0,
            w: 9.33,
            h: 1.5,
            fontSize: 14,
            color: '94A3B8',
            align: 'center',
            valign: 'middle',
          });
        }

        // 下部エメラルドグリーン帯 (JsBCoverSlide の bandColor, bandOpacity, bandHeightPercent を共通参照)
        const bandH = 7.5 * (coverConfig.bandHeightPercent / 100);
        const bandY = 7.5 - bandH;
        const transparency = Math.round((1 - coverConfig.bandOpacity) * 100);

        slide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: bandY,
          w: 13.33,
          h: bandH,
          fill: { color: coverConfig.bandColorHexNoHash, transparency },
          line: { color: coverConfig.bandColorHexNoHash, transparency },
        });

        slide.addText(
          [
            {
              text: `${coverConfig.title}\n`,
              options: {
                fontSize: 24,
                bold: true,
                color: 'FFFFFF',
              },
            },
            {
              text: coverConfig.subtitle,
              options: {
                fontSize: 16,
                bold: true,
                color: 'FFFFFF',
              },
            },
          ],
          {
            x: 0.9,
            y: bandY + 0.1,
            w: 11.5,
            h: bandH - 0.2,
            valign: 'middle',
          }
        );
      } else if (slideDef.type === 'DETAILS') {
        // ------------------------------------------
        // DETAILS: 物件概要（可変項目レイアウト）
        // ------------------------------------------
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };

        // Header
        slide.addText('PROPERTY DETAILS', {
          x: 0.8,
          y: 0.45,
          w: 6.0,
          h: 0.5,
          fontSize: 16,
          bold: true,
          color: '20B26C',
          valign: 'middle',
        });
        slide.addText('J.square', {
          x: 10.5,
          y: 0.45,
          w: 2.0,
          h: 0.5,
          fontSize: 13,
          bold: true,
          color: '0F172A',
          align: 'right',
          valign: 'middle',
        });

        // 基本項目 + 追加項目の完全マージ配列を取得（値のない項目は除外）
        const detailItems = buildDynamicPropertyDetailItems(data, appState.additionalItems);

        const totalItems = detailItems.length;
        const half = Math.ceil(totalItems / 2);
        const leftItems = detailItems.slice(0, half);
        const rightItems = detailItems.slice(half);

        const isDense = totalItems >= 16;
        const isMedium = totalItems >= 12 && totalItems < 16;

        const startY = 1.15;
        const rowHeight = isDense ? 0.38 : isMedium ? 0.46 : 0.56;
        const pillHeight = isDense ? 0.32 : isMedium ? 0.36 : 0.42;
        const fontSize = isDense ? 8.5 : isMedium ? 9.0 : 9.5;

        leftItems.forEach((row, i) => {
          const y = startY + i * rowHeight;
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.8,
            y: y,
            w: 1.4,
            h: pillHeight,
            fill: { color: '6ED4A4' },
            line: { color: '6ED4A4' },
            rectRadius: 0.08,
          });
          slide.addText(row.label, {
            x: 0.8,
            y: y,
            w: 1.4,
            h: pillHeight,
            fontSize: fontSize,
            bold: true,
            color: 'FFFFFF',
            align: 'center',
            valign: 'middle',
          });
          slide.addText(row.value, {
            x: 2.3,
            y: y,
            w: 3.9,
            h: pillHeight,
            fontSize: fontSize,
            bold: true,
            color: '1E293B',
            valign: 'middle',
          });
        });

        rightItems.forEach((row, i) => {
          const y = startY + i * rowHeight;
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 6.8,
            y: y,
            w: 1.4,
            h: pillHeight,
            fill: { color: '6ED4A4' },
            line: { color: '6ED4A4' },
            rectRadius: 0.08,
          });
          slide.addText(row.label, {
            x: 6.8,
            y: y,
            w: 1.4,
            h: pillHeight,
            fontSize: fontSize,
            bold: true,
            color: 'FFFFFF',
            align: 'center',
            valign: 'middle',
          });
          slide.addText(row.value, {
            x: 8.3,
            y: y,
            w: 4.2,
            h: pillHeight,
            fontSize: fontSize,
            bold: true,
            color: '1E293B',
            valign: 'middle',
          });
        });

        slide.addText('※：賃料は税別表記となります。（保証金・敷金は除く）', {
          x: 0.8,
          y: 6.85,
          w: 8.0,
          h: 0.3,
          fontSize: 8.5,
          color: '64748B',
        });
      } else if (slideDef.type === 'LOCATION') {
        // ------------------------------------------
        // LOCATION: 位置図
        // ------------------------------------------
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };

        slide.addText('LOCATION', {
          x: 0.8,
          y: 0.45,
          w: 6.0,
          h: 0.5,
          fontSize: 16,
          bold: true,
          color: '20B26C',
          valign: 'middle',
        });
        slide.addText('J.square', {
          x: 10.5,
          y: 0.45,
          w: 2.0,
          h: 0.5,
          fontSize: 13,
          bold: true,
          color: '0F172A',
          align: 'right',
          valign: 'middle',
        });

        if (media.mapImage) {
          slide.addImage({
            data: media.mapImage,
            x: 1.2,
            y: 1.3,
            w: 10.9,
            h: 5.5,
            sizing: { type: 'contain', w: 10.9, h: 5.5 },
          });

          // Green pill badge: PROPERTY
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 5.8,
            y: 1.4,
            w: 1.7,
            h: 0.35,
            fill: { color: '20B26C' },
            line: { color: '20B26C' },
            rectRadius: 0.06,
          });
          slide.addText('PROPERTY', {
            x: 5.8,
            y: 1.4,
            w: 1.7,
            h: 0.35,
            fontSize: 9,
            bold: true,
            color: 'FFFFFF',
            align: 'center',
            valign: 'middle',
          });

          slide.addText('※ 掲載地図はGoogle Mapsの地図データです', {
            x: 7.0,
            y: 6.9,
            w: 5.5,
            h: 0.3,
            fontSize: 8,
            color: '94A3B8',
            align: 'right',
            valign: 'bottom',
          });
        } else {
          // 地図未取得時のプレースホルダー（誤った代替地図の出力を防止）
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 1.5,
            y: 1.8,
            w: 10.3,
            h: 4.6,
            fill: { color: 'FFFBEB' },
            line: { color: 'FCD34D', width: 1, dashType: 'dash' },
            rectRadius: 0.1,
          });
          slide.addText('Google Mapsを取得できませんでした。地図画像を指定してください', {
            x: 2.0,
            y: 3.4,
            w: 9.3,
            h: 0.8,
            fontSize: 14,
            bold: true,
            color: '78350F',
            align: 'center',
            valign: 'middle',
          });
        }
      } else if (slideDef.type === 'PHOTO') {
        // ------------------------------------------
        // PHOTO: 物件写真（枚数に応じた動的レイアウト）
        // ------------------------------------------
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };

        slide.addText('PHOTO', {
          x: 0.8,
          y: 0.45,
          w: 6.0,
          h: 0.5,
          fontSize: 16,
          bold: true,
          color: '20B26C',
          valign: 'middle',
        });
        slide.addText('J.square', {
          x: 10.5,
          y: 0.45,
          w: 2.0,
          h: 0.5,
          fontSize: 13,
          bold: true,
          color: '0F172A',
          align: 'right',
          valign: 'middle',
        });

        const displayPhotos = media.photos.slice(0, 4);
        const count = displayPhotos.length;

        if (count === 1) {
          // 1枚: ページ中央に大判1枚
          slide.addImage({
            data: displayPhotos[0],
            x: 0.8,
            y: 1.20,
            w: 11.7,
            h: 5.70,
            sizing: { type: 'cover', w: 11.7, h: 5.70 },
          });
        } else if (count === 2) {
          // 2枚: 左右2分割
          const w = 5.7;
          const h = 5.70;
          slide.addImage({
            data: displayPhotos[0],
            x: 0.8,
            y: 1.20,
            w: w,
            h: h,
            sizing: { type: 'cover', w: w, h: h },
          });
          slide.addImage({
            data: displayPhotos[1],
            x: 6.8,
            y: 1.20,
            w: w,
            h: h,
            sizing: { type: 'cover', w: w, h: h },
          });
        } else if (count === 3) {
          // 3枚: 左側に大判1枚、右側に上下2枚
          const w = 5.7;
          const leftH = 5.70;
          const rightH = 2.70;
          // 左大判
          slide.addImage({
            data: displayPhotos[0],
            x: 0.8,
            y: 1.20,
            w: w,
            h: leftH,
            sizing: { type: 'cover', w: w, h: leftH },
          });
          // 右上
          slide.addImage({
            data: displayPhotos[1],
            x: 6.8,
            y: 1.20,
            w: w,
            h: rightH,
            sizing: { type: 'cover', w: w, h: rightH },
          });
          // 右下
          slide.addImage({
            data: displayPhotos[2],
            x: 6.8,
            y: 4.20,
            w: w,
            h: rightH,
            sizing: { type: 'cover', w: w, h: rightH },
          });
        } else if (count >= 4) {
          // 4枚: 2列×2行グリッド
          const w = 5.7;
          const h = 2.70;
          const slots = [
            { x: 0.8, y: 1.20 },
            { x: 6.8, y: 1.20 },
            { x: 0.8, y: 4.20 },
            { x: 6.8, y: 4.20 },
          ];

          displayPhotos.slice(0, 4).forEach((photoUrl, idx) => {
            slide.addImage({
              data: photoUrl,
              x: slots[idx].x,
              y: slots[idx].y,
              w: w,
              h: h,
              sizing: { type: 'cover', w: w, h: h },
            });
          });
        }
      } else if (slideDef.type === 'PLAN') {
        // ------------------------------------------
        // PLAN: 平面図
        // ------------------------------------------
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };

        const planTitle = slideDef.title || `PLAN：${slideDef.planLabel || '平面図'}`;
        slide.addText(planTitle, {
          x: 0.8,
          y: 0.45,
          w: 6.0,
          h: 0.5,
          fontSize: 16,
          bold: true,
          color: '20B26C',
          valign: 'middle',
        });

        if (slideDef.unitInfo) {
          const parts: string[] = [];
          if (slideDef.unitInfo.areaTsubo) parts.push(`面積: ${slideDef.unitInfo.areaTsubo}坪${slideDef.unitInfo.areaSqm ? ` (${slideDef.unitInfo.areaSqm}㎡)` : ''}`);
          if (slideDef.unitInfo.rent) parts.push(`賃料: ${typeof slideDef.unitInfo.rent === 'number' ? `${slideDef.unitInfo.rent.toLocaleString()}円` : slideDef.unitInfo.rent}`);
          if (parts.length > 0) {
            slide.addText(parts.join('  |  '), {
              x: 6.8,
              y: 0.48,
              w: 3.5,
              h: 0.45,
              fontSize: 10,
              bold: true,
              color: '065F46',
              align: 'right',
              valign: 'middle',
            });
          }
        }

        slide.addText('J.square', {
          x: 10.5,
          y: 0.45,
          w: 2.0,
          h: 0.5,
          fontSize: 13,
          bold: true,
          color: '0F172A',
          align: 'right',
          valign: 'middle',
        });

        if (slideDef.planUrl) {
          slide.addImage({
            data: slideDef.planUrl,
            x: 1.0,
            y: 1.2,
            w: 11.33,
            h: 5.8,
            sizing: { type: 'contain', w: 11.33, h: 5.8 },
          });
        }
      }
    }

  } else {
    // ==========================================
    // JS-A / JS-C / JS-D: 1スライド マイソク形式
    // ==========================================
    const slide = pptx.addSlide();
    slide.background = { color: 'F8FAFC' };

    // Top Header Banner
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.4,
      y: 0.3,
      w: 12.5,
      h: 1.1,
      fill: { color: '0F172A' },
    });

    // Building Name with Google Maps hyperlink
    slide.addText(
      [
        {
          text: data.property.name || '物件名未定',
          options: {
            fontSize: 22,
            bold: true,
            color: 'FFFFFF',
            hyperlink: { url: mapsUrl, tooltip: 'Googleマップで位置を確認' },
          },
        },
        {
          text: `  ${data.property.room ? `${data.property.room}号室` : ''} ${data.property.usage ? `[${data.property.usage}]` : ''}`,
          options: { fontSize: 14, color: '94A3B8', bold: false },
        },
      ],
      { x: 0.6, y: 0.35, w: 7.5, h: 0.9, valign: 'middle' }
    );

    // Access (Right top)
    slide.addText(
      [
        { text: '交 通: ', options: { fontSize: 11, bold: true, color: '38BDF8' } },
        { text: data.property.access || '―', options: { fontSize: 13, bold: true, color: 'FFFFFF' } },
      ],
      { x: 8.2, y: 0.35, w: 4.5, h: 0.9, align: 'right', valign: 'middle' }
    );

    // Visual Elements
    if (targetImages.main) {
      slide.addImage({
        data: targetImages.main,
        x: 0.4,
        y: 1.55,
        w: 3.8,
        h: 2.3,
        sizing: { type: 'contain', w: 3.8, h: 2.3 },
      });
    }

    if (targetImages.floorPlan) {
      slide.addImage({
        data: targetImages.floorPlan,
        x: 4.35,
        y: 1.55,
        w: 3.8,
        h: 2.3,
        sizing: { type: 'contain', w: 3.8, h: 2.3 },
      });
    }

    if (targetImages.map) {
      slide.addImage({
        data: targetImages.map,
        x: 0.4,
        y: 3.95,
        w: 3.8,
        h: 1.25,
        sizing: { type: 'contain', w: 3.8, h: 1.25 },
      });
    }

    // Rent & Catch copy
    slide.addShape(pptx.ShapeType.rect, {
      x: 8.3,
      y: 1.55,
      w: 4.6,
      h: 1.15,
      fill: { color: '1E3A8A' },
    });

    const rentAmountStr = (data.rent.amount && data.rent.amount > 0) ? data.rent.amount.toLocaleString() : 'ご相談';
    const taxStr = data.rent.taxIncluded ? '(税込)' : data.rent.taxIncluded === false ? '(税別)' : '';

    slide.addText(
      [
        { text: '賃料\n', options: { fontSize: 11, color: '93C5FD', bold: true } },
        { text: `${rentAmountStr} `, options: { fontSize: 24, color: 'FFFFFF', bold: true } },
        { text: rentAmountStr === 'ご相談' ? '' : `円/月額 ${taxStr}`, options: { fontSize: 12, color: 'FFFFFF' } },
      ],
      { x: 8.4, y: 1.58, w: 4.4, h: 1.05, align: 'center', valign: 'middle' }
    );

    let additionalText = appState.additionalItems.map(item => `■ ${item.name}: ${item.content}`).join('\n');
    if (!additionalText) {
      additionalText = `■ おすすめポイント: 好立地物件\n■ 最寄駅: ${data.property.access || '―'}\n■ Googleマップ: ${mapsUrl}`;
    }

    slide.addShape(pptx.ShapeType.rect, {
      x: 8.3,
      y: 2.8,
      w: 4.6,
      h: 1.05,
      fill: { color: 'EFF6FF' },
      line: { color: 'BFDBFE', width: 1 },
    });

    slide.addText(additionalText, {
      x: 8.4,
      y: 2.85,
      w: 4.4,
      h: 0.95,
      fontSize: 9.5,
      color: '1E40AF',
    });

    // Property Details Table
    const tableRows = [
      [
        { text: '所在地', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: data.property.address || '―', options: { colspan: 3, fontSize: 9 } },
        { text: '契約面積', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: `${data.area.tsubo ? `${data.area.tsubo}坪` : ''} ${data.area.sqm ? `(${data.area.sqm}㎡)` : ''}`.trim() || '―', options: { fontSize: 9 } },
      ],
      [
        { text: '共益費', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: (data.commonFee.amount && data.commonFee.amount > 0) ? `${data.commonFee.amount.toLocaleString()}円` : 'なし', options: { fontSize: 9 } },
        { text: '敷金/保証金', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: data.keyMoney || data.deposit || 'ご相談', options: { fontSize: 9 } },
        { text: '礼金/償却', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: data.depreciation || 'なし', options: { fontSize: 9 } },
      ],
      [
        { text: '契約期間', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: data.contract || '相談', options: { fontSize: 9 } },
        { text: '引渡時期', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: data.property.handoverTiming || data.handover || '相談', options: { fontSize: 9 } },
        { text: '構造・規模', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: `${data.building.structure || ''} ${data.building.scale || ''}`.trim() || '―', options: { fontSize: 9 } },
      ],
      [
        { text: '築年月', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: data.building.builtYearMonth || '―', options: { fontSize: 9 } },
        { text: '設備・備考', options: { bold: true, fill: { color: 'E2E8F0' }, fontSize: 9 } },
        { text: `${data.equipment.join(' / ')} ${data.conditions.join(' / ')}`.trim() || '―', options: { colspan: 3, fontSize: 8.5 } },
      ],
    ];

    slide.addTable(tableRows, {
      x: 0.4,
      y: 3.95,
      w: 12.5,
      colW: [1.3, 2.8, 1.3, 2.8, 1.3, 3.0],
      border: { pt: 0.5, color: '94A3B8' },
      margin: 0.04,
    });

    // Footer: Company & Staff Contact
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.4,
      y: 5.85,
      w: 12.5,
      h: 1.0,
      fill: { color: 'FFFFFF' },
      line: { color: 'CBD5E1', width: 1 },
    });

    slide.addText(
      [
        { text: `${appState.jsContact.company}\n`, options: { fontSize: 12, bold: true, color: '0F172A' } },
        { text: `${appState.jsContact.address}  |  免許番号: ${formattedLicense} (取引態様: ${appState.jsContact.transactionType})\n`, options: { fontSize: 8.5, color: '64748B' } },
        { text: `TEL：${appState.jsContact.tel}  FAX：${appState.jsContact.fax}  MAIL：${appState.jsContact.infoEmail}`, options: { fontSize: 8.5, color: '64748B' } },
      ],
      { x: 0.6, y: 5.9, w: 7.0, h: 0.9, valign: 'middle' }
    );

    slide.addText(
      [
        { text: 'お問い合わせ・内見予約\n', options: { fontSize: 8.5, color: '3B82F6', bold: true } },
        { text: `担当：${appState.jsContact.personName || '［未設定］'}  `, options: { fontSize: 11, bold: true, color: '0F172A' } },
        { text: `MOBILE：${appState.jsContact.personTel || '［未設定］'}\n`, options: { fontSize: 11, bold: true, color: '2563EB' } },
        { text: `URL：${appState.jsContact.url}`, options: { fontSize: 8.5, color: '64748B' } },
      ],
      { x: 7.8, y: 5.9, w: 4.9, h: 0.9, align: 'right', valign: 'middle' }
    );
  }

  const filename = `${cleanFilenameName}_${appState.format}_${dateStrYYYYMMDD}.pptx`;
  await pptx.writeFile({ fileName: filename });
  return filename;
}

/**
 * 最終報告テキスト生成 (仕様第19項)
 */
export function generateCompletionReport(
  appState: AppState,
  options?: {
    hstorageStatus?: 'completed' | 'not_completed' | 'partial';
    hstorageFolder?: string;
    targetDate?: Date;
  }
): string {
  const data = appState.data;
  if (!data) return '物件データがありません';

  const targetDate = options?.targetDate || new Date();
  const dateStrYYYYMMDD = formatDateYYYYMMDD(targetDate);
  const displayDate = targetDate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const { formattedLicense } = getUpdatedLicenseNumber(appState.jsContact.licenseNumber, targetDate);
  const mapsUrl = getGoogleMapsUrl(data.property.name, data.property.address);

  const cleanName = (data.property.name || '物件').replace(/[\\/:*?"<>|]/g, '_');
  const pdfFilename = `${cleanName}_${appState.format}_${dateStrYYYYMMDD}.pdf`;
  const pptxFilename = `${cleanName}_${appState.format}_${dateStrYYYYMMDD}.pptx`;
  const emailPdfFilename = `${cleanName}_提案メール_${dateStrYYYYMMDD}.pdf`;

  // 検算結果
  let areaCheck = '未入力 / 要確認';
  if (data.area.sqm !== null && data.area.tsubo !== null) {
    const calcTsubo = Number((data.area.sqm * 0.3025).toFixed(2));
    const diff = Math.abs(calcTsubo - data.area.tsubo);
    areaCheck = `${data.area.sqm}㎡ (${data.area.tsubo}坪) - ${diff < 0.05 ? '検算OK' : `検算差分あり(換算値: ${calcTsubo}坪)`}`;
  } else if (data.area.tsubo !== null) {
    areaCheck = `${data.area.tsubo}坪 (㎡未設定)`;
  } else if (data.area.sqm !== null) {
    areaCheck = `${data.area.sqm}㎡ (坪未設定)`;
  }

  let rentCheck = '未設定';
  if (data.rent.amount !== null) {
    const tax = data.rent.taxIncluded ? '税込' : data.rent.taxIncluded === false ? '税別' : '税区分未定';
    const tsuboP = data.rent.tsuboPrice ? `坪単価: ${data.rent.tsuboPrice.toLocaleString()}円` : '坪単価未算出';
    rentCheck = `${data.rent.amount.toLocaleString()}円 (${tax}) / ${tsuboP}`;
  }

  let commonFeeCheck = 'なし / 賃料込';
  if (data.commonFee.amount !== null && data.commonFee.amount > 0) {
    const tax = data.commonFee.taxIncluded ? '税込' : data.commonFee.taxIncluded === false ? '税別' : '';
    commonFeeCheck = `${data.commonFee.amount.toLocaleString()}円 ${tax}`;
  }

  // 要確認事項リスト
  const confirmations: string[] = [];
  if (!data.property.name || data.property.name === '要確認') confirmations.push('物件名が要確認です');
  if (!data.property.address || data.property.address === '要確認') confirmations.push('所在地が要確認です');
  if (data.rent.amount === null) confirmations.push('賃料が未入力です');
  if (!appState.jsContact.personName) confirmations.push('作成担当者が未設定です');
  if (!appState.jsContact.personTel) confirmations.push('担当者携帯番号が未設定です');

  const confirmationText = confirmations.length === 0 ? '要確認事項なし' : confirmations.map(c => `・${c}`).join('\n');

  // ステータス判定
  let statusText = '完成';
  const hstorage = options?.hstorageStatus || 'completed';
  if (confirmations.length > 0) {
    statusText = '部分完了';
  } else if (hstorage === 'not_completed') {
    statusText = 'ファイル作成完了／HSTRAGE保存未完了';
  } else if (hstorage === 'completed') {
    statusText = '完成';
  }

  return `## 作成結果

物件名：${data.property.name || '要確認'}
使用フォーマット：${appState.format}
作成担当者：${appState.jsContact.personName || '未選択'}
作成日：${displayDate}
宅建免許番号：${formattedLicense}
Google Maps：${mapsUrl}

## 出力ファイル

マイソクPDF：${pdfFilename}
マイソクPowerPoint：${pptxFilename}
提案メールPDF：${emailPdfFilename}

## 検算結果

面積：${areaCheck}
賃料・坪単価：${rentCheck}
共益費・坪単価：${commonFeeCheck}

## HSTRAGE

保存先：${options?.hstorageFolder || 'Cloud Firestore / HSTRAGE / mysokus'}
保存状況：${hstorage === 'completed' ? '完了 (保存・同期確認済み)' : '未完了'}

## 要確認事項

${confirmationText}

## ステータス

${statusText}`;
}

/**
 * html2canvas 1.4.1 で oklch() / oklab() / color() などの現代的カラー表記を
 * 標準的な sRGB (rgb / rgba / #hex) に安全・確実に変換してエラーを完全に防ぐ関数
 */
function sanitizeOklchColorsForHtml2canvas(clonedDoc: Document, clonedEl: HTMLElement) {
  let dummyCtx: CanvasRenderingContext2D | null = null;
  try {
    const canvas = clonedDoc.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    dummyCtx = canvas.getContext('2d');
  } catch (e) {
    // Canvas context fallback
  }

  const convertColorToRgb = (colorStr: string): string => {
    if (!colorStr || typeof colorStr !== 'string') return colorStr;
    const trimmed = colorStr.trim();
    if (trimmed === 'transparent' || trimmed === 'inherit' || trimmed === 'initial' || trimmed === 'unset' || trimmed === 'none') {
      return trimmed;
    }
    if (!trimmed.includes('oklch') && !trimmed.includes('oklab') && !trimmed.includes('color(')) {
      return colorStr;
    }
    if (dummyCtx) {
      try {
        dummyCtx.fillStyle = 'rgba(0, 0, 0, 0)';
        dummyCtx.fillStyle = trimmed;
        if (dummyCtx.fillStyle && !dummyCtx.fillStyle.includes('oklch') && !dummyCtx.fillStyle.includes('oklab')) {
          return dummyCtx.fillStyle;
        }
      } catch (err) {
        // Fallback
      }
    }
    // Fallback sRGB color
    return '#1e293b';
  };

  // 1. クローン先ドキュメント内のすべての <style> タグ内の oklch/oklab/color 定義を置換
  try {
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach((styleTag) => {
      if (styleTag.textContent && (styleTag.textContent.includes('oklch') || styleTag.textContent.includes('oklab') || styleTag.textContent.includes('color('))) {
        styleTag.textContent = styleTag.textContent.replace(/(?:oklch|oklab|color)\([^)]+\)/gi, (matchedColor) => {
          return convertColorToRgb(matchedColor);
        });
      }
    });
  } catch (e) {
    console.warn("Style tag sanitization warning for html2canvas:", e);
  }

  // 2. クローンされた要素および全子孫要素のComputedStyleとインラインスタイルをsRGBに固定化
  try {
    const win = clonedDoc.defaultView || window;
    const elements = [clonedEl, ...Array.from(clonedEl.querySelectorAll('*'))];
    const colorProperties = [
      'color',
      'backgroundColor',
      'background-color',
      'borderColor',
      'border-color',
      'borderTopColor',
      'border-top-color',
      'borderRightColor',
      'border-right-color',
      'borderBottomColor',
      'border-bottom-color',
      'borderLeftColor',
      'border-left-color',
      'outlineColor',
      'outline-color',
      'textDecorationColor',
      'text-decoration-color',
      'boxShadow',
      'box-shadow',
      'fill',
      'stroke',
      'caretColor',
      'caret-color',
      'columnRuleColor',
      'column-rule-color'
    ];

    elements.forEach((el) => {
      if (el instanceof HTMLElement || el instanceof SVGElement) {
        const htmlEl = el as HTMLElement;
        try {
          const comp = win.getComputedStyle(htmlEl);
          if (comp) {
            colorProperties.forEach((prop) => {
              const val = comp.getPropertyValue(prop);
              if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color('))) {
                const converted = val.replace(/(?:oklch|oklab|color)\([^)]+\)/gi, (m) => convertColorToRgb(m));
                htmlEl.style.setProperty(prop, converted, 'important');
              }
            });
          }
        } catch (cErr) {
          // ignore computedStyle errors on non-rendered nodes
        }

        // インラインスタイルの直接置換
        if (htmlEl.style) {
          for (let i = 0; i < htmlEl.style.length; i++) {
            const propName = htmlEl.style[i];
            const val = htmlEl.style.getPropertyValue(propName);
            if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color('))) {
              const converted = val.replace(/(?:oklch|oklab|color)\([^)]+\)/gi, (m) => convertColorToRgb(m));
              htmlEl.style.setProperty(propName, converted, 'important');
            }
          }
        }
      }
    });
  } catch (e) {
    console.warn("Element style sanitization warning for html2canvas:", e);
  }
}

/**
 * マイソク / プレゼン資料 PDFの生成・ダウンロード
 * JS-Bの場合はスライド要素の配列または単一要素からマルチページPDFを確実に生成
 */
export async function downloadPdfPresentation(
  appState: AppState,
  elements?: (HTMLElement | null)[],
  options?: { customDate?: Date }
): Promise<string> {
  const data = appState.data;
  if (!data) throw new Error('物件データがありません');

  const targetDate = options?.customDate || new Date();
  const dateStrYYYYMMDD = formatDateYYYYMMDD(targetDate);
  const cleanName = (data.property.name || '物件').replace(/[\\/:*?"<>|]/g, '_');
  const filename = `${cleanName}_${appState.format}_${dateStrYYYYMMDD}.pdf`;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf')
  ]);

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const validElements = (elements || []).filter((el): el is HTMLElement => el !== null);

  if (validElements.length > 0) {
    const totalExpectedPages = validElements.length;
    let renderedPagesCount = 0;

    for (let i = 0; i < validElements.length; i++) {
      const el = validElements[i];
      
      // 非表示状態 (display: none, hidden等) のスライドでもhtml2canvasが正常にレンダリングできるように一時的に表示スタイルを調整
      const originalDisplay = el.style.display;
      const originalVisibility = el.style.visibility;
      const originalPosition = el.style.position;
      const hadHiddenClass = el.classList.contains('hidden');

      if (hadHiddenClass) {
        el.classList.remove('hidden');
      }
      el.style.display = 'block';
      el.style.visibility = 'visible';

      try {
        if (renderedPagesCount > 0) {
          pdf.addPage('a4', 'landscape');
        }

        const canvas = await html2canvas(el, {
          scale: 2.5,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          letterRendering: false,
          ignoreElements: (element) => {
            return element.hasAttribute('data-pdf-ignore') || element.hasAttribute('data-export-hidden');
          },
          onclone: (clonedDoc, clonedEl) => {
            if (clonedEl instanceof HTMLElement) {
              clonedEl.style.display = 'block';
              clonedEl.style.visibility = 'visible';
            }

            // フォント描画崩れ・文字分断・アンチエイリアス崩れを防ぐクローン内スタイル注入
            try {
              const fixStyle = clonedDoc.createElement('style');
              fixStyle.textContent = `
                * {
                  -webkit-font-smoothing: antialiased !important;
                  -moz-osx-font-smoothing: grayscale !important;
                  text-rendering: optimizeLegibility !important;
                }
                body > div img {
                  display: inline-block !important;
                }
              `;
              clonedDoc.head?.appendChild(fixStyle);
            } catch (styleErr) {
              // ignore
            }

            sanitizeOklchColorsForHtml2canvas(clonedDoc, clonedEl);
          },
        });

        // JPEGの非可逆圧縮ノイズ（文字周辺のモスキートノイズ・極細線の消失）を防ぐため、可逆圧縮PNGで出力
        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        renderedPagesCount++;
      } catch (pageErr) {
        console.error(`Error rendering page ${i + 1} for PDF:`, pageErr);
        throw new Error(`PDFのページ ${i + 1} の生成中にエラーが発生しました: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
      } finally {
        // 元の表示状態へ復元
        el.style.display = originalDisplay;
        el.style.visibility = originalVisibility;
        el.style.position = originalPosition;
        if (hadHiddenClass) {
          el.classList.add('hidden');
        }
      }
    }

    if (renderedPagesCount !== totalExpectedPages) {
      throw new Error(`PDF生成ページ数が不一致です (期待: ${totalExpectedPages}ページ, 実際: ${renderedPagesCount}ページ)`);
    }
  } else {
    if (appState.format === 'JS-B') {
      throw new Error('JS-B形式のPDF出力にはJsBCoverSlideを含むレンダリング要素が必要です。プレビュー画面から出力してください。');
    }
    // フォールバック: 直接jsPDFで基本資料を作成 (JS-A / JS-C専用)
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');

    pdf.setFillColor(217, 234, 211); // #D9EAD3
    pdf.roundedRect(20, 60, pdfWidth - 40, 60, 3, 3, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(26);
    pdf.setTextColor(30, 41, 59);
    pdf.text(data.property.name || '物件ご提案書', pdfWidth / 2, 88, { align: 'center' });

    pdf.setFontSize(14);
    pdf.setTextColor(71, 85, 105);
    pdf.text(data.building.subTitle || '【物件概要】', pdfWidth / 2, 105, { align: 'center' });

    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`所在地: ${data.property.address || '要確認'}`, 25, 150);
    pdf.text(`交通: ${data.property.access || '要確認'}`, 25, 158);
    pdf.text(`${appState.jsContact.company} | 担当: ${appState.jsContact.personName || '古澤 孝典'}`, pdfWidth - 25, 158, { align: 'right' });
  }

  pdf.save(filename);
  return filename;
}

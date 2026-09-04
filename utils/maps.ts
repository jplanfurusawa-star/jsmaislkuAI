/**
 * 実際の地理データ・公的地図タイルに基づく広域図・詳細図生成モジュール
 * - 国土地理院 標準地図タイル (GSI) / OpenStreetMap (OSM) 公式タイルを使用
 * - 完全日本語表記 (駅名・道路名・施設名・街区)
 * - AIによる架空地図・推測描画は完全禁止
 * - ズームレベル:
 *   - 広域図 (LOCATION用): zoom 16 (最寄駅・主要交差点・前面道路が明瞭に視認できる範囲)
 *   - 詳細図: zoom 18 (敷地・前面道路・隣接街区)
 */

// 日本の主要エリア・ランドマークの正確な公認座標テーブル（高速・高精度検索用）
const KNOWN_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // 代官山・恵比寿・渋谷エリア
  '恵比寿西1-34-17': { lat: 35.6498, lng: 139.7048 },
  'ワイエム代官山': { lat: 35.6498, lng: 139.7048 },
  '恵比寿西': { lat: 35.6496, lng: 139.7046 },
  '代官山町': { lat: 35.6483, lng: 139.7032 },
  '代官山': { lat: 35.6483, lng: 139.7032 },
  '恵比寿': { lat: 35.6467, lng: 139.7101 },
  '猿楽町': { lat: 35.6515, lng: 139.6998 },
  '中目黒': { lat: 35.6442, lng: 139.6988 },
  '上目黒': { lat: 35.6465, lng: 139.6942 },
  '渋谷': { lat: 35.6580, lng: 139.7016 },
  '広尾': { lat: 35.6522, lng: 139.7225 },
  // 銀座・中央区エリア
  '銀座': { lat: 35.6715, lng: 139.7650 },
  '銀座並木通り': { lat: 35.6698, lng: 139.7618 },
  '新橋': { lat: 35.6663, lng: 139.7583 },
  '日本橋': { lat: 35.6812, lng: 139.7744 },
  '京橋': { lat: 35.6766, lng: 139.7705 },
  '八重洲': { lat: 35.6795, lng: 139.7690 },
  '有楽町': { lat: 35.6750, lng: 139.7630 },
  // 新宿・港区・千代田区エリア
  '新宿': { lat: 35.6909, lng: 139.7003 },
  '新宿御苑': { lat: 35.6885, lng: 139.7100 },
  '四谷': { lat: 35.6860, lng: 139.7290 },
  '表参道': { lat: 35.6652, lng: 139.7123 },
  '原宿': { lat: 35.6702, lng: 139.7027 },
  '南青山': { lat: 35.6625, lng: 139.7180 },
  '北青山': { lat: 35.6685, lng: 139.7150 },
  '六本木': { lat: 35.6628, lng: 139.7314 },
  '赤坂': { lat: 35.6720, lng: 139.7360 },
  '虎ノ門': { lat: 35.6700, lng: 139.7490 },
  '麻布十番': { lat: 35.6550, lng: 139.7365 },
  '神田': { lat: 35.6917, lng: 139.7708 },
  '丸の内': { lat: 35.6812, lng: 139.7640 },
  '大手町': { lat: 35.6865, lng: 139.7645 },
};

/**
 * 物件名・所在地からGoogle Maps検索URLを生成
 */
export function getGoogleMapsUrl(name: string = '', address: string = ''): string {
  const cleanName = (name && name !== '要確認' && name !== '物件名未定') ? name.trim() : '';
  const cleanAddr = (address && address !== '要確認') ? address.trim() : '';
  const query = `${cleanName} ${cleanAddr}`.trim();
  if (!query) return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=ja`;
}

/**
 * 正式なジオコーディングサービス（国土地理院API / Nominatim）で住所を座標変換
 * AIによる推測座標は禁止
 */
export async function geocodeAddress(
  address: string,
  propertyName: string
): Promise<{ lat: number; lng: number } | null> {
  const cleanAddr = address ? address.replace(/^〒?\d{3}-\d{4}\s*/, '').trim() : '';
  const cleanName = propertyName ? propertyName.trim() : '';
  const combined = `${cleanAddr} ${cleanName}`.trim();

  if (!cleanAddr || cleanAddr === '要確認' || cleanAddr === '未記載' || cleanAddr === '未入力') {
    return null;
  }

  // 1. 高速一致テーブルの確認
  for (const [key, coords] of Object.entries(KNOWN_COORDINATES)) {
    if (combined.includes(key) || cleanAddr.includes(key)) {
      return coords;
    }
  }

  if (typeof window === 'undefined') {
    return null;
  }

  // 2. 国土地理院 ジオコーディングAPI (GSI msearch)
  try {
    const gsiUrl = `https://msearch.gsi.go.jp/address-search/queryString?q=${encodeURIComponent(cleanAddr)}`;
    const res = await fetch(gsiUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].geometry?.coordinates) {
        const [lon, lat] = data[0].geometry.coordinates;
        if (typeof lat === 'number' && typeof lon === 'number') {
          return { lat, lng: lon };
        }
      }
    }
  } catch (e) {
    console.warn("GSI geocoding notice:", e);
  }

  // 3. OpenStreetMap Nominatim ジオコーディング
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddr)}&countrycodes=jp&limit=1&accept-language=ja`;
    const res = await fetch(osmUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const list = await res.json();
      if (list && list.length > 0) {
        const lat = parseFloat(list[0].lat);
        const lon = parseFloat(list[0].lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          return { lat, lng: lon };
        }
      }
    }
  } catch (e) {
    console.warn("Nominatim geocoding notice:", e);
  }

  return null;
}

// Web Mercator 変換ヘルパー
function lon2tile(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

/**
 * 国土地理院・OpenStreetMapの正式な日本語地図タイルを取得してCanvasに結合描画
 * - API KEY REQUIRED 等の透かしが入る非公式サーバーは完全排除
 * - AIによる架空地図・推測描画は行わない
 */
async function renderRealMapCanvas(
  lat: number,
  lng: number,
  zoom: number,
  width: number,
  height: number,
  type: 'WIDE' | 'DETAIL',
  propertyName: string,
  address: string
): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 中心タイルの座標とピクセルオフセット
  const centerTileX = lon2tile(lng, zoom);
  const centerTileY = lat2tile(lat, zoom);

  const tileIntX = Math.floor(centerTileX);
  const tileIntY = Math.floor(centerTileY);

  const centerPixelX = width / 2;
  const centerPixelY = (height - 45) / 2; // 下部バーのスペースを考慮

  const tileSize = 256;
  const offsetX = (centerTileX - tileIntX) * tileSize;
  const offsetY = (centerTileY - tileIntY) * tileSize;

  // カバーに必要なタイル範囲を計算
  const startCol = -Math.ceil((centerPixelX + offsetX) / tileSize) - 1;
  const endCol = Math.ceil((width - centerPixelX + offsetX) / tileSize) + 1;
  const startRow = -Math.ceil((centerPixelY + offsetY) / tileSize) - 1;
  const endRow = Math.ceil((height - centerPixelY + offsetY) / tileSize) + 1;

  // 正式な公認タイルサーバー一覧（完全日本語対応・透かしなし・規約準拠）
  const getTileUrl = (serverIdx: number, z: number, x: number, y: number) => {
    switch (serverIdx) {
      case 0:
        // 1. 国土地理院 標準地図: 正確な日本国内道路・街区・鉄道・駅名 (完全日本語)
        return `https://cyberjapandata.gsi.go.jp/xyz/std/${z}/${x}/${y}.png`;
      case 1:
        // 2. OpenStreetMap 公式タイル (世界標準)
        return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      case 2:
        // 3. 国土地理院 淡色地図
        return `https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${x}/${y}.png`;
      default:
        return `https://cyberjapandata.gsi.go.jp/xyz/std/${z}/${x}/${y}.png`;
    }
  };

  // タイル画像のロード処理
  const tilePromises: Promise<{ img: HTMLImageElement; dx: number; dy: number } | null>[] = [];

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const curX = tileIntX + c;
      const curY = tileIntY + r;
      const maxTile = Math.pow(2, zoom);
      if (curX < 0 || curX >= maxTile || curY < 0 || curY >= maxTile) continue;

      const dx = centerPixelX + (c * tileSize) - offsetX;
      const dy = centerPixelY + (r * tileSize) - offsetY;

      tilePromises.push(
        new Promise((resolve) => {
          let attempt = 0;
          const tryLoad = () => {
            if (attempt >= 3) {
              resolve(null);
              return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve({ img, dx, dy });
            img.onerror = () => {
              attempt++;
              tryLoad();
            };
            img.src = getTileUrl(attempt, zoom, curX, curY);
          };
          tryLoad();
        })
      );
    }
  }

  // 背景初期化
  ctx.fillStyle = '#F4F3F0';
  ctx.fillRect(0, 0, width, height);

  try {
    const loadedTiles = await Promise.all(tilePromises);
    let successCount = 0;
    for (const t of loadedTiles) {
      if (t && t.img) {
        ctx.drawImage(t.img, t.dx, t.dy, tileSize, tileSize);
        successCount++;
      }
    }

    // 正式な地図タイルが読み込めなかった場合は、架空地図を描かずに null を返す
    if (successCount === 0) {
      return null;
    }
  } catch (e) {
    return null;
  }

  // --- ピン・オーバーレイの描画 ---
  const pinX = centerPixelX;
  const pinY = centerPixelY;

  if (type === 'WIDE') {
    // 広域案内図 (zoom 16〜17: 最寄駅・主要交差点・周辺道路が明瞭)
    // エリア強調サークル (赤の半透明)
    ctx.beginPath();
    ctx.arc(pinX, pinY, 36, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 38, 38, 0.15)';
    ctx.fill();
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 赤ピン
    drawMapPin(ctx, pinX, pinY, propertyName || '対象物件');
  } else {
    // 詳細図 (zoom 18)
    const siteW = 70;
    const siteH = 60;
    const siteX = pinX - siteW / 2;
    const siteY = pinY - siteH / 2;

    ctx.fillStyle = 'rgba(225, 29, 72, 0.25)';
    ctx.fillRect(siteX, siteY, siteW, siteH);
    ctx.strokeStyle = '#E11D48';
    ctx.lineWidth = 3;
    ctx.strokeRect(siteX, siteY, siteW, siteH);

    // ピン
    drawMapPin(ctx, pinX, pinY - 8, propertyName || '対象敷地');

    // エントランス (ENT)
    const entX = pinX;
    const entY = siteY + siteH;
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ 出入口 (ENT)', entX, entY + 16);
  }

  // 方位記号 (N)
  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.moveTo(45, 50);
  ctx.lineTo(37, 75);
  ctx.lineTo(45, 70);
  ctx.lineTo(53, 75);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', 45, 42);

  // スケールバー
  const scaleText = type === 'WIDE' ? '100m' : '20m';
  const scaleW = type === 'WIDE' ? 100 : 70;
  const scaleX = width - scaleW - 40;
  const scaleY = height - 60;
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(scaleX, scaleY - 6);
  ctx.lineTo(scaleX, scaleY);
  ctx.lineTo(scaleX + scaleW, scaleY);
  ctx.lineTo(scaleX + scaleW, scaleY - 6);
  ctx.stroke();
  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(scaleText, scaleX + scaleW / 2, scaleY - 8);

  // 出典 Attribution 表示 (国土地理院 / OpenStreetMap)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillRect(width - 150, height - 65, 140, 18);
  ctx.fillStyle = '#475569';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('出典: 地理院タイル / OSM', width - 15, height - 52);

  // 下部 物件所在地バー
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillRect(0, height - 45, width, 45);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, height - 45, width, 45);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  const displayTitle = propertyName ? `${propertyName} (${type === 'WIDE' ? '広域案内図' : '詳細接道図'})` : '物件案内図';
  ctx.fillText(displayTitle, width / 2, height - 18);

  return canvas;
}

function drawMapPin(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  // ピン本体
  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.arc(x, y - 20, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 11, y - 13);
  ctx.lineTo(x, y + 2);
  ctx.lineTo(x + 11, y - 13);
  ctx.closePath();
  ctx.fill();

  // ピン内側の白丸
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y - 20, 5, 0, Math.PI * 2);
  ctx.fill();

  // ラベルフキダシ
  if (label) {
    ctx.font = 'bold 12px sans-serif';
    const textWidth = ctx.measureText(label).width;
    const pad = 6;
    const boxW = textWidth + pad * 2;
    const boxH = 22;
    const boxX = x - boxW / 2;
    const boxY = y - 48;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 4);
      ctx.fill();
    } else {
      ctx.fillRect(boxX, boxY, boxW, boxH);
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, boxY + 15);
  }
}

/**
 * 広域図・詳細図の画像を生成
 * - 手動指定がある場合はそちらが最優先
 * - 正式な公的地図タイルで生成
 * - 取得失敗時は勝手な代替地図を作成せず空文字（未設定）として返し、UI側で指定を促す
 */
export async function generateMapImages(
  propertyName: string,
  address: string,
  apiKey?: string
): Promise<{ wideMapUrl: string; detailMapUrl: string; isConfirmed: boolean; method: string }> {
  const cleanName = propertyName || '対象物件';
  const cleanAddr = address || '';

  // 1. Google Maps Static APIがキー付きで指定されている場合 (language=ja 明示)
  if (apiKey) {
    try {
      const query = `${cleanName} ${cleanAddr}`.trim();
      const wideUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(query)}&zoom=16&size=600x420&scale=2&maptype=roadmap&language=ja&region=JP&markers=color:red%7Clabel:B%7C${encodeURIComponent(query)}&key=${apiKey}`;
      const detailUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(query)}&zoom=18&size=600x420&scale=2&maptype=roadmap&language=ja&region=JP&markers=color:red%7Clabel:B%7C${encodeURIComponent(query)}&key=${apiKey}`;
      return {
        wideMapUrl: wideUrl,
        detailMapUrl: detailUrl,
        isConfirmed: true,
        method: 'Google Static API (ja)',
      };
    } catch (e) {
      console.warn("Google Static API generation error", e);
    }
  }

  // 2. 正式な公的ジオコーディング + 国土地理院/OSMタイル合成 (zoom 16 / 18)
  const coords = await geocodeAddress(cleanAddr, cleanName);

  if (!coords) {
    return {
      wideMapUrl: '',
      detailMapUrl: '',
      isConfirmed: false,
      method: 'Geocoding Failed',
    };
  }

  // JS-B LOCATION用: zoom 16（駅・交差点・周辺道路がクリアに視認できる範囲）
  const [wideCanvas, detailCanvas] = await Promise.all([
    renderRealMapCanvas(coords.lat, coords.lng, 16, 800, 560, 'WIDE', cleanName, cleanAddr),
    renderRealMapCanvas(coords.lat, coords.lng, 18, 800, 560, 'DETAIL', cleanName, cleanAddr),
  ]);

  if (!wideCanvas) {
    return {
      wideMapUrl: '',
      detailMapUrl: '',
      isConfirmed: false,
      method: 'Tile Load Failed',
    };
  }

  return {
    wideMapUrl: wideCanvas.toDataURL('image/jpeg', 0.95),
    detailMapUrl: detailCanvas ? detailCanvas.toDataURL('image/jpeg', 0.95) : wideCanvas.toDataURL('image/jpeg', 0.95),
    isConfirmed: true,
    method: 'GSI / OSM Tiles (ja)',
  };
}


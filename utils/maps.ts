/**
 * Google Maps Platform Maps Static API による正式な地図生成モジュール
 * - Google Maps 実データのみを使用 (AI推測・架空地図・国土地理院/OSMへのフォールバック禁止)
 * - 日本語表記: language=ja, region=jp
 * - 高解像度: scale=2, format=png, maptype=roadmap
 * - 物件位置マーカー: Google Maps Static API marker
 * - ズーム: Zoom 16〜17程度（物件と最寄駅の位置関係に応じて自動調整）
 * - APIキーはサーバー側環境変数 (GOOGLE_MAPS_API_KEY) で厳格管理
 * - 取得失敗時は「Google Mapsを取得できませんでした。地図画像を指定してください」と表示
 */

/**
 * 物件名・所在地からGoogle Maps検索URLを生成（ブラウザで直接確認用）
 */
export function getGoogleMapsUrl(name: string = '', address: string = ''): string {
  const cleanName = (name && name !== '要確認' && name !== '物件名未定') ? name.trim() : '';
  const cleanAddr = (address && address !== '要確認' && address !== '未入力' && address !== '未記載') ? address.trim() : '';
  const query = `${cleanName} ${cleanAddr}`.trim();
  if (!query) return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=ja`;
}

/**
 * Google Maps Static API から正式な位置図・案内図を取得
 * @param propertyName 物件名
 * @param address 物件住所
 * @param access 最寄駅・交通情報 (例: 「東急東横線『代官山』駅 徒歩3分」)
 * @param options ズーム指定 (広域図: Zoom 15〜16 / 詳細図: Zoom 18推奨・近接街区)
 */
export async function generateMapImages(
  propertyName: string,
  address: string,
  access?: string,
  options?: { wideZoom?: number; detailZoom?: number } | number
): Promise<{
  wideMapUrl: string;
  detailMapUrl: string;
  isConfirmed: boolean;
  method: string;
  wideZoom?: number;
  detailZoom?: number;
  error?: string;
}> {
  const cleanName = propertyName || '対象物件';
  const cleanAddr = address || '';

  if (!cleanAddr || cleanAddr === '要確認' || cleanAddr === '未記載' || cleanAddr === '未入力') {
    return {
      wideMapUrl: '',
      detailMapUrl: '',
      isConfirmed: false,
      method: 'none',
      error: '住所が未入力です',
    };
  }

  const wideZoom = typeof options === 'object' ? options?.wideZoom : undefined;
  const detailZoom = typeof options === 'object' ? options?.detailZoom : typeof options === 'number' ? options : 18;

  try {
    const res = await fetch('/api/map', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: cleanAddr,
        name: cleanName,
        access: access || '',
        mapType: 'both',
        wideZoom: wideZoom,
        detailZoom: detailZoom || 18,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.success) {
        const wideUrl = result.wideDataUrl || result.dataUrl || '';
        const detailUrl = result.detailDataUrl || result.dataUrl || '';
        return {
          wideMapUrl: wideUrl,
          detailMapUrl: detailUrl,
          wideZoom: result.wideZoom,
          detailZoom: result.detailZoom,
          isConfirmed: true,
          method: 'Google Maps Static API (ja)',
        };
      }
      return {
        wideMapUrl: '',
        detailMapUrl: '',
        isConfirmed: false,
        method: 'Google Maps Failed',
        error: result.message || 'Google Mapsを取得できませんでした。地図画像を指定してください',
      };
    }
  } catch (err) {
    console.warn("Failed to fetch Google Maps Static API from server endpoint:", err);
  }

  // 取得失敗時: AI生成や他社タイルへのフォールバックは禁止。空文字を返し手動指定を促す
  return {
    wideMapUrl: '',
    detailMapUrl: '',
    isConfirmed: false,
    method: 'Google Maps Failed',
    error: 'Google Mapsを取得できませんでした。地図画像を指定してください',
  };
}

/**
 * 特定のズームレベルで単一の地図（詳細図または広域図）を取得する
 */
export async function fetchSingleMap(
  address: string,
  zoom: number,
  mapType: 'wide' | 'detail' = 'detail',
  access?: string
): Promise<{ dataUrl: string; success: boolean; zoom: number; error?: string }> {
  const cleanAddr = address || '';
  if (!cleanAddr || cleanAddr === '要確認' || cleanAddr === '未記載' || cleanAddr === '未入力') {
    return { dataUrl: '', success: false, zoom, error: '有効な住所が指定されていません' };
  }

  try {
    const res = await fetch('/api/map', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: cleanAddr,
        access: access || '',
        mapType,
        zoom,
        wideZoom: mapType === 'wide' ? zoom : undefined,
        detailZoom: mapType === 'detail' ? zoom : undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && (data.dataUrl || data.detailDataUrl || data.wideDataUrl)) {
        return {
          dataUrl: (mapType === 'detail' ? data.detailDataUrl : data.wideDataUrl) || data.dataUrl,
          success: true,
          zoom: data.zoom || zoom,
        };
      }
      return { dataUrl: '', success: false, zoom, error: data.message || '取得失敗' };
    }
  } catch (err) {
    console.error('fetchSingleMap error:', err);
  }
  return { dataUrl: '', success: false, zoom, error: 'Google Mapsの取得に失敗しました' };
}

/**
 * 互換性のためのジオコーディング関数（サーバーサイドで処理するため通常はgenerateMapImagesを使用）
 */
export async function geocodeAddress(
  address: string,
  propertyName: string
): Promise<{ lat: number; lng: number } | null> {
  const cleanAddr = address ? address.replace(/^〒?\d{3}-\d{4}\s*/, '').trim() : '';
  if (!cleanAddr || cleanAddr === '要確認' || cleanAddr === '未記載' || cleanAddr === '未入力') {
    return null;
  }

  try {
    const res = await fetch(`/api/map?address=${encodeURIComponent(cleanAddr)}&name=${encodeURIComponent(propertyName || '')}`);
    if (res.ok) {
      const data = await res.json();
      if (data.lat && data.lng) {
        return { lat: data.lat, lng: data.lng };
      }
    }
  } catch (e) {
    console.warn("Geocoding fetch warning:", e);
  }

  return null;
}

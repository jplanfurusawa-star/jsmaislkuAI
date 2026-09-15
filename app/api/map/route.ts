import { NextRequest, NextResponse } from "next/server";

// Haversine distance formula in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 住所から最寄駅名を抽出 (例: 「東急東横線『代官山』駅 徒歩3分」 -> 「代官山駅」)
 */
function extractStationName(access: string = ''): string | null {
  if (!access) return null;
  const match = access.match(/(?:[「『])?([^\s「『（(\]]+?駅)(?:[」』])?/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

async function handleMapRequest(params: {
  address: string;
  name?: string;
  access?: string;
  zoom?: number;
  format?: 'json' | 'image';
  mapType?: 'wide' | 'detail' | 'both';
  wideZoom?: number;
  detailZoom?: number;
}) {
  const { address, name, access, format = 'json', mapType = 'both' } = params;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'API_KEY_MISSING',
      message: 'Google Mapsを取得できませんでした。地図画像を指定してください',
      details: 'サーバーの環境変数 GOOGLE_MAPS_API_KEY が未設定です。',
    }, { status: 200 });
  }

  const cleanAddr = (address || '').replace(/^〒?\d{3}-\d{4}\s*/, '').trim();
  if (!cleanAddr || cleanAddr === '要確認' || cleanAddr === '未入力' || cleanAddr === '未記載') {
    return NextResponse.json({
      success: false,
      error: 'INVALID_ADDRESS',
      message: 'Google Mapsを取得できませんでした。地図画像を指定してください',
      details: '有効な物件住所が指定されていません。',
    }, { status: 200 });
  }

  // 1. Google Maps Geocoding APIによる正式な緯度経度取得（AIによる推測禁止）
  let lat: number;
  let lng: number;

  try {
    const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    geocodeUrl.searchParams.set('address', cleanAddr);
    geocodeUrl.searchParams.set('language', 'ja');
    geocodeUrl.searchParams.set('region', 'jp');
    geocodeUrl.searchParams.set('key', apiKey);

    const geoRes = await fetch(geocodeUrl.toString());
    if (!geoRes.ok) {
      console.warn('Google Maps Geocoding HTTP error:', geoRes.status);
      return NextResponse.json({
        success: false,
        error: 'GEOCODING_HTTP_ERROR',
        message: 'Google Mapsを取得できませんでした。地図画像を指定してください',
        details: `Geocoding API HTTPステータス: ${geoRes.status}`,
      }, { status: 200 });
    }

    const geoData = await geoRes.json();
    if (geoData.status !== 'OK' || !geoData.results || geoData.results.length === 0) {
      console.warn('Google Maps Geocoding status:', geoData.status, geoData.error_message);
      return NextResponse.json({
        success: false,
        error: `GEOCODING_${geoData.status}`,
        message: 'Google Mapsを取得できませんでした。地図画像を指定してください',
        details: geoData.error_message || `Geocodingステータス: ${geoData.status}`,
      }, { status: 200 });
    }

    lat = geoData.results[0].geometry.location.lat;
    lng = geoData.results[0].geometry.location.lng;
  } catch (geoErr) {
    console.error('Google Maps Geocoding error:', geoErr);
    return NextResponse.json({
      success: false,
      error: 'GEOCODING_EXCEPTION',
      message: 'Google Mapsを取得できませんでした。地図画像を指定してください',
    }, { status: 200 });
  }

  // 2. 広域図ズームレベルの算出 (初期値: Zoom 15〜16。最寄駅との位置関係に応じて自動調整)
  let calculatedWideZoom = 16;
  if (params.wideZoom && params.wideZoom >= 12 && params.wideZoom <= 20) {
    calculatedWideZoom = params.wideZoom;
  } else if (params.zoom && mapType === 'wide' && params.zoom >= 12 && params.zoom <= 20) {
    calculatedWideZoom = params.zoom;
  } else {
    // 最寄駅の特定と距離測定
    const stationName = extractStationName(access);
    if (stationName) {
      try {
        const stationUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        stationUrl.searchParams.set('address', stationName);
        stationUrl.searchParams.set('language', 'ja');
        stationUrl.searchParams.set('region', 'jp');
        stationUrl.searchParams.set('key', apiKey);
        // 物件周辺約5kmのバウンディングボックスでバイアス
        stationUrl.searchParams.set(
          'bounds',
          `${lat - 0.05},${lng - 0.05}|${lat + 0.05},${lng + 0.05}`
        );

        const sRes = await fetch(stationUrl.toString());
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.status === 'OK' && sData.results && sData.results.length > 0) {
            const sLat = sData.results[0].geometry.location.lat;
            const sLng = sData.results[0].geometry.location.lng;
            const distMeters = calculateDistanceMeters(lat, lng, sLat, sLng);

            // 縮尺調整: 物件と最寄駅が同一画面内に確実に収まるズームレベル
            if (distMeters <= 350) {
              calculatedWideZoom = 16;
            } else if (distMeters <= 750) {
              calculatedWideZoom = 16;
            } else if (distMeters <= 1400) {
              calculatedWideZoom = 15;
            } else {
              calculatedWideZoom = 14;
            }
          }
        }
      } catch (stnErr) {
        console.warn('Station distance geocoding notice:', stnErr);
        calculatedWideZoom = 16;
      }
    } else {
      calculatedWideZoom = 16;
    }
  }

  // 3. 詳細図ズームレベルの算出 (物件街区・建物の形状・周辺道路を明瞭に確認できる近接ズーム: Zoom 18)
  let calculatedDetailZoom = 18;
  if (params.detailZoom && params.detailZoom >= 12 && params.detailZoom <= 20) {
    calculatedDetailZoom = params.detailZoom;
  } else if (params.zoom && mapType === 'detail' && params.zoom >= 12 && params.zoom <= 20) {
    calculatedDetailZoom = params.zoom;
  }

  // Google Maps Static API 取得ヘルパー
  const fetchStaticMapImage = async (zoomLevel: number): Promise<{ buffer: ArrayBuffer; dataUrl: string }> => {
    const staticMapUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');
    staticMapUrl.searchParams.set('center', `${lat},${lng}`);
    staticMapUrl.searchParams.set('zoom', zoomLevel.toString());
    staticMapUrl.searchParams.set('size', '640x450');
    staticMapUrl.searchParams.set('scale', '2');
    staticMapUrl.searchParams.set('maptype', 'roadmap');
    staticMapUrl.searchParams.set('format', 'png');
    staticMapUrl.searchParams.set('language', 'ja');
    staticMapUrl.searchParams.set('region', 'jp');
    // 物件位置マーカー (赤ピン)
    staticMapUrl.searchParams.set('markers', `color:red|${lat},${lng}`);
    staticMapUrl.searchParams.set('key', apiKey);
    staticMapUrl.searchParams.set('solution_id', 'gmp_mcp_codeassist_v1_aistudio');

    const mapRes = await fetch(staticMapUrl.toString());
    if (!mapRes.ok) {
      const errText = await mapRes.text();
      console.warn('Google Maps Static API error:', mapRes.status, errText);
      throw new Error(`Maps Static API status: ${mapRes.status}`);
    }

    const buffer = await mapRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;
    return { buffer, dataUrl };
  };

  try {
    if (mapType === 'detail') {
      const detailResult = await fetchStaticMapImage(calculatedDetailZoom);
      if (format === 'image') {
        return new NextResponse(detailResult.buffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
      return NextResponse.json({
        success: true,
        dataUrl: detailResult.dataUrl,
        detailDataUrl: detailResult.dataUrl,
        lat,
        lng,
        zoom: calculatedDetailZoom,
        detailZoom: calculatedDetailZoom,
        attribution: 'Google Maps',
      });
    }

    if (mapType === 'wide') {
      const wideResult = await fetchStaticMapImage(calculatedWideZoom);
      if (format === 'image') {
        return new NextResponse(wideResult.buffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
      return NextResponse.json({
        success: true,
        dataUrl: wideResult.dataUrl,
        wideDataUrl: wideResult.dataUrl,
        lat,
        lng,
        zoom: calculatedWideZoom,
        wideZoom: calculatedWideZoom,
        attribution: 'Google Maps',
      });
    }

    // mapType === 'both': 広域図(Zoom 15〜16)と詳細図(Zoom 18)を並行取得
    const [wideResult, detailResult] = await Promise.all([
      fetchStaticMapImage(calculatedWideZoom),
      fetchStaticMapImage(calculatedDetailZoom),
    ]);

    return NextResponse.json({
      success: true,
      dataUrl: wideResult.dataUrl, // 互換性
      wideDataUrl: wideResult.dataUrl,
      detailDataUrl: detailResult.dataUrl,
      lat,
      lng,
      wideZoom: calculatedWideZoom,
      detailZoom: calculatedDetailZoom,
      attribution: 'Google Maps',
    });
  } catch (staticErr) {
    console.error('Google Maps Static API execution error:', staticErr);
    return NextResponse.json({
      success: false,
      error: 'STATIC_MAP_EXCEPTION',
      message: 'Google Mapsを取得できませんでした。地図画像を指定してください',
    }, { status: 200 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address') || '';
  const name = searchParams.get('name') || '';
  const access = searchParams.get('access') || '';
  const zoomParam = searchParams.get('zoom');
  const wideZoomParam = searchParams.get('wideZoom');
  const detailZoomParam = searchParams.get('detailZoom');
  const mapType = (searchParams.get('mapType') || searchParams.get('type') || 'both') as 'wide' | 'detail' | 'both';
  const format = (searchParams.get('format') === 'image' ? 'image' : 'json') as 'image' | 'json';
  
  const zoom = zoomParam ? parseInt(zoomParam, 10) : undefined;
  const wideZoom = wideZoomParam ? parseInt(wideZoomParam, 10) : undefined;
  const detailZoom = detailZoomParam ? parseInt(detailZoomParam, 10) : undefined;

  return handleMapRequest({ address, name, access, zoom, wideZoom, detailZoom, mapType, format });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const address = body.address || '';
    const name = body.name || '';
    const access = body.access || '';
    const zoom = typeof body.zoom === 'number' ? body.zoom : undefined;
    const wideZoom = typeof body.wideZoom === 'number' ? body.wideZoom : undefined;
    const detailZoom = typeof body.detailZoom === 'number' ? body.detailZoom : undefined;
    const mapType = (body.mapType || body.type || 'both') as 'wide' | 'detail' | 'both';
    const format = body.format === 'image' ? 'image' : 'json';

    return handleMapRequest({ address, name, access, zoom, wideZoom, detailZoom, mapType, format });
  } catch {
    return NextResponse.json({
      success: false,
      error: 'INVALID_REQUEST_BODY',
      message: 'Google Mapsを取得できませんでした。地図画像を指定してください',
    }, { status: 400 });
  }
}

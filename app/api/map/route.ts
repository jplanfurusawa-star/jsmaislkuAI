import { NextRequest, NextResponse } from "next/server";

// Japanese major area geocode table for instant, accurate fallback
const KNOWN_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // 代官山・恵比寿エリア
  '恵比寿西': { lat: 35.6496, lng: 139.7046 },
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address') || '';
  const name = searchParams.get('name') || '';
  const zoomParam = searchParams.get('zoom');
  const type = searchParams.get('type') || 'wide'; // 'wide' (zoom 15) or 'detail' (zoom 18)

  const zoom = zoomParam ? parseInt(zoomParam, 10) : (type === 'detail' ? 18 : 15);

  let lat = 35.6496; // Default: 恵比寿西・代官山
  let lng = 139.7046;

  // 1. Try to find matched known coordinate
  const queryStr = `${address} ${name}`;
  for (const [key, coords] of Object.entries(KNOWN_COORDINATES)) {
    if (queryStr.includes(key)) {
      lat = coords.lat;
      lng = coords.lng;
      break;
    }
  }

  // 2. If online geocoding is possible, try Nominatim
  if (address && address !== '要確認') {
    try {
      const cleanAddr = address.replace(/^〒?\d{3}-\d{4}\s*/, '').trim();
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddr)}&countrycodes=jp&limit=1`,
        {
          headers: {
            'User-Agent': 'JSquareRealEstateApp/1.0 (contact: info-js@j-jsquare.com)',
          },
          signal: AbortSignal.timeout(3000),
        }
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          lat = parseFloat(geoData[0].lat);
          lng = parseFloat(geoData[0].lon);
        }
      }
    } catch (e) {
      // Fallback to table or default
    }
  }

  // Check if Google Maps Static API Key is configured in env
  const gApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (gApiKey) {
    try {
      const gUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=600x420&scale=2&maptype=roadmap&markers=color:red%7Clabel:B%7C${lat},${lng}&key=${gApiKey}`;
      const imgRes = await fetch(gUrl);
      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    } catch (e) {
      console.warn("Google Maps Static API fetch error", e);
    }
  }

  return NextResponse.json({
    lat,
    lng,
    zoom,
    address,
    name,
    type,
  });
}

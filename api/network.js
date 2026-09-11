/**
 * Aynı Wi-Fi'daki oyuncuları eşleştirmek için "ağ kimliği" üretir.
 * Aynı ağdan çıkan herkes aynı genel IP'yi paylaşır; IP'nin kendisi
 * hiçbir yerde saklanmaz, yalnız tuzlanmış özeti döner.
 */
export const config = { runtime: 'edge' };

const SALT = 'tenis-el-takip-v1';

export default async function handler(req) {
  const fwd = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
  const ip = fwd.split(',')[0].trim() || '0.0.0.0';

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + ip));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

  return new Response(JSON.stringify({ id: hex.slice(0, 16) }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

// Tenis kortu ölçüleri (metre) — gerçek ITF ölçüleri
export const COURT = {
  halfLength: 11.885,        // file -> dip çizgi
  halfSingles: 4.115,        // tekler yan çizgi
  halfDoubles: 5.485,        // çiftler yan çizgi
  serviceLine: 6.40,         // file -> servis çizgisi
  netCenter: 0.914,          // file orta yükseklik
  netPost: 1.07,             // file direk yüksekliği
  lineW: 0.08,
};

// Fizik sabitleri
export const PHYS = {
  gravity: -9.81,
  drag: 0.0095,              // hava sürtünmesi  F = -k|v|v
  magnus: 0.0130,            // dönü -> yanal kuvvet
  restitution: 0.70,         // sekme
  friction: 0.70,            // zemin sürtünmesi (yatay)
  spinDecay: 0.55,           // saniyedeki dönü kaybı
  radius: 0.0335,
};

// Oyuncu tarafı yerleşimi
export const PLAYER = {
  camPos: [0, 1.70, 12.95],
  camLook: [0, 1.05, -5.5],
  racketZ: 11.15,            // raketin durduğu düzlem
  racketZRange: 0.55,        // el derinliğine göre oynama payı
  reachX: 2.75,              // raketin sağa/sola erişimi
  reachYMin: 0.18,
  reachYMax: 2.35,
  hitRadius: 0.52,           // vuruş küresi (savururken genişler)
};

// Zorluk kademeleri: [rakip hızı, isabet, vuruş süresi kısaltma]
export const DIFFICULTY = [
  { name: 'Kolay',  speed: 4.6, accuracy: 0.62, pace: 1.34, reach: 5.4 },
  { name: 'Normal', speed: 6.4, accuracy: 0.80, pace: 1.14, reach: 6.4 },
  { name: 'Zor',    speed: 8.2, accuracy: 0.93, pace: 0.96, reach: 7.4 },
];

export const COLORS = {
  courtIn:   0x3d81d0,
  courtOut:  0x36a279,
  line:      0xf2f7ff,
  ball:      0xdcf94a,
  net:       0x11161f,
  tape:      0xf4f8ff,
  skyTop:    0x0a1b38,
  skyBottom: 0x3c7fb8,
};

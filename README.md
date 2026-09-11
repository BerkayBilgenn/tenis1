# 🎾 El Takipli Tenis

Webcam'den el ve parmak hareketlerinle oynanan 3D tenis. Gerçek ölçülerde bir
stadyum, fizik tabanlı top, koşan bir rakip — hepsi tarayıcıda, kurulum yok.

## Çalıştırma

```bash
./start.sh
```

`http://localhost:8000` açılır. **Kamerayı Başlat**'a bas.

> `index.html`'i çift tıklayıp açma (`file://`) — tarayıcı kameraya izin vermez.
> Claude'un içindeki önizleme panelinde de kamera kapalıdır: **Chrome'da** aç.

## Kontroller

| Hareket | Etki |
|---|---|
| ✋ Elini oynat | Raket avucunu takip eder |
| 💥 Hızlı savur | Vuruş gücü — savuruşun **zirve hızı** sayılır, yavaşlarken vursan da sert gider |
| ↔ Elini yana eğ | Topun sağa-sola açısı |
| ↕ Yukarı savur | Topspin (aşağı savuruş = slice) |
| 🤏 Baş + işaret parmağı | Servis — top havaya atılır, savurmasan bile içeri girer |
| ✊ Yumruk | Smaç: güç ×1.3, isabet düşer, kısa ağır çekim tetiklenir |

Klavye: `Boşluk` servis · `M` fare modu · `G` yardım göstergeleri ·
`N` gece/gündüz · `S` ses · `1/2/3` zorluk · `R` maçı sıfırla

### Oyunu okunur kılan şeyler

- **Mavi halka** topun yere düşeceği yeri, **sarı halka** raketi tutman gereken
  yeri gösterir (sarı halka her şeyin önünde çizilir). `G` ile kapanır.
- **Ayakların otomatik.** Rakip kısa top atarsa öne koşarsın, lob atarsa geri
  çekilirsin — sen sadece raketi yönetirsin.
- **Servis asla düşmez**, fault/çifte hata yok.
- Topa tam denk gelmezsen **uzanarak** çevirirsin (daha zayıf gider).
- 7 saniye hareketsiz kalırsan otomatik servis atılır.

## 👥 Arkadaşınla oynama (aynı Wi-Fi)

Menüde **Arkadaşınla Oyna** → adını yaz → **aynı Wi-Fi'daki oyuncular listelenir**
→ birine **Davet Et** → karşı taraf kabul edince maç başlar.

### Nasıl buluşuyorsunuz

Tarayıcı yerel ağı tarayamaz (mDNS/broadcast API'si yok). Onun yerine aynı ağdan
çıkan herkesin **aynı genel IP'yi** paylaşmasından faydalanılır:
`/api/network` çağrısı IP'nin tuzlanmış özetini döner, o özet lobi odasının adı olur.
**IP hiçbir yerde saklanmaz**, sadece hash'i döner.

Farklı ağdaysanız lobideki **oda kodu** kutusunu kullanın — ikiniz de aynı kodu yazın.

### Bağlantı

Buluşma internet üzerinden, ama bağlantı kurulduktan sonra veri **WebRTC ile
doğrudan iki cihaz arasında** akar. Aynı Wi-Fi'daysanız yerel adresler seçilir,
trafik router'dan bile çıkmaz.

Sinyalleşme için üç ağ sırayla denenir (**nostr → torrent → mqtt**); biri
engelliyse ya da düşerse diğerine geçilir.

Davet akışı üç adımlı ve **tekrarlı**: `davet → kabul → başla`. Tek bir paket
kaybolduğunda taraflardan biri lobide asılı kalmaz — iki taraf da karşılıklı
onay almadan maç başlamaz, yanıt gelmezse "tekrar dene" der.

| Durum | Gecikme |
|---|---|
| Aynı Wi-Fi | 2–10 ms |
| Farklı ağ | 30–80 ms |

### Kim neyi hesaplıyor

- **Ev sahibi** (daveti gönderen) topun fiziğini simüle eder, skoru tutar,
  saniyede 30 kez durum yayınlar
- **Misafir** kendi raketini ve vuruşunu gönderir; **kendi vuruşunu anında
  uygular** (tahmin), ev sahibi onaylayınca otoriteye döner — kendi vuruşunda
  gecikme hissetmezsin
- İki taraf da kendi dünyasında +Z tarafında oynar; konum/hız/dönü tel üzerinde
  Y ekseni etrafında 180° döndürülerek aktarılır. Oyun kodunun geri kalanı tek
  oyunculu hâliyle aynı kalır
- Skor ev sahibinde tutulur, misafirde sıralaması ters çevrilerek gösterilir
- Bağlantı koparsa oyun otomatik yapay zekâya döner, maç yarıda kalmaz

### Sorun çıkarsa: `D` tuşu

Oyun içinde `D` tanılama panelini açar:

```
strateji : nostr          hangi sinyalleşme ağı kullanılıyor
kimlik   : atjeUkUb       kendi eş kimliğin
lobide   : 1 eş           kaç kişi görünüyor
maç      : EV SAHİBİ · Ahmet
gecikme  : 1 ms           ping
son paket: 1 ms önce      rakipten en son ne zaman veri geldi
durum    : toss           oyun durumu
```

Altında son ağ olayları listelenir. Bir şey ters giderse bu panelin görüntüsü
sorunu doğrudan gösterir.

**Sekme arka plandayken tarayıcı kare döngüsünü durdurur**, o yüzden o taraf
donar (bağlantı kopmaz, ping devam eder). Rakibin donduğunda rozette
"donuk" yazar. İki cihazda da pencereyi önde tut.

### Vercel'de

`api/network.js` bir Edge Function. Ücretsiz planda çalışır — tek seferlik bir
HTTP isteği, kalıcı bağlantı değil. Yerel geliştirmede `serve.py` aynı uç noktayı
`/24` alt ağ üzerinden taklit eder, böylece aynı Wi-Fi'daki cihazlar geliştirme
sırasında da birbirini bulur.

## Kamera açılmıyorsa

Sayfa açılır açılmaz el takibi modeli arka planda inmeye başlar; menüde
**"El takibi hazır ✓"** yazısını bekle (ilk seferde ~20 sn, sonra önbellekten).
Açılmazsa menüdeki kırmızı mesaj sebebi söyler:

| Mesaj | Çözüm |
|---|---|
| Sayfa dosya olarak açılmış | `./start.sh` ile localhost üzerinden aç |
| Kamera izni verilmedi | Adres çubuğundaki kamera simgesi → İzin ver → yenile |
| Kamerayı başka uygulama kullanıyor | Zoom / FaceTime / diğer sekmeleri kapat |
| Model indirilemedi | Ağ/VPN `cdn.jsdelivr.net` ve `storage.googleapis.com`'u engelliyor olabilir |

Her durumda **Fareyle Oyna** çalışır (fare = el, tıklama = pinch).

## Vercel'de yayınlama (ücretsiz)

Proje saf statik — build adımı, sunucu ya da ortam değişkeni yok. Vercel Hobby
planı yeterli ve HTTPS verdiği için **kamera yayında da çalışır**.

```bash
npx vercel          # ilk deploy (önizleme adresi)
npx vercel --prod   # yayına al
```

İlk çalıştırmada sorulara: *Set up and deploy* → **Y**, framework → **Other**,
build command → **boş bırak**, output directory → **boş bırak** (kök dizin).

Alternatif: klasörü GitHub'a at, [vercel.com/new](https://vercel.com/new)
üzerinden repoyu içe aktar. Sonraki her push otomatik yayınlanır.

`vercel.json` kamera iznini açık tutan `Permissions-Policy` başlığını ve
`js/`, `css/` için önbelleksiz sunumu ayarlar. `.vercelignore` yerel sunucu
dosyalarını dışarıda bırakır.

## Grafik

- Fiziksel tabanlı malzemeler + gökyüzünden üretilen **IBL** (metal raket
  çerçevesi ortamı yansıtır)
- **Post-processing**: bloom, SMAA, vinyet, kromatik sapma, film greni,
  vuruş anında ekran parlaması
- **Gündüz** (altın saat) ve **gece** (projektörlü) modu — `N`
- Kademeli tribün + ~1500 kişilik **instanced** kalabalık (sayı sonrası coşar)
- Sarkan file, prosedürel kort dokusu, reklam panoları, canlı skorboard,
  hakem kürsüsü, projektör kuleleri
- Top: gerçek dikiş eğrisi, tüy dokusu, koniklenen iz şeridi, sekmede ezilme
  ve toz bulutu
- Uyarlanabilir çözünürlük: kare süresi uzarsa piksel oranı otomatik düşer

## Motor

- Fizik **sabit adımda** (1/180 s) — nişan çözücüsüyle birebir aynı yolu üretir
- Sürtünme ve Magnus etkisini hesaba katan **yinelemeli atış çözücüsü**
  (hedefe sapma < 10 cm), file geçişini garantiler
- El girdisinde **One Euro filtresi**: dururken titremez, hızlı harekette gecikmez
- **Savurma durum makinesi**: güç zirve hızdan, yön savuruş vektöründen
- Rakip: tepki süresi, **ivmeli** hareket, derinlik konumlanması, atış seçimi
  (çapraz / çizgi / derin / kısa açı / lob) ve bilinçli hatalar
- Sentezlenmiş ses (dosya yok), tenis skoru (15/30/40/AV/oyun)

## Dosyalar

```
index.html      arayüz, skorbord, kamera kutusu
css/style.css   HUD, menü, duyarlı ölçekleme
js/config.js    kort ölçüleri, fizik sabitleri, zorluk
js/env.js       gökyüzü şaderi, IBL, gündüz/gece ışık takımı
js/postfx.js    bloom + SMAA + renk/vinyet/gren geçişi
js/court.js     kort, file, tribün, kalabalık, projektör, skorboard
js/ball.js      top fiziği, atış çözücüsü, yol tahmini, iz şeridi
js/racket.js    raket modeli, ele bağlanma, savurma
js/opponent.js  rakip iskeleti, animasyon ve yapay zekâsı
js/hands.js     MediaPipe el takibi (ön yükleme, One Euro, tanılama) + fare yedeği
js/hud.js       skor, ralli, hız, vuruş kalitesi
js/effects.js   halkalar, kıvılcım, toz bulutu, sekme izleri
js/audio.js     sentezlenmiş ses efektleri
js/main.js      oyun döngüsü, kurallar, oyuncu konumu, rehberler
js/net.js       WebRTC eşleşme, koordinat aynalama, durum senkronu
js/lobby.js     lobi arayüzü, davet akışı
api/network.js  Vercel Edge Function — ağ kimliği (IP'nin tuzlanmış özeti)
serve.py        önbelleksiz yerel sunucu + /api/network taklidi
```

three.js ve MediaPipe CDN'den gelir; başka bağımlılık yok.

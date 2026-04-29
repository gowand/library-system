# Kütüphane TR/EN Yeniden Tam Sürüm

Bu sürüm baştan yazıldı. Tüm sayfalar Türkçe ve İngilizce desteklidir.

## Kurulum

```bash
npm install
node server.js
```

## Adres

```text
http://localhost:3000
```

## Girişler

```text
Super Admin:
admin@ktb.gov.tr / 123456

Kütüphane:
yesilyurt@ktb.gov.tr / 123456
```

## Dil Desteği

Her sayfada TR / EN butonu vardır.
Dil seçimi cookie ile saklanır.

## Sayfalar

```text
/
 /login
/super-admin
/dashboard
/dashboard/profile
/dashboard/events
/dashboard/games
/dashboard/archive
/yesilyurt
/yesilyurt/archive
/yesilyurt/games
/yesilyurt/about
/yesilyurt/contact
```


## Güncelleme

Hakkımızda alanına yazılan metin artık ana sayfada gösterilmez. Ana sayfada sabit kısa tanıtım metni görünür; Hakkımızda metni sadece Hakkımızda sayfasında görünür.


## Son Güncelleme

- Geçmiş tarihli etkinliklere başvuru kapatıldı.
- Etkinlik başvuru telefon alanı otomatik `+905` ile başlar.
- Telefon numarası `+905XXXXXXXXX` formatında doğrulanır.


## Güvenlik Güncellemesi

- Kütüphane giriş sayfasından süper admin girişine bağlantı tamamen kaldırıldı.
- Süper admin giriş sayfasından kütüphane girişine bağlantı tamamen kaldırıldı.
- Giriş adresleri gizli tutulacak şekilde ayrı çalışır: `/library-login` ve `/admin-login`.


## Başvuru ve Arşiv Ayrımı

- `/yesilyurt/events` sadece tarihi geçmemiş ve başvurusu açık etkinlikleri gösterir.
- `/yesilyurt/archive` sadece tarihi geçmiş etkinlikleri afişleriyle gösterir.
- Etkinlik tarihi geçince afişi otomatik olarak arşiv sayfasında görünür.
- Etkinlik arşiv detayında başvuru butonu yoktur; sadece etkinlik görselleri vardır.
- Etkinlik sonrası fotoğraflar kütüphane panelindeki `/dashboard/archive` sayfasından yüklenir.


## Başvuru Şartları Güncellemesi

- Etkinlik başvuru formunda yaş aralığı, kontenjan, tarih ve yer bilgisi görünür.
- Yaş uygun değilse veya telefon hatalıysa kullanıcı bilgileri silinmez.
- Telefon alanı 05 ile başlar ve 11 hane olarak doğrulanır.


## Premium Birleşik Güncelleme

- Başvuru ve arşiv ayrımı
- Etkinlik başvuru şartları
- Form hatasında bilgilerin korunması
- Basit otomatik İngilizce üretimi
- Etkinlik QR kodu
- Oyun QR / barkod kodu
- Başvuru durum yönetimi: onayla / yedek / reddet
- Yoklama: geldi / gelmedi
- SMS/e-posta kayıt sistemi: yalnızca “başvurunuz alınmıştır” mesajı kayıt altına alınır
- İstatistik paneli
- Tek tuş JSON yedekleme

Not: Gerçek SMS/e-posta gönderimi için daha sonra API bilgileri eklenmelidir.


## Dil Sistemi Güncellemesi

- Başvuru ve yönetim formlarında İngilizce alanlar kaldırıldı.
- Kütüphane personeli sadece Türkçe içerik girer.
- Sistem İngilizce metni otomatik üretir.

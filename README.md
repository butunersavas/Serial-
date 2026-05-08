# Siber Risk ve Bulgu Yönetimi

Excel üzerinden gelen güvenlik testi bulgularını web arayüzüne aktarmak, açık/kapatıldı durumlarını yönetmek, durum seviyesine göre gösterge paneli üretmek ve temiz Excel raporu dışa aktarmak için hazırlanmış örnek web uygulamasıdır.

## Teknoloji Yığını

- **Backend:** FastAPI, SQLAlchemy, OpenPyXL
- **Frontend:** React, Material UI, Vite
- **Veritabanı:** PostgreSQL
- **Çalıştırma:** Docker Compose

## Özellikler

### Excel İçe Aktarma

- Kullanıcı `.xlsx` veya `.xlsm` dosyası yükleyebilir.
- Dosyada `Bulgular` sayfası varsa bu sayfa okunur; yoksa ilk sayfa kullanılır.
- Kolon başlıkları Türkçe karakterlerden ve farklı yazım biçimlerinden bağımsız otomatik eşleştirilir.
- `İlgili` kolonu varsa `İlgili Birim / Kurum` alanına aktarılır.
- `İlgili Kişi` ayrı alan olarak tutulur.
- Aynı `Kayıt No` yeniden içe aktarılırsa mevcut kayıt güncellenir, mükerrer kayıt oluşturulmaz.

### Bulgular Ekranı

Bulgular ekranında aşağıdaki kolonlar gösterilir ve düzenlenebilir alanlar web arayüzünden güncellenebilir:

- Kayıt No
- Bulgu Başlığı
- Durum Seviyesi
- Bulgunun Etkisi
- Bulgunun Açıklaması
- Çözüm Önerisi
- İlgili Birim / Kurum
- İlgili Kişi
- Durum
- Termin Tarihi
- Yeni Termin
- Not
- Son Güncelleme

`Durum` alanı `Devam Ediyor` ve `Kapatıldı` seçeneklerine sahiptir. `Kapatıldı` seçilen satırlar açık yeşil renkte gösterilir.

`Durum Seviyesi` alanı şu seçenekleri destekler:

- Acil
- Kritik
- Yüksek
- Orta
- Düşük

### Özet / Gösterge Paneli

Gösterge panelinde şu kartlar bulunur:

- Toplam Bulgu
- Kapatılan
- Açık Kalan
- Kapanma Oranı

Ayrıca `Durum Seviyesi | Toplam | Kapatılan | Açık Kalan` özet tablosu `Acil`, `Kritik`, `Yüksek`, `Orta`, `Düşük` ve `Toplam` satırlarıyla gösterilir.

### Filtreler

Bulgular ekranında aşağıdaki filtreler vardır:

- Durum Seviyesi
- Durum
- İlgili Birim / Kurum
- İlgili Kişi
- Termin tarihi yaklaşanlar
- Açık kalanlar
- Kapatılanlar

### Excel Dışa Aktarma

- Tek tuşla `.xlsx` raporu alınır.
- Excel içinde `Ozet` ve `Bulgular` sayfaları oluşturulur.
- OpenPyXL ile geçerli Office Open XML dosyası üretildiği için Excel açılışında onarım/uyarı beklenmez.
- `Kapatıldı` durumundaki satırlarda A ve C:K arası açık yeşil renkte boyanır.
- `Durum` kolonunda Excel açılır liste doğrulaması bulunur: `Devam Ediyor`, `Kapatıldı`.

### Log

Aşağıdaki işlemler `audit_logs` tablosunda saklanır:

- Kim ne zaman içe aktarma yaptı
- Kim hangi bulguyu kapattı
- Son dışa aktarma zamanı
- Kayıt oluşturma ve güncelleme işlemleri

## Kurulum ve Çalıştırma

### Gereksinimler

- Docker
- Docker Compose

### Uygulamayı Başlatma

```bash
docker compose up --build
```

Servisler ayağa kalktıktan sonra:

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:8000>
- Swagger/OpenAPI: <http://localhost:8000/docs>
- PostgreSQL: `localhost:5432`

### Uygulamayı Durdurma

```bash
docker compose down
```

Veritabanı verilerini de silmek için:

```bash
docker compose down -v
```

## Kullanım

1. `docker compose up --build` komutu ile sistemi başlatın.
2. Tarayıcıdan <http://localhost:5173> adresine gidin.
3. Üst menüdeki **Excel İçe Aktar** butonu ile güvenlik bulgularını yükleyin.
4. **Bulgular** sekmesinde kayıtları filtreleyin, düzenleyin ve durumlarını yönetin.
5. Kapatılan kayıtlar açık yeşil renkte görüntülenir.
6. **Özet / Gösterge Paneli** sekmesinde toplam/kapatılan/açık kalan metriklerini izleyin.
7. **Excel Dışa Aktar** butonu ile `Ozet` ve `Bulgular` sayfalarını içeren raporu indirin.

## API Özet

- `GET /health`: Sağlık kontrolü
- `GET /dashboard`: Özet metrikler ve durum seviyesi tablosu
- `GET /findings`: Bulguları filtreli listeleme
- `POST /findings`: Manuel bulgu oluşturma
- `PATCH /findings/{finding_id}`: Bulgu güncelleme / kapatma
- `POST /import`: Excel içe aktarma
- `GET /export`: Excel dışa aktarma
- `GET /logs`: İşlem logları

## Excel Kolon Eşleştirme Notları

İçe aktarma sırasında başlıklar normalize edilir. Örneğin aşağıdaki alternatifler desteklenir:

- `Kayıt No`, `Kayit No`, `Kayıt Numarası`, `ID`
- `Bulgu Başlığı`, `Başlık`, `Bulgu`
- `Durum Seviyesi`, `Risk Seviyesi`, `Kritiklik`
- `İlgili Birim / Kurum`, `İlgili Birim`, `İlgili Kurum`, `İlgili`
- `İlgili Kişi`, `Sorumlu Kişi`, `Sorumlu`

## Geliştirme

Backend'i yerelde çalıştırmak için:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend'i yerelde çalıştırmak için:

```bash
cd frontend
npm install
npm run dev
```

## Microsoft Defender Vulnerability Management Entegrasyonu

Aşama 4 kapsamında uygulamaya Microsoft Defender for Endpoint / Defender Vulnerability Management API entegrasyonu eklenmiştir. Bu entegrasyon kurum cihazlarında görülen CVE kayıtlarını, cihaz-yazılım-CVE eşleşmelerini ve remediation önerilerini dashboard, ayrı Defender ekranı, raporlar ve iç bulguya dönüştürme akışı ile gösterir.

### Microsoft Entra App Registration

Gerçek Defender API bağlantısı için Microsoft Entra ID üzerinde bir App Registration oluşturulmalıdır:

1. Microsoft Entra admin center içinde **App registrations > New registration** ekranından uygulamayı oluşturun.
2. Oluşan uygulama sayfasından **Directory (tenant) ID** değerini `Tenant ID` alanına girin.
3. **Application (client) ID** değerini `Client ID` alanına girin.
4. **Certificates & secrets > Client secrets > New client secret** ile secret üretin ve `Client Secret` alanına girin.
5. **API permissions** bölümünden Defender Vulnerability Management için gerekli application permission izinlerini ekleyin.
6. İzinler için **Admin consent** verilmelidir; aksi halde bağlantı testi 401/403 dönebilir.

### Gerekli API İzinleri

Ayarlar ekranında bilgi olarak da gösterilen temel izinler:

- `Vulnerability.Read.All`
- `SecurityRecommendation.Read.All`

Cihaz detay endpointleri genişletildiğinde `Machine.Read.All` izni de gerekebilir.

### API Base URL

Varsayılan Defender API base URL değeri:

```text
https://api.security.microsoft.com
```

Kullanılan endpointler:

- `GET /api/vulnerabilities`
- `GET /api/vulnerabilities/machinesVulnerabilities`
- `GET /api/recommendations`
- Opsiyonel altyapı: `GET /api/machines/{machineId}/vulnerabilities`

### Uygulama Ayarları ve Test Connection

Frontend içinde **Ayarlar > Microsoft Defender Entegrasyonu** bölümünde şu alanlar yönetilir:

- Tenant ID
- Client ID
- Client Secret
- Defender API Base URL
- Entegrasyon Aktif / Pasif
- Son Sync Zamanı
- Bağlantıyı Test Et
- Tüm Verileri Senkronize Et

`Bağlantıyı Test Et` butonu OAuth2 client credentials akışı ile token almayı ve Defender API erişimini test eder. Token alınamazsa kullanıcıya Tenant ID, Client ID ve Client Secret bilgilerinin kontrol edilmesi gerektiğini belirten Türkçe hata mesajı gösterilir.

### Secret Güvenliği Notu

Client Secret frontend tarafında açık gösterilmez; kayıt sonrası maskeli döner. Bu sürümde backend tarafında secret için temel saklama altyapısı hazırlanmıştır. Production ortamında secret değerinin veritabanında düz metin tutulmaması, KMS/Key Vault veya uygulama seviyesinde güçlü encryption ile korunması önerilir. Ayrıca veritabanı erişimi, yedekleri ve ortam değişkenleri minimum yetki prensibine göre sınırlandırılmalıdır.

### Mock / Demo Mod

Defender entegrasyonu yapılandırılmamışsa veya henüz gerçek API bilgileri girilmemişse ekranlar boş kalmaz. Uygulama şu uyarıyla demo veri gösterir:

```text
Defender entegrasyonu yapılandırılmadı. Gösterilen veriler demo amaçlıdır.
```

Tenant ID, Client ID, Client Secret ve API Base URL girilip bağlantı başarılı olduktan ve senkronizasyon çalıştırıldıktan sonra ekranlar gerçek veritabanı kayıtlarını göstermeye başlar.

### Defender Excel Export

Defender ekranındaki Excel export aşağıdaki sayfaları üretir:

1. `Defender_Ozet`
2. `Defender_CVE_Listesi`
3. `Defender_Cihaz_Yazilim_CVE`
4. `Defender_Oneriler`

Ana bulgular Excel import/export yapısı değiştirilmeden korunmuştur.

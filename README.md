# Kurumsal Güvenlik Bulgu Takip

Excel üzerinden gelen güvenlik testi bulgularını web arayüzüne aktarmak, açık/kapatıldı durumlarını yönetmek, durum seviyesine göre özet dashboard üretmek ve temiz Excel raporu dışa aktarmak için hazırlanmış örnek web uygulamasıdır.

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
- Aynı `Kayıt No` yeniden import edilirse mevcut kayıt güncellenir, mükerrer kayıt oluşturulmaz.

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
- Termin Tarih
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

### Özet / Dashboard

Dashboard üzerinde şu kartlar bulunur:

- Toplam Bulgu
- Kapatılan
- Açık Kalan
- Kapanma Oranı
- Son Çalışma Saati

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
- `Durum` kolonunda Excel dropdown doğrulaması bulunur: `Devam Ediyor`, `Kapatıldı`.

### Log

Aşağıdaki işlemler `audit_logs` tablosunda saklanır:

- Kim ne zaman import yaptı
- Kim hangi bulguyu kapattı
- Son çalışma saati
- Son export zamanı
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
6. **Özet / Dashboard** sekmesinde toplam/kapatılan/açık kalan metriklerini izleyin.
7. **Excel Dışa Aktar** butonu ile `Ozet` ve `Bulgular` sayfalarını içeren raporu indirin.

## API Özet

- `GET /health`: Sağlık kontrolü
- `GET /dashboard`: Özet metrikler ve durum seviyesi tablosu
- `GET /findings`: Bulguları filtreli listeleme
- `POST /findings`: Manuel bulgu oluşturma
- `PATCH /findings/{finding_id}`: Bulgu güncelleme / kapatma
- `POST /import`: Excel import
- `GET /export`: Excel export
- `GET /logs`: İşlem logları

## Excel Kolon Eşleştirme Notları

Import sırasında başlıklar normalize edilir. Örneğin aşağıdaki alternatifler desteklenir:

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

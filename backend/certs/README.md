# Backend trusted CA certificates

Bu klasör, backend Docker image build aşamasında kurum proxy / SSL
inspection root CA sertifikasını container trust store içine eklemek için
ayrılmıştır. Sertifikayı PEM/CRT formatında şu adla koyun:

```text
backend/certs/company-root-ca.crt
```

Docker build sırasında bu opsiyonel sertifika şu hedefe güvenli dosya
izinleriyle kopyalanır:

```text
/usr/local/share/ca-certificates/company-root-ca.crt
```

Ardından `update-ca-certificates` çalıştırılarak Debian/OpenSSL CA deposuna
kaydedilir. Dosya yoksa build başarısız olmaz; varsayılan Debian CA trust
store kullanılmaya devam eder.

Defender API SSL doğrulaması kapatılmamalıdır. Backend, Python
`ssl.create_default_context()` ile container trust store'a güvenir; güvenli
olmayan SSL doğrulama baypasları kullanılmamalıdır.

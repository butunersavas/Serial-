# Backend trusted CA certificates

Place the corporate SSL inspection/proxy root CA certificate here as:

```text
backend/certs/company-root-ca.crt
```

During the backend Docker image build, this optional certificate is copied to
`/usr/local/share/ca-certificates/company-root-ca.crt` and registered with
`update-ca-certificates`. If the file is not present, the Docker build continues
with the default Debian CA trust store.

Do not disable Python SSL verification for Defender API calls; the backend uses
`ssl.create_default_context()` and relies on the container trust store.

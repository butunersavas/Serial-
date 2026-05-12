FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Optional corporate proxy / SSL inspection root CA.
# Place the PEM/CRT file at backend/certs/company-root-ca.crt before building.
COPY certs/ /tmp/certs/
RUN if [ -f /tmp/certs/company-root-ca.crt ]; then \
        install -m 0644 /tmp/certs/company-root-ca.crt /usr/local/share/ca-certificates/company-root-ca.crt \
        && update-ca-certificates; \
    else \
        echo "Optional backend/certs/company-root-ca.crt not provided; using default CA trust store."; \
    fi \
    && rm -rf /tmp/certs

COPY requirements.txt .
RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org -r requirements.txt

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

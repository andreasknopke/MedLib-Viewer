# MedLib Klinikbibliothek

MedLib ist ein eigenständiges Open-Source-Websystem zur Organisation, OCR-Erfassung und Volltextsuche großer PDF-Bestände medizinischer Fachbücher. Die Produktidee ist deutlich von Dokumentenmanagementsystemen wie Paperless-ngx und modernen medizinischen Fachportalen inspiriert, übernimmt aber keinen Code aus Paperless-ngx.

## Funktionsumfang

- PDF-Import mit Metadaten für Titel, Autor:innen, Verlag, ISBN, Jahr, Edition, Fachgebiet und Tags.
- OCR-Pipeline mit Tesseract, Poppler und deutscher/englischer Spracheinstellung.
- PostgreSQL-basierte Volltextsuche über OCR-Seitentexte mit Snippets und Fallback-Suche.
- Rollenbasierte Userverwaltung mit Admin, Bibliothekar:in, Kliniker:in und Reader.
- Web-Reader mit Seitentext, Suchmarkierung, Notizen, Lesezeichen, Markierungen und PDF-Download.
- React/Tailwind-Portaloberfläche für Klinikbibliothek, Upload, Recherche und persönliche Annotationen.
- Docker-first-Deployment für eine einzelne Klinik mit bis zu ca. 500 Usern.

## Architektur

```text
frontend/       React + Vite + Tailwind, Nginx-Reverse-Proxy
backend/        FastAPI, SQLAlchemy, JWT Auth, OCR-Verarbeitung
storage/books/  lokale PDF-Ablage, in Produktion durch NAS/S3-kompatiblen Storage ersetzbar
PostgreSQL      Metadaten, User, Annotationen, OCR-Seitentext, Volltextsuche
```

Die erste Version nutzt FastAPI BackgroundTasks für OCR. Für große Massenimporte sollte die OCR-Verarbeitung auf einen dedizierten Worker mit Queue (z. B. Celery/RQ + Redis) ausgelagert werden, damit Uploads und Webzugriffe entkoppelt bleiben.

## Schnellstart

1. `.env.example` nach `.env` kopieren und `SECRET_KEY` sowie Datenbankpasswort ändern.
2. Container starten:

   ```bash
   docker compose up --build
   ```

3. Initialen Admin anlegen:

   ```bash
   curl -X POST http://localhost:8000/api/auth/bootstrap \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@klinik.local","full_name":"MedLib Admin","password":"BitteEinSehrLangesPasswort123!","role":"admin"}'
   ```

4. Frontend öffnen: http://localhost:8080

## Entwicklung

Backend lokal:

```bash
cd backend
pip install -e .[dev]
uvicorn app.main:app --reload
```

Frontend lokal:

```bash
cd frontend
npm install
npm run dev
```

## Betrieb in einer Klinik

- Hinter einem Klinik-internen Reverse Proxy mit TLS betreiben.
- `SECRET_KEY`, Datenbankpasswort und Backups verbindlich konfigurieren.
- Zugriff über VPN/Intranet oder SSO/LDAP anbinden; die aktuelle Auth ist bewusst einfach gehalten.
- Rollenmodell fachlich prüfen: Upload/Re-OCR nur Admin/Bibliothek, Lesen/Annotation für Fachpersonal.
- PDF- und OCR-Daten können sensible oder lizenzrechtlich geschützte Inhalte enthalten; nur intern berechtigten Usern bereitstellen.
- Für Produktivbetrieb sollten Datenbank-Backups, Storage-Backups, Audit-Logs und Monitoring ergänzt werden.

## Rechtliches und Lizenz

Dieses Repository steht unter MIT-Lizenz. 

Bei medizinischen Fachbüchern sind Urheber- und Verlagsrechte unabhängig von der Softwarelizenz zu prüfen. Für eine Klinikbibliothek sollten nur rechtmäßig lizenzierte PDFs importiert und nur berechtigten Nutzer:innen zugänglich gemacht werden.

## Nächste sinnvolle Ausbaustufen

- Alembic-Migrationen statt `create_all` beim Start.
- OCR-Queue mit Redis/Celery und Fortschritt per WebSocket/SSE.
- PDF.js-Viewer mit Textlayer für geometrisch exakte Highlights.
- LDAP/OIDC/Keycloak-Anbindung und optional 2FA.
- Audit-Logging für Downloads, Uploads, OCR und Adminaktionen.
- Fachsystem-Integration für Klinik-Intranet, Proxy-Auth und zentrale Nutzergruppen.

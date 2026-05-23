# MedLib Klinikbibliothek



MedLib ist ein eigenständiges Open-Source-Websystem zur Organisation, OCR-Erfassung und Volltextsuche großer PDF-Bestände medizinischer Fachbücher. Die Produktidee ist deutlich von Dokumentenmanagementsystemen wie Paperless-ngx und modernen medizinischen Fachportalen inspiriert, übernimmt aber keinen Code aus Paperless-ngx.

## Funktionsumfang

- PDF-Import mit Metadaten für Titel, Autor:innen, Verlag, ISBN, Jahr, Edition, Fachgebiet und Tags.
- OCR-Pipeline mit Tesseract, Poppler und deutscher/englischer Spracheinstellung.
- PostgreSQL-basierte Volltextsuche über OCR-Seitentexte mit Snippets und Fallback-Suche.
- Rollenbasierte Userverwaltung mit Admin, Bibliothekar:in, Kliniker:in und Reader.
- Web-Reader mit Seitentext, Suchmarkierung, Notizen, Lesezeichen, Markierungen und PDF-Download.
- Verwaltungsbereich für Kliniken, Fachbereiche und Kategorien zur Einsortierung von Büchern und Zeitschriften.
- Persönlicher Nutzerbereich mit eigener Sammlung, Bookmarks und Notizen.
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

1. `.env.example` nach `.env` kopieren und `SECRET_KEY`, Datenbankpasswort sowie die `ROOT_ADMIN_*`-Werte setzen.
2. Container starten:

   ```bash
   docker compose up --build
   ```

3. Mit dem per ENV gesetzten Root-Account im Frontend anmelden und dort weitere Benutzer anlegen.

4. Falls kein Root-ENV gesetzt ist, kann alternativ einmalig ein initialer Admin angelegt werden:

   ```bash
   curl -X POST http://localhost:8000/api/auth/bootstrap \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@klinik.local","full_name":"MedLib Admin","password":"BitteEinSehrLangesPasswort123!","role":"admin"}'
   ```

5. Frontend öffnen: http://localhost:8080

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

GitHub Actions prüft bei Pushes und Pull Requests automatisch den Backend-Syntaxcheck sowie den Frontend-Build.

Beim Start prüft das Backend optional `ROOT_ADMIN_EMAIL` und `ROOT_ADMIN_PASSWORD` und legt damit automatisch einen Root-Admin an. Dieser Root-Admin kann anschließend weitere Benutzer direkt im Frontend über die Benutzerverwaltung anlegen.

## Coolify Deployment

Für Coolify ist ein vorbereiteter Compose-Stack unter [deploy/coolify/docker-compose.coolify.yml](deploy/coolify/docker-compose.coolify.yml) enthalten.

Empfohlener Pfad in Coolify:

1. Neues `Docker Compose`-Projekt aus dem Git-Repository anlegen.
2. Als Compose-Datei [deploy/coolify/docker-compose.coolify.yml](deploy/coolify/docker-compose.coolify.yml) wählen.
3. Als öffentliche Service-Route den Service `frontend` auf Port `80` veröffentlichen.
4. Umgebungsvariablen aus [deploy/coolify/env.coolify.example](deploy/coolify/env.coolify.example) übernehmen.
5. `CORS_ORIGINS` auf die echte Klinik-Domain setzen, z. B. `["https://medlib.example-klinik.de"]`.
6. `ROOT_ADMIN_EMAIL` und `ROOT_ADMIN_PASSWORD` setzen, damit beim ersten Start automatisch der Root-Admin angelegt wird.
7. Nach dem ersten Login weitere Benutzer direkt im Frontend unter `Benutzerverwaltung` anlegen.

Hinweise für Coolify:

- Die Coolify-Compose-Datei verwendet benannte Volumes für PostgreSQL und die PDF-Ablage.
- Der Service `backend` bleibt intern; öffentlich exponiert wird nur `frontend`.
- Healthchecks für Datenbank, Backend und Frontend sind vorbereitet.
- Für produktiven Klinikbetrieb sollten Domain, TLS, Backup-Strategie und Zugriffsschutz in Coolify bzw. dem vorgeschalteten Reverse Proxy verbindlich gesetzt werden.

## Datenbankmigrationen (Alembic)

Das Backend verwendet **Alembic** für Schema-Migrationen. Beim Start führt der Backend-Container automatisch `alembic upgrade head` aus, sodass neue Tabellen und Spalten ohne manuellen Eingriff angelegt werden.

Manuelle Migration (z. B. bei Schema-Änderungen in der Entwicklung):

```bash
cd backend

# Neue Migration aus den SQLAlchemy-Modellen erzeugen:
alembic revision --autogenerate -m "beschreibung_der_aenderung"

# Migration auf die Datenbank anwenden:
alembic upgrade head

# Aktuellen Migrationsstand anzeigen:
alembic current
```

Die Alembic-Konfiguration (`alembic/env.py`) liest die `DATABASE_URL` automatisch aus der App-Konfiguration bzw. der Umgebungsvariablen. Es ist keine manuelle Anpassung der `alembic.ini` nötig.

## Admin und Backups

Empfohlener Admin-Flow:

- Den ersten Root-Admin über `ROOT_ADMIN_EMAIL` und `ROOT_ADMIN_PASSWORD` setzen.
- Danach weitere Konten im Frontend über `Benutzerverwaltung` anlegen.
- `ROOT_ADMIN_UPDATE_PASSWORD=true` nur temporär setzen, wenn das Root-Passwort beim nächsten Start bewusst überschrieben werden soll.

Einfache PostgreSQL-Backup-Kommandos:

```bash
docker compose exec db pg_dump -U medlib -d medlib > medlib-backup.sql
docker compose exec db pg_dumpall -U medlib > medlib-cluster-backup.sql
```

Einfacher Restore:

```bash
cat medlib-backup.sql | docker compose exec -T db psql -U medlib -d medlib
```

Produktionshinweise:

- Datenbank-Backups regelmäßig extern speichern, nicht nur auf demselben Host.
- Das Storage für `/data/books` zusätzlich dateibasiert sichern.
- Vor Updates einen Datenbank-Dump und ein Storage-Backup erstellen.
- Root-Admin-Zugang nur für Initialisierung und Notfälle verwenden; Alltagskonten separat anlegen.

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

- OCR-Queue mit Redis/Celery und Fortschritt per WebSocket/SSE.
- PDF.js-Viewer mit Textlayer für geometrisch exakte Highlights.
- LDAP/OIDC/Keycloak-Anbindung und optional 2FA.
- Audit-Logging für Downloads, Uploads, OCR und Adminaktionen.
- Fachsystem-Integration für Klinik-Intranet, Proxy-Auth und zentrale Nutzergruppen.

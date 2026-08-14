# Setlist-o-Mat

Der Setlist-o-Mat hilft einer Gruppe dabei, Konzertstücke zu bewerten, Setlist-Entwürfe zusammenzustellen und gemeinsam eine finale Reihenfolge zu finden.

## Funktionen

- Stücke mit 1–5 Sternen und Kommentar bewerten
- offene Bewertungen als persönliche Aufgabenliste anzeigen
- beliebig viele Setlists erstellen, sortieren, duplizieren und veröffentlichen
- Dauer, Zielkorridor von 25–30 Minuten, Grade, Kosten und Genre-Mix auswerten
- veröffentlichte Setlists gemeinsam bewerten und kommentieren
- Metadaten und Auswahlstatus administrieren
- mobil optimierte Bedienung

## Lokale Entwicklung

Voraussetzung ist Node.js 22.13 oder neuer.

```bash
npm ci
npm run dev
```

Ohne Supabase-Variablen läuft die App mit Demodaten. Die vollständige Backend-Einrichtung ist in [SUPABASE_SETUP.md](SUPABASE_SETUP.md) beschrieben.

## GitHub Pages

Der Workflow `.github/workflows/pages.yml` erzeugt bei jedem Push auf `main` einen statischen Next.js-Build und veröffentlicht ihn über GitHub Pages.

Für die spätere Supabase-Verbindung werden diese Repository-Variablen verwendet:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Der Publishable Key ist für Browser-Anwendungen vorgesehen. Secret- und Service-Role-Keys dürfen niemals im Repository oder in `NEXT_PUBLIC_*`-Variablen gespeichert werden.

# Projektkontext: Setlist-o-Mat

Stand: 26. August 2026  
Maßgeblicher technischer Stand: `main`, Commit `f432d1e6` (`Add multi-project support`)  
Repository: https://github.com/fabiradi/setlist-o-mat

## Rolle und Pflege dieses Dokuments

Dieses Dokument ist der kompakte Einstiegskontext für ChatGPT-Projektchats. Die verbindliche Fassung liegt im Repository unter `docs/PROJECT_CONTEXT.md`.

- Für den tatsächlich implementierten Stand sind immer der aktuelle Branch `main`, `supabase/schema.sql` und die übrigen Repository-Dateien maßgeblich.
- Vor technischen Änderungen muss der aktuelle Repository-Stand geprüft werden; der oben genannte Commit ist nur der Stand dieser Beschreibung.
- Bei größeren fachlichen, architektonischen oder betrieblichen Änderungen wird zuerst `docs/PROJECT_CONTEXT.md` aktualisiert. Anschließend wird diese Projektquelle auf denselben Inhalt gebracht.
- Kurzlebige Einzelaufgaben und Gesprächsverläufe gehören nicht in dieses Dokument. Größere offene Themen und dauerhaft gültige Entscheidungen dagegen schon.

## Zweck und Produktziel

Der Setlist-o-Mat unterstützt kleine Gruppen bei der gemeinsamen Auswahl eines Konzertprogramms. Der aktuelle Haupteinsatz ist die Planung des „Jahreskonzerts 2027“ mit sechs Mitgliedern; die Anwendung ist jedoch auf mehrere voneinander getrennte Projekte ausgelegt.

Der fachliche Ablauf ist:

1. Mitglieder bewerten alle Stücke mit 1–5 Sternen oder „Kann ich nicht beurteilen“ und können sie kommentieren.
2. Jedes Mitglied kann private Setlist-Entwürfe erstellen und auswerten.
3. Ein Entwurf wird veröffentlicht und ist danach nicht mehr veränderbar.
4. Die Gruppe bewertet und kommentiert die veröffentlichten Setlists.
5. Veröffentlichte Vorschläge werden verglichen und von einem Admin für die Finalrunde ausgewählt.
6. Eine Setlist wird als endgültiges Konzertprogramm festgelegt.

Die Anwendung ist smartphone-orientiert. Für das Hauptprojekt gilt bislang ein Zielkorridor von 25–30 Minuten Nettospielzeit; Projekte besitzen bereits eigene Felder für diese Zeitgrenzen.

## Verbindliche Produktregeln

- Gruppenbewertungen eines Stücks werden einem Mitglied erst angezeigt, nachdem es das Stück selbst bearbeitet hat. Eine eigene Wertung oder „Kann ich nicht beurteilen“ erfüllt diese Bedingung.
- Setlist-Entwürfe sind nur für ihren Eigentümer sichtbar.
- Veröffentlichte Setlists sind unveränderlich. Änderungen erfolgen über eine duplizierte Variante.
- Bewertungen und Kommentare gehören immer zu einem Nutzer und einem Projektkontext.
- Pro Projekt darf es höchstens eine finale Setlist geben.
- Daten verschiedener Projekte müssen vollständig voneinander getrennt bleiben.
- Neu registrierte Nutzer werden keinem Projekt automatisch zugeordnet. Die Zuordnung erfolgt durch einen Admin.
- Der technische Ist-Stand im Repository ist maßgeblich. Diese Beschreibung hält Produktentscheidungen und größere Zusammenhänge fest, ersetzt aber keine Prüfung des aktuellen Codes.

## Architektur und Tech-Stack

| Bereich | Stand |
| --- | --- |
| Frontend | Next.js 16.2.6, React 19.2.6, TypeScript 5.9.3 |
| Styling/UI | Tailwind CSS 4, umfangreiches eigenes CSS, Lucide Icons |
| Backend | Supabase mit PostgreSQL, Auth, Row Level Security, Realtime Presence und Edge Functions |
| Hosting | Statischer Next.js-Export auf GitHub Pages |
| Deployment | GitHub Actions bei Push auf `main` |
| Demo-Betrieb | Lokale Demodaten, wenn Supabase-Umgebungsvariablen fehlen |
| PWA | Manifest und App-Icons; kein echter Offline-Service-Worker |

Die Anwendung ist derzeit stark monolithisch aufgebaut. Der Großteil der Logik und UI liegt in `app/page.tsx` (ca. 7.150 Zeilen), das Styling weitgehend in `app/globals.css` (ca. 129 KB). Es gibt noch keine automatisierten Tests. Der Deployment-Workflow baut die Anwendung, führt aber keinen separaten Lint- oder Testlauf aus.

## Datenmodell

| Tabelle | Zweck |
| --- | --- |
| `profiles` | Nutzerprofil, E-Mail, globaler App-Admin, Passwortwechselpflicht, letzte Aktivität |
| `projects` | Name, Aktiv-/Archivstatus und projektspezifischer Zeitkorridor |
| `project_members` | Projektzuordnung, Rolle `member`/`admin` und Status |
| `pieces` | Projektbezogener Stückkatalog mit Dauer, Schwierigkeitsgrad, Genres, Soli, Preis, Kaufstatus, Quellen und Links |
| `piece_ratings` | Persönliche Sterne, Kommentar oder Status `skipped` |
| `setlists` | Eigentümer, Projekt, Name und Status `draft`/`published`/`finalist`/`final` |
| `setlist_items` | Stücke und Reihenfolge einer Setlist |
| `setlist_ratings` | Sterne und Kommentar eines Nutzers zu einer Setlist |
| `signup_allowed_emails` | Zusätzliche für die Registrierung freigegebene Adressen |
| `signup_blocked_emails` | Sperrliste; hat Vorrang vor einer Freigabe |
| `app_settings` | Globale Einstellungen, derzeit insbesondere Wartungsmodus |
| `private.signup_access` | SHA-256-Hash des gemeinsamen Gruppencodes |

Das atomare Speichern eines eigenen Setlist-Entwurfs erfolgt über die RPC-Funktion `save_own_setlist_draft`. Dadurch entstehen beim Ersetzen oder Umsortieren der Stücke keine sichtbaren Zwischenzustände.

Das Datenbankschema liegt derzeit als vollständige Datei `supabase/schema.sql` vor. Es gibt noch keine versionierten Migrationen. Ob Änderungen der Schema-Datei bereits in der produktiven Supabase-Instanz ausgeführt wurden, muss deshalb separat geprüft werden.

## Authentifizierung, Rollen und RLS

Die Anmeldung erfolgt mit E-Mail und Passwort. Eine Registrierung ist nur möglich, wenn:

- der gemeinsame Gruppencode stimmt,
- die Adresse auf `@musikverein-verl.de` endet oder in der Freigabeliste steht,
- die Adresse nicht gesperrt ist.

Diese Regeln werden durch einen Supabase-Auth-Hook vor der Benutzeranlage geprüft. Ein Trigger erzeugt anschließend das Profil. Für temporäre Passwörter und das vollständige Löschen von Konten existieren geschützte Edge Functions.

Es gibt zwei Admin-Ebenen:

- `profiles.is_app_admin`: globaler App-Admin
- `project_members.role = 'admin'`: Admin eines einzelnen Projekts

Die RLS berücksichtigt beide Ebenen. Im Frontend werden Adminfunktionen derzeit jedoch nur globalen App-Admins angeboten; die Projekt-Admin-Rolle ist dort noch nicht konsequent umgesetzt.

Die RLS schützt insbesondere:

- Projekte, Mitglieder, Stücke, Bewertungen und Setlists anhand der Projektzugehörigkeit,
- private Entwürfe vor anderen Nutzern,
- fremde Stückbewertungen bis zur eigenen Bearbeitung,
- Schreibzugriffe auf eigene Bewertungen und eigene Entwürfe,
- Finalisten- und Finalmarkierungen als Adminaktionen.

Ein partieller Unique Index stellt sicher, dass es pro Projekt höchstens eine finale Setlist gibt.

## Umgesetzter Funktionsumfang

### Stückbewertung und Stückverwaltung

- Bewertung mit 1–5 Sternen, Kommentar oder „Kann ich nicht beurteilen“
- Zurücksetzen der eigenen Bewertung
- persönliche Aufgabenliste und Fortschrittsanzeige
- Gruppenwertungen und Kommentare nach Abgabe der eigenen Bearbeitung
- Suche, Genre-Filter und verschiedene Sortierungen
- Anzeige der Verwendungshäufigkeit in veröffentlichten Setlists
- Hörbeispiele und YouTube-Player
- Adminpflege und Neuanlage von Stücken
- Metadaten unter anderem für Dauer, Grade, Genres, Soli, Preis, Kaufstatus und Quelle

### Setlists

- private Entwürfe mit Hinzufügen, Entfernen und Sortieren von Stücken
- atomisches Speichern der Entwürfe
- Duplizieren einer Setlist als Variante
- Veröffentlichung mit anschließender Unveränderlichkeit
- Auswertung von Dauer, Genres, Kosten, Schwierigkeitsgraden und Soli
- gemeinsames Abspielen ausgewählter Hörbeispiele
- Druck-/PDF-Ausgabe
- Gruppenbewertung und Kommentare
- Ändern oder Zurücksetzen der eigenen Bewertung
- Filter für eigene, veröffentlichte, unbewertete und Finalrunden-Setlists
- Adminmarkierungen für `finalist` und `final`

### Dashboard und Setlist-Vergleich

Das Dashboard leitet aktuell aus dem persönlichen Arbeitsstand eine Phase ab:

1. Stücke bewerten
2. erste Setlist bauen
3. veröffentlichte Setlists bewerten
4. Setlists vergleichen
5. Finalrunde

Der Vergleich stellt zwei oder drei veröffentlichte Setlists gegenüber und zeigt Gruppen- und Eigenbewertung, Bewertungsfortschritt, Dauer, Übereinstimmungen, Genre-Mix, Soli, Kosten, Kommentare sowie gemeinsame, teilweise gemeinsame und exklusive Stücke einschließlich ihrer Positionen.

### Betrieb und Mehrprojektfähigkeit

- responsive Smartphone-Oberfläche und Hash-basierte Deep Links
- Wartungsmodus, Online-Anzeige und Prüfung auf neue Deployments
- Registrierungs-Freigabe- und Sperrlisten
- echter Projektumschalter auf Desktop und Mobilgerät
- Projekt-ID in URL und `localStorage`
- projektbezogenes Laden von Stücken, Setlists, Bewertungen und Mitgliedern
- Anlegen eines Projekts
- optionales Kopieren eines Stückkatalogs ohne Bewertungen und Setlists
- Zuordnen und Entfernen von Nutzern
- Auswahl der Projektrolle `Mitglied` oder `Projekt-Admin`
- Zustand „noch keinem Projekt zugeordnet“ für neue Nutzer

## Konventionen für die Weiterentwicklung

- Änderungen müssen die Projektisolation sowohl in den Frontend-Abfragen als auch in der RLS erhalten.
- Sicherheitsregeln gehören in die Datenbank/RLS und dürfen nicht ausschließlich durch ausgeblendete UI abgesichert werden.
- Projektbezogene Werte wie Name und Zeitkorridor dürfen nicht fest im Frontend codiert werden.
- Statuswechsel von Setlists müssen die Zustände `draft`, `published`, `finalist` und `final` sowie deren erlaubte Übergänge respektieren.
- Bestehende Nutzeränderungen im Repository sind bei Arbeiten am Code zu erhalten; technische Aussagen sind gegen `main` und `supabase/schema.sql` zu prüfen.
- Mobile Bedienbarkeit ist ein primäres Akzeptanzkriterium.
- Vor dem Ausbau der Finalrunde wird die Mehrprojektfähigkeit mit einem isolierten Testkonto praktisch verifiziert.
- Nach einer Änderung werden mindestens die unmittelbar betroffenen Prüfungen sowie `npm run build` ausgeführt; Fehler oder nicht ausgeführte Prüfungen werden ausdrücklich genannt.
- Datenbankänderungen werden nicht allein durch Frontend-Code als erledigt betrachtet. Der ausgeführte Stand der produktiven Supabase-Datenbank muss separat bestätigt werden.
- Geheimnisse, Service-Role-Keys und andere privilegierte Zugangsdaten dürfen nicht in das Repository oder in `NEXT_PUBLIC_*`-Variablen gelangen.
- Dokumentation und Projektkontext werden nur bei materiellen Änderungen aktualisiert, nicht bei jeder kleinen UI-Korrektur.

## Bekannte Schwachstellen

- Das Dashboard enthält noch den fest codierten Namen „Jahreskonzert 2027“.
- Auswertungen verwenden teilweise weiterhin fest 25–30 Minuten statt des projektspezifischen Zeitkorridors.
- Projekte können in der Oberfläche angelegt, aber noch nicht umbenannt oder archiviert werden.
- Beim Projektwechsel werden alte Daten nicht sofort vollständig geleert und die Hauptoberfläche nicht vollständig blockiert. Kurzzeitig können dadurch Daten des vorherigen Projekts unter dem neuen Projektnamen erscheinen.
- Projekt-Admins erhalten im Frontend noch nicht konsequent ihre laut RLS möglichen Adminfunktionen.
- Die Dashboardphase wird pro Nutzer berechnet und ist kein verbindlicher, gespeicherter Projekt- oder Prozessstatus.
- Finalisten verwenden weiterhin dieselben Setlist-Bewertungen. Eine eigenständige Finalrundenabstimmung und ein separater Abschlussstatus fehlen.
- Finalisten können administrativ unabhängig vom Bewertungsfortschritt bestimmt werden.
- Fachliche Daten werden nicht in Echtzeit synchronisiert; Realtime wird bislang nur für Anwesenheit verwendet.
- Datenbankänderungen sind nicht als Migrationen versioniert.
- Automatisierte Tests und ein Lint-/Test-Gate im Deployment fehlen.

## Größere offene Themen und Priorität

### 1. Mehrprojektfähigkeit verifizieren und vervollständigen

- produktiven SQL-Stand mit `supabase/schema.sql` abgleichen
- Testprojekt mit kopiertem Stückkatalog anlegen
- zweites Konto registrieren, den unzugeordneten Zustand prüfen und nur dem Testprojekt zuweisen
- Isolation von Stücken, Bewertungen, Setlists und Mitgliedern zwischen Haupt- und Testprojekt testen
- Projektwechsel des App-Admins prüfen
- fest codierten Projektnamen und Zeitkorridor beseitigen
- sauberen Ladezustand beim Projektwechsel herstellen
- Umbenennen und Archivieren von Projekten ergänzen
- Zuständigkeiten von App-Admin und Projekt-Admin verbindlich festlegen und im Frontend abbilden

### 2. Bewertungsabschluss und Finalrunde fachlich definieren

- expliziten Projekt- oder Prozessstatus statt ausschließlich abgeleiteter Nutzerphasen einführen
- Regeln für Abschluss der Stück- und Setlistbewertung festlegen
- Voraussetzungen und Zeitpunkt der Finalistenauswahl definieren
- entscheiden, ob Finalisten erneut bewertet werden oder bestehende Bewertungen gelten
- Abschluss der Finalrunde und Festlegung der finalen Setlist sichtbar machen
- Dashboard um den verbindlichen Gruppenfortschritt ergänzen
- Projektabschluss und Archivierung definieren

### 3. Technische Stabilisierung

- versionierte Supabase-Migrationen einführen
- generierte Datenbanktypen zentral verwenden
- `app/page.tsx` und `app/globals.css` schrittweise aufteilen
- Tests für RLS, Projektisolation, Registrierung und Setlist-Statuswechsel ergänzen
- Lint und Tests in den Deployment-Workflow aufnehmen
- belastbaren Gesamtexport beziehungsweise Backup-Konzept ergänzen

### 4. Optionaler Betriebsausbau

- SMTP-/Resend-Konfiguration und E-Mail-Bestätigung vollständig in Betrieb nehmen, sofern weiterhin gewünscht
- prüfen, welche Fachdaten von einer Realtime-Aktualisierung profitieren
- echten Offline-Betrieb nur bei klarem Bedarf als separates Vorhaben planen

## Unmittelbarer nächster Schritt

Vor weiteren Änderungen an der Finalrunde wird geprüft, ob der aktuelle Mehrprojektstand in der produktiven Supabase-Datenbank vollständig aktiv ist. Anschließend wird mit einem separaten Testkonto ein isoliertes Testprojekt durchgespielt. Erst nach erfolgreicher Projektisolation werden die verbliebenen Mehrprojektlücken geschlossen und danach Bewertungsabschluss und Finalrunde weiterentwickelt.

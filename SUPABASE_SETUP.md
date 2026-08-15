# Supabase-Einrichtung für den Setlist-o-Mat

Die App verwendet E-Mail-Adresse und Passwort. Ohne Umgebungsvariablen startet sie bewusst im lokalen Demo-Modus.

## 1. Datenbank aufsetzen

Im SQL-Editor des Supabase-Projekts zuerst `supabase/schema.sql` ausführen. `supabase/seed.sql` enthält ausschließlich synthetische Demodaten und kann für einen technischen Test verwendet werden. Die echten Konzertdaten werden bewusst nicht im öffentlichen Repository gespeichert, sondern separat in die produktive Datenbank importiert.

## 2. Anmelderegel aktivieren

Unter **Authentication → Hooks → Before User Created** die Funktion `private.before_user_created` auswählen.

- `@musikverein-verl.de` wird automatisch zugelassen.
- Andere Adressen müssen in `signup_allowed_emails` stehen.
- `signup_blocked_emails` hat immer Vorrang.
- Jede neue Registrierung benötigt zusätzlich den gemeinsamen Gruppencode. In `private.signup_access` wird ausschließlich dessen SHA-256-Hash gespeichert; der Klartext gehört nicht ins Repository.

Beispiel zum Setzen oder Rotieren des Gruppencodes (Platzhalter ersetzen):

```sql
insert into private.signup_access (id, code_hash, updated_at)
values (true, encode(extensions.digest(upper(trim('<GRUPPENCODE>')), 'sha256'), 'hex'), now())
on conflict (id) do update
set code_hash = excluded.code_hash,
    updated_at = excluded.updated_at;
```

Nach der ersten eigenen Anmeldung die Admin-Rolle einmalig im SQL-Editor setzen. `<ADMIN-E-MAIL>` dabei durch die eigene Adresse ersetzen:

```sql
update public.profiles
set is_app_admin = true
where email = lower('<ADMIN-E-MAIL>');

update public.project_members
set role = 'admin'
where user_id = (
  select id from public.profiles where email = lower('<ADMIN-E-MAIL>')
);
```

## 3. Passwort-Anmeldung und Resend

Solange kein produktiver SMTP-Dienst bereitsteht, kann **Confirm email** unter Authentication → Sign In / Providers ausgeschaltet werden. Neue Konten werden trotzdem durch Gruppencode, Domain/Freigabeliste und den Before-User-Created-Hook geschützt. Passwort-Anmeldungen versenden keine Mail.

Nach der Verifizierung einer Resend-Absenderdomain Resend unter den SMTP-Einstellungen eintragen und **Confirm email** wieder aktivieren. API-Key und SMTP-Passwort gehören ausschließlich in Supabase, niemals ins Repository oder in eine `NEXT_PUBLIC_*`-Variable.

Für einen ersten Test kann eine von Resend erlaubte Absenderadresse genutzt werden. Die Musikvereins-Domain kann später ohne Codeänderung als Absenderdomain ergänzt werden.

## 4. App verbinden

In den Hosting-Variablen setzen:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<projekt>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Der Publishable Key darf im Browser verwendet werden; Sicherheit entsteht durch die RLS-Regeln. Secret- oder Service-Role-Keys dürfen nicht in Frontend- oder Hosting-Variablen mit `NEXT_PUBLIC_` landen.

## 5. Excel-Daten erneut erzeugen

Nach einem geprüften Excel-Import wird `app/data/pieces.json` aktualisiert. Anschließend erzeugt `npm run seed:generate` ein idempotentes `supabase/seed.sql`, das vorhandene Stücke anhand ihres Import-Schlüssels aktualisiert.

## 6. Nutzer vollständig löschen

Die Edge Function `admin-delete-user` mit der Supabase CLI deployen. Die Funktion prüft den eingeloggten Aufrufer serverseitig als App-Admin und nutzt den Service-Role-Key ausschließlich in der geschützten Function-Umgebung. Das eigene Admin-Konto kann darüber nicht versehentlich gelöscht werden.

## 7. Temporäres Passwort vergeben

Die Edge Function `admin-reset-password` ebenfalls deployen. Sie prüft die Adminrolle, erzeugt serverseitig ein zufälliges temporäres Passwort und markiert das Profil mit `password_change_required`. Beim nächsten Aufruf der App muss das Mitglied deshalb ein eigenes Passwort setzen, bevor andere Funktionen erreichbar sind. Das temporäre Passwort wird nur einmal im Admin-Dialog angezeigt und gehört nicht in Logs oder ins Repository.

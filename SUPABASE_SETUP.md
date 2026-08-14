# Supabase-Einrichtung für den Setlist-o-Mat

Die App enthält bereits den Login per E-Mail-Code. Ohne Umgebungsvariablen startet sie bewusst im lokalen Demo-Modus.

## 1. Datenbank aufsetzen

Im SQL-Editor des Supabase-Projekts zuerst `supabase/schema.sql` ausführen. `supabase/seed.sql` enthält ausschließlich synthetische Demodaten und kann für einen technischen Test verwendet werden. Die echten Konzertdaten werden bewusst nicht im öffentlichen Repository gespeichert, sondern separat in die produktive Datenbank importiert.

## 2. Anmelderegel aktivieren

Unter **Authentication → Hooks → Before User Created** die Funktion `private.before_user_created` auswählen.

- `@musikverein-verl.de` wird automatisch zugelassen.
- Andere Adressen müssen in `signup_allowed_emails` stehen.
- `signup_blocked_emails` hat immer Vorrang.

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

## 3. E-Mail-Code und Resend

In der Supabase-E-Mail-Vorlage für Magic Link/OTP den sechsstelligen Token mit `{{ .Token }}` anzeigen. Unter den SMTP-Einstellungen Resend als Versanddienst eintragen. API-Key und SMTP-Passwort gehören ausschließlich in Supabase, niemals ins Repository oder in eine `NEXT_PUBLIC_*`-Variable.

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

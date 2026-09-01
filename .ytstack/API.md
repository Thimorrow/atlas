# Atlas HTTP-API, Kurzfassung fuer den Android-Client

Der Code ist die Wahrheit. Diese Datei fasst zusammen, was ein nativer Client
wissen muss, und benennt vor allem die Luecken.

## Anmeldung
- Ein einziges Passwort in `ATLAS_PASSWORD`. Kein Benutzerkonto.
- `POST /api/login` mit `{"password": "..."}` setzt das Cookie `atlas-gate`
  (HttpOnly, SameSite=Lax, Path=/, Max-Age ein Jahr). `DELETE /api/login` loescht es.
- Ohne Cookie: `/api/*` antwortet 401 mit `{"error":"Nicht angemeldet."}`,
  Seiten werden auf `/login?weiter=...` umgeleitet.
- Ausgenommen von der Sperre: `_next/static`, `_next/image`, `favicon.ico`,
  `/login`, `/api/login`.
- Kotlin: persistenter CookieJar. Ein 401 kann jederzeit kommen, ein Interceptor
  muss zum Anmeldebildschirm springen.

## Routen
| Methode | Pfad | Zweck |
| --- | --- | --- |
| POST/DELETE | /api/login | anmelden, abmelden |
| GET | /api/session | Sitzung pruefen |
| GET | /api/home?date= | Woche, Aufgaben, Faecher und Sync-Stand in einem Aufruf |
| GET | /api/colors | Farbtoken mit echten Farbwerten |
| GET/POST | /api/subjects | Faecher lesen, anlegen (`?all=1`, `?archived=1`) |
| GET | /api/subjects/candidates | Untis-Fachnamen fuer die Ersteinrichtung |
| POST | /api/subjects/setup | Ersteinrichtung, idempotent |
| GET/PATCH/DELETE | /api/subjects/{id} | Fach mit Notizen, Aufgaben, naechsten Stunden |
| GET/POST | /api/subjects/{id}/notes | Notizen |
| GET/PATCH/DELETE | /api/notes/{id} | eine Notiz |
| GET/POST | /api/subjects/{id}/files | Dateiliste, Datei eintragen |
| POST | /api/subjects/{id}/files/upload | Upload-Token fuer den Blob-Store |
| GET/DELETE | /api/files/{id} | Datei herunterladen, loeschen |
| GET/POST | /api/assignments | Aufgaben (`?completed=1`, `?subjectId=`) |
| GET/PATCH/DELETE | /api/assignments/{id} | eine Aufgabe |
| POST/DELETE | /api/assignments/{id}/complete | abhaken, Haken entfernen |
| GET | /api/calendar?date=&view=week\|day | Stundenplan |
| GET/POST | /api/sync/untis | Stand lesen, Abgleich anstossen (`{start,end}` optional) |

Fehlerantworten haben immer die Form `{"error": "<deutscher Satz>"}`.
Eine kaputte UUID im Pfad ergibt 404, nie 400.

## Datentypen
- **SubjectDTO**: id, name, untisSubject?, teacher?, room?, color?, archivedAt?,
  openAssignments, noteCount.
- **NoteDTO**: id, subjectId, title, body (roher Markdown), createdAt, updatedAt.
- **AssignmentDTO**: id, subjectId?, subjectName?, subjectColor?, type, title,
  notes?, dueDate? (`JJJJ-MM-TT`), completedAt?.
- **LessonDTO**: id, date, startTime (`HH:MM`), endTime?, room?, teacher?, status,
  substitutionText?.
- **CalendarEvent**: source, refId, date, startTime, endTime?, title, status, room?, teacher?.
- **FileDTO**: id, name, pathname, size, contentType, createdAt. Keine Blob-URL,
  der Store ist privat, heruntergeladen wird ueber `/api/files/{id}`.
- **Aufgabentyp**: homework, exam, test, presentation, other.
- **Stundenstatus**: regular, cancelled, substituted.
- **Farbtoken**: slate, white, blue, sky, teal, green, yellow, amber, orange,
  rose, violet, lime, pink. Werte ueber `/api/colors`.

## Fallstricke
- `dueDate`, `date`, `start`, `end` sind reine Datumsangaben ohne Zeitzone, also
  `LocalDate`. Alles andere mit `Z` ist UTC, also `Instant`.
- `/api/calendar` ohne `date` nimmt das UTC-Datum des Servers. Der Client soll
  `date` immer selbst setzen, mit dem lokalen Datum des Geraets.
- Faelligkeiten immer gegen das lokale Geraetedatum vergleichen, so macht es
  `lib/assignments-view.ts` auch.
- Sortierungen kommen aus Postgres, nicht mit deutscher Locale. Umlaute koennen
  anders einsortiert sein als ein Kotlin-Collator.
- Erlaubte Dateitypen: application/pdf, image/png, image/jpeg, image/webp,
  image/heic. Hoechstens 10 MB.
- Der Download laeuft durch die Passwortsperre, ein DownloadManager ohne die
  Cookies der App bekommt 401 mit JSON statt der Datei.
- `enabled: false` in der Dateiliste heisst nur, dass kein Blob-Token gesetzt ist.

## Was noch fehlt, und was davon Absicht ist
Diese Liste kommt aus einer Durchsicht des ganzen `app/`-Baums. Erledigte Punkte
sind abgehakt.

- [x] Sitzung pruefen ohne Fehlversuch: `GET /api/session`.
- [x] Startansicht in einem Aufruf: `GET /api/home?date=`.
- [x] Farbwerte ueber die API: `GET /api/colors`.
- [x] Zustand des Untis-Abgleichs serverseitig: `GET /api/sync/untis`.
- [x] Upload ohne Vercel-SDK: multipart an `POST /api/subjects/{id}/files`.
- [ ] Gruppierung der Aufgaben (ueberfaellig, heute, morgen, diese Woche,
      spaeter, ohne Datum) liegt nur im Browser, in `lib/assignments-view.ts`.
      Ein nativer Client baut sie nach. Bewusst so: die Regeln sind Anzeige,
      nicht Datenhaltung.
- [ ] Markdown wird nur im Browser gerendert. Nativ braucht es einen eigenen
      Renderer mit denselben Regeln wie `lib/markdown.ts`.
- [ ] Doppelstunden zusammenfassen macht `app/page.tsx` im Browser.
- [ ] Kein Delta-Abgleich: die DTOs fuehren kein `updatedAt`, es gibt kein
      `?since=` und kein Loeschjournal. Fuer echten Offline-Betrieb die
      groesste Luecke.
- [ ] Keine Benachrichtigungen, kein Push-Token, kein serverseitiger Ausloeser.
- [ ] Keine faecheruebergreifenden Listen fuer Notizen und Dateien, keine Suche.
- [ ] Keine Paginierung, kein frei waehlbarer Zeitraum im Kalender. `expandRange`
      koennte es, ist aber nicht nach aussen gefuehrt.

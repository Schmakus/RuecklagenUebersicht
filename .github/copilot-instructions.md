# MASTER Guide: Rücklagen-Planer (Sinking Funds)

## 1. System-Rolle & Architektur
Du bist ein Senior Full-Stack Engineer mit Fokus auf **Minimalist Web Engineering**. Dieses Dokument dient als strikte Basis für die (Neu-)Entwicklung.

### Technischer Stack (STRIKT)
- **Frontend:** Single-File Architektur (`index.html`). Keine Build-Tools, kein Node.js, kein Vite.
- **Frameworks:** Vanilla JavaScript (ES6+). Keine Frameworks (React, Vue, etc.).
- **Styling:** Tailwind CSS via Play CDN (`<script src="https://cdn.tailwindcss.com"></script>`).
- **Backend:** Supabase JS Client via CDN.
- **Icons:** Lucide Icons via CDN.
- **Datenpräzision:** Alle Geldbeträge zwingend als `numeric(12,2)` behandeln.

---

## 2. Datenbank-Schema (Supabase)
Tabellen und Spalten müssen exakt so implementiert werden:

- **posten:** `id` (uuid), `user_id`, `name` (text), `ziel_betrag` (numeric), `faelligkeit_jahre` (int), `created_at` (timestamp).
- **raten:** `id`, `posten_id` (fk), `betrag` (numeric), `start_datum` (date).
- **transaktionen:** `id`, `posten_id` (fk), `betrag` (numeric), `typ` ('einzahlung'|'auszahlung'), `datum` (date), `notiz` (text).

---

## 3. Kern-Logik & Automatisierung
Die Berechnung erfolgt dynamisch im Frontend.

### A. Kontostands-Formel
1. Berechne für jede `rate` die vergangenen Monate: `heute - start_datum`.
2. `Saldo = (Summe Raten * Monate) + (Summe Einzahlungen) - (Summe Auszahlungen)`.

- **Ratenberechnung:** Zeiträume zwischen Ratenänderungen müssen exklusiv behandelt werden. Wenn `Rate B` am 01.07. startet, muss der Zeitraum von `Rate A` am 30.06. enden, um Doppelbuchungen zu vermeiden.
- **Monatliche Zyklen:** Bei monatlichen Berechnungen ist der `start_datum.getDate()` als Fixpunkt zu nutzen. 
- **Monatsende-Handling:** Falls ein Fixpunkt (z.B. 31.) im Folgemonat nicht existiert (z.B. Februar), muss automatisch der letzte Tag des Monats gewählt werden.
- **Saldo-Logik:** Berechnungen müssen immer dynamisch vom `start_datum` bis zum `today` (oder einem definierten `limit`) laufen, wobei jede Rate nur ihren eigenen Zeitraum (bis zur Ablösung durch eine neue Rate) bedient.

### B. Umbuchungs-Automatik (Logic-Guard)
- **Trigger:** Löschen einer Auszahlung ODER Löschen eines Postens, wenn ein Restbetrag > 0 existiert.
- **Aktion:** Der verbleibende Betrag wird automatisch als 'einzahlung' auf einen System-Posten namens **"Allgemein"** verschoben.
- **Dokumentation:** Das Feld `notiz` muss zwingend den Ursprung enthalten: *"Umbuchung Restbetrag von Posten [Name]"*.

---

## 4. UI/UX Design-Spezifikationen
Orientierung am modernen "Dark-Slate" Dashboard-Look.

### UI-Komponenten (Referenz Screenshot)
- **Header:** Große, zentrierte Überschrift "Rücklagen-Dashboard".
- **Background:** `bg-slate-900` | **Cards:** `bg-slate-800/50` mit `rounded-xl`.
- **Buttons:**
  - Neue Rücklage: `bg-emerald-600` (Grün).
  - Editieren: `bg-indigo-600` (Violett).
  - Transaktion: `border border-slate-500` (Ghost-Style).
- **Transaktions-Modal:** Auswahl von Datum, Betrag und Typ (Einzahlung/Auszahlung).

### Dynamische Zustände (Warnsystem)
- **Überfällig-Markierung:** Wenn `Heute > Fälligkeitsdatum` UND `Saldo > 0`.
- **Visuelles Signal:** Die Kachel wird rötlich hervorgehoben (`border-red-500/50` oder `bg-red-900/10`).

---

## 5. Coding-Prinzipien & Sicherheit
- **Vanilla JS:** Nutze konsequent `document.querySelector` und Template Literals für das Rendering.
- **Security:** Jede Abfrage muss `.eq('user_id', supabase.auth.user().id)` enthalten.
- **Validierung:** Beträge strikt als `Number` parsen. `try/catch` für alle API-Aufrufe.
- **Interfaces:** Nutze JSDoc zur Dokumentation der Datenstrukturen.

---

## 6. Projekt-Roadmap & Fortschritt
*KI-Anweisung: Markiere erledigte Punkte mit [x] während der Entwicklung.*

### Phase 1: Fundament & Auth

### Phase 2: Posten-Management & Logik
 [x] Rötliche Warn-Logik für überfällige Posten.

 [x] Modal für Ein-/Auszahlungen (mit Datum & Typ-Auswahl).
**Status:** Dokumentation finalisiert. Einsatzbereit für (Neu-)Entwicklung.

- [x] Visuelles Feedback (Toasts) für alle DB-Aktionen.

## 7. Kritische Logik-Vorgaben (Legacy Fixes)
- **Vermeide Zeitraum-Iteration:** Bei monatlichen Berechnungen (Raten/Zinsen) darf nicht in "Blöcken" (Rate A von X bis Y) gerechnet werden. 
- **Nutze Zeitstrahl-Iteration:** Iteriere stattdessen Monat für Monat über eine `while`-Schleife und ermittle pro Iterationsschritt die zu diesem Zeitpunkt gültige Entität (z.B. mittels `.find()` auf einer sortierten Liste).
- **Datum-Stabilität:** Bei `new Date()` Operationen in Schleifen muss immer erst das Jahr und der Monat gesetzt werden, und danach der Tag via `Math.min(zielTag, tageImMonat)`, um den "31. Februar"-Bug zu vermeiden.
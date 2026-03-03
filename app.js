  // --- Delete-Button-Handler ---
  document.addEventListener('click', async (e) => {
    let btn = e.target.closest('.delete-posten-btn');
    if (btn) {
      const postenId = btn.closest('[data-posten-id]')?.dataset.postenId;
      if (!postenId) return;
      const postenObj = posten.find(p => p.id === postenId);
      if (!postenObj || postenObj.name === 'Allgemein') return;
      // Modal anzeigen
      const saldo = window.berechnePostenSaldo(postenId);
      const modalHtml = `
        <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" id="delete-modal-overlay">
          <div class="bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-lg relative">
            <button class="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200" onclick="document.getElementById('delete-modal-overlay').remove()">✕</button>
            <h2 class="text-lg font-bold mb-4">Rücklage löschen</h2>
            <div class="mb-4">Soll die Rücklage <span class="font-semibold">${postenObj.name}</span> wirklich gelöscht werden?</div>
            ${saldo > 0 ? `<div class="mb-4 text-red-400">Restbetrag von <span class="font-semibold">${saldo.toFixed(2)} €</span> wird automatisch in <span class="font-semibold">Allgemein</span> übertragen.</div>` : ''}
            <div class="flex gap-2 mt-4">
              <button id="confirm-delete-posten" class="bg-red-600 hover:bg-red-700 text-white rounded px-4 py-2 flex-1">Löschen</button>
              <button onclick="document.getElementById('delete-modal-overlay').remove()" class="border border-slate-500 text-slate-300 rounded px-4 py-2 flex-1">Abbrechen</button>
            </div>
          </div>
        </div>
      `;
      // Vorheriges Modal entfernen, falls vorhanden
      const oldModal = document.getElementById('delete-modal-overlay');
      if (oldModal) oldModal.remove();
      let modalDiv = document.createElement('div');
      modalDiv.innerHTML = modalHtml;
      document.body.appendChild(modalDiv);
      document.getElementById('confirm-delete-posten').onclick = async () => {
        // Umbuchung falls nötig
        if (saldo > 0) {
          // Finde "Allgemein"
          const allgemein = posten.find(p => p.name === 'Allgemein');
          if (allgemein) {
            await supabase.from('transaktionen').insert({
              posten_id: allgemein.id,
              betrag: saldo,
              typ: 'einzahlung',
              datum: new Date().toISOString().slice(0,10),
              notiz: `Umbuchung Restbetrag von Posten ${postenObj.name}`
            });
          }
        }
        // Lösche Posten
        await supabase.from('posten').delete().eq('id', postenId);
        showToast('Rücklage gelöscht.', 'success');
        document.getElementById('delete-modal-overlay').remove();
        await loadData();
        renderDashboard();
      };
    }
  });
  // ...existing code...
  // Handler für Kontoauszug-Modal
  // ...existing code...
// app.js
// --- Toast-Komponente ---
function showToast(msg, type = "info") {
  let toast = document.createElement("div");
  toast.className = `fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg font-semibold text-sm transition-all duration-300 pointer-events-none ` +
    (type === "error" ? "bg-red-700 text-white" : type === "success" ? "bg-emerald-600 text-white" : "bg-slate-800 text-zinc-100");
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; }, 1800);
  setTimeout(() => { toast.remove(); }, 2200);
}
// SPA-Logik für Rücklagen-Planer (Phase 1: Grundstruktur & Auth)

// --- Supabase Setup ---
const SUPABASE_URL = window.env?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY || '';
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// --- State ---
let user = null;

// --- Auth UI ---
function renderAuth() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="flex flex-col items-center justify-center min-h-screen">
      <h1 class="text-3xl font-bold mb-6">Rücklagen-Planer</h1>
      <form id="login-form" class="flex flex-col gap-4 w-80 bg-slate-800/50 p-8 rounded-xl shadow-lg">
        <input name="email" type="email" placeholder="E-Mail" required class="rounded bg-slate-900 border border-slate-700 px-3 py-2 text-zinc-100" />
        <input name="password" type="password" placeholder="Passwort" required class="rounded bg-slate-900 border border-slate-700 px-3 py-2 text-zinc-100" />
        <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-4 py-2 font-semibold">Login</button>
        <button type="button" id="register-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-2 font-semibold">Registrieren</button>
      </form>
    </div>
  `;
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showToast('Login fehlgeschlagen: ' + error.message, 'error');
  };
  document.getElementById('register-btn').onclick = async () => {
    const email = document.querySelector('#login-form input[name="email"]').value;
    const password = document.querySelector('#login-form input[name="password"]').value;
    if (!email || !password) return alert('Bitte E-Mail und Passwort eingeben!');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) showToast('Registrierung fehlgeschlagen: ' + error.message, 'error');
    else showToast('Registrierung erfolgreich! Bitte E-Mail bestätigen und dann einloggen.', 'success');
  };
}

// --- Dashboard & Posten-Logik ---
let posten = [];
let raten = [];
let transaktionen = [];

/**
 * Berechnet den aktuellen Saldo eines Postens anhand aller gebuchten Transaktionen (inkl. automatischer Raten)
 * @param {string} postenId
 * @returns {number}
 */
window.berechnePostenSaldo = function(postenId) {
  let saldo = 0;
  const today = new Date();
  // Raten filtern und sortieren
  const ratenList = raten
    .filter(r => r.posten_id === postenId)
    .sort((a, b) => new Date(a.start_datum) - new Date(b.start_datum));

  if (ratenList.length === 0) return saldo;

  for (let i = 0; i < ratenList.length; i++) {
    const rate = ratenList[i];
    const start = new Date(rate.start_datum);
    // Enddatum: Entweder einen Tag vor der nächsten Rate, oder heute (inklusive!)
    let end;
    if (ratenList[i + 1]) {
      end = new Date(ratenList[i + 1].start_datum);
      end.setDate(end.getDate() - 1); // Bis zum Tag vor der nächsten Rate
    } else {
      end = today;
    }

    // Beginne mit dem ersten Buchungsdatum (immer Startdatum)
    let jahr = start.getFullYear();
    let monat = start.getMonth();
    let buchungsTag = start.getDate();
    let first = true;
    while (true) {
      let tageImMonat = new Date(jahr, monat + 1, 0).getDate();
      let tatsaechlicherTag = Math.min(buchungsTag, tageImMonat);
      let aktuellesDatum = new Date(jahr, monat, tatsaechlicherTag);
      if (aktuellesDatum < start) {
        // Falls z.B. 31. Februar, dann Monatsende nehmen
        aktuellesDatum = new Date(jahr, monat + 1, 0);
      }
      if (aktuellesDatum > end || aktuellesDatum > today) break;
      saldo += Number(rate.betrag);
      // Nächster Monat
      monat++;
      if (monat > 11) {
        monat = 0;
        jahr++;
      }
      first = false;
    }
  }
  // 2. Echte Transaktionen: Ein-/Auszahlungen
  const trans = transaktionen.filter(t => t.posten_id === postenId);
  for (const t of trans) {
    if (t.typ === 'einzahlung') saldo += Number(t.betrag);
    else if (t.typ === 'auszahlung') saldo -= Number(t.betrag);
  }
  return saldo;
};

// --- Editieren-Button in Card und Handler ---
function renderDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="max-w-3xl mx-auto w-full p-4">
      <h1 class="text-2xl font-bold mb-6 text-center">Rücklagen-Dashboard</h1>
      <div class="flex justify-end mb-4">
        <button id="add-posten-btn" class="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-4 py-2 flex items-center gap-2">
          <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='w-5 h-5'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg>
          Neue Rücklage
        </button>
      </div>
      <div id="posten-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6">
        ${posten.length === 0 ? `<div class="col-span-2 text-center text-zinc-500">Noch keine Posten angelegt.</div>` : posten.map(p => {
          const saldo = window.berechnePostenSaldo ? window.berechnePostenSaldo(p.id) : 0;
          const heute = new Date().toISOString().slice(0,10);
          const istUeberfaellig = p.faelligkeitsdatum && heute > p.faelligkeitsdatum && saldo > 0;
          const ziel = Number(p.ziel_betrag) || 0;
          const fortschritt = ziel > 0 ? Math.min(100, Math.round((saldo / ziel) * 100)) : 0;
          const isAllgemein = p.name === 'Allgemein';
          const cardClass = isAllgemein
            ? "bg-slate-950 rounded-xl p-5 flex flex-col gap-4 shadow-md relative border-2 border-emerald-700/40"
            : istUeberfaellig
              ? "bg-slate-800/50 rounded-xl p-5 flex flex-col gap-4 shadow-md relative border-2 border-red-500/50 bg-red-900/10"
              : "bg-slate-800/50 rounded-xl p-5 flex flex-col gap-4 shadow-md relative";
          return isAllgemein
            ? `<div class="${cardClass}" data-posten-id="${p.id}">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-semibold text-lg">${p.name}</span>
                </div>
                <div class="mb-2">
                  <span class="text-emerald-400 font-mono text-2xl">${saldo.toFixed(2)} €</span>
                </div>
                <div class="flex gap-2">
                  <button class="show-kontoauszug-btn border border-emerald-600 text-emerald-400 rounded px-3 py-1 text-xs flex-1">Kontoauszug</button>
                  <button class="trans-btn border border-slate-500 text-slate-300 rounded px-3 py-1 text-xs flex-1">Transaktion</button>
                </div>
              </div>`
            : `<div class="${cardClass}" data-posten-id="${p.id}">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-semibold text-lg">${p.name}</span>
                  <div class="flex flex-row gap-2"> <button class="edit-posten-btn p-1 text-indigo-400 hover:text-indigo-200" title="Bearbeiten"><i data-lucide="edit-3" class="w-5 h-5"></i></button><button class="delete-posten-btn p-1 text-red-400 hover:text-red-200" title="Löschen"><i data-lucide="trash-2" class="w-5 h-5"></i></button></div>
                </div>
                <div class="mb-2">
                  <div class="flex justify-between text-xs mb-1">
                    <span class="text-zinc-400">${saldo.toFixed(2)} € von ${ziel.toFixed(2)} €</span>
                    <span class="text-zinc-400">${fortschritt}%</span>
                  </div>
                  <div class="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-3 bg-emerald-600 rounded-full transition-all duration-300" style="width: ${fortschritt}%;"></div>
                  </div>
                </div>
                <div class="flex items-center gap-2 mb-4">
                  <span class="text-emerald-400 font-mono text-xl">€ ${p.ziel_betrag.toFixed(2)}</span>
                </div>
                <div class="flex gap-2">
                  <button class="show-kontoauszug-btn border border-emerald-600 text-emerald-400 rounded px-3 py-1 text-xs flex-1">Kontoauszug</button>
                  <button class="trans-btn border border-slate-500 text-slate-300 rounded px-3 py-1 text-xs flex-1">Transaktion</button>
                  <button class="rate-btn bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1 text-xs flex-1">Rate anpassen</button>
                </div>
              </div>`;
        }).join('')}
      </div>
    </div>
  `;
  // Nach dem vollständigen Rendern: Lucide Icons ersetzen
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  }
}

// --- Rate anpassen Modal & Button ---
function openRateModal(postenId) {
  const postenObj = posten.find(p => p.id === postenId);
  if (!postenObj) return;
  const modalHtml = `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-lg relative">
        <button class="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200" onclick="document.getElementById('modal-overlay').remove()">✕</button>
        <h2 class="text-lg font-bold mb-4">Rate anpassen: ${postenObj.name}</h2>
        <form id="rate-form" class="flex flex-col gap-3">
          <label class="text-sm">Neue monatliche Rate (€):
            <input name="betrag" type="number" min="0" step="0.01" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Startdatum der neuen Rate:
            <input name="start_datum" type="date" value="${new Date().toISOString().slice(0,10)}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-2 mt-2">Speichern</button>
        </form>
      </div>
    </div>
  `;
  let modalDiv = document.createElement('div');
  modalDiv.id = 'modal-overlay';
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv);
  document.getElementById('rate-form').onsubmit = async (e) => {
    e.preventDefault();
    const betrag = Number(e.target.betrag.value);
    const start_datum = e.target.start_datum.value;
    if (isNaN(betrag) || betrag <= 0 || !start_datum) return showToast('Ungültige Eingabe!', 'error');
    // Prüfe, ob Rate für dieses Datum schon existiert
    const { data: existingRates } = await supabase.from('raten')
      .select('*')
      .eq('posten_id', postenId)
      .eq('start_datum', start_datum);
    try {
      if (existingRates && existingRates.length > 0) {
        // Überschreibe vorhandene Rate
        await supabase.from('raten').update({ betrag }).eq('id', existingRates[0].id);
        // Passe alle zugehörigen Transaktionen im Zeitraum dieser Rate an
        // Finde die nächste Rate (falls vorhanden)
        const ratenList = raten.filter(r => r.posten_id === postenId).sort((a, b) => new Date(a.start_datum) - new Date(b.start_datum));
        const idx = ratenList.findIndex(r => r.start_datum === start_datum);
        const start = new Date(start_datum);
        const end = ratenList[idx+1] ? new Date(ratenList[idx+1].start_datum) : new Date();
        let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        while (d <= end && d <= new Date()) {
          const buchungsTag = start.getDate();
          const buchungsDatum = new Date(d.getFullYear(), d.getMonth(), buchungsTag);
          if (buchungsDatum < start) {
            d.setMonth(d.getMonth() + 1);
            continue;
          }
          if (buchungsDatum > end || buchungsDatum > new Date()) break;
          // Update oder Insert für diesen Monat
          const datumStr = buchungsDatum.toISOString().slice(0,10);
          const { data: transExist } = await supabase.from('transaktionen')
            .select('id')
            .eq('posten_id', postenId)
            .eq('typ', 'einzahlung')
            .eq('notiz', 'Automatische Rate')
            .eq('datum', datumStr);
          if (transExist && transExist.length > 0) {
            await supabase.from('transaktionen').update({ betrag }).eq('id', transExist[0].id);
          } else {
            await supabase.from('transaktionen').insert({
              user_id: user.id,
              posten_id: postenId,
              betrag,
              typ: 'einzahlung',
              datum: datumStr,
              notiz: 'Automatische Rate'
            });
          }
          d.setMonth(d.getMonth() + 1);
        }
      } else {
        // Neue Rate anlegen
        await supabase.from('raten').insert({ posten_id: postenId, betrag, start_datum });
      }
      showToast('Rate gespeichert.', 'success');
      document.getElementById('modal-overlay').remove();
      await loadData();
      await loadData();
      renderDashboard();
    } catch (err) {
      showToast('Fehler beim Speichern der Rate.', 'error');
    }
  };
}

// --- Transaktion Modal & Button ---
function openTransModal(postenId) {
  const postenObj = posten.find(p => p.id === postenId);
  if (!postenObj) return;
  const modalHtml = `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-lg relative">
        <button class="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200" onclick="document.getElementById('modal-overlay').remove()">✕</button>
        <h2 class="text-lg font-bold mb-4">Transaktion: ${postenObj.name}</h2>
        <form id="trans-form" class="flex flex-col gap-3">
          <label class="text-sm">Betrag (€):
            <input name="betrag" type="number" step="0.01" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Typ:
            <select name="typ" class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100">
              <option value="einzahlung">Einzahlung</option>
              <option value="auszahlung">Auszahlung</option>
            </select>
          </label>
          <label class="text-sm">Datum:
            <input name="datum" type="date" value="${new Date().toISOString().slice(0,10)}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-4 py-2 mt-2">Speichern</button>
        </form>
      </div>
    </div>
  `;
  let modalDiv = document.createElement('div');
  modalDiv.id = 'modal-overlay';
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv);
  document.getElementById('trans-form').onsubmit = async (e) => {
    e.preventDefault();
    const betrag = Number(e.target.betrag.value);
    const typ = e.target.typ.value;
    const datum = e.target.datum.value;
    if (isNaN(betrag) || betrag === 0 || !datum) return showToast('Ungültige Eingabe!', 'error');
    try {
      await supabase.from('transaktionen').insert({ posten_id: postenId, betrag, typ, datum });
      showToast('Transaktion gespeichert.', 'success');
      document.getElementById('modal-overlay').remove();
      await loadData();
      renderDashboard();
    } catch (err) {
      showToast('Fehler beim Speichern der Transaktion.', 'error');
    }
  };
}

// --- Button-Handler für neue Rücklage ---
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'add-posten-btn') {
    openAddPostenModal();
  }
});

// --- Modal für neue Rücklage (mit Fälligkeitsdatum & Rate) ---
function openAddPostenModal() {
  const modalHtml = `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-lg relative">
        <button class="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200" onclick="document.getElementById('modal-overlay').remove()">✕</button>
        <h2 class="text-lg font-bold mb-4">Neue Rücklage anlegen</h2>
        <form id="add-posten-form" class="flex flex-col gap-3">
          <label class="text-sm">Name:
            <input name="name" type="text" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Zielbetrag (€):
            <input name="ziel_betrag" type="number" min="0" step="0.01" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Laufzeit (Jahre):
            <input name="laufzeit_jahre" type="number" min="1" step="1" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Fälligkeitsdatum:
            <input name="faelligkeitsdatum" type="date" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Monatliche Rate (€, Vorschlag):
            <input name="rate_betrag" type="number" min="0" step="0.01" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Startdatum der Rate:
            <input name="rate_start_datum" type="date" value="${new Date().toISOString().slice(0,10)}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-4 py-2 mt-2">Anlegen</button>
        </form>
      </div>
    </div>
  `;
  // Vorheriges Modal entfernen, falls vorhanden
  const oldModal = document.getElementById('modal-overlay');
  if (oldModal) oldModal.remove();
  let modalDiv = document.createElement('div');
  modalDiv.id = 'modal-overlay';
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv);
  // Vorschlagslogik für Rate direkt nach dem Einfügen
  const zielInput = modalDiv.querySelector('input[name="ziel_betrag"]');
  const laufzeitInput = modalDiv.querySelector('input[name="laufzeit_jahre"]');
  const rateInput = modalDiv.querySelector('input[name="rate_betrag"]');
  function updateRate() {
    const ziel = Number(zielInput.value);
    const jahre = Number(laufzeitInput.value);
    if (
      zielInput.value !== '' && laufzeitInput.value !== '' &&
      !isNaN(ziel) && ziel > 0 && !isNaN(jahre) && jahre > 0
    ) {
      const monate = jahre * 12;
      const vorschlag = monate > 0 ? ziel / monate : 0;
      rateInput.value = vorschlag.toFixed(2);
    } else {
      rateInput.value = '';
    }
  }
  zielInput.addEventListener('input', updateRate);
  laufzeitInput.addEventListener('input', updateRate);
  rateInput.value = '';
  document.getElementById('add-posten-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    // Feldnamen exakt wie im HTML-Formular
    const name = form.elements['name']?.value?.trim() || '';
    const ziel_betrag = Number(form.elements['ziel_betrag']?.value);
    const laufzeit_jahre = Number(form.elements['laufzeit_jahre']?.value);
    const faelligkeitsdatum = form.elements['faelligkeitsdatum']?.value;
    const rate_betrag = Number(form.elements['rate_betrag']?.value);
    const rate_start_datum = form.elements['rate_start_datum']?.value;
    if (!name || isNaN(ziel_betrag) || ziel_betrag < 0 || isNaN(laufzeit_jahre) || laufzeit_jahre < 1 || !faelligkeitsdatum || isNaN(rate_betrag) || rate_betrag <= 0 || !rate_start_datum) {
      showToast('Bitte alle Felder korrekt ausfüllen!', 'error');
      return;
    }
    try {
      // 1. Posten anlegen
      const { data: postenRes, error: postenErr } = await supabase.from('posten').insert({
        user_id: user.id,
        name,
        ziel_betrag,
        laufzeit_jahre,
        faelligkeitsdatum
      }).select();
      if (postenErr || !postenRes || !postenRes[0]) throw postenErr || new Error('Fehler beim Anlegen des Postens');
      const postenId = postenRes[0].id;
      // Prüfe, ob Rate für dieses Datum schon existiert
      const { data: existingRates } = await supabase.from('raten')
        .select('*')
        .eq('posten_id', postenId)
        .eq('start_datum', rate_start_datum);
      let ratenErr = null;
      if (existingRates && existingRates.length > 0) {
        // Überschreibe vorhandene Rate
        const { error } = await supabase.from('raten').update({ betrag: rate_betrag }).eq('id', existingRates[0].id);
        ratenErr = error;
      } else {
        // Neue Rate anlegen
        const { error } = await supabase.from('raten').insert({
          posten_id: postenId,
          betrag: rate_betrag,
          start_datum: rate_start_datum
        });
        ratenErr = error;
      }
      if (ratenErr) throw ratenErr;
      showToast('Rücklage angelegt.', 'success');
      document.getElementById('modal-overlay').remove();
      await loadData();
      renderDashboard();
    } catch (err) {
      showToast('Fehler beim Anlegen: ' + (err.message || err), 'error');
    }
  };
}

// --- Button-Handler für neue Rücklage ---
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'add-posten-btn') {
    openAddPostenModal();
  }
});

// --- Modal für Rücklage bearbeiten (mit Fälligkeitsdatum & Rate) ---
function openEditPostenModal(postenId) {
  const postenObj = posten.find(p => p.id === postenId);
  if (!postenObj) return;
  // Finde die aktuell gültige Rate (neueste mit start_datum <= heute)
  const heute = new Date().toISOString().slice(0,10);
  const aktuelleRate = raten
    .filter(r => r.posten_id === postenId && r.start_datum <= heute)
    .sort((a, b) => new Date(b.start_datum) - new Date(a.start_datum))[0];
  // Finde die nächste zukünftige Rate (start_datum > heute)
  const zukunftRate = raten
    .filter(r => r.posten_id === postenId && r.start_datum > heute)
    .sort((a, b) => new Date(a.start_datum) - new Date(b.start_datum))[0];
  const modalHtml = `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-lg relative">
        <button class="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200" onclick="document.getElementById('modal-overlay').remove()">✕</button>
        <h2 class="text-lg font-bold mb-4">Rücklage bearbeiten</h2>
        <form id="edit-posten-form" class="flex flex-col gap-3">
          <label class="text-sm">Name:
            <input name="name" type="text" value="${postenObj.name}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Zielbetrag (€):
            <input name="ziel_betrag" type="number" min="0" step="0.01" value="${postenObj.ziel_betrag}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Laufzeit (Jahre):
            <input name="laufzeit_jahre" type="number" min="1" step="1" value="${postenObj.laufzeit_jahre || postenObj.faelligkeit_jahre || ''}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Fälligkeitsdatum:
            <input name="faelligkeitsdatum" type="date" value="${postenObj.faelligkeitsdatum || ''}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Startdatum der aktuellen Rate:
            <input name="rate_start_datum" type="date" value="${aktuelleRate && aktuelleRate.start_datum ? aktuelleRate.start_datum : new Date().toISOString().slice(0,10)}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Monatliche Rate (€):
            <input name="rate_betrag" type="number" min="0" step="0.01" value="${aktuelleRate && aktuelleRate.betrag ? aktuelleRate.betrag : ''}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          ${zukunftRate ? `<div class='text-xs text-zinc-400 mt-1'>Nächste geplante Rate ab <span class='font-semibold'>${zukunftRate.start_datum}</span>: <span class='font-semibold'>${zukunftRate.betrag.toFixed(2)} €</span></div>` : ''}
          <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-2 mt-2">Speichern</button>
        </form>
      </div>
    </div>
  `;
  let modalDiv = document.createElement('div');
  modalDiv.id = 'modal-overlay';
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv);
  // Vorschlagslogik für Rate (wie beim Anlegen)
  setTimeout(() => {
    const zielInput = document.querySelector('#edit-posten-form input[name="ziel_betrag"]');
    const laufzeitInput = document.querySelector('#edit-posten-form input[name="laufzeit_jahre"]');
    const rateInput = document.querySelector('#edit-posten-form input[name="rate_betrag"]');
    function updateRate() {
      const ziel = Number(zielInput.value);
      const jahre = Number(laufzeitInput.value);
      if (!isNaN(ziel) && ziel > 0 && !isNaN(jahre) && jahre > 0) {
        const vorschlag = ziel / (jahre * 12);
        rateInput.value = vorschlag.toFixed(2);
      }
    }
    zielInput.addEventListener('input', updateRate);
    laufzeitInput.addEventListener('input', updateRate);
    // Nur vorschlagen, wenn keine aktuelle Rate vorhanden ist
    if (!rateInput.value || rateInput.value === '0') updateRate();
  }, 0);
  document.getElementById('edit-posten-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.elements['name']?.value?.trim() || '';
    const ziel_betrag = Number(form.elements['ziel_betrag']?.value);
    const laufzeit_jahre = Number(form.elements['laufzeit_jahre']?.value);
    const faelligkeitsdatum = form.elements['faelligkeitsdatum']?.value;
    const rate_betrag = Number(form.elements['rate_betrag']?.value);
    const rate_start_datum = form.elements['rate_start_datum']?.value;
    if (!name || isNaN(ziel_betrag) || ziel_betrag < 0 || isNaN(laufzeit_jahre) || laufzeit_jahre < 1 || !faelligkeitsdatum || isNaN(rate_betrag) || rate_betrag <= 0 || !rate_start_datum) {
      showToast('Bitte alle Felder korrekt ausfüllen!', 'error');
      return;
    }
    try {
      await supabase.from('posten').update({
        name,
        ziel_betrag,
        laufzeit_jahre,
        faelligkeitsdatum
      }).eq('id', postenId);
      // Update aktuelle Rate
      if (aktuelleRate) {
        await supabase.from('raten').update({
          betrag: rate_betrag,
          start_datum: rate_start_datum
        }).eq('id', aktuelleRate.id);
      }
      showToast('Rücklage gespeichert.', 'success');
      document.getElementById('modal-overlay').remove();
      // Erstes Laden (triggert automatische Buchung)
      await loadData();
      // Zweites Laden, damit alle neuen Transaktionen sicher geladen sind
      await loadData();
      renderDashboard();
    } catch (err) {
      showToast('Fehler beim Speichern: ' + (err.message || err), 'error');
    }
  };
}

// --- Edit-Button-Handler ---
document.addEventListener('click', (e) => {
  let btn = e.target.closest('.edit-posten-btn');
  if (btn) {
    const postenId = btn.closest('[data-posten-id]')?.dataset.postenId;
    if (postenId) openEditPostenModal(postenId);
  }
});

// --- Button-Handler für Rate und Transaktion ---
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('rate-btn')) {
    const postenId = e.target.closest('[data-posten-id]')?.dataset.postenId;
    if (postenId) openRateModal(postenId);
  }
  if (e.target && e.target.classList.contains('trans-btn')) {
    const postenId = e.target.closest('[data-posten-id]')?.dataset.postenId;
    if (postenId) openTransModal(postenId);
  }
});

// --- Daten laden ---
async function loadData() {
  // Posten
  const { data: postenData } = await supabase
    .from('posten')
    .select('*')
    .eq('user_id', user.id)
    .order('name');
  posten = postenData || [];
  // Prüfe, ob "Allgemein" existiert, sonst anlegen
  // Zusätzliche DB-Prüfung, ob "Allgemein" existiert
  const { data: checkAllgemein } = await supabase
    .from('posten')
    .select('*')
    .eq('user_id', user.id)
    .eq('name', 'Allgemein');
  if (!checkAllgemein || checkAllgemein.length === 0) {
    try {
      await supabase.from('posten').insert({
        user_id: user.id,
        name: 'Allgemein',
        ziel_betrag: 0,
        laufzeit_jahre: 0,
        faelligkeitsdatum: new Date().toISOString().slice(0,10)
      });
    } catch (err) {
      // Fehler ignorieren, falls Unique-Constraint verletzt wird
    }
    // Nach Anlage: Daten neu laden
    const { data: postenData2 } = await supabase
      .from('posten')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    posten = postenData2 || [];
  }
  // Raten
  const { data: ratenData } = await supabase
    .from('raten')
    .select('*')
    .in('posten_id', posten.map(p => p.id));
  raten = ratenData || [];
  // Transaktionen
  const { data: transData } = await supabase
    .from('transaktionen')
    .select('*')
    .in('posten_id', posten.map(p => p.id));
  transaktionen = transData || [];

  // Automatische Buchung entfällt. Raten werden nur in raten-Tabelle geführt.
}

// --- Initialisierung ---
window.init = async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  user = session?.user || null;
  if (!user) {
    renderAuth();
    return;
  }
  await loadData();
  renderDashboard();
};

// --- Supabase Auth Listener & App-Start ---
// --- Kontoauszug-Modal pro Rücklage ---
window.openKontoauszugModal = function openKontoauszugModal(postenId) {
  const p = posten.find(x => x.id === postenId);
  if (!p) return;

  // Hilfsfunktion: Formatiert ein Datumsobjekt zu YYYY-MM-DD (Lokalzeit)
  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  let buchungen = [];
  const ratenList = raten
    .filter(r => r.posten_id === postenId)
    .sort((a, b) => new Date(a.start_datum) - new Date(b.start_datum));
  
  let today = new Date();

  for (let i = 0; i < ratenList.length; i++) {
    const rate = ratenList[i];
    const start = new Date(rate.start_datum);
    let end;

    if (ratenList[i + 1]) {
      end = new Date(ratenList[i + 1].start_datum);
      end.setDate(end.getDate() - 1);
    } else {
      end = today;
    }

    // Wir starten beim Monat/Jahr des Raten-Beginns
    let folgeJahr = start.getFullYear();
    let folgeMonat = start.getMonth();
    let folgeTag = start.getDate();

    while (true) {
      let aktuellesDatum = new Date(folgeJahr, folgeMonat, folgeTag);

      // Abbruch, wenn das Datum über den Gültigkeitsbereich der Rate oder "Heute" hinausgeht
      if (aktuellesDatum > end || aktuellesDatum > today) break;

      buchungen.push({
        datum: formatLocalDate(aktuellesDatum), // Korrektur: Nutzt lokale Zeit statt ISO
        betrag: Number(rate.betrag),
        typ: 'einzahlung',
        notiz: 'Monatliche Rate'
      });

      // Erhöhe Monat für den nächsten Durchlauf
      folgeMonat++;
      if (folgeMonat > 11) {
        folgeMonat = 0;
        folgeJahr++;
      }
    }
  }

  // 2. Echte Transaktionen hinzufügen
  const trans = transaktionen.filter(t => t.posten_id === postenId);
  for (const t of trans) {
    buchungen.push({
      datum: t.datum, // Liegt bereits als String vor
      betrag: Number(t.betrag),
      typ: t.typ,
      notiz: t.notiz || ''
    });
  }

  // Sortiere alle Buchungen nach Datum
  buchungen.sort((a, b) => new Date(a.datum) - new Date(b.datum));

  // Summenberechnung
  let summe = 0;
  for (const t of buchungen) {
    if (t.typ === 'einzahlung') summe += Number(t.betrag);
    else if (t.typ === 'auszahlung') summe -= Number(t.betrag);
  }

  const modalHtml = `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" id="modal-overlay">
      <div class="bg-slate-900 rounded-xl p-6 w-full max-w-md shadow-lg relative text-white">
        <button class="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200" onclick="document.getElementById('modal-overlay').remove()">✕</button>
        <h2 class="text-lg font-bold mb-4">Kontoauszug: ${p.name}</h2>
        <div class="max-h-[60vh] overflow-y-auto">
          <table class="w-full text-left mb-2">
            <thead>
              <tr class="border-b border-zinc-700">
                <th class="py-2 text-xs uppercase text-zinc-400">Datum</th>
                <th class="py-2 text-xs uppercase text-zinc-400 text-right">Betrag</th>
                <th class="py-2 text-xs uppercase text-zinc-400">Typ</th>
                <th class="py-2 text-xs uppercase text-zinc-400">Notiz</th>
              </tr>
            </thead>
            <tbody>
              ${buchungen.map(t => `
                <tr class="border-b border-zinc-800/50">
                  <td class="py-2 text-xs">${t.datum}</td>
                  <td class="py-2 text-xs text-right font-mono">${t.betrag.toFixed(2)} €</td>
                  <td class="py-2 text-xs text-zinc-400">${t.typ === 'einzahlung' ? 'Einzahlung' : 'Auszahlung'}</td>
                  <td class="py-2 text-xs text-zinc-500 italic">${t.notiz || ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="mt-4 pt-4 border-t border-zinc-700 text-right font-semibold text-zinc-200">
          Summe: <span class="font-mono text-xl text-white ml-2">${summe.toFixed(2)} €</span>
        </div>
      </div>
    </div>
  `;

  let modalDiv = document.createElement('div');
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv.firstElementChild);
};

// Handler für Kontoauszug-Button (nur einmal, nach Funktionsdefinition)
document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-posten-id]');
  if (card && typeof window.openKontoauszugModal === 'function' && e.target.classList.contains('show-kontoauszug-btn')) {
    window.openKontoauszugModal(card.dataset.postenId);
  }
});
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    window.init();
  } else {
    renderAuth();
  }
});
window.addEventListener('DOMContentLoaded', window.init);

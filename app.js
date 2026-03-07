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
              user_id: user.id,
              posten_id: allgemein.id,
              betrag: saldo,
              typ: 'einzahlung',
              datum: new Date().toISOString().slice(0,10),
              notiz: `Umbuchung Restbetrag von Posten ${postenObj.name}`
            });
            // Nach Umbuchung: Daten neu laden und Dashboard aktualisieren
            await loadData();
            renderDashboard();
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
      <img src="./icons/favicon.svg" alt="Logo" class="w-16 h-16 mb-4 drop-shadow-lg">
      <h1 class="text-3xl font-bold mb-6">Rücklagen-Planer</h1>
      <form id="login-form" class="flex flex-col gap-4 w-80 bg-slate-800/50 p-8 rounded-xl shadow-lg">
        <input name="email" type="email" placeholder="E-Mail" required class="rounded bg-slate-900 border border-slate-700 px-3 py-2 text-zinc-100" />
        <input name="password" type="password" placeholder="Passwort" required class="rounded bg-slate-900 border border-slate-700 px-3 py-2 text-zinc-100" />
        <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-4 py-2 font-semibold">Login</button>
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
  // Registrierung entfernt
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

  // 1. Ratenberechnung (nur falls vorhanden)
  if (ratenList.length > 0) {
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
  }
  // 2. Echte Transaktionen: Ein-/Auszahlungen (immer berechnen)
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
  const filterValue = (window.postenTitleFilter || '').trim().toLowerCase();
  const sortedPosten = [...posten].sort((a, b) => {
    if (a.name === 'Allgemein') return -1;
    if (b.name === 'Allgemein') return 1;
    return a.name.localeCompare(b.name);
  });
  const filteredPosten = sortedPosten.filter((p) => {
    if (p.name === 'Allgemein') return true;
    if (!filterValue) return true;
    return String(p.name || '').toLowerCase().includes(filterValue);
  });
  const filterSuggestions = [...new Set(
    posten
      .filter(p => p.name && p.name !== 'Allgemein')
      .map(p => p.name)
  )].sort((a, b) => a.localeCompare(b));
  // Konto-Filter (Multiselect)
  const KONTO_OPTIONS = ['Rücklagen', 'Zweckgebunden', 'Sparen'];
  if (!window.kontoFilter || window.kontoFilter.length === 0) {
    window.kontoFilter = [...KONTO_OPTIONS];
  }
  const kontoFilteredPosten = filteredPosten.filter(p => {
    if (p.name === 'Allgemein') return true;
    return window.kontoFilter.includes(p.konto || 'Rücklagen');
  });
  // Archiv-Filter
  if (!window.archivFilter) window.archivFilter = 'aktiv';
  const archivFilteredPosten = kontoFilteredPosten.filter(p => {
    if (p.name === 'Allgemein') return true;
    if (window.archivFilter === 'aktiv') return !p.archiviert;
    if (window.archivFilter === 'archiviert') return !!p.archiviert;
    return true; // 'alle'
  });
  // Gesamtsumme aller Ansparungen (nur aktive Posten)
  const activePosten = posten.filter(p => !p.archiviert);
  const totalSaldo = activePosten.reduce((sum, p) => sum + (window.berechnePostenSaldo ? window.berechnePostenSaldo(p.id) : 0), 0);
  // Monatliche Gesamtbelastung (Summe aller aktuellen Raten aktiver Posten)
  const monatlicheBelastung = activePosten
    .filter(p => p.name !== 'Allgemein')
    .reduce((sum, p) => {
      const postenRaten = raten.filter(r => r.posten_id === p.id);
      if (postenRaten.length === 0) return sum;
      const aktRate = postenRaten.sort((a, b) => new Date(b.start_datum) - new Date(a.start_datum))[0];
      return sum + Number(aktRate.betrag);
    }, 0);
  app.innerHTML = `
    <div class="max-w-[88rem] mx-auto w-full mt-4 px-2 flex flex-col items-center">
      <h1 class="text-2xl font-bold mb-6 text-center">Rücklagen Dashboard</h1>
      <div class="flex flex-wrap justify-center items-center gap-4 mb-4 w-full max-w-5xl">
        <div class="flex items-center gap-2 text-lg font-semibold text-emerald-300 bg-slate-800/70 rounded-xl px-4 py-2">
          <svg xmlns='http://www.w3.org/2000/svg' class='w-6 h-6 text-emerald-400' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='10' /><path d='M8 12h8M12 8v8' /></svg>
          Angespart: <span class="font-mono text-emerald-200 text-xl">${totalSaldo.toFixed(2)} €</span>
        </div>
        <div class="flex items-center gap-2 text-lg font-semibold text-indigo-300 bg-slate-800/70 rounded-xl px-4 py-2">
          <svg xmlns='http://www.w3.org/2000/svg' class='w-6 h-6 text-indigo-400' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='2'><path d='M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'/></svg>
          Monatlich: <span class="font-mono text-indigo-200 text-xl">${monatlicheBelastung.toFixed(2)} €</span>
        </div>
        <button id="add-posten-btn" class="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-4 py-2 flex items-center gap-2">
          <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='w-5 h-5'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg>
          Neue Rücklage
        </button>
      </div>
      <div class="w-full max-w-5xl mb-5 flex flex-wrap justify-center gap-4">
        <div class="flex-1 min-w-[200px] max-w-md">
          <label for="posten-title-filter" class="block text-xs text-zinc-400 mb-1">Filter nach Titel</label>
          <input
            id="posten-title-filter"
            list="posten-title-suggestions"
            type="text"
            value="${(window.postenTitleFilter || '').replace(/"/g, '&quot;')}"
            placeholder="z.B. Auto, Urlaub, Kredit"
            class="w-full rounded bg-slate-800 border border-zinc-700 px-3 py-2 text-zinc-100"
          />
          <datalist id="posten-title-suggestions">
            ${filterSuggestions.map(name => `<option value="${String(name).replace(/"/g, '&quot;')}"></option>`).join('')}
          </datalist>
        </div>
        <div class="flex-shrink-0">
          <span class="block text-xs text-zinc-400 mb-1">Konto</span>
          <div class="flex gap-2">
            ${KONTO_OPTIONS.map(k => {
              const isActive = window.kontoFilter.includes(k);
              return `<button type="button" class="konto-filter-btn px-3 py-1.5 rounded text-xs font-semibold border transition-all ${
                isActive ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-zinc-700 text-zinc-400'
              }" data-konto="${k}">${k}</button>`;
            }).join('')}
          </div>
        </div>
        <div class="flex-shrink-0">
          <span class="block text-xs text-zinc-400 mb-1">Status</span>
          <div class="flex gap-2">
            ${['aktiv', 'archiviert', 'alle'].map(s => {
              const isActive = window.archivFilter === s;
              const label = s.charAt(0).toUpperCase() + s.slice(1);
              return `<button type="button" class="archiv-filter-btn px-3 py-1.5 rounded text-xs font-semibold border transition-all ${
                isActive ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-zinc-700 text-zinc-400'
              }" data-status="${s}">${label}</button>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div id="posten-grid" class="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-center">
        ${archivFilteredPosten.length === 0 ? `<div class="col-span-2 text-center text-zinc-500">Keine passenden Posten gefunden.</div>` : archivFilteredPosten.map(p => {
          const saldo = window.berechnePostenSaldo ? window.berechnePostenSaldo(p.id) : 0;
          const istUeberfaellig = (() => {
            if (!p.faelligkeit_tag || !p.faelligkeit_monat || saldo <= 0) return false;
            const now = new Date();
            const maxTag = new Date(now.getFullYear(), p.faelligkeit_monat, 0).getDate();
            const tag = Math.min(p.faelligkeit_tag, maxTag);
            const deadline = new Date(now.getFullYear(), p.faelligkeit_monat - 1, tag);
            return now > deadline;
          })();
          const ziel = Number(p.ziel_betrag) || 0;
          const isKredit = p.typ === 'kredit';
          const kredit_betrag = Number(p.kredit_betrag) || 0;
          // Fortschritt: Kredit = Rückzahlungsfortschritt, Rücklage = Saldo/Ziel
          let fortschritt = 0;
          if (isKredit) {
            if (kredit_betrag > 0) {
              fortschritt = Math.min(100, Math.max(0, Math.round(((saldo + kredit_betrag) / kredit_betrag) * 100)));
            }
          } else if (ziel > 0 && saldo >= 0) {
            fortschritt = Math.min(100, Math.round((saldo / ziel) * 100));
          }
          const isAllgemein = p.name === 'Allgemein';
          const istVollErreicht = ziel > 0 && saldo >= ziel;
          const istUeberschritten = ziel > 0 && saldo >= ziel * 1.1;
          const cardClass = isAllgemein
            ? "bg-slate-950 rounded-xl p-5 flex flex-col justify-between h-full shadow-md relative border-2 border-emerald-700/40"
            : isKredit && saldo >= 0
              ? "bg-emerald-900/20 rounded-xl p-5 flex flex-col justify-between h-full shadow-md relative border-2 border-emerald-500/50"
              : isKredit
                ? "bg-orange-900/10 rounded-xl p-5 flex flex-col justify-between h-full shadow-md relative border-2 border-orange-500/50"
                : istUeberschritten
                  ? "bg-red-900/30 rounded-xl p-5 flex flex-col justify-between h-full shadow-md relative border-2 border-red-400/70"
                  : istVollErreicht
                    ? "bg-emerald-900/30 rounded-xl p-5 flex flex-col justify-between h-full shadow-md relative border-2 border-emerald-400/70"
                    : istUeberfaellig
                      ? "bg-slate-800/50 rounded-xl p-5 flex flex-col justify-between h-full shadow-md relative border-2 border-red-500/50 bg-red-900/10"
                      : "bg-slate-800/50 rounded-xl p-5 flex flex-col justify-between h-full shadow-md relative";
          // Neue Darstellung: Angespart groß, Ziel darunter
          return isAllgemein
            ? `<div class="${cardClass}" data-posten-id="${p.id}">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-semibold text-lg">${p.name}</span>
                </div>
                <div class="mb-2">
                  <span class="text-emerald-400 font-mono text-3xl">${saldo.toFixed(2)} €</span>
                </div>
                <div class="flex gap-2 mt-auto">
                  <button class="show-kontoauszug-btn border border-emerald-600 text-emerald-400 rounded px-3 py-1 text-xs flex-1">Kontoauszug</button>
                  <button class="trans-btn border border-slate-500 text-slate-300 rounded px-3 py-1 text-xs flex-1">Transaktion</button>
                </div>
              </div>`
            : `<div class="${cardClass}" data-posten-id="${p.id}">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-lg">${p.name}</span>
                    ${isKredit ? '<span class="text-xs font-semibold bg-orange-700/60 text-orange-200 rounded px-1.5 py-0.5">Kredit</span>' : ''}
                  </div>
                  <div class="flex flex-row gap-2"> <button class="edit-posten-btn p-1 text-indigo-400 hover:text-indigo-200" title="Bearbeiten"><i data-lucide="edit-3" class="w-5 h-5"></i></button><button class="archive-posten-btn p-1 ${p.archiviert ? 'text-emerald-400 hover:text-emerald-200' : 'text-amber-400 hover:text-amber-200'}" title="${p.archiviert ? 'Wiederherstellen' : 'Archivieren'}"><i data-lucide="${p.archiviert ? 'archive-restore' : 'archive'}" class="w-5 h-5"></i></button><button class="delete-posten-btn p-1 text-red-400 hover:text-red-200" title="Löschen"><i data-lucide="trash-2" class="w-5 h-5"></i></button></div>
                </div>
                <div class="mb-4 text-xs text-zinc-400">
                  ${(() => {
                    const MONAT_NAMEN = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
                    let parts = [];
                    if (p.faelligkeit_tag && p.faelligkeit_monat) {
                      const dd = String(p.faelligkeit_tag).padStart(2, '0');
                      const monName = MONAT_NAMEN[p.faelligkeit_monat - 1] || '';
                      parts.push(`Fällig am <span class='font-semibold'>${dd}. ${monName}</span>`);
                    }
                    if (p.laufzeit_monate) {
                      parts.push(`Laufzeit: <span class='font-semibold'>${p.laufzeit_monate}</span> Mon.`);
                    }
                    if (p.archiviert) {
                      parts.push(`<span class='text-amber-400 font-semibold'>Archiviert</span>`);
                    }
                    return parts.length ? parts.join(' | ') : '';
                  })()}
                </div>
                <div class="mb-6 flex flex-col gap-1">
                  <span class="font-mono text-3xl ${saldo < 0 ? 'text-red-400' : 'text-emerald-400'}">${saldo.toFixed(2)} €</span>
                  <span class="text-zinc-400 text-xs">${isKredit ? 'Verbleibende Schulden' : 'Angespart von Rücklage'}</span>
                </div>
                <div class="flex flex-col mb-2">
                  <div class="flex flex-row items-center gap-4 justify-center">
                    <span class="text-emerald-200 font-mono text-base">${isKredit ? 'Kredit: ' + kredit_betrag.toFixed(2) + ' €' : 'Ziel: ' + ziel.toFixed(2) + ' €'}</span>
                    ${(() => {
                      const ratenList = raten.filter(r => r.posten_id === p.id);
                      if (ratenList.length === 0) return '';
                      const aktuelleRate = ratenList.sort((a, b) => new Date(b.start_datum) - new Date(a.start_datum))[0];
                      return `<span class='text-indigo-400 font-mono text-sm'>Rate: ${Number(aktuelleRate.betrag).toFixed(2)} €</span>`;
                    })()}
                  </div>
                  ${(() => {
                    const ratenList = raten.filter(r => r.posten_id === p.id);
                    if (ratenList.length === 0) return '';
                    const aktuelleRate = ratenList.sort((a, b) => new Date(b.start_datum) - new Date(a.start_datum))[0];
                    return `<div class='flex flex-col items-end pr-6'><span class='text-xs text-zinc-400 mt-0.5'>ab ${aktuelleRate.start_datum}</span></div>`;
                  })()}
                </div>
                <div class="mb-2">
                  <div class="flex justify-between text-xs mb-1">
                    <span class="text-zinc-400">${fortschritt}%</span>
                  </div>
                  <div class="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-3 ${isKredit ? 'bg-orange-500' : 'bg-emerald-600'} rounded-full transition-all duration-300" style="width: ${fortschritt}%;"></div>
                  </div>
                </div>
                ${(() => {
                  const rList = raten.filter(r => r.posten_id === p.id);
                  if (rList.length === 0) return '';
                  const aRate = rList.sort((a, b) => new Date(b.start_datum) - new Date(a.start_datum))[0];
                  const rate = Number(aRate.betrag);
                  if (rate <= 0) return '';
                  if (isKredit) {
                    if (saldo >= 0) return `<div class='text-xs text-emerald-400 text-center mb-2 font-semibold'>Abbezahlt ✓</div>`;
                    const rem = Math.abs(saldo);
                    const mon = Math.ceil(rem / rate);
                    return `<div class='text-xs text-zinc-400 text-center mb-2'>Abbezahlt in ~${mon} Mon.</div>`;
                  } else {
                    if (ziel <= 0) return '';
                    if (saldo >= ziel) return `<div class='text-xs text-emerald-400 text-center mb-2 font-semibold'>Ziel erreicht ✓</div>`;
                    const rem = ziel - saldo;
                    const mon = Math.ceil(rem / rate);
                    return `<div class='text-xs text-zinc-400 text-center mb-2'>Ziel in ~${mon} Mon.</div>`;
                  }
                })()}
                <div class="flex gap-2 mt-auto">
                  <button class="show-kontoauszug-btn border border-emerald-600 text-emerald-400 rounded px-3 py-1 text-xs flex-1">Kontoauszug</button>
                  <button class="trans-btn border border-slate-500 text-slate-300 rounded px-3 py-1 text-xs flex-1">Transaktion</button>
                  <button class="rate-btn bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1 text-xs flex-1">Rate</button>
                </div>
              </div>`;
        }).join('')}
      </div>
    </div>
  `;
  const filterInput = document.getElementById('posten-title-filter');
  if (filterInput) {
    if (window._filterRestoreFocus) {
      filterInput.focus();
      const pos = window._filterCursorPos ?? filterInput.value.length;
      filterInput.setSelectionRange(pos, pos);
      window._filterRestoreFocus = false;
    }
    filterInput.addEventListener('input', (e) => {
      window.postenTitleFilter = e.target.value || '';
      window._filterRestoreFocus = true;
      window._filterCursorPos = e.target.selectionStart;
      renderDashboard();
    });
  }
  document.querySelectorAll('.konto-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const konto = btn.dataset.konto;
      if (window.kontoFilter.includes(konto)) {
        if (window.kontoFilter.length > 1) {
          window.kontoFilter = window.kontoFilter.filter(k => k !== konto);
        }
      } else {
        window.kontoFilter = [...window.kontoFilter, konto];
      }
      renderDashboard();
    });
  });
  document.querySelectorAll('.archiv-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.archivFilter = btn.dataset.status;
      renderDashboard();
    });
  });
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
  // Klick außerhalb des Modal-Inhalts schließt das Modal
  const overlayEl = document.getElementById('modal-overlay');
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) {
      overlayEl.remove();
    }
  });
  // Klick außerhalb des Modal-Inhalts schließt das Modal
  modalDiv.addEventListener('click', (e) => {
    if (
      e.target === modalDiv ||
      (e.target.classList && e.target.classList.contains('fixed') && e.target.classList.contains('inset-0'))
    ) {
      modalDiv.remove();
    }
  });
  document.getElementById('rate-form').onsubmit = async (e) => {
    e.preventDefault();
    const betrag = Number(e.target.betrag.value);
    const start_datum = e.target.start_datum.value;
    if (isNaN(betrag) || betrag < 0 || !start_datum) return showToast('Ungültige Eingabe!', 'error');
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
              <option value="auszahlung">Auszahlung</option>
              <option value="einzahlung">Einzahlung</option>
            </select>
          </label>
          <label class="text-sm">Datum:
            <input name="datum" type="date" value="${new Date().toISOString().slice(0,10)}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Notiz:
            <input name="notiz" type="text" maxlength="100" class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" placeholder="Optional..." />
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
  // Klick außerhalb des Modal-Inhalts schließt das Modal
  modalDiv.addEventListener('click', (e) => {
    // Schließe Modal, wenn auf das Overlay oder einen Bereich mit Overlay-Klasse geklickt wird
    if (
      e.target === modalDiv ||
      (e.target.classList && e.target.classList.contains('fixed') && e.target.classList.contains('inset-0'))
    ) {
      modalDiv.remove();
    }
  });
  document.getElementById('trans-form').onsubmit = async (e) => {
    e.preventDefault();
    const betrag = Number(e.target.betrag.value);
    const typ = e.target.typ.value;
    const datum = e.target.datum.value;
    const notiz = e.target.notiz.value || '';
    if (isNaN(betrag) || betrag === 0 || !datum) return showToast('Ungültige Eingabe!', 'error');
    try {
      await supabase.from('transaktionen').insert({ posten_id: postenId, betrag, typ, datum, notiz });
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

// --- Modal für neue Rücklage oder Kredit ---
function openAddPostenModal() {
  const heute = new Date().toISOString().slice(0,10);
  let currentTyp = 'ruecklage';
  const modalHtml = `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-slate-900 rounded-xl p-6 w-full max-w-sm shadow-lg relative">
        <button class="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200" onclick="document.getElementById('modal-overlay').remove()">✕</button>
        <h2 class="text-lg font-bold mb-4" id="add-modal-title">Neue Rücklage anlegen</h2>
        <div class="flex mb-4 rounded-lg overflow-hidden border border-slate-700">
          <button id="toggle-ruecklage" type="button" onclick="setAddPostenTyp('ruecklage')" class="flex-1 py-2 text-sm font-semibold bg-emerald-600 text-white">Rücklage</button>
          <button id="toggle-kredit" type="button" onclick="setAddPostenTyp('kredit')" class="flex-1 py-2 text-sm font-semibold bg-slate-700 text-zinc-300">Kredit</button>
        </div>
        <form id="add-posten-form" class="flex flex-col gap-3">
          <label class="text-sm">Name:
            <input name="name" type="text" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <div id="field-ziel-betrag">
            <label class="text-sm">Zielbetrag (€):
              <input name="ziel_betrag" type="number" min="0" step="0.01" class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
            </label>
          </div>
          <div id="field-kredit-betrag" class="hidden">
            <label class="text-sm">Kreditbetrag (€):
              <input name="kredit_betrag" type="number" min="0.01" step="0.01" class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
            </label>
          </div>
          <label class="text-sm">Konto:
            <select name="konto" class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100">
              <option value="Rücklagen" selected>Rücklagen</option>
              <option value="Zweckgebunden">Zweckgebunden</option>
              <option value="Sparen">Sparen</option>
            </select>
          </label>
          <label class="text-sm">Laufzeit (Monate):
            <input name="laufzeit_monate" type="number" min="1" step="1" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <div class="text-sm">Fälligkeit (Tag & Monat):
            <div class="flex gap-2 mt-1">
              <input name="faelligkeit_tag" type="number" min="1" max="31" placeholder="Tag" required class="w-20 rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
              <select name="faelligkeit_monat" required class="flex-1 rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100">
                <option value="">Monat...</option>
                <option value="1">Januar</option><option value="2">Februar</option><option value="3">März</option>
                <option value="4">April</option><option value="5">Mai</option><option value="6">Juni</option>
                <option value="7">Juli</option><option value="8">August</option><option value="9">September</option>
                <option value="10">Oktober</option><option value="11">November</option><option value="12">Dezember</option>
              </select>
            </div>
          </div>
          <div id="keine-rate-toggle-row" class="hidden items-center justify-between py-1">
            <span class="text-sm text-zinc-300">Keine monatliche Rate</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="keine-rate-cb" class="sr-only peer" onchange="toggleAddKeineRate(this)">
              <div class="w-9 h-5 bg-slate-600 rounded-full peer peer-checked:bg-orange-500 transition-all"></div>
              <div class="absolute top-0.5 left-0.5 h-4 w-4 bg-white rounded-full shadow transition-all peer-checked:translate-x-4"></div>
            </label>
          </div>
          <div id="rate-inputs" class="flex flex-col gap-3">
            <label class="text-sm">Monatliche Rate (€, Vorschlag):
              <input name="rate_betrag" type="number" min="0" step="0.01" class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
            </label>
            <label class="text-sm">Startdatum der Rate:
              <input name="rate_start_datum" type="date" value="${heute}" class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
            </label>
          </div>
          <button type="submit" id="add-submit-btn" class="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-4 py-2 mt-2">Anlegen</button>
        </form>
      </div>
    </div>
  `;
  const oldModal = document.getElementById('modal-overlay');
  if (oldModal) oldModal.remove();
  const modalDiv = document.createElement('div');
  modalDiv.id = 'modal-overlay';
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv);
  modalDiv.addEventListener('click', (e) => {
    if (
      e.target === modalDiv ||
      (e.target.classList && e.target.classList.contains('fixed') && e.target.classList.contains('inset-0'))
    ) {
      modalDiv.remove();
    }
  });

  window.setAddPostenTyp = function(typ) {
    currentTyp = typ;
    const isKredit = typ === 'kredit';
    document.getElementById('add-modal-title').textContent = isKredit ? 'Neuen Kredit anlegen' : 'Neue Rücklage anlegen';
    document.getElementById('toggle-ruecklage').className = isKredit
      ? 'flex-1 py-2 text-sm font-semibold bg-slate-700 text-zinc-300'
      : 'flex-1 py-2 text-sm font-semibold bg-emerald-600 text-white';
    document.getElementById('toggle-kredit').className = isKredit
      ? 'flex-1 py-2 text-sm font-semibold bg-orange-600 text-white'
      : 'flex-1 py-2 text-sm font-semibold bg-slate-700 text-zinc-300';
    document.getElementById('field-ziel-betrag').classList.toggle('hidden', isKredit);
    document.getElementById('field-kredit-betrag').classList.toggle('hidden', !isKredit);
    const keineRateRow = document.getElementById('keine-rate-toggle-row');
    if (isKredit) {
      keineRateRow.classList.remove('hidden');
      keineRateRow.classList.add('flex');
    } else {
      keineRateRow.classList.add('hidden');
      keineRateRow.classList.remove('flex');
    }
    document.getElementById('add-submit-btn').className = isKredit
      ? 'bg-orange-600 hover:bg-orange-700 text-white rounded px-4 py-2 mt-2'
      : 'bg-emerald-600 hover:bg-emerald-700 text-white rounded px-4 py-2 mt-2';
    // Reset keine-rate on typ switch
    const cb = document.getElementById('keine-rate-cb');
    if (cb) { cb.checked = false; }
    document.getElementById('rate-inputs').classList.remove('hidden');
    updateRate();
  };

  window.toggleAddKeineRate = function(cb) {
    document.getElementById('rate-inputs').classList.toggle('hidden', cb.checked);
  };

  const zielInput = modalDiv.querySelector('input[name="ziel_betrag"]');
  const kreditInput = modalDiv.querySelector('input[name="kredit_betrag"]');
  const laufzeitInput = modalDiv.querySelector('input[name="laufzeit_monate"]');
  const rateInput = modalDiv.querySelector('input[name="rate_betrag"]');

  function updateRate() {
    const isKredit = currentTyp === 'kredit';
    const referenceInput = isKredit ? kreditInput : zielInput;
    const ziel = Number(referenceInput.value);
    const monate = Number(laufzeitInput.value);
    if (
      referenceInput.value !== '' && laufzeitInput.value !== '' &&
      !isNaN(ziel) && ziel > 0 && !isNaN(monate) && monate > 0
    ) {
      rateInput.value = (ziel / monate).toFixed(2);
    } else {
      rateInput.value = '';
    }
  }
  zielInput.addEventListener('input', updateRate);
  kreditInput.addEventListener('input', updateRate);
  laufzeitInput.addEventListener('input', updateRate);

  document.getElementById('add-posten-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.elements['name']?.value?.trim() || '';
    const laufzeit_monate = Number(form.elements['laufzeit_monate']?.value);
    const faelligkeit_tag = Number(form.elements['faelligkeit_tag']?.value);
    const faelligkeit_monat = Number(form.elements['faelligkeit_monat']?.value);
    const isKredit = currentTyp === 'kredit';
    if (!name || isNaN(laufzeit_monate) || laufzeit_monate < 1 || isNaN(faelligkeit_tag) || faelligkeit_tag < 1 || faelligkeit_tag > 31 || isNaN(faelligkeit_monat) || faelligkeit_monat < 1 || faelligkeit_monat > 12) {
      showToast('Bitte alle Pflichtfelder ausfüllen!', 'error');
      return;
    }
    let ziel_betrag = 0;
    let kredit_betrag = 0;
    if (isKredit) {
      kredit_betrag = Number(form.elements['kredit_betrag']?.value);
      if (isNaN(kredit_betrag) || kredit_betrag <= 0) {
        showToast('Bitte einen gültigen Kreditbetrag eingeben!', 'error');
        return;
      }
    } else {
      ziel_betrag = Number(form.elements['ziel_betrag']?.value);
      if (isNaN(ziel_betrag) || ziel_betrag < 0) {
        showToast('Bitte einen gültigen Zielbetrag eingeben!', 'error');
        return;
      }
    }
    try {
      const { data: postenRes, error: postenErr } = await supabase.from('posten').insert({
        user_id: user.id,
        name,
        ziel_betrag: isKredit ? kredit_betrag : ziel_betrag,
        laufzeit_monate,
        faelligkeit_tag,
        faelligkeit_monat,
        typ: isKredit ? 'kredit' : 'ruecklage',
        kredit_betrag: isKredit ? kredit_betrag : null,
        konto: form.elements['konto']?.value || 'Rücklagen'
      }).select();
      if (postenErr || !postenRes || !postenRes[0]) throw postenErr || new Error('Fehler beim Anlegen des Postens');
      const postenId = postenRes[0].id;
      // Bei Kredit: Initiale Auszahlung (Kreditbetrag) anlegen
      if (isKredit) {
        await supabase.from('transaktionen').insert({
          posten_id: postenId,
          betrag: kredit_betrag,
          typ: 'auszahlung',
          datum: heute,
          notiz: 'Kreditaufnahme'
        });
      }
      // Rate anlegen, wenn nicht deaktiviert
      const keineRate = document.getElementById('keine-rate-cb')?.checked || false;
      if (!keineRate) {
        const rate_betrag = Number(form.elements['rate_betrag']?.value);
        const rate_start_datum = form.elements['rate_start_datum']?.value;
        if (!isNaN(rate_betrag) && rate_betrag > 0 && rate_start_datum) {
          await supabase.from('raten').insert({
            posten_id: postenId,
            betrag: rate_betrag,
            start_datum: rate_start_datum
          });
        }
      }
      showToast(isKredit ? 'Kredit angelegt.' : 'Rücklage angelegt.', 'success');
      document.getElementById('modal-overlay').remove();
      await loadData();
      renderDashboard();
    } catch (err) {
      showToast('Fehler beim Anlegen: ' + (err.message || err), 'error');
    }
  };
}

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
          <label class="text-sm">Konto:
            <select name="konto" class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100">
              <option value="Rücklagen" ${(postenObj.konto || 'Rücklagen') === 'Rücklagen' ? 'selected' : ''}>Rücklagen</option>
              <option value="Zweckgebunden" ${postenObj.konto === 'Zweckgebunden' ? 'selected' : ''}>Zweckgebunden</option>
              <option value="Sparen" ${postenObj.konto === 'Sparen' ? 'selected' : ''}>Sparen</option>
            </select>
          </label>
          <label class="text-sm">Zielbetrag (€):
            <input name="ziel_betrag" type="number" min="0" step="0.01" value="${postenObj.ziel_betrag}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Laufzeit (Monate):
            <input name="laufzeit_monate" type="number" min="1" step="1" value="${postenObj.laufzeit_monate || postenObj.faelligkeit_jahre || ''}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <div class="text-sm">Fälligkeit (Tag & Monat):
            <div class="flex gap-2 mt-1">
              <input name="faelligkeit_tag" type="number" min="1" max="31" value="${postenObj.faelligkeit_tag || ''}" placeholder="Tag" required class="w-20 rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
              <select name="faelligkeit_monat" required class="flex-1 rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100">
                <option value="">Monat...</option>
                ${[['1','Januar'],['2','Februar'],['3','März'],['4','April'],['5','Mai'],['6','Juni'],['7','Juli'],['8','August'],['9','September'],['10','Oktober'],['11','November'],['12','Dezember']].map(([v,l]) => `<option value="${v}" ${Number(postenObj.faelligkeit_monat) === Number(v) ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <!-- Felder für Rate werden beim Bearbeiten nicht angezeigt -->
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
  // Klick außerhalb des Modal-Inhalts schließt das Modal
  modalDiv.addEventListener('click', (e) => {
    if (
      e.target === modalDiv ||
      (e.target.classList && e.target.classList.contains('fixed') && e.target.classList.contains('inset-0'))
    ) {
      modalDiv.remove();
    }
  });
  // Vorschlagslogik für Rate entfernt, da Felder im Editier-Modal nicht vorhanden
  document.getElementById('edit-posten-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.elements['name']?.value?.trim() || '';
    const ziel_betrag = Number(form.elements['ziel_betrag']?.value);
    const laufzeit_monate = Number(form.elements['laufzeit_monate']?.value);
    const faelligkeit_tag = Number(form.elements['faelligkeit_tag']?.value);
    const faelligkeit_monat = Number(form.elements['faelligkeit_monat']?.value);
    // Nur Felder validieren, die im Editier-Modal sichtbar sind
    if (!name || isNaN(ziel_betrag) || ziel_betrag < 0 || isNaN(laufzeit_monate) || laufzeit_monate < 1 || isNaN(faelligkeit_tag) || faelligkeit_tag < 1 || faelligkeit_tag > 31 || isNaN(faelligkeit_monat) || faelligkeit_monat < 1 || faelligkeit_monat > 12) {
      showToast('Bitte alle Felder korrekt ausfüllen!', 'error');
      return;
    }
    try {
      const konto = form.elements['konto']?.value || 'Rücklagen';
      await supabase.from('posten').update({
        name,
        ziel_betrag,
        laufzeit_monate,
        faelligkeit_tag,
        faelligkeit_monat,
        konto
      }).eq('id', postenId);
      // Rate wird im Editier-Modal nicht bearbeitet
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

// --- Archiv-Button-Handler ---
document.addEventListener('click', async (e) => {
  let btn = e.target.closest('.archive-posten-btn');
  if (btn) {
    const postenId = btn.closest('[data-posten-id]')?.dataset.postenId;
    if (!postenId) return;
    const postenObj = posten.find(p => p.id === postenId);
    if (!postenObj) return;
    const newState = !postenObj.archiviert;
    try {
      await supabase.from('posten').update({ archiviert: newState }).eq('id', postenId);
      showToast(newState ? 'Posten archiviert.' : 'Posten wiederhergestellt.', 'success');
      await loadData();
      renderDashboard();
    } catch (err) {
      showToast('Fehler beim Archivieren.', 'error');
    }
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
        laufzeit_monate: 0
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

  // Default filter: Von = earliest, Bis = today
  let allBuchungen = [];
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
    let folgeJahr = start.getFullYear();
    let folgeMonat = start.getMonth();
    let folgeTag = start.getDate();
    while (true) {
      let aktuellesDatum = new Date(folgeJahr, folgeMonat, folgeTag);
      if (aktuellesDatum > end || aktuellesDatum > today) break;
      allBuchungen.push({
        datum: formatLocalDate(aktuellesDatum),
        betrag: Number(rate.betrag),
        typ: 'Rate',
        notiz: rate.notiz || ''
      });
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
    allBuchungen.push({
      id: t.id,
      datum: t.datum,
      betrag: Number(t.betrag),
      typ: t.typ,
      notiz: t.notiz || ''
    });
  }
  // Sortiere alle Buchungen nach Datum
  // Sortiere alle Buchungen nach Datum (neuste zuerst)
  allBuchungen.sort((a, b) => new Date(b.datum) - new Date(a.datum));

  // Initial filter values
  // Achtung: Sortierung ist jetzt absteigend (neuste zuerst)
  let maxDate = allBuchungen.length ? allBuchungen[0].datum : formatLocalDate(today);
  let minDate = allBuchungen.length ? allBuchungen[allBuchungen.length-1].datum : formatLocalDate(today);

  // Render function for modal content
  function renderKontoauszugContent(von, bis, typFilter) {
    // Filtered Buchungen
    const filtered = allBuchungen.filter(t =>
      t.datum >= von && t.datum <= bis &&
      (typFilter === 'alle' || t.typ === typFilter)
    );
    let summe = 0;
    for (const t of filtered) {
      if (t.typ === 'einzahlung' || t.typ === 'Rate') summe += Number(t.betrag);
      else if (t.typ === 'auszahlung') summe -= Number(t.betrag);
    }
    // Pagination logic
    const pageSize = 14;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    let page = window.__kontoauszugPage || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const pageEntries = filtered.slice(startIdx, endIdx);

    // Pagination buttons logic
    function renderPagination() {
      if (totalPages <= 1) return '';
      let btns = [];
      // Always show 4 pages, use ... if needed
      if (totalPages <= 4) {
        for (let i = 1; i <= totalPages; i++) {
          btns.push(i);
        }
      } else {
        if (page <= 2) {
          btns = [1,2,3,4,'...'];
        } else if (page >= totalPages-1) {
          btns = ['...', totalPages-3, totalPages-2, totalPages-1, totalPages];
        } else {
          btns = ['...', page-1, page, page+1, '...'];
        }
      }
      return `
        <div class="flex gap-2 justify-center mt-4 mb-2">
          <button class="px-2 py-1 w-16 rounded bg-slate-800 text-zinc-300 border border-slate-700" data-page="prev" ${page === 1 ? 'disabled' : ''}>Zurück</button>
          ${btns.map(b => {
            if (b === '...') return `<span class="px-2 text-zinc-500">...</span>`;
            return `<button class="px-2 py-1 w-8 rounded ${b === page ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-zinc-300'} border border-slate-700" data-page="${b}">${b}</button>`;
          }).join('')}
          <button class="px-2 py-1 w-16 rounded bg-slate-800 text-zinc-300 border border-slate-700" data-page="next" ${page === totalPages ? 'disabled' : ''}>Vor</button>
        </div>
      `;
    }

    return `
      <button class="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200" onclick="document.getElementById('modal-overlay').remove()">✕</button>
      <h2 class="text-lg font-bold mb-4">Kontoauszug: ${p.name}</h2>
      <div class="flex gap-2 mb-4">
        <div>
          <label class="block text-xs text-zinc-400 mb-1" for="konto-von">Von</label>
          <input type="date" id="konto-von" class="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-zinc-100" value="${von}" min="${minDate}" max="${maxDate}">
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1" for="konto-bis">Bis</label>
          <input type="date" id="konto-bis" class="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-zinc-100" value="${bis}" min="${minDate}" max="${maxDate}">
        </div>
        <div>
          <label class="block text-xs text-zinc-400 mb-1" for="konto-typ">Typ</label>
          <select id="konto-typ" class="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-zinc-100">
            <option value="alle">Alle</option>
            <option value="einzahlung">Einzahlung</option>
            <option value="auszahlung">Auszahlung</option>
            <option value="Rate">Rate</option>
          </select>
        </div>
      </div>
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
            ${pageEntries.map(t => `
              <tr class="border-b border-zinc-800/50">
                <td class="py-2 text-xs">${t.datum}</td>
                <td class="py-2 text-xs text-right font-mono">${t.betrag.toFixed(2)} €</td>
                <td class="py-2 text-xs text-zinc-400">${t.typ === 'einzahlung' ? 'Einzahlung' : t.typ === 'auszahlung' ? 'Auszahlung' : 'Rate'}</td>
                <td class="py-2 text-xs text-zinc-500 italic flex items-center gap-2">
                  ${t.notiz || ''}
                  ${(t.id && (t.typ === 'einzahlung' || t.typ === 'auszahlung')) ? `<button class='delete-trans-btn text-red-500 hover:text-red-700 ml-2' data-id='${t.id}' title='Entfernen'><svg xmlns='http://www.w3.org/2000/svg' class='inline w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg></button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${renderPagination()}
      <div class="mt-4 pt-4 border-t border-zinc-700 text-right font-semibold text-zinc-200">
        Summe: <span class="font-mono text-xl text-white ml-2">${summe.toFixed(2)} €</span>
      </div>
    `;
  }

  // Modal HTML
  let currentTyp = 'alle';
  const modalHtml = `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" id="modal-overlay">
      <div class="bg-slate-900 rounded-xl p-6 w-full max-w-md shadow-lg relative text-white" id="modal-content">
        ${renderKontoauszugContent(minDate, maxDate, currentTyp)}
      </div>
    </div>
  `;

  let modalDiv = document.createElement('div');
  modalDiv.innerHTML = modalHtml;
  const overlay = modalDiv.firstElementChild;
  document.body.appendChild(overlay);
  // Click-outside-to-close logic
  overlay.addEventListener('mousedown', function(e) {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  // Date and type filter logic
  const modalContent = overlay.querySelector('#modal-content');
  function updateFilter() {
    const von = modalContent.querySelector('#konto-von').value;
    const bis = modalContent.querySelector('#konto-bis').value;
    const typ = modalContent.querySelector('#konto-typ')?.value || 'alle';
    currentTyp = typ;
    modalContent.innerHTML = renderKontoauszugContent(von, bis, typ);
    attachListeners();
    // Set dropdown value after re-render
    const typSelect = modalContent.querySelector('#konto-typ');
    if (typSelect) typSelect.value = typ;
  }
  function attachListeners() {
        // Lösch-Button für Transaktionen
        modalContent.querySelectorAll('.delete-trans-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const transId = btn.getAttribute('data-id');
            if (!transId) return;
            if (!confirm('Diese Transaktion wirklich löschen?')) return;
            try {
              const { error } = await supabase.from('transaktionen').delete().eq('id', transId);
              if (error) {
                showToast('Fehler beim Löschen!', 'error');
              } else {
                showToast('Transaktion gelöscht.', 'success');
                await loadData();
                updateFilter();
              }
            } catch (err) {
              showToast('Fehler beim Löschen!', 'error');
            }
          });
        });
    modalContent.querySelector('#konto-von').addEventListener('change', () => {
      window.__kontoauszugPage = 1;
      updateFilter();
    });
    modalContent.querySelector('#konto-bis').addEventListener('change', () => {
      window.__kontoauszugPage = 1;
      updateFilter();
    });
    modalContent.querySelector('#konto-typ')?.addEventListener('change', () => {
      window.__kontoauszugPage = 1;
      updateFilter();
    });
    modalContent.querySelector('button[onclick]')?.addEventListener('click', () => overlay.remove());
    // Pagination buttons
    modalContent.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        let page = window.__kontoauszugPage || 1;
        const von = modalContent.querySelector('#konto-von').value;
        const bis = modalContent.querySelector('#konto-bis').value;
        const typ = modalContent.querySelector('#konto-typ')?.value || 'alle';
        const totalPages = Math.max(1, Math.ceil(allBuchungen.filter(t => t.datum >= von && t.datum <= bis && (typ === 'alle' || t.typ === typ)).length / 14));
        if (btn.dataset.page === 'prev' && page > 1) {
          window.__kontoauszugPage = page - 1;
        } else if (btn.dataset.page === 'next' && page < totalPages) {
          window.__kontoauszugPage = page + 1;
        } else if (!isNaN(Number(btn.dataset.page))) {
          window.__kontoauszugPage = Number(btn.dataset.page);
        }
        updateFilter();
      });
    });
  }
  attachListeners();
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

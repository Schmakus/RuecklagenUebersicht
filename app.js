// app.js
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
    if (error) alert('Login fehlgeschlagen: ' + error.message);
  };
  document.getElementById('register-btn').onclick = async () => {
    const email = document.querySelector('#login-form input[name="email"]').value;
    const password = document.querySelector('#login-form input[name="password"]').value;
    if (!email || !password) return alert('Bitte E-Mail und Passwort eingeben!');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert('Registrierung fehlgeschlagen: ' + error.message);
    else alert('Registrierung erfolgreich! Bitte E-Mail bestätigen und dann einloggen.');
  };
}

// --- Dashboard & Posten-Logik ---
let posten = [];
let raten = [];
let transaktionen = [];

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
        ${posten.length === 0 ? `<div class="col-span-2 text-center text-zinc-500">Noch keine Posten angelegt.</div>` : posten.map(p => `
          <div class="bg-slate-800/50 rounded-xl p-5 flex flex-col gap-4 shadow-md relative" data-posten-id="${p.id}">
            <div class="font-semibold text-lg mb-2">${p.name}</div>
            <div class="flex items-center gap-2 mb-4">
              <span class="text-emerald-400 font-mono text-xl">€ ${p.ziel_betrag.toFixed(2)}</span>
            </div>
            <div class="flex gap-2">
              <button class="trans-btn border border-slate-500 text-slate-300 rounded px-3 py-1 text-xs flex-1">Transaktion</button>
              <button class="rate-btn bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1 text-xs flex-1">Rate anpassen</button>
              <button class="edit-posten-btn bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1 text-xs flex-1">Bearbeiten</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
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
    if (isNaN(betrag) || betrag <= 0) return alert('Ungültiger Betrag!');
    await supabase.from('raten').insert({
      posten_id: postenId,
      betrag,
      start_datum: new Date().toISOString().slice(0, 10)
    });
    document.getElementById('modal-overlay').remove();
    await loadData();
    renderDashboard();
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
    if (isNaN(betrag) || betrag === 0) return alert('Ungültiger Betrag!');
    await supabase.from('transaktionen').insert({
      posten_id: postenId,
      betrag,
      typ,
      datum: new Date().toISOString().slice(0, 10)
    });
    document.getElementById('modal-overlay').remove();
    await loadData();
    renderDashboard();
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
          <label class="text-sm">Fälligkeit (Jahre):
            <input name="faelligkeit_jahre" type="number" min="1" step="1" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
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
  let modalDiv = document.createElement('div');
  modalDiv.id = 'modal-overlay';
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv);
  // Vorschlagslogik für Rate
  setTimeout(() => {
    const zielInput = document.querySelector('input[name="ziel_betrag"]');
    const faelligkeitInput = document.querySelector('input[name="faelligkeit_jahre"]');
    const rateInput = document.querySelector('input[name="rate_betrag"]');
    function updateRate() {
      const ziel = Number(zielInput.value);
      const jahre = Number(faelligkeitInput.value);
      if (!isNaN(ziel) && ziel > 0 && !isNaN(jahre) && jahre > 0) {
        const vorschlag = ziel / (jahre * 12);
        rateInput.value = vorschlag.toFixed(2);
      }
    }
    zielInput.addEventListener('input', updateRate);
    faelligkeitInput.addEventListener('input', updateRate);
    updateRate();
  }, 0);
  document.getElementById('add-posten-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const ziel_betrag = Number(e.target.ziel_betrag.value);
    const faelligkeit_jahre = Number(e.target.faelligkeit_jahre.value);
    const faelligkeitsdatum = e.target.faelligkeitsdatum.value;
    const rate_betrag = Number(e.target.rate_betrag.value);
    const rate_start_datum = e.target.rate_start_datum.value;
    if (!name || isNaN(ziel_betrag) || ziel_betrag < 0 || isNaN(faelligkeit_jahre) || faelligkeit_jahre < 1 || !faelligkeitsdatum || isNaN(rate_betrag) || rate_betrag <= 0 || !rate_start_datum) {
      alert('Bitte alle Felder korrekt ausfüllen!');
      return;
    }
    try {
      // 1. Posten anlegen
      const { data: postenRes, error: postenErr } = await supabase.from('posten').insert({
        user_id: user.id,
        name,
        ziel_betrag,
        faelligkeit_jahre,
        faelligkeitsdatum
      }).select();
      if (postenErr || !postenRes || !postenRes[0]) throw postenErr || new Error('Fehler beim Anlegen des Postens');
      const postenId = postenRes[0].id;
      // 2. Erste Rate anlegen
      const { error: ratenErr } = await supabase.from('raten').insert({
        posten_id: postenId,
        betrag: rate_betrag,
        start_datum: rate_start_datum
      });
      if (ratenErr) throw ratenErr;
      document.getElementById('modal-overlay').remove();
      await loadData();
      renderDashboard();
    } catch (err) {
      alert('Fehler beim Anlegen: ' + (err.message || err));
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
  // Finde die erste Rate
  const ersteRate = raten.filter(r => r.posten_id === postenId)
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
          <label class="text-sm">Fälligkeit (Jahre):
            <input name="faelligkeit_jahre" type="number" min="1" step="1" value="${postenObj.faelligkeit_jahre}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Fälligkeitsdatum:
            <input name="faelligkeitsdatum" type="date" value="${postenObj.faelligkeitsdatum || ''}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Startdatum der ersten Rate:
            <input name="rate_start_datum" type="date" value="${ersteRate ? ersteRate.start_datum : ''}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
          </label>
          <label class="text-sm">Monatliche Rate (€):
            <input name="rate_betrag" type="number" min="0" step="0.01" value="${ersteRate ? ersteRate.betrag : ''}" required class="mt-1 w-full rounded bg-slate-800 border border-zinc-700 px-2 py-1 text-zinc-100" />
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
  document.getElementById('edit-posten-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const ziel_betrag = Number(e.target.ziel_betrag.value);
    const faelligkeit_jahre = Number(e.target.faelligkeit_jahre.value);
    const faelligkeitsdatum = e.target.faelligkeitsdatum.value;
    const rate_betrag = Number(e.target.rate_betrag.value);
    const rate_start_datum = e.target.rate_start_datum.value;
    if (!name || isNaN(ziel_betrag) || ziel_betrag < 0 || isNaN(faelligkeit_jahre) || faelligkeit_jahre < 1 || !faelligkeitsdatum || isNaN(rate_betrag) || rate_betrag <= 0 || !rate_start_datum) {
      alert('Bitte alle Felder korrekt ausfüllen!');
      return;
    }
    try {
      await supabase.from('posten').update({
        name,
        ziel_betrag,
        faelligkeit_jahre,
        faelligkeitsdatum
      }).eq('id', postenId);
      // Update erste Rate
      if (ersteRate) {
        await supabase.from('raten').update({
          betrag: rate_betrag,
          start_datum: rate_start_datum
        }).eq('id', ersteRate.id);
      }
      document.getElementById('modal-overlay').remove();
      await loadData();
      renderDashboard();
    } catch (err) {
      alert('Fehler beim Speichern: ' + (err.message || err));
    }
  };
}

// --- Edit-Button-Handler ---
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('edit-posten-btn')) {
    const postenId = e.target.closest('[data-posten-id]')?.dataset.postenId;
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
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    window.init();
  } else {
    renderAuth();
  }
});
window.addEventListener('DOMContentLoaded', window.init);

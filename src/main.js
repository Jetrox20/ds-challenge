const PASS = 'datasciencegt';
const DB_URL = 'https://ds-challenge-6ef2c-default-rtdb.firebaseio.com';
let currentPlayer = '';
let realProfits = { amazon: 30425, nubank: 1033, ubereats: 1887 };

async function dbSet(path, data) {
  await fetch(`${DB_URL}/${path}.json`, { method: 'PUT', body: JSON.stringify(data) });
}
async function dbGet(path) {
  const r = await fetch(`${DB_URL}/${path}.json`);
  return r.json();
}
function dbListen(path, cb) {
  const es = new EventSource(`${DB_URL}/${path}.json?accept=text/event-stream`);
  es.addEventListener('put', e => cb(JSON.parse(e.data).data));
  return es;
}

function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function fmt(n) { return '$' + Math.round(n).toLocaleString() + 'M'; }

window.startPlayer = async function() {
  const n = document.getElementById('player-name').value.trim();
  if (!n) { document.getElementById('name-err').style.display = 'block'; return; }
  document.getElementById('name-err').style.display = 'none';
  currentPlayer = n;
  document.getElementById('predict-greeting').textContent = 'Hola, ' + n + '!';
  calcAmazon(); calcNubank(); calcUber();
  const revealed = await dbGet('revealed');
  if (revealed) { await loadRealProfits(); renderResults(); show('s-results'); }
  else show('s-predict');
}

window.goAdmin = function() { show('s-admin-login'); }

window.checkAdmin = function() {
  if (document.getElementById('admin-pass').value === PASS) { renderAdmin(); show('s-admin'); }
  else document.getElementById('pass-err').style.display = 'block';
}

window.updR = function() {
  const a = +document.getElementById('r-amazon').value;
  const n = +document.getElementById('r-nubank').value;
  const u = +document.getElementById('r-ubereats').value;
  document.getElementById('v-amazon').textContent = fmt(a);
  document.getElementById('v-nubank').textContent = fmt(n);
  document.getElementById('v-ubereats').textContent = fmt(u);
  realProfits = { amazon: a, nubank: n, ubereats: u };
}

window.renderAdmin = async function() {
  const subs = await dbGet('submissions');
  const el = document.getElementById('admin-entries');
  if (!subs) { el.innerHTML = '<p class="small">Aun no hay participantes.</p>'; return; }
  const arr = Object.values(subs);
  el.innerHTML = arr.map(s => `<div class="entry-row"><span>${s.name}</span><span class="small">${new Date(s.ts).toLocaleTimeString()}</span></div>`).join('');
}

window.switchTab = function(i) {
  [0, 1, 2].forEach(j => {
    document.getElementById('tab-' + j).style.display = j === i ? 'block' : 'none';
    document.querySelectorAll('.tab')[j].classList.toggle('active', j === i);
  });
}

window.calcAmazon = function() {
  const rd = +document.getElementById('a-rd').value;
  const prime = +document.getElementById('a-prime').value;
  const margin = +document.getElementById('a-margin').value;
  document.getElementById('va-rd').textContent = '$' + rd + 'B';
  document.getElementById('va-prime').textContent = prime + 'M';
  document.getElementById('va-margin').textContent = margin + '%';
  document.getElementById('pred-amazon').textContent = fmt(prime * 120 * (margin / 100) * 0.5);
}

window.calcNubank = function() {
  const cl = +document.getElementById('n-clientes').value;
  const arpu = +document.getElementById('n-arpu').value;
  const mora = +document.getElementById('n-mora').value;
  document.getElementById('vn-cl').textContent = cl + 'M';
  document.getElementById('vn-arpu').textContent = '$' + arpu;
  document.getElementById('vn-mora').textContent = mora + '%';
  document.getElementById('pred-nubank').textContent = fmt(cl * arpu * 12 * (1 - mora / 100) * 0.15);
}

window.calcUber = function() {
  const ord = +document.getElementById('u-orders').value;
  const comm = +document.getElementById('u-comm').value;
  const cost = +document.getElementById('u-cost').value;
  document.getElementById('vu-ord').textContent = ord + 'M';
  document.getElementById('vu-comm').textContent = comm + '%';
  document.getElementById('vu-cost').textContent = cost + '%';
  document.getElementById('pred-ubereats').textContent = fmt(ord * 365 * 25 * (comm / 100) * (1 - cost / 100));
}

function getPredictions() {
  return {
    amazon: Math.round(+document.getElementById('a-prime').value * 120 * (+document.getElementById('a-margin').value / 100) * 0.5),
    nubank: Math.round(+document.getElementById('n-clientes').value * +document.getElementById('n-arpu').value * 12 * (1 - +document.getElementById('n-mora').value / 100) * 0.15),
    ubereats: Math.round(+document.getElementById('u-orders').value * 365 * 25 * (+document.getElementById('u-comm').value / 100) * (1 - +document.getElementById('u-cost').value / 100))
  };
}

window.submitPrediction = async function() {
  const preds = getPredictions();
  const key = currentPlayer.replace(/[^a-zA-Z0-9]/g, '_');
  await dbSet(`submissions/${key}`, { name: currentPlayer, ts: Date.now(), preds });
  document.getElementById('my-summary').innerHTML = `
    <div class="entry-row"><span class="small">Amazon</span><span style="font-weight:500">${fmt(preds.amazon)}</span></div>
    <div class="entry-row"><span class="small">Nubank</span><span style="font-weight:500">${fmt(preds.nubank)}</span></div>
    <div class="entry-row"><span class="small">Uber Eats</span><span style="font-weight:500">${fmt(preds.ubereats)}</span></div>`;
  show('s-waiting');
  dbListen('revealed', async (val) => {
    if (val) { await loadRealProfits(); renderResults(); show('s-results'); }
  });
}

async function loadRealProfits() {
  const rp = await dbGet('realprofits');
  if (rp) realProfits = rp;
}

window.revealResults = async function() {
  await dbSet('realprofits', realProfits);
  await dbSet('revealed', true);
  await loadRealProfits();
  renderResults();
  show('s-results');
}

async function renderResults() {
  await loadRealProfits();
  const subs = await dbGet('submissions');
  if (!subs) return;
  const arr = Object.values(subs);
  const ranked = arr.map(s => ({ ...s, err: calcError(s.preds, realProfits) })).sort((a, b) => a.err - b.err);
  const colors = ['#FAC775', '#D3D1C7', '#F0997B'];
  document.getElementById('podio-grid').innerHTML = ranked.slice(0, 3).map((s, i) => `
    <div class="podio-card">
      <div style="font-size:20px;font-weight:500;color:${colors[i]};margin-bottom:4px">${i + 1}</div>
      <div style="font-size:14px;font-weight:500">${s.name}</div>
      <div style="font-size:11px;color:#888;margin-top:2px">Error: ${(s.err * 100).toFixed(1)}%</div>
    </div>`).join('');
  document.getElementById('results-table').innerHTML = ranked.map((s, i) => `
    <div class="entry-row">
      <span style="font-size:13px;font-weight:${i < 3 ? '500' : '400'}">${i + 1}. ${s.name}</span>
      <span style="font-size:12px;color:#888">Error: ${(s.err * 100).toFixed(1)}%</span>
    </div>`).join('');
  document.getElementById('real-vals').innerHTML = `
    <div class="entry-row"><span class="small">Amazon</span><span style="font-weight:500">${fmt(realProfits.amazon)}</span></div>
    <div class="entry-row"><span class="small">Nubank</span><span style="font-weight:500">${fmt(realProfits.nubank)}</span></div>
    <div class="entry-row"><span class="small">Uber Eats</span><span style="font-weight:500">${fmt(realProfits.ubereats)}</span></div>`;
}

function calcError(preds, real) {
  const errs = [
    Math.abs(preds.amazon - real.amazon) / real.amazon,
    Math.abs(preds.nubank - real.nubank) / real.nubank,
    Math.abs(preds.ubereats - real.ubereats) / Math.abs(real.ubereats || 1)
  ];
  return errs.reduce((a, b) => a + b, 0) / 3;
}
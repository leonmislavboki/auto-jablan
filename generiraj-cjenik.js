#!/usr/bin/env node
/*
  Generira CSV cjenik iz cjenik.js (Odluka o objavi cjenika, NN 101/2026).

    node generiraj-cjenik.js          napravi novu verziju ako se cjenik promijenio
    node generiraj-cjenik.js --check  samo provjeri je li cjenik.csv usklađen s cjenik.js (izlaz 1 ako nije)

  Rezultat:
    cjenik.csv                 uvijek zadnja verzija, stalni URL za automatsko preuzimanje
    cjenik/<naziv>.csv         svaka objavljena verzija s nazivom prema točki VI Odluke
    cjenik/manifest.json       popis verzija (broj pohrane, vrijeme, datoteka)
    cjenik/index.html          javna arhiva verzija (dostupnost 30 dana, točka II)

  Stare verzije se ne brišu automatski.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = __dirname;
const ARCHIVE = path.join(ROOT, 'cjenik');
const LATEST = path.join(ROOT, 'cjenik.csv');
const MANIFEST = path.join(ARCHIVE, 'manifest.json');
const TZ = 'Europe/Zagreb';

function loadData() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'cjenik.js'), 'utf8'), ctx, { filename: 'cjenik.js' });
  const data = ctx.window.CJENIK;
  if (!data || !Array.isArray(data.items)) throw new Error('cjenik.js: nedostaje window.CJENIK.items');
  const errors = [];
  data.items.forEach((it, i) => {
    const where = `stavka ${i + 1} (${it.name || 'bez naziva'})`;
    if (!it.name) errors.push(`${where}: nedostaje name`);
    if (it.priceType !== 'fixed' && it.priceType !== 'upon-inspection') errors.push(`${where}: priceType mora biti "fixed" ili "upon-inspection"`);
    if (it.priceType === 'fixed') {
      if (!Number.isFinite(it.currentPrice) || it.currentPrice < 0) errors.push(`${where}: neispravan currentPrice`);
      if (!Number.isFinite(it.anchorPrice) || it.anchorPrice < 0) errors.push(`${where}: neispravan anchorPrice`);
    }
    if (it.specialSale != null && (typeof it.specialSale !== 'string' || !it.specialSale.trim())) errors.push(`${where}: specialSale mora biti null ili naziv akcije`);
  });
  if (!Number.isFinite(data.vatRate) || data.vatRate < 0) errors.push('vatRate mora biti broj (npr. 25)');
  if (typeof data.retail !== 'function') errors.push('nedostaje funkcija retail na dnu cjenik.js');
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(data.anchorDate || '')) errors.push('anchorDate mora biti u obliku DD.MM.GGGG');
  if (!data.store || !data.store.type || !data.store.address || !data.store.code) errors.push('store.type, store.address i store.code su obavezni');
  if (errors.length) throw new Error('Cjenik ima greške:\n  - ' + errors.join('\n  - '));
  return data;
}

// U CSV idu usluge s maloprodajnom cijenom (s PDV-om). Usluge "po ponudi" nemaju cijenu i prikazuju se samo na stranici.
function buildCsv(data) {
  const cell = v => { const t = v == null ? '' : String(v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const rows = [[
    'naziv_usluge', 'trenutna_cijena', 'sidrena_cijena', 'valuta', 'jedinica_mjere',
    'poseban_oblik_prodaje', 'naziv_posebnog_oblika_prodaje', 'datum_sidrene_cijene', 'pdv_ukljucen', 'napomena'
  ]];
  data.items.filter(it => it.priceType === 'fixed').forEach(it => rows.push([
    it.name.trim(),
    data.retail(it.currentPrice).toFixed(2),
    data.retail(it.anchorPrice).toFixed(2),
    data.currency || 'EUR',
    it.unit || '',
    it.specialSale ? 'DA' : 'NE',
    it.specialSale ? it.specialSale.trim() : '',
    data.anchorDate,
    'DA',
    it.note || ''
  ]));
  return rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

function zagrebStamp(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { file: `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}`, human: `${p.day}.${p.month}.${p.year}. u ${p.hour}:${p.minute}` };
}

function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return []; }
}

function writeIndex(manifest) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = manifest.slice().reverse().map((m, i) => `      <tr><td>${String(m.broj).padStart(4, '0')}</td><td>${esc(m.objavljeno)}</td><td><a href="${esc(m.datoteka)}" download>${esc(m.datoteka)}</a>${i === 0 ? ' <b>(važeći)</b>' : ''}</td></tr>`).join('\n');
  const body = rows || '      <tr><td colspan="3">Još nema objavljenih verzija cjenika.</td></tr>';
  const html = `<!DOCTYPE html>
<html lang="hr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Arhiva cjenika | Auto Jablan</title>
<style>
  body { background: #0C0F14; color: #E8EAED; font: 15px/1.6 system-ui, sans-serif; margin: 0; padding: 2rem 1rem; }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 .5rem; }
  p { color: #8B93A1; margin: 0 0 1.5rem; }
  a { color: #F5C518; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: .7rem .5rem; border-bottom: 1px solid rgba(226,232,240,.12); vertical-align: top; }
  th { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: #8B93A1; font-weight: 500; }
  td:first-child { font-family: ui-monospace, monospace; white-space: nowrap; }
</style>
</head>
<body>
<main>
  <h1>Arhiva cjenika usluga</h1>
  <p>Castrol Service Auto-Jablan d.o.o., VII Retkovec 1/1, Zagreb. Važeći cjenik je uvijek na <a href="../cjenik.csv">/cjenik.csv</a>. Svaka objavljena verzija ostaje dostupna ovdje.</p>
  <table>
    <caption style="text-align:left;color:#8B93A1;margin-bottom:.5rem">Objavljene verzije cjenika, od najnovije</caption>
    <thead><tr><th scope="col">Broj pohrane</th><th scope="col">Objavljeno</th><th scope="col">Datoteka (CSV)</th></tr></thead>
    <tbody>
${body}
    </tbody>
  </table>
  <p style="margin-top:1.5rem"><a href="../">Natrag na stranicu</a></p>
</main>
</body>
</html>
`;
  fs.writeFileSync(path.join(ARCHIVE, 'index.html'), html);
}

function main() {
  const data = loadData();
  const csv = buildCsv(data);
  const current = fs.existsSync(LATEST) ? fs.readFileSync(LATEST, 'utf8') : null;

  if (process.argv.includes('--check')) {
    if (current !== csv) {
      console.error('cjenik.csv NIJE usklađen s cjenik.js. Pokrenite: node generiraj-cjenik.js');
      process.exit(1);
    }
    console.log('cjenik.csv je usklađen s cjenik.js.');
    return;
  }

  // primjeri cijena se ne arhiviraju kao objavljena verzija
  if (data.placeholder) {
    fs.writeFileSync(LATEST, csv);
    fs.mkdirSync(ARCHIVE, { recursive: true });
    writeIndex(readManifest());
    console.warn('placeholder je true: ažuriran samo cjenik.csv za pregled, arhiva se ne dira.');
    console.warn('Kad unesete stvarne cijene, postavite placeholder: false i pokrenite ponovno.');
    return;
  }

  fs.mkdirSync(ARCHIVE, { recursive: true });
  const manifest = readManifest();
  const hash = crypto.createHash('sha256').update(csv).digest('hex');
  const last = manifest[manifest.length - 1];

  if (last && last.sha256 === hash && current === csv) {
    writeIndex(manifest);
    console.log(`Nema promjene cijena. Važeća verzija: ${last.datoteka}`);
    return;
  }

  const now = new Date();
  const stamp = zagrebStamp(now);
  const broj = (last ? last.broj : 0) + 1;
  const s = data.store;
  const name = [slug(s.type), slug(s.address), slug(s.code), String(broj).padStart(4, '0'), stamp.file].join('_') + '.csv';

  fs.writeFileSync(path.join(ARCHIVE, name), csv);
  fs.writeFileSync(LATEST, csv);
  manifest.push({ broj, datoteka: name, objavljeno: stamp.human, iso: now.toISOString(), sha256: hash });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  writeIndex(manifest);

  console.log(`Nova verzija cjenika: cjenik/${name}`);
  console.log('Ažuriran cjenik.csv. Objavite promjenu (commit + push) prije 8:00.');
}

try { main(); } catch (e) { console.error(e.message); process.exit(1); }

// Interfaccia della pagina portafoglio. avvia(contenitore, dati, righePrezzi, strumenti, {oggi}) disegna tutto in "contenitore".
// Usa le funzioni di calc.js. Nessun dato esce dal browser.
(function (g) {
  const fmt = (n, d = 2) => (n == null || isNaN(n) ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }));
  const eur = n => fmt(n) + ' €';
  const segno = n => (n >= 0 ? '+' : '') + fmt(n) + ' €';
  const pct = (x, d = 1) => (x == null ? '—' : (x >= 0 ? '+' : '') + fmt(x * 100, d) + '%');
  const cls = n => (n == null ? '' : n >= 0 ? 'pos' : 'neg');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dataIt = d => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
  const ggmm = d => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '');
  const nomeMese = m => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
  const ETICHETTE = { acquisto: 'Acquisto', vendita: 'Vendita', rimborso: 'Rimborso', cedola: 'Cedola', provento: 'Premio certificato',
    versamento: 'Versamento', prelievo: 'Prelievo', bollo: 'Bollo', imposta: 'Imposta', commissione: 'Commissione', trasferimento: 'Trasferimento titoli' };
  const FILTRI = [['tutti', 'Tutti'], ['versamento', 'Versamenti'], ['prelievo', 'Prelievi'], ['acquisto', 'Acquisti'], ['vendita', 'Vendite'],
    ['cedola', 'Cedole e premi'], ['rimborso', 'Rimborsi'], ['bollo', 'Bollo'], ['imposta', 'Imposte']];

  function avvia(contenitore, dati, righePz, strumenti, opz) {
    opz = opz || {};
    const pz = indicizzaPrezzi(righePz || []);
    const oggi = opz.oggi || (righePz || []).reduce((a, r) => (r.data_fonte > a ? r.data_fonte : a), '') || new Date().toISOString().slice(0, 10);
    const meseOra = oggi.slice(0, 7), anno = +oggi.slice(0, 4);
    const conFuori = !!dati.fuoriFineco && (dati.fuori || []).length > 0;
    const serieF = serieMensile(dati, pz, { finoA: meseOra });
    const serieO = conFuori ? serieMensile(dati, pz, { fuori: true, soloFuori: true, finoA: meseOra }) : [];
    const serieT = conFuori ? sommaSerie(serieF, serieO) : serieF;
    const pmcIni = (dati.comunicati || []).filter(c => c.tipo === 'pmc_iniziale');
    const pmc = {}; posizioni(dati.movimenti || [], pmcIni, oggi).forEach(p => (pmc[p.codice] = p));
    const ultimo = serieF[serieF.length - 1] || { q: {}, liq: 0 };
    const st = k => strumenti[k] || { nome: k, isin: '', classe: 'Altro', descrizione: '', caratteristiche: [] };
    const stato = { vista: 'fineco', scheda: 'panoramica', periodo: 99, filtroMov: 'tutti', opStr: '', opAnno: '' };

    // Prezzo corrente di una posizione: archivio prezzi, altrimenti ultimo prezzo dello storico Excel.
    const prezzoCorrente = k => {
      const p = prezzoA(pz, k, meseOra); if (p) return p;
      const s = (dati.storico || []).filter(r => r.codice === k && r.prezzo).sort((a, b) => a.mese.localeCompare(b.mese)).pop();
      return s ? { prezzo: s.prezzo, dataFonte: s.mese + '-28', vecchio: true, daExcel: true } : null;
    };
    const righePos = Object.entries(ultimo.q || {}).filter(([, q]) => q > 1e-9).map(([k, q]) => {
      const p = prezzoCorrente(k); const val = p ? valorePosizione(k, q, p.prezzo) : null; const m = pmc[k];
      const costo = m ? valorePosizione(k, q, m.pmc) : null;
      return { k, q, p, val, pmc: m ? m.pmc : null, pmcComunicato: pmcIni.some(c => c.codice === k), gain: val != null && costo != null ? val - costo : null, costo };
    }).sort((a, b) => (b.val || 0) - (a.val || 0));

    function serieVista() { return stato.vista === 'tutto' ? serieT : serieF; }

    contenitore.innerHTML = `
      <header class="testa">
        <div><div class="sub">Portafoglio${conFuori ? '' : ' Fineco'} · dati al ${dataIt(oggi)}</div><h1>${esc(dati.persona && dati.persona.etichetta)}</h1>
          ${conFuori ? `<div class="interruttore" id="vista" role="group" aria-label="Cosa includere">
            <button data-vista="fineco" aria-pressed="true">Solo Fineco</button><button data-vista="tutto" aria-pressed="false">Tutto il patrimonio</button></div>` : ''}
        </div>
        <div class="testa-dx"><div class="sub">Controvalore</div><div class="grande num" id="totale"></div><div class="num" id="ytd"></div></div>
      </header>
      <nav class="schede" role="tablist">${[['panoramica', 'Panoramica'], ['posizioni', 'Posizioni'], ...(conFuori ? [['fuori', 'Fuori Fineco']] : []),
        ['operazioni', 'Operazioni'], ['movimenti', 'Movimenti conto'], ['costi', 'Costi e tasse'], ['rendimenti', 'Rendimenti per anno']]
        .filter(([k]) => k !== 'fuori').map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === 'panoramica'}">${l}</button>`).join('')
        .replace('<button role="tab" data-tab="operazioni"', conFuori ? '<button role="tab" data-fuori="1" data-scheda="fuori" aria-selected="false">Fuori Fineco</button><button role="tab" data-tab="operazioni"' : '<button role="tab" data-tab="operazioni"')}</nav>
      <section data-sez="panoramica"><div class="kpis" id="kpis"></div>
        <div class="riquadro"><h2>Andamento</h2>
          <div class="chips" id="periodo"><button class="chip" data-r="6" aria-pressed="false">6 mesi</button><button class="chip" data-r="12" aria-pressed="false">1 anno</button><button class="chip" data-r="99" aria-pressed="true">Dall'inizio</button></div>
          <div class="legenda"><span><i class="l-val"></i>Valore</span><span><i class="l-ver"></i>Soldi versati</span></div>
          <div id="grafico"></div><p class="nota" id="hover">Passa sopra il grafico per vedere il valore di fine mese.</p></div></section>
      <section data-sez="posizioni" hidden>
        <div class="griglia2"><div class="riquadro"><h2>Composizione</h2><div id="composizione"></div></div>
          <div class="riquadro"><h2>Come leggere il prezzo medio</h2><p class="nota">Il prezzo medio di carico è quanto hai pagato in media per ogni quota, commissioni comprese. Si aggiorna da solo a ogni acquisto; una vendita non lo cambia. Clicca uno strumento per il dettaglio.</p></div></div>
        <div class="riquadro scorre"><table><thead><tr><th>Strumento</th><th class="r">Quantità</th><th class="r">Prezzo medio</th><th class="r">Prezzo</th><th class="r">Valore</th><th class="r">Guadagno</th></tr></thead><tbody id="postab"></tbody></table></div>
        <div class="riquadro scorre" id="chiusi" hidden><h2>Titoli chiusi</h2><table><thead><tr><th>Strumento</th><th>Periodo</th><th class="r">Risultato</th></tr></thead><tbody id="chiusitab"></tbody></table>
          <p class="nota">Strumenti venduti o rimborsati. Il risultato comprende cedole e premi incassati. Clicca per il dettaglio.</p></div></section>
      ${conFuori ? `<section data-sez="fuori" hidden><div class="riquadro scorre"><h2>Fuori Fineco</h2><table><thead><tr><th>Bene</th><th class="r">Quantità</th><th class="r">Prezzo</th><th class="r">Valore</th></tr></thead><tbody id="fuoritab"></tbody></table>
        <p class="nota">Oro e monete al prezzo Denaro di Confinvest (quanto si incasserebbe vendendo). Il fondo pensione si aggiorna quando arriva l'estratto Allianz.</p></div></section>` : ''}
      <section data-sez="operazioni" hidden>
        <div class="filtri"><label>Strumento <select id="opstr"></select></label><label>Anno <select id="opanno"></select></label></div>
        <div class="riquadro scorre"><table><thead><tr><th>Data</th><th>Operazione</th><th>Strumento</th><th class="r">Quantità</th><th class="r">Prezzo</th><th class="r">Commissioni</th><th class="r">Totale</th><th class="r">Guadagno realizzato</th></tr></thead><tbody id="optab"></tbody></table></div>
        <p class="nota">Il guadagno realizzato è l'incasso della vendita meno il prezzo medio delle quote vendute. L'imposta, quando c'è, è quella addebitata da Fineco.</p></section>
      <section data-sez="movimenti" hidden><div class="chips" id="movfiltri"></div>
        <div class="riquadro scorre"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrizione</th><th class="r">Importo</th><th>Fonte</th></tr></thead><tbody id="movtab"></tbody></table></div>
        <p class="nota">"Contabile" = letto dal documento Fineco. "Comunicato" = inserito a mano (bollo, imposte, versamenti).</p></section>
      <section data-sez="costi" hidden><div class="kpis" id="costikpi"></div>
        <div class="riquadro scorre"><h2>Per anno</h2><table><thead><tr><th>Anno</th><th class="r">Commissioni</th><th class="r">Imposta di bollo</th><th class="r">Imposte sui guadagni</th><th class="r">Ritenute su cedole</th><th class="r">Totale</th></tr></thead><tbody id="costitab"></tbody></table></div></section>
      <section data-sez="rendimenti" hidden><div class="riquadro scorre"><h2>Rendimenti per anno</h2><table><thead id="rendhead"></thead><tbody id="rendtab"></tbody></table>
        <p class="nota">Rendimento "tempo-ponderato": versamenti e prelievi non contano come guadagno, come per i fondi. L'anno in corso è calcolato fino all'ultimo mese disponibile.</p></div></section>
      <aside class="pannello" id="pannello" aria-hidden="true"><button class="chiudi" id="chiudi">Chiudi</button><div id="pcontenuto"></div></aside>`;
    const $ = s => contenitore.querySelector(s);

    function testata() {
      const s = serieVista(); const u = s[s.length - 1];
      $('#totale').textContent = u ? eur(u.valore) : '—';
      const r = rendimentoTWR(s, (anno - 1) + '-12', meseOra);
      $('#ytd').innerHTML = `<span class="${cls(r)}">${pct(r)}</span> da inizio ${anno}`;
      const cedole = (dati.movimenti || []).filter(m => (m.tipo === 'cedola' || m.tipo === 'provento') && m.data.startsWith(String(anno))).reduce((a, m) => a + (m.importo || 0), 0);
      const versato = u && u.versato > 0 ? u.versato : null, guad = versato ? u.valore - versato : null;
      $('#kpis').innerHTML = [['Soldi versati', versato ? eur(versato) : '—'], ['Guadagno complessivo', guad != null ? `<span class="${cls(guad)}">${segno(guad)}</span>` : '—'],
        ['Cedole e premi ' + anno, eur(cedole)], ['Liquidità sul conto', eur(ultimo.liq)]]
        .map(([l, v]) => `<div class="kpi"><div class="etichetta">${l}</div><div class="v num">${v}</div></div>`).join('');
      grafico();
    }

    function grafico() {
      const tutta = serieVista().filter(x => x.valore > 0); const dati_ = tutta.slice(-Math.min(stato.periodo, tutta.length));
      const box = $('#grafico'); if (dati_.length < 2) { box.innerHTML = '<p class="nota">Storico non ancora sufficiente per il grafico.</p>'; return; }
      const W = 980, H = 280, L = 64, R = 14, T = 14, B = 30;
      const tutti = dati_.flatMap(m => [m.valore, m.versato || m.valore]); let lo = Math.min(...tutti), hi = Math.max(...tutti);
      const passo = Math.pow(10, Math.floor(Math.log10(hi - lo || 1))) / 2; lo = Math.floor(lo / passo) * passo; hi = Math.ceil(hi / passo) * passo || 1;
      const x = i => L + (W - L - R) * i / (dati_.length - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
      let gr = ''; for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; gr += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g-linea"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v / 1000, 1)}k</text>`; }
      let xl = ''; const ogni = Math.ceil(dati_.length / 6); dati_.forEach((m, i) => { if (i % ogni === 0 || i === dati_.length - 1) xl += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${nomeMese(m.mese)}</text>`; });
      const path = f => dati_.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(m)).toFixed(1)}`).join('');
      const last = dati_.length - 1;
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Andamento del portafoglio">${gr}${xl}
        <path d="${path(m => m.valore)}L${x(last)},${H - B}L${L},${H - B}Z" class="g-area"/>
        <path d="${path(m => m.versato || m.valore)}" class="g-versato"/><path d="${path(m => m.valore)}" class="g-valore"/>
        <circle cx="${x(last)}" cy="${y(dati_[last].valore)}" r="4.5" class="g-punto"/><line id="hl" x1="0" x2="0" y1="${T}" y2="${H - B}" class="g-hl" opacity="0"/>
        <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/></svg>`;
      const svg = box.querySelector('svg'), hl = box.querySelector('#hl');
      box.querySelector('#hit').addEventListener('mousemove', e => { const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W;
        const i = Math.max(0, Math.min(last, Math.round((px - L) / (W - L - R) * last))); hl.setAttribute('x1', x(i)); hl.setAttribute('x2', x(i)); hl.setAttribute('opacity', .3);
        const m = dati_[i]; $('#hover').innerHTML = `<strong>${nomeMese(m.mese)}</strong> · valore <span class="num">${eur(m.valore)}</span>${m.versato ? ` · versati <span class="num">${eur(m.versato)}</span>` : ''}`; });
    }

    function tabPosizioni() {
      const tot = righePos.reduce((a, r) => a + (r.val || 0), 0) + (ultimo.liq || 0);
      $('#postab').innerHTML = righePos.map(r => `<tr class="cliccabile" tabindex="0" data-codice="${esc(r.k)}"><td><strong>${esc(r.k)}</strong><div class="sub">${esc(st(r.k).nome)}</div></td>
        <td class="r num">${fmt(r.q, eNominale(r.k) ? 0 : (r.q % 1 ? 3 : 0))}${eNominale(r.k) ? ' nom.' : ''}</td>
        <td class="r num">${r.pmc != null ? fmt(r.pmc) : '—'}${r.pmc != null && !r.pmcComunicato ? '<div class="sub">da contabili</div>' : ''}</td>
        <td class="r num">${r.p ? fmt(r.p.prezzo) : '—'}${r.p && r.p.vecchio ? `<div class="sub avviso">prezzo del ${ggmm(r.p.dataFonte)}</div>` : ''}</td>
        <td class="r num">${eur(r.val)}</td><td class="r num ${cls(r.gain)}">${r.gain != null ? segno(r.gain) + `<div class="sub">${pct(r.gain / r.costo)}</div>` : '—'}</td></tr>`).join('') +
        `<tr><td><strong>Liquidità</strong></td><td></td><td></td><td></td><td class="r num">${eur(ultimo.liq)}</td><td></td></tr>`;
      const gruppi = {}; righePos.forEach(r => (gruppi[st(r.k).classe] = (gruppi[st(r.k).classe] || 0) + (r.val || 0))); gruppi['Liquidità'] = (gruppi['Liquidità'] || 0) + Math.max(0, ultimo.liq || 0);
      const col = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
      $('#composizione').innerHTML = `<div class="barra">${Object.values(gruppi).map((v, i) => `<span class="${col[i % 6]}" style="width:${tot > 0 ? v / tot * 100 : 0}%"></span>`).join('')}</div>` +
        Object.entries(gruppi).map(([k, v], i) => `<div class="riga-alloc"><span><i class="${col[i % 6]}"></i>${esc(k)}</span><span class="num">${fmt(tot > 0 ? v / tot * 100 : 0, 1)}%</span></div>`).join('');
    }

    // Quanto ha reso lo strumento: dall'inizio, anno per anno, cedole e premi incassati.
    function bloccoRendimento(rs) {
      const i = rs.inizio, kpi = (e, v, c = '') => `<div class="kpi"><div class="etichetta">${e}</div><div class="v num ${c}">${v}</div></div>`;
      return `<h4>Dall'inizio</h4><div class="kpis">${kpi('Investito', eur(i.investito))}${kpi(rs.chiuso ? 'Incassato' : 'Valore oggi', rs.chiuso ? eur(i.incassi) : eur(i.valore))}
          ${kpi('Cedole e premi', eur(i.cedole))}${i.incompleto ? kpi('Risultato', 'da verificare') : kpi('Risultato', i.totale != null ? segno(i.totale) + `<div class="sub">${pct(i.pct)}</div>` : '—', cls(i.totale))}</div>
        ${i.incompleto ? '<p class="nota avviso">Risultato da verificare: mancano alcune contabili, quindi i numeri non sono affidabili.</p>' : ''}
        <h4>Anno per anno</h4><div class="scorre"><table><thead><tr><th>Anno</th><th class="r">Prezzo</th><th class="r">Cedole</th><th class="r">Totale</th><th class="r">%</th></tr></thead><tbody>
        ${rs.anni.map(a => `<tr><td>${a.anno}${a.incompleto ? ' ⚠' : ''}${a.anno === anno && !rs.chiuso ? ' <span class="sub">(in corso)</span>' : a.parziale ? ' <span class="sub">(parziale)</span>' : ''}</td>
          <td class="r num ${a.incompleto ? '' : cls(a.prezzo)}">${a.prezzo != null && !a.incompleto ? segno(a.prezzo) : '—'}</td><td class="r num">${a.cedole ? segno(a.cedole) : '—'}</td>
          <td class="r num ${a.incompleto ? '' : cls(a.totale)}"><strong>${a.totale != null && !a.incompleto ? segno(a.totale) : '—'}</strong></td><td class="r num ${a.incompleto ? '' : cls(a.pct)}">${a.incompleto ? '—' : pct(a.pct)}</td></tr>`).join('')}</tbody></table></div>
        <p class="nota">La percentuale dell'anno è calcolata sul capitale mediamente investito: un acquisto di novembre pesa meno di uno di gennaio.</p>
        <h4>Cedole e premi</h4>${rs.cedole.length ? `<div class="scorre"><table><tbody>${rs.cedole.map(c => `<tr><td>${dataIt(c.data)}</td><td>${ETICHETTE[c.tipo]}</td><td class="r num">${eur(c.importo)}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="nota">Nessuna cedola o provento.</p>'}`;
    }

    function tabChiusi() {
      const meseAnno = d => d.slice(5, 7) + '/' + d.slice(0, 4);
      const righe = titoliChiusi(dati, serieF).map(k => {
        const rs = rendimentoStrumento(dati, serieF, pz, k, oggi), mv = (dati.movimenti || []).filter(m => m.codice === k).map(m => m.data).sort();
        return `<tr class="cliccabile" tabindex="0" data-codice="${esc(k)}"><td><strong>${esc(k)}</strong><div class="sub">${esc(st(k).nome)}</div></td>
          <td>${meseAnno(mv[0])} – ${meseAnno(mv[mv.length - 1])}</td>
          <td class="r num ${rs.inizio.incompleto ? '' : cls(rs.inizio.totale)}">${rs.inizio.incompleto ? '<span class="avviso">da verificare</span><div class="sub">mancano contabili</div>' : rs.inizio.totale != null ? segno(rs.inizio.totale) + `<div class="sub">${pct(rs.inizio.pct)}</div>` : '—'}</td></tr>`;
      });
      $('#chiusitab').innerHTML = righe.join(''); $('#chiusi').hidden = !righe.length;
    }

    function apriStrumento(k) {
      const s = st(k), r = righePos.find(x => x.k === k);
      const acq = (dati.movimenti || []).filter(m => m.codice === k && ['acquisto', 'vendita', 'rimborso', 'trasferimento'].includes(m.tipo)).sort((a, b) => b.data.localeCompare(a.data));
      $('#pcontenuto').innerHTML = `<div class="sub">${esc(s.classe)}${s.isin ? ' · ' + esc(s.isin) : ''}</div><h3>${esc(s.nome)}</h3><p>${esc(s.descrizione)}</p>
        <dl class="fatti">${s.ter && s.ter !== '—' ? `<dt>Costo annuo (TER)</dt><dd>${esc(s.ter)}</dd>` : ''}${(s.caratteristiche || []).map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
        ${r ? `<div class="kpis due"><div class="kpi"><div class="etichetta">Prezzo medio</div><div class="v num">${r.pmc != null ? fmt(r.pmc) : '—'}</div></div><div class="kpi"><div class="etichetta">Guadagno</div><div class="v num ${cls(r.gain)}">${r.gain != null ? segno(r.gain) : '—'}</div></div></div>` : ''}
        ${bloccoRendimento(rendimentoStrumento(dati, serieF, pz, k, oggi))}
        <h4>Operazioni</h4><div class="scorre"><table><thead><tr><th>Data</th><th>Tipo</th><th class="r">Quantità</th><th class="r">Prezzo</th></tr></thead><tbody>
        ${acq.map(m => `<tr><td>${dataIt(m.data)}</td><td>${ETICHETTE[m.tipo]}</td><td class="r num">${fmt(m.quantita, m.quantita % 1 ? 3 : 0)}</td><td class="r num">${fmt(m.prezzo, 3)}</td></tr>`).join('')}</tbody></table></div>
        <p class="nota">Il prezzo medio si ricalcola a ogni acquisto: (quantità precedente × prezzo medio + nuovo acquisto con commissioni) ÷ quantità totale.</p>`;
      $('#pannello').classList.add('aperto'); $('#pannello').setAttribute('aria-hidden', 'false'); $('#chiudi').focus();
    }

    function tabFuori() {
      if (!conFuori) return;
      const sto = dati.storico || [];
      // Ultima riga Excel valorizzata di ogni bene: le colonne dei mesi futuri (vuote o a zero) non contano.
      const ultimaRiga = k => sto.filter(r => r.codice === k && (r.valore || 0) !== 0).sort((a, b) => a.mese.localeCompare(b.mese)).pop() || {};
      const oro = prezzoCorrente('ORO_G');
      $('#fuoritab').innerHTML = (dati.fuori || []).map(f => {
        const k = f.codice; const rs = ultimaRiga(k); const ultimoSto = rs.mese;
        let q = rs.quantita, p = null, v = rs.valore, nota = '';
        (dati.comunicati || []).filter(c => c.codice === k && c.tipo === 'quantita_fuori').forEach(c => (q = (q || 0) + (c.quantita || 0)));
        if (k === 'ALLIANZ') { const c = (dati.comunicati || []).filter(c => c.codice === k && c.tipo === 'valore_fuori').sort((a, b) => a.data.localeCompare(b.data)).pop(); if (c) { v = c.importo; nota = 'estratto del ' + dataIt(c.data); } else nota = 'valore di ' + nomeMese(ultimoSto); q = null; }
        else if (k === 'PESOS_G') { const pOro = sto.filter(r => r.codice === 'ORO_G' && r.mese === ultimoSto && r.prezzo)[0] || ultimaRiga('ORO_G'); q = pOro && pOro.prezzo ? rs.valore / pOro.prezzo : null; p = oro; v = q != null && oro ? q * oro.prezzo : v; }
        else { p = prezzoCorrente(k); v = q != null && p ? q * p.prezzo : v; }
        const uq = k === 'ORO_G' || k === 'PESOS_G' ? ' g' : q != null ? ' pz' : '';
        return `<tr class="cliccabile" tabindex="0" data-codice="${esc(k)}"><td><strong>${esc(st(k).nome)}</strong>${nota ? `<div class="sub">${nota}</div>` : ''}</td><td class="r num">${q != null ? fmt(q, q % 1 ? 1 : 0) + uq : '—'}</td>
          <td class="r num">${p ? fmt(p.prezzo) : '—'}${p && p.vecchio ? `<div class="sub avviso">prezzo del ${ggmm(p.dataFonte)}</div>` : ''}</td><td class="r num">${eur(v)}</td></tr>`;
      }).join('');
    }

    function tabOperazioni() {
      const ops = operazioni(dati.movimenti || [], pmcIni).filter(o => o.tipo !== 'trasferimento');
      const imp = (dati.comunicati || []).filter(c => c.tipo === 'imposta');
      const codici = [...new Set(ops.map(o => o.codice))].sort(), anni = [...new Set(ops.map(o => o.data.slice(0, 4)))].sort().reverse();
      if (!$('#opstr').options.length) {
        $('#opstr').innerHTML = '<option value="">Tutti</option>' + codici.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        $('#opanno').innerHTML = '<option value="">Tutti</option>' + anni.map(a => `<option>${a}</option>`).join('');
      }
      $('#optab').innerHTML = ops.filter(o => (!stato.opStr || o.codice === stato.opStr) && (!stato.opAnno || o.data.startsWith(stato.opAnno)))
        .sort((a, b) => b.data.localeCompare(a.data)).map(o => {
          const i = imp.find(c => c.data === o.data && (!c.codice || c.codice === o.codice));
          return `<tr><td class="num">${dataIt(o.data)}</td><td>${ETICHETTE[o.tipo]}</td><td><strong>${esc(o.codice)}</strong><div class="sub">${esc(st(o.codice).nome)}</div></td>
            <td class="r num">${fmt(o.quantita, o.quantita % 1 ? 3 : 0)}</td><td class="r num">${fmt(o.prezzo, 3)}</td><td class="r num">${fmt(o.commissioni)}</td>
            <td class="r num">${segno(o.totale || 0)}</td><td class="r num ${cls(o.realizzato)}">${o.realizzato != null ? segno(o.realizzato) : ''}${i ? `<div class="sub">imposta ${eur(Math.abs(i.importo))}</div>` : ''}</td></tr>`;
        }).join('') || '<tr><td colspan="8" class="nota">Nessuna operazione.</td></tr>';
    }

    function righeMovimenti() {
      const r = (dati.movimenti || []).filter(m => m.tipo !== 'trasferimento').map(m => ({ data: m.data, tipo: m.tipo, importo: m.importo || 0, fonte: 'contabile',
        descr: `${ETICHETTE[m.tipo]} ${m.codice}${m.quantita && ['acquisto', 'vendita'].includes(m.tipo) ? ` · ${fmt(m.quantita, m.quantita % 1 ? 3 : 0)} a ${fmt(m.prezzo, 3)}` : ''}${m.ritenuta ? ` (ritenuta ${eur(m.ritenuta)})` : ''}` }));
      (dati.comunicati || []).filter(c => ['versamento', 'prelievo', 'bollo', 'imposta', 'commissione'].includes(c.tipo)).forEach(c => r.push({
        data: c.data, tipo: c.tipo, importo: (c.tipo === 'versamento' ? 1 : -1) * Math.abs(c.importo || 0), fonte: 'comunicato', descr: c.nota || ETICHETTE[c.tipo] }));
      return r.sort((a, b) => b.data.localeCompare(a.data));
    }
    function tabMovimenti() {
      $('#movfiltri').innerHTML = FILTRI.map(([k, l]) => `<button class="chip" data-k="${k}" aria-pressed="${k === stato.filtroMov}">${l}</button>`).join('');
      const f = stato.filtroMov;
      $('#movtab').innerHTML = righeMovimenti().filter(m => f === 'tutti' || m.tipo === f || (f === 'cedola' && m.tipo === 'provento'))
        .map(m => `<tr><td class="num">${dataIt(m.data)}</td><td><span class="tag t-${m.tipo}">${ETICHETTE[m.tipo]}</span></td><td>${esc(m.descr)}</td>
          <td class="r num ${cls(m.importo)}">${segno(m.importo)}</td><td><span class="tag ${m.fonte === 'comunicato' ? 't-man' : ''}">${m.fonte}</span></td></tr>`).join('')
        || '<tr><td colspan="5" class="nota">Nessun movimento di questo tipo.</td></tr>';
    }

    function tabCosti() {
      const c = costiPerAnno(dati); const a = c.find(x => x.anno === anno) || { commissioni: 0, bollo: 0, imposte: 0, ritenute: 0 };
      $('#costikpi').innerHTML = [['Commissioni ' + anno, a.commissioni], ['Bollo ' + anno, a.bollo], ['Imposte sui guadagni ' + anno, a.imposte], ['Ritenute su cedole ' + anno, a.ritenute]]
        .map(([l, v]) => `<div class="kpi"><div class="etichetta">${l}</div><div class="v num">${eur(v)}</div></div>`).join('');
      $('#costitab').innerHTML = c.slice().reverse().map(r => `<tr><td>${r.anno}</td><td class="r num">${eur(r.commissioni)}</td><td class="r num">${eur(r.bollo)}</td><td class="r num">${eur(r.imposte)}</td><td class="r num">${eur(r.ritenute)}</td>
        <td class="r num"><strong>${eur(r.commissioni + r.bollo + r.imposte + r.ritenute)}</strong></td></tr>`).join('');
    }

    function tabRendimenti() {
      const r = rendimentiPerAnno(serieF, conFuori ? serieO : null);
      $('#rendhead').innerHTML = conFuori ? '<tr><th>Anno</th><th class="r">Fineco</th><th class="r">Fuori Fineco</th><th class="r">Complessivo</th></tr>' : '<tr><th>Anno</th><th class="r">Rendimento</th></tr>';
      $('#rendtab').innerHTML = r.slice().reverse().map(x => `<tr><td>${x.anno}${x.anno === anno ? ' <span class="sub">(in corso)</span>' : ''}</td><td class="r num ${cls(x.fineco)}">${pct(x.fineco)}</td>
        ${conFuori ? `<td class="r num ${cls(x.fuori)}">${pct(x.fuori)}</td><td class="r num ${cls(x.totale)}"><strong>${pct(x.totale)}</strong></td>` : ''}</tr>`).join('')
        || '<tr><td colspan="4" class="nota">Serve almeno un anno completo di storico.</td></tr>';
    }

    contenitore.addEventListener('click', e => {
      const t = e.target.closest('[data-tab],[data-scheda]');
      if (t) { const k = t.dataset.tab || t.dataset.scheda; contenitore.querySelectorAll('[data-tab],[data-scheda]').forEach(b => b.setAttribute('aria-selected', b === t)); contenitore.querySelectorAll('[data-sez]').forEach(s => (s.hidden = s.dataset.sez !== k)); return; }
      const v = e.target.closest('#vista [data-vista]');
      if (v) { stato.vista = v.dataset.vista; contenitore.querySelectorAll('#vista [data-vista]').forEach(b => b.setAttribute('aria-pressed', b === v)); testata(); return; }
      const p = e.target.closest('#periodo [data-r]');
      if (p) { stato.periodo = +p.dataset.r; contenitore.querySelectorAll('#periodo [data-r]').forEach(b => b.setAttribute('aria-pressed', b === p)); grafico(); return; }
      const m = e.target.closest('#movfiltri [data-k]'); if (m) { stato.filtroMov = m.dataset.k; tabMovimenti(); return; }
      const r = e.target.closest('tr.cliccabile'); if (r) { apriStrumento(r.dataset.codice); return; }
      if (e.target.closest('#chiudi')) { $('#pannello').classList.remove('aperto'); $('#pannello').setAttribute('aria-hidden', 'true'); }
    });
    contenitore.addEventListener('keydown', e => { const r = e.target.closest && e.target.closest('tr.cliccabile'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); apriStrumento(r.dataset.codice); } if (e.key === 'Escape') $('#chiudi').click(); });
    contenitore.addEventListener('change', e => { if (e.target.id === 'opstr') { stato.opStr = e.target.value; tabOperazioni(); } if (e.target.id === 'opanno') { stato.opAnno = e.target.value; tabOperazioni(); } });

    testata(); tabPosizioni(); tabChiusi(); tabFuori(); tabOperazioni(); tabMovimenti(); tabCosti(); tabRendimenti();
  }
  g.avvia = avvia;
})(window);

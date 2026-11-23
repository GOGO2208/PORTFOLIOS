// Motore di calcolo del portafoglio: funzioni pure, senza DOM.
// Importi in euro; i titoli "nominali" (BTP, BOT, OAT) hanno quantità nominale e prezzo per 100.
(function (g) {
  const eNominale = c => /^(BTP|BOT|OAT)-/.test(c || '');
  const scala = c => (eNominale(c) ? 100 : 1);
  const r2 = x => Math.round(x * 100) / 100;
  const CODICI_FUORI = ['ORO_G', 'STERLINA_POST74', 'MARENGO_FR', 'PESOS_G', 'ALLIANZ'];
  const NON_POSIZIONI = ['TOTALE', 'VERSAMENTI', 'VERSAMENTI_M', 'PRELIEVI', 'LIQUIDITA'];
  const ordineTipo = { pmc_iniziale: 0, trasferimento: 1, acquisto: 2, vendita: 3, rimborso: 4 };
  const fineMese = m => m + '-31';
  const meseDi = d => d.slice(0, 7);

  function valorePosizione(codice, quantita, prezzo) { return quantita * prezzo / scala(codice); }

  // Applica movimenti e PMC comunicati in ordine; chiama traccia(evento) per ogni operazione.
  function scorri(movimenti, pmcIniziali, aData, traccia) {
    const ev = [];
    (movimenti || []).forEach(m => { if (['acquisto', 'vendita', 'rimborso', 'trasferimento'].includes(m.tipo)) ev.push(m); });
    (pmcIniziali || []).forEach(p => ev.push({ data: p.data, tipo: 'pmc_iniziale', codice: p.codice, quantita: p.quantita, prezzo: p.importo }));
    ev.sort((a, b) => a.data.localeCompare(b.data) || ordineTipo[a.tipo] - ordineTipo[b.tipo]);
    const pos = {};
    for (const e of ev) {
      if (aData && e.data > aData) break;
      const s = scala(e.codice);
      const p = pos[e.codice] || (pos[e.codice] = { codice: e.codice, quantita: 0, costo: 0 });
      const pmcPrima = p.quantita > 0 ? p.costo * s / p.quantita : 0;
      if (e.tipo === 'pmc_iniziale') { p.quantita = e.quantita; p.costo = e.quantita * e.prezzo / s; }
      else if (e.tipo === 'acquisto' || e.tipo === 'trasferimento') {
        p.quantita += e.quantita; p.costo += e.quantita * e.prezzo / s + (e.commissioni || 0);
        traccia && e.tipo === 'acquisto' && traccia({ e, pmcAlMomento: p.costo * s / p.quantita, realizzato: null });
      } else {
        const q = Math.min(e.quantita, p.quantita);
        const realizzato = (e.importo || 0) - q * pmcPrima / s;
        p.quantita -= q; p.costo = p.quantita > 1e-9 ? p.costo - q * pmcPrima / s : 0;
        if (p.quantita <= 1e-9) { p.quantita = 0; p.costo = 0; }
        traccia && traccia({ e, pmcAlMomento: pmcPrima, realizzato });
      }
    }
    return pos;
  }

  function posizioni(movimenti, pmcIniziali, aData) {
    const pos = scorri(movimenti, pmcIniziali, aData);
    return Object.values(pos).filter(p => p.quantita > 1e-9)
      .map(p => ({ codice: p.codice, quantita: +p.quantita.toFixed(6), pmc: p.costo * scala(p.codice) / p.quantita, costo: p.costo }));
  }

  function operazioni(movimenti, pmcIniziali) {
    const out = [];
    scorri(movimenti, pmcIniziali, null, ({ e, pmcAlMomento, realizzato }) => out.push({
      data: e.data, tipo: e.tipo, codice: e.codice, quantita: e.quantita, prezzo: e.prezzo, commissioni: e.commissioni || 0,
      totale: e.importo, pmcAlMomento, realizzato, fonte: e.fonte }));
    return out;
  }

  function indicizzaPrezzi(righe) {
    const pz = {};
    (righe || []).forEach(r => (pz[r.codice] = pz[r.codice] || []).push({ mese: r.mese, prezzo: +r.prezzo, dataFonte: r.data_fonte }));
    Object.values(pz).forEach(a => a.sort((x, y) => x.mese.localeCompare(y.mese)));
    return pz;
  }

  function prezzoA(pz, codice, mese) {
    const a = pz[codice]; if (!a) return null;
    let best = null; for (const x of a) { if (x.mese <= mese) best = x; else break; }
    return best ? { prezzo: best.prezzo, dataFonte: best.dataFonte, vecchio: best.mese !== mese } : null;
  }

  const mesiTra = (da, a) => { const out = []; let [y, m] = da.split('-').map(Number); const [ya, ma] = a.split('-').map(Number);
    while (y < ya || (y === ya && m <= ma)) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } } return out; };

  // Flussi da storico Excel: mensili, oppure cumulati dentro l'anno (dati.persona.versamentiExcel === 'cumulati').
  function flussiStorico(dati) {
    const f = {}; const cum = dati.persona && dati.persona.versamentiExcel === 'cumulati';
    for (const k of ['VERSAMENTI', 'PRELIEVI']) {
      if (k === 'PRELIEVI' && dati.persona && dati.persona.prelieviExcel === 'ignora') continue;
      const righe = (dati.storico || []).filter(r => r.codice === k).sort((a, b) => a.mese.localeCompare(b.mese));
      let prec = 0, anno = null;
      for (const r of righe) {
        let v = r.valore || 0;
        if (cum) { const y = r.mese.slice(0, 4); if (y !== anno) { prec = 0; anno = y; } const d = v - prec; prec = v; v = d; }
        f[r.mese] = (f[r.mese] || 0) + (k === 'VERSAMENTI' ? v : -v);
      }
    }
    // Versamenti dal foglio "Dettaglio flussi": sempre mensili, usati solo nei mesi senza riga Versamenti.
    const conVers = new Set((dati.storico || []).filter(r => r.codice === 'VERSAMENTI').map(r => r.mese));
    (dati.storico || []).filter(r => r.codice === 'VERSAMENTI_M' && !conVers.has(r.mese)).forEach(r => (f[r.mese] = (f[r.mese] || 0) + (r.valore || 0)));
    return f;
  }

  function serieMensile(dati, pz, opz) {
    opz = opz || {};
    const fuoriCod = new Set((dati.fuori || []).map(x => x.codice));
    const sto = dati.storico || [];
    const mesiSto = [...new Set(sto.filter(r => !['VERSAMENTI', 'VERSAMENTI_M', 'PRELIEVI', 'TOTALE'].includes(r.codice) && (r.valore || 0) !== 0).map(r => r.mese))].sort();
    const fl = flussiStorico(dati);
    const com = dati.comunicati || [];
    const flussoCom = m => com.filter(c => meseDi(c.data) === m && (c.tipo === 'versamento' || c.tipo === 'prelievo'))
      .reduce((s, c) => s + (c.tipo === 'versamento' ? 1 : -1) * Math.abs(c.importo || 0), 0);
    const usaFineco = !opz.soloFuori, usaFuori = !!opz.fuori;
    const out = []; let versato = 0;
    const ultimoSto = mesiSto[mesiSto.length - 1];
    let ultimiPrezzi = {}, ultimeQ = {}; const visti = new Set();
    for (const m of mesiSto) {
      const righe = sto.filter(r => r.mese === m);
      let vf = 0, vo = 0, ff = (fl[m] || 0) + flussoCom(m), fo = 0; const qm = {}; let lm = 0;
      for (const r of righe) {
        if (NON_POSIZIONI.includes(r.codice) && r.codice !== 'LIQUIDITA') continue;
        if (fuoriCod.has(r.codice) || CODICI_FUORI.includes(r.codice)) {
          if (!fuoriCod.has(r.codice)) continue;
          vo += r.valore || 0;
          const q = r.codice === 'PESOS_G' ? null : r.quantita;
          if (out.length && !visti.has(r.codice)) fo += r.valore || 0; // bene comparso dopo l'inizio: è un acquisto
          else if (q != null && ultimeQ[r.codice] != null && q !== ultimeQ[r.codice] && r.prezzo) fo += (q - ultimeQ[r.codice]) * r.prezzo;
          visti.add(r.codice);
          if (q != null) ultimeQ[r.codice] = q;
          if (r.prezzo) ultimiPrezzi[r.codice] = r.prezzo;
          if (r.codice === 'PESOS_G') ultimeQ.PESOS_G_valore = r.valore;
        } else { vf += r.valore || 0; if (r.codice === "LIQUIDITA") lm = r.valore || 0; else if (r.quantita != null) qm[r.codice] = r.quantita; }
      }
      if (ultimeQ.PESOS_G_valore != null && ultimiPrezzi.ORO_G) ultimeQ.PESOS_G = ultimeQ.PESOS_G_valore / ultimiPrezzi.ORO_G;
      const valore = (usaFineco ? vf : 0) + (usaFuori ? vo : 0);
      const flusso = (usaFineco ? ff : 0) + (usaFuori ? fo : 0);
      versato += flusso;
      if (!out.length && versato < valore) versato = valore; // portafoglio iniziale (es. titoli trasferiti) conta come capitale versato
      out.push({ mese: m, valore, versato, flusso, fineco: vf, fuori: vo, q: qm, liq: lm });
    }
    // Dopo lo storico: quantità dell'ultimo mese Excel + movimenti successivi, valorizzate ai prezzi di fine mese.
    const ultimoPz = Object.values(pz).flat().reduce((a, x) => (x.mese > a ? x.mese : a), '');
    const finoA = opz.finoA || ultimoPz || ultimoSto;
    if (!ultimoSto || !finoA || finoA <= ultimoSto) return out;
    const q = {}; let liq = 0;
    sto.filter(r => r.mese === ultimoSto).forEach(r => {
      if (r.codice === 'LIQUIDITA') liq = r.valore || 0;
      else if (!NON_POSIZIONI.includes(r.codice) && !CODICI_FUORI.includes(r.codice) && r.quantita != null) q[r.codice] = r.quantita;
    });
    const mov = (dati.movimenti || []).filter(x => x.data > fineMese(ultimoSto)).sort((a, b) => a.data.localeCompare(b.data));
    const cassa = com.filter(c => c.data > fineMese(ultimoSto) && ['versamento', 'prelievo', 'bollo', 'imposta', 'commissione'].includes(c.tipo));
    let allianz = (sto.filter(r => r.codice === 'ALLIANZ' && r.mese === ultimoSto)[0] || {}).valore || 0;
    for (const m of mesiTra(ultimoSto, finoA).slice(1)) {
      for (const x of mov.filter(x => meseDi(x.data) === m)) {
        if (x.tipo === 'acquisto' || x.tipo === 'trasferimento') q[x.codice] = (q[x.codice] || 0) + x.quantita;
        if (x.tipo === 'vendita' || x.tipo === 'rimborso') q[x.codice] = Math.max(0, (q[x.codice] || 0) - x.quantita);
        if (x.tipo !== 'trasferimento') liq += x.importo || 0;
      }
      for (const c of cassa.filter(c => meseDi(c.data) === m)) liq += (c.tipo === 'versamento' ? 1 : -1) * Math.abs(c.importo || 0);
      let vf = liq, manca = false;
      for (const [cod, qq] of Object.entries(q)) { if (qq <= 1e-9) continue; const p = prezzoA(pz, cod, m); if (!p) { manca = true; continue; } vf += valorePosizione(cod, qq, p.prezzo); }
      let vo = 0, fo = 0;
      for (const c of com.filter(c => meseDi(c.data) === m)) {
        if (c.tipo === 'quantita_fuori') { ultimeQ[c.codice] = (ultimeQ[c.codice] || 0) + (c.quantita || 0); fo += c.importo || 0; }
        if (c.tipo === 'valore_fuori' && c.codice === 'ALLIANZ') allianz = c.importo || 0;
        if (c.tipo === 'versamento_fuori') fo += c.importo || 0;
      }
      for (const cod of fuoriCod) {
        if (cod === 'ALLIANZ') { vo += allianz; continue; }
        const base = cod === 'PESOS_G' ? 'ORO_G' : cod; const p = prezzoA(pz, base, m);
        const pr = p ? p.prezzo : ultimiPrezzi[base]; if (pr && ultimeQ[cod] != null) vo += ultimeQ[cod] * pr;
      }
      const ff = flussoCom(m);
      const valore = (usaFineco ? vf : 0) + (usaFuori ? vo : 0), flusso = (usaFineco ? ff : 0) + (usaFuori ? fo : 0);
      versato += flusso;
      const qc = {}; for (const [k, v] of Object.entries(q)) if (v > 1e-9) qc[k] = +v.toFixed(6);
      out.push({ mese: m, valore, versato, flusso, fineco: vf, fuori: vo, incompleto: manca, q: qc, liq });
    }
    return out;
  }

  function rendimentoTWR(serie, daMese, aMese) {
    const s = (serie || []).filter(x => x.mese <= aMese);
    let prev = null; for (const x of s) if (x.mese <= daMese) prev = x;
    const periodo = s.filter(x => x.mese > daMese);
    if (!prev) prev = periodo.shift();
    if (!prev || !periodo.length) return null;
    let f = 1;
    for (const x of periodo) { if (prev.valore > 0) f *= (x.valore - (x.flusso || 0)) / prev.valore; prev = x; }
    return f - 1;
  }

  function sommaSerie(a, b) {
    const mesi = [...new Set([...a, ...b].map(x => x.mese))].sort(); let ua = null, ub = null;
    return mesi.map(m => { const xa = a.find(x => x.mese === m), xb = b.find(x => x.mese === m); if (xa) ua = xa; if (xb) ub = xb;
      return { mese: m, valore: (ua ? ua.valore : 0) + (ub ? ub.valore : 0), flusso: (xa ? xa.flusso || 0 : 0) + (xb ? xb.flusso || 0 : 0),
        versato: (ua ? ua.versato || 0 : 0) + (ub ? ub.versato || 0 : 0) }; });
  }

  function rendimentiPerAnno(serieFineco, serieFuori) {
    const anni = [...new Set(serieFineco.map(x => +x.mese.slice(0, 4)))].sort();
    const tot = serieFuori ? sommaSerie(serieFineco, serieFuori) : serieFineco;
    const out = [];
    for (const y of anni) {
      const da = (y - 1) + '-12', a = y + '-12';
      const fineco = rendimentoTWR(serieFineco, da, a); if (fineco === null) continue;
      out.push({ anno: y, fineco, fuori: serieFuori ? rendimentoTWR(serieFuori, da, a) : null, totale: rendimentoTWR(tot, da, a) });
    }
    return out;
  }

  function costiPerAnno(dati) {
    const c = {}; const riga = y => (c[y] = c[y] || { anno: +y, commissioni: 0, bollo: 0, imposte: 0, ritenute: 0 });
    (dati.movimenti || []).forEach(m => { const r = riga(m.data.slice(0, 4)); r.commissioni += m.commissioni || 0; r.ritenute += m.ritenuta || 0; });
    (dati.comunicati || []).forEach(x => { const k = { bollo: 'bollo', imposta: 'imposte', commissione: 'commissioni' }[x.tipo]; if (k) riga(x.data.slice(0, 4))[k] += Math.abs(x.importo || 0); });
    return Object.values(c).sort((a, b) => a.anno - b.anno).map(r => ({ anno: r.anno, commissioni: r2(r.commissioni), bollo: r2(r.bollo), imposte: r2(r.imposte), ritenute: r2(r.ritenute) }));
  }

  // Rendimento di un singolo strumento: anno per anno e dall'inizio, prezzo + cedole/proventi.
  // % annua = totale / capitale medio (Dietz); il periodo parte dal primo acquisto se a inizio anno non c'era la posizione.
  const giorni = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
  const ENTRATE = ['acquisto', 'trasferimento'], USCITE = ['vendita', 'rimborso'], REDDITI = ['cedola', 'provento'];
  const costoEntrata = m => (m.importo ? Math.abs(m.importo) : m.quantita * m.prezzo / scala(m.codice) + (m.commissioni || 0));

  function rendimentoStrumento(dati, serie, pz, codice, oggi) {
    const mov = (dati.movimenti || []).filter(m => m.codice === codice).sort((a, b) => a.data.localeCompare(b.data));
    const meseOra = meseDi(oggi), annoOra = +oggi.slice(0, 4);
    // Le contabili del mese corrente possono essere più recenti dell'ultimo prezzo: l'anno in corso arriva fino all'ultimo movimento del mese.
    const fineOra = mov.filter(m => meseDi(m.data) <= meseOra).reduce((d, m) => (m.data > d ? m.data : d), oggi);
    const qSerie = m => { let q = 0; for (const x of serie || []) { if (x.mese <= m) q = (x.q && x.q[codice]) || 0; else break; } return q; };
    const qMov = d => mov.reduce((q, m) => m.data > d ? q : ENTRATE.includes(m.tipo) ? q + m.quantita : USCITE.includes(m.tipo) ? q - m.quantita : q, 0);
    const prezzoMese = m => { const s = (dati.storico || []).find(r => r.mese === m && r.codice === codice && r.prezzo); if (s) return s.prezzo; const p = prezzoA(pz, codice, m); return p ? p.prezzo : null; };
    const valoreA = m => { const q = qSerie(m); if (q <= 1e-9) return 0; const p = prezzoMese(m); return p ? valorePosizione(codice, q, p) : null; };
    const somma = (lista, f) => lista.reduce((s, m) => s + f(m), 0);
    const chiuso = qSerie(meseOra) <= 1e-9 && mov.some(m => ENTRATE.includes(m.tipo));
    const uscite = mov.filter(m => USCITE.includes(m.tipo));
    const ultimaUscita = uscite.length ? uscite[uscite.length - 1].data : null;
    const dataChiusura = chiuso && ultimaUscita && Math.abs(qMov(ultimaUscita)) <= 1e-6 ? ultimaUscita : null;
    const inizi = [...mov.filter(m => ENTRATE.includes(m.tipo)).map(m => +m.data.slice(0, 4)), ...(serie || []).filter(x => x.q && x.q[codice] > 1e-9).map(x => +x.mese.slice(0, 4))];
    const anni = [];
    if (inizi.length) {
      const ultimoAnno = dataChiusura ? +dataChiusura.slice(0, 4) : annoOra;
      for (let y = Math.min(...inizi); y <= ultimoAnno; y++) {
        const inizioP = (y - 1) + '-12-31', meseIni = (y - 1) + '-12';
        const chiudeQui = dataChiusura && +dataChiusura.slice(0, 4) === y;
        const fine = chiudeQui ? dataChiusura : y === annoOra ? fineOra : y + '-12-31';
        const meseFin = chiudeQui ? meseDi(dataChiusura) : y === annoOra ? meseOra : y + '-12';
        const nel = mov.filter(m => m.data > inizioP && m.data <= fine);
        const ent = nel.filter(m => ENTRATE.includes(m.tipo)), usc = nel.filter(m => USCITE.includes(m.tipo)), red = nel.filter(m => REDDITI.includes(m.tipo));
        const valIni = valoreA(meseIni), valFin = chiudeQui ? 0 : valoreA(meseFin);
        if (qSerie(meseIni) <= 1e-9 && !nel.length) continue;
        const inizio = qSerie(meseIni) > 1e-9 ? inizioP : (ent[0] || nel[0]).data;
        const acquisti = somma(ent, costoEntrata), incassi = somma(usc, m => m.importo || 0), cedole = somma(red, m => m.importo || 0);
        let prezzo = null, totale = null, pct = null;
        if (valIni !== null && valFin !== null) {
          prezzo = valFin - valIni - acquisti + incassi; totale = prezzo + cedole;
          const D = giorni(fine) - giorni(inizio), w = d => (D > 0 ? (giorni(fine) - giorni(d)) / D : 1);
          const cap = valIni + somma(ent, m => costoEntrata(m) * w(m.data)) - somma(usc, m => (m.importo || 0) * w(m.data));
          pct = cap > 0 ? totale / cap : null;
        }
        anni.push({ anno: y, parziale: inizio > inizioP || !!chiudeQui, valIni, valFin, acquisti, incassi, cedole, prezzo, totale, pct,
          incompleto: Math.abs(qMov(fine) - qSerie(meseFin)) > 1e-6 });
      }
    }
    const investito = somma(mov.filter(m => ENTRATE.includes(m.tipo)), costoEntrata);
    const incassi = somma(uscite, m => m.importo || 0), cedole = somma(mov.filter(m => REDDITI.includes(m.tipo)), m => m.importo || 0);
    const valore = chiuso ? 0 : valoreA(meseOra);
    const totale = valore === null ? null : valore - investito + incassi + cedole;
    return {
      codice, chiuso,
      inizio: { investito, valore, cedole, incassi, totale, pct: totale !== null && investito > 0 ? totale / investito : null,
        incompleto: anni.some(a => a.incompleto) || Math.abs(qMov(fineOra) - qSerie(meseOra)) > 1e-6 },
      anni: anni.reverse(),
      cedole: mov.filter(m => REDDITI.includes(m.tipo)).map(m => ({ data: m.data, tipo: m.tipo, importo: m.importo })).reverse()
    };
  }

  // Strumenti comprati e oggi azzerati (venduti o rimborsati), dal più recente.
  function titoliChiusi(dati, serie) {
    const ultimo = (serie || [])[(serie || []).length - 1] || { q: {} };
    const ultimaData = {};
    (dati.movimenti || []).forEach(m => { if (!CODICI_FUORI.includes(m.codice) && m.codice) ultimaData[m.codice] = m.data > (ultimaData[m.codice] || '') ? m.data : ultimaData[m.codice]; });
    const comprati = new Set((dati.movimenti || []).filter(m => ENTRATE.includes(m.tipo) && !CODICI_FUORI.includes(m.codice)).map(m => m.codice));
    return [...comprati].filter(c => !((ultimo.q || {})[c] > 1e-9)).sort((a, b) => ultimaData[b].localeCompare(ultimaData[a]));
  }

  Object.assign(g, { eNominale, valorePosizione, posizioni, operazioni, indicizzaPrezzi, prezzoA, serieMensile, rendimentoTWR, sommaSerie, rendimentiPerAnno, costiPerAnno, rendimentoStrumento, titoliChiusi, CODICI_FUORI });
})(typeof window !== 'undefined' ? window : globalThis);

// Decifra i file prodotti da cifra.sh (OpenSSL enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256).
// decifra(ArrayBuffer, password) → Promise<oggetto>; rifiuta con Error('password') se la password è sbagliata.
(function (g) {
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  async function decifra(buf, password) {
    const u = new Uint8Array(buf);
    if (u.length < 32 || new TextDecoder().decode(u.slice(0, 8)) !== 'Salted__') throw new Error('file');
    const pw = new TextEncoder().encode(String(password).trim().toLowerCase());
    const base = await crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: u.slice(8, 16), iterations: 600000, hash: 'SHA-256' }, base, 384));
    const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-CBC', false, ['decrypt']);
    let chiaro;
    try { chiaro = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: bits.slice(32, 48) }, key, u.slice(16)); }
    catch (e) { throw new Error('password'); }
    const testo = new TextDecoder().decode(chiaro); const i = testo.indexOf('\n');
    if (i !== 64) throw new Error('password');
    const json = testo.slice(65);
    if (hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))) !== testo.slice(0, 64)) throw new Error('password');
    return JSON.parse(json);
  }
  g.decifra = decifra;
})(window);

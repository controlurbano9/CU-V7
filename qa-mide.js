(() => {
  const W = innerWidth, movil = W < 900;
  const escala = new Set(['13px', '15px', '17px', '22px', '30px', '40px']);
  const rgb = c => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const n = m.map(Number); if (n.length >= 3 && n.slice(0, 3).every(v => v <= 1)) { for (let i = 0; i < 3; i++) n[i] *= 255; } return n; };
  const lum = a => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]); };
  const fondo = e => { for (let p = e; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c && (c.length < 4 || c[3] > 0.5)) return c; } return [255, 255, 255]; };
  const visible = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.1; };
  const conTexto = [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && visible(e));
  const fueraEscala = {}, bajos = [];
  conTexto.forEach(e => {
    const cs = getComputedStyle(e);
    if (!escala.has(cs.fontSize)) fueraEscala[cs.fontSize] = (fueraEscala[cs.fontSize] || 0) + 1;
    const c = rgb(cs.color), b = fondo(e);
    if (c && b) { const x = lum(c), y = lum(b); const r = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); if (r < 4.5) bajos.push(e.textContent.trim().slice(0, 24) + ' ' + r.toFixed(2)); }
  });
  const dentroDeScroll = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') return true; } return false; };
  const fuera = [...document.querySelectorAll('body *')].filter(e => { if (!visible(e)) return false; const r = e.getBoundingClientRect(); return (r.right > W + 1) && getComputedStyle(e).position !== 'fixed' && !dentroDeScroll(e); }).slice(0, 5).map(e => String(e.className).slice(0, 30) || e.tagName);
  const tactiles = movil ? [...document.querySelectorAll('button, a[href], input, select, [role=button]')].filter(e => visible(e) && e.getBoundingClientRect().height < 44 && !e.closest('.tv-dir, .nv-falta, .fv-hechos')).map(e => (e.textContent.trim() || e.getAttribute('aria-label') || e.className).slice(0, 18)) : [];
  const amarillo = [...document.querySelectorAll('body *')].filter(e => visible(e) && /242, 194, 0/.test(getComputedStyle(e).backgroundColor)).map(e => String(e.className).slice(0, 26));
  return { W, desborde: document.documentElement.scrollWidth > W + 1, fuera, fueraEscala, contrasteBajo: bajos.length, ejemplosContraste: bajos.slice(0, 6), tactilesBajos: tactiles.length, ejemplosTactiles: tactiles.slice(0, 6), amarilloEn: [...new Set(amarillo)].slice(0, 8) };
})()

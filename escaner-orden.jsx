// ═══════════════════════════════════════════════════════════════
// escaner-orden.jsx — Escáner de órdenes de policía (PDF a Drive)
//
// El inspector diligencia y firma la orden de policía en papel, formato
// OFICIO (8.5 x 13 pulgadas). Aquí la fotografía página por página con la
// cámara del teléfono, cada toma se normaliza en canvas (gris + contraste,
// que es lo que vuelve legible la tinta de bolígrafo sobre papel amarillento)
// y el conjunto se arma como un PDF de páginas oficio con jsPDF.
//
// Por qué el PDF se arma en el cliente y no en Apps Script:
//   - El escaneo pasa en campo, muchas veces sin señal. Con el PDF ya
//     ensamblado, la subida se encola en IndexedDB como una foto más y sale
//     sola al recuperar conexión. Si lo armara el backend haría falta estar
//     conectado para cerrar el escaneo.
//   - Una sola llamada al webhook por orden, en vez de N subidas de página
//     más un ensamblado que dejaría JPEG huérfanos si falla a la mitad.
//
// jsPDF se carga bajo demanda (cargarJsPDF en api.js) y app.jsx lo precalienta
// tras el login, igual que turf y el SDK de Maps.
// ═══════════════════════════════════════════════════════════════

const { useState: useStateEO, useEffect: useEffectEO } = React;

// Página oficio 8.5" x 13" en milímetros — jsPDF no trae este formato
// (su 'legal' es 8.5 x 14"), así que va como [ancho, alto] explícito.
const EO_PAGINA_MM = [215.9, 330.2];

// 150 DPI sobre 8.5" de ancho. Suficiente para leer manuscrito y firmas sin
// inflar el PDF: cada página pesa ~150-250 KB en JPEG q0.75.
const EO_ANCHO_PX = 1275;

// Tope del payload. El webhook aguanta más, pero un PDF de campo que pase de
// aquí casi siempre significa demasiadas páginas o fotos sin recortar.
const EO_MAX_BASE64 = 6 * 1024 * 1024;

// Lee un File a HTMLImageElement (el navegador aplica la orientación EXIF).
function _eoLeerImagen(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

// Normaliza una toma: rota, reescala a EO_ANCHO_PX y aplica una curva dura de
// gris. Los umbrales (110 / 175) blanquean el papel y saturan la tinta; la
// zona intermedia se estira en lugar de binarizarse para no comerse los
// trazos suaves del lápiz ni el sello de la Alcaldía.
function _eoProcesar(img, rot) {
  const girado = (rot === 90 || rot === 270);
  const origW = girado ? img.height : img.width;
  const origH = girado ? img.width  : img.height;

  const ancho = Math.min(EO_ANCHO_PX, origW);   // nunca escalar hacia arriba
  const alto  = Math.round(origH * (ancho / origW));

  const cv = document.createElement('canvas');
  cv.width = ancho; cv.height = alto;
  const ctx = cv.getContext('2d');

  // Fondo blanco: si la toma no cubre todo el lienzo, el sobrante debe
  // parecer papel y no transparencia negra al pasar a JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ancho, alto);

  ctx.save();
  ctx.translate(ancho / 2, alto / 2);
  ctx.rotate(rot * Math.PI / 180);
  if (girado) ctx.drawImage(img, -alto / 2, -ancho / 2, alto, ancho);
  else        ctx.drawImage(img, -ancho / 2, -alto / 2, ancho, alto);
  ctx.restore();

  const d = ctx.getImageData(0, 0, ancho, alto);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = g <= 110 ? 0 : g >= 175 ? 255 : Math.round((g - 110) * (255 / 65));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);

  return { dataUrl: cv.toDataURL('image/jpeg', 0.75), w: ancho, h: alto };
}

function EscanerOrdenPolicia({ idCarpetaVisita, fila, orden, linkInicial, onSubido }) {
  // paginas: [{ id, file, rot, dataUrl, w, h }] — se guarda el File original
  // para que rotar reprocese desde la fuente en vez de degradar el JPEG.
  const [paginas, setPaginas]     = useStateEO([]);
  const [ocupado, setOcupado]     = useStateEO('');   // texto de estado o ''
  const [link, setLink]           = useStateEO(linkInicial || '');
  const [pendiente, setPendiente] = useStateEO(false);
  const inputRef = React.useRef(null);

  // El link puede llegar después: al reabrir una visita el efecto que carga
  // la fila desde BD corre luego del primer render.
  useEffectEO(function () {
    if (linkInicial && linkInicial !== link) { setLink(linkInicial); setPendiente(false); }
  }, [linkInicial]);

  async function alSeleccionar(e) {
    const archivos = Array.from(e.target.files || []);
    if (inputRef.current) inputRef.current.value = '';   // permite reelegir la misma foto
    if (!archivos.length) return;

    const validos = archivos.filter(function (f) { return f.size <= 12 * 1024 * 1024; });
    if (validos.length < archivos.length) {
      appAlert((archivos.length - validos.length) + ' imagen(es) superan 12MB y se descartaron.',
        { tono: 'aviso', titulo: 'Imagen muy grande' });
    }
    if (!validos.length) return;

    setOcupado('Procesando páginas...');
    const nuevas = [];
    for (const f of validos) {
      try {
        const img = await _eoLeerImagen(f);
        const p   = _eoProcesar(img, 0);
        nuevas.push({ id: 'p' + Date.now() + '_' + nuevas.length, file: f, rot: 0,
                      dataUrl: p.dataUrl, w: p.w, h: p.h });
      } catch (err) {
        console.warn('[escaner-orden] no se pudo procesar', f.name, err);
      }
    }
    setPaginas(function (prev) { return prev.concat(nuevas); });
    setOcupado('');
    if (!nuevas.length) {
      appAlert('No se pudo procesar ninguna de las imágenes seleccionadas.',
        { tono: 'error', titulo: 'Escaneo fallido' });
    }
  }

  async function rotar(idx) {
    const p = paginas[idx];
    if (!p) return;
    const rot = (p.rot + 90) % 360;
    setOcupado('Girando...');
    try {
      const img = await _eoLeerImagen(p.file);
      const r   = _eoProcesar(img, rot);
      setPaginas(function (prev) {
        return prev.map(function (x, i) {
          return i === idx ? Object.assign({}, x, { rot: rot, dataUrl: r.dataUrl, w: r.w, h: r.h }) : x;
        });
      });
    } catch (err) {
      appAlert('No se pudo girar la página: ' + err.message, { tono: 'error' });
    }
    setOcupado('');
  }

  function eliminar(idx) {
    setPaginas(function (prev) { return prev.filter(function (_, i) { return i !== idx; }); });
  }

  function mover(idx, dir) {
    const dest = idx + dir;
    setPaginas(function (prev) {
      if (dest < 0 || dest >= prev.length) return prev;
      const copia = prev.slice();
      const tmp = copia[idx]; copia[idx] = copia[dest]; copia[dest] = tmp;
      return copia;
    });
  }

  async function generarYSubir() {
    if (!paginas.length) return;
    if (!idCarpetaVisita || !fila) {
      appAlert('Guarde la visita primero: la orden se sube a la carpeta de Drive de la visita, que aún no existe.',
        { tono: 'aviso', titulo: 'Falta guardar' });
      return;
    }
    if (link) {
      const ok = await appConfirm('Ya hay una orden escaneada para esta visita. El PDF anterior se reemplaza por este. ¿Continuar?',
        { titulo: 'Reemplazar orden' });
      if (!ok) return;
    }

    try {
      setOcupado('Armando PDF...');
      const JsPDF = await cargarJsPDF();
      const doc = new JsPDF({ unit: 'mm', format: EO_PAGINA_MM, orientation: 'portrait', compress: true });
      const [ANCHO, ALTO] = EO_PAGINA_MM;

      paginas.forEach(function (p, i) {
        if (i > 0) doc.addPage(EO_PAGINA_MM, 'portrait');
        // Encajar sin deformar: la foto rara vez tiene la proporción exacta
        // del oficio, y estirarla haría ilegible la letra manuscrita.
        const escala = Math.min(ANCHO / p.w, ALTO / p.h);
        const w = p.w * escala, h = p.h * escala;
        doc.addImage(p.dataUrl, 'JPEG', (ANCHO - w) / 2, (ALTO - h) / 2, w, h, undefined, 'FAST');
      });

      const uri = doc.output('datauristring');
      const base64 = uri.slice(uri.indexOf('base64,') + 7);
      if (base64.length > EO_MAX_BASE64) {
        setOcupado('');
        appAlert('El PDF quedó demasiado pesado (' + (base64.length / 1048576).toFixed(1) +
                 ' MB). Elimine páginas repetidas o vuelva a tomar las fotos más de cerca.',
          { tono: 'error', titulo: 'PDF muy pesado' });
        return;
      }

      const nombre = 'ORDEN_POLICIA_' + String(orden || 'SN').replace(/[\/\\:*?"<>|]/g, '-') + '.pdf';
      setOcupado('Subiendo a Drive...');
      const r = await subirOrdenPolicia(idCarpetaVisita, fila, base64, nombre, orden || '');

      setOcupado('');
      if (r.encolado) {
        setPendiente(true);
        setPaginas([]);
        appAlert('Sin conexión: la orden quedó en cola y se subirá a Drive automáticamente al recuperar señal.',
          { tono: 'aviso', titulo: 'Orden en cola' });
        return;
      }
      setPendiente(false);
      setLink(r.link || '');
      setPaginas([]);
      if (typeof onSubido === 'function') onSubido(r.link || '');
      // AP8: el PDF puede haber quedado en Drive sin registrarse en BD o sin
      // permiso de lectura — eso se dice, no se oculta tras un "listo".
      if (r.avisoBD || r.aviso) {
        appAlert('La orden se subió a Drive, pero: ' + (r.avisoBD || r.aviso),
          { tono: 'aviso', titulo: 'Subida con avisos' });
      }
    } catch (err) {
      setOcupado('');
      appAlert('No se pudo subir la orden: ' + (err.message || err),
        { tono: 'error', titulo: 'Error al subir' });
    }
  }

  const bloqueado = !!ocupado;

  return (
    <div className="form-seccion" style={{ marginTop: 14 }}>
      <span className="form-seccion-titulo">Orden de policía escaneada</span>

      <div style={{ marginTop: 12 }}>
        {link && (
          <div style={{
            marginBottom: 12, padding: '10px 12px', background: 'var(--gris-bg)',
            borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon.File size={16} />
            <a href={link} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--brand-accent)', textDecoration: 'none', fontWeight: 600 }}>
              Ver orden {orden || ''} en Drive
            </a>
          </div>
        )}

        {pendiente && (
          <div style={{
            marginBottom: 12, padding: '10px 12px', background: 'var(--amarillo-bg)',
            border: '1px dashed var(--amarillo)', borderRadius: 8, fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cafe)',
          }}>
            <Icon.ArrowUp size={14} />
            Orden en cola — se sube sola al recuperar conexión.
          </div>
        )}

        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          minHeight: 'var(--tap)', padding: '14px 16px',
          border: '1px solid var(--brand)', borderRadius: 'var(--r)',
          textAlign: 'center', cursor: bloqueado ? 'wait' : 'pointer',
          background: 'var(--brand-bg)', fontSize: 14, fontWeight: 600,
          color: 'var(--brand-ink)', opacity: bloqueado ? 0.55 : 1,
        }}>
          {bloqueado ? <span className="spinner-btn" aria-hidden="true" /> : <Icon.Plus size={18} />}
          {bloqueado ? ocupado : (paginas.length ? 'Agregar otra página' : 'Escanear orden de policía')}
          {/* capture="environment" abre la cámara trasera directo, sin pasar
              por el selector de galería (que es lo que hace la sección de
              fotos, donde sí hace falta poder elegir tomas previas). */}
          <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple
            onChange={alSeleccionar} disabled={bloqueado} style={{ display: 'none' }} />
        </label>

        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--texto-suave)', textAlign: 'center' }}>
          Formato oficio (8.5 × 13"). Encuadre la hoja completa, de frente y con buena luz.
        </div>

        {paginas.length > 0 && (
          <>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-suave)' }}>
                {paginas.length} página(s) — revise antes de subir
              </div>
              {paginas.map(function (p, i) {
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    padding: 8, background: 'var(--gris-bg)', borderRadius: 8,
                  }}>
                    {/* contain, no cover: la miniatura está para revisar que
                        la hoja salió completa y derecha — recortarla al
                        centro escondería justo los bordes que hay que ver. */}
                    <img src={p.dataUrl} alt={'Página ' + (i + 1)} style={{
                      width: 46, height: 60, objectFit: 'contain',
                      borderRadius: 4, border: '1px solid var(--borde-med)', background: '#fff',
                    }} />
                    <div style={{ flex: '1 1 90px', fontSize: 12, fontWeight: 600 }}>
                      Página {i + 1}
                      <div style={{ fontWeight: 400, color: 'var(--texto-suave)', fontSize: 11 }}>
                        {p.w} × {p.h} px
                      </div>
                    </div>
                    {/* Los 4 botones de 44px no caben junto a la miniatura en
                        390px: van en su propio grupo para envolver enteros a
                        la línea de abajo en vez de partirse. */}
                    <div style={{ display: 'flex', marginLeft: 'auto' }}>
                      <button type="button" onClick={function () { mover(i, -1); }}
                        disabled={i === 0 || bloqueado} title="Subir"
                        className="btn-icono" aria-label={'Subir página ' + (i + 1)}>
                        <Icon.ChevronUp size={16} />
                      </button>
                      <button type="button" onClick={function () { mover(i, 1); }}
                        disabled={i === paginas.length - 1 || bloqueado} title="Bajar"
                        className="btn-icono" aria-label={'Bajar página ' + (i + 1)}>
                        <Icon.Chevron size={16} />
                      </button>
                      <button type="button" onClick={function () { rotar(i); }}
                        disabled={bloqueado} title="Girar 90°"
                        className="btn-icono" aria-label={'Girar página ' + (i + 1)}>
                        <Icon.Refresh size={16} />
                      </button>
                      <button type="button" onClick={function () { eliminar(i); }}
                        disabled={bloqueado} title="Eliminar"
                        className="btn-icono peligro" aria-label={'Eliminar página ' + (i + 1)}>
                        <Icon.Close size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button type="button" onClick={generarYSubir} disabled={bloqueado}
              aria-busy={bloqueado}
              className="btn-principal secundario" style={{ fontSize: 15, marginTop: 14 }}>
              {bloqueado ? ocupado : 'Generar PDF y subir a Drive'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

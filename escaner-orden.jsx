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
// Android suele mandar el PDF con type vacío o `application/octet-stream`
// según la app de escaneo, así que el nombre también cuenta.
function _eoEsPdf(f) {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
}

// Archivo → base64 pelado (sin el prefijo data:). Para el PDF que ya trae
// escaneado el inspector: no se reprocesa nada, se sube tal cual llegó.
function _eoBase64(file) {
  return new Promise(function (resolve, reject) {
    const fr = new FileReader();
    fr.onload = function () {
      const s = String(fr.result);
      resolve(s.slice(s.indexOf('base64,') + 7));
    };
    fr.onerror = function () { reject(new Error('no se pudo leer ' + file.name)); };
    fr.readAsDataURL(file);
  });
}

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

    // Un PDF ya escaneado (app de escaneo del teléfono) se sube tal cual: es
    // la ruta preferida en campo — esas apps corrigen perspectiva y sombra
    // mucho mejor que nuestra curva de gris, que no sabe de degradados.
    // Nuestro escáner por cámara sigue vivo como respaldo.
    const pdf = archivos.find(_eoEsPdf);
    if (pdf) {
      if (archivos.length > 1) {
        appAlert('Se seleccionó un PDF: se sube ese archivo y se ignora el resto. ' +
                 'Para armar el PDF desde fotos, seleccione solo imágenes.',
          { tono: 'aviso', titulo: 'Se usa el PDF' });
      }
      setOcupado('Leyendo PDF...');
      try {
        await subirBase64(await _eoBase64(pdf));
      } catch (err) {
        setOcupado('');
        appAlert('No se pudo leer el PDF: ' + (err.message || err),
          { tono: 'error', titulo: 'PDF ilegible' });
      }
      return;
    }

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

  // Único camino de subida: lo usan el PDF traído de la app de escaneo y el
  // PDF que armamos con jsPDF desde las fotos. Las guardas, el reemplazo, el
  // tope de tamaño y el encolado sin señal viven aquí una sola vez.
  async function subirBase64(base64) {
    if (!idCarpetaVisita || !fila) {
      setOcupado('');
      appAlert('Guarde la visita primero: la orden se sube a la carpeta de Drive de la visita, que aún no existe.',
        { tono: 'aviso', titulo: 'Falta guardar' });
      return;
    }
    if (link) {
      const ok = await appConfirm('Ya hay una orden escaneada para esta visita. El PDF anterior se reemplaza por este. ¿Continuar?',
        { titulo: 'Reemplazar orden' });
      if (!ok) { setOcupado(''); return; }
    }
    if (base64.length > EO_MAX_BASE64) {
      setOcupado('');
      appAlert('El PDF quedó demasiado pesado (' + (base64.length / 1048576).toFixed(1) +
               ' MB). Elimine páginas repetidas, baje la calidad en la app de escaneo ' +
               'o vuelva a tomar las fotos más de cerca.',
        { tono: 'error', titulo: 'PDF muy pesado' });
      return;
    }

    try {
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

      // Si la solicitud de vigilancia ya existe, el PDF único que se envía a
      // la policía queda desactualizado en cuanto cambia la orden: se rearma.
      // Best-effort y sin bloquear — devuelve '' si no hay solicitud todavía,
      // y entonces lo armará Admin → Vigilancia al generarla.
      armarSolicitudUnificada(fila, idCarpetaVisita);
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

  async function generarYSubir() {
    if (!paginas.length) return;

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
      await subirBase64(uri.slice(uri.indexOf('base64,') + 7));
    } catch (err) {
      setOcupado('');
      appAlert('No se pudo armar el PDF: ' + (err.message || err),
        { tono: 'error', titulo: 'Error al subir' });
    }
  }

  const bloqueado = !!ocupado;
  // Sesión de escaneo abierta: hay páginas capturadas pendientes de revisar
  // y subir. Solo entonces el slot muestra algo — el escáner no es un
  // bloque permanente colgando del renglón.
  const sesionAbierta = paginas.length > 0;

  // El componente renderiza su propio FilaEntregable: es quien conoce el
  // link, las páginas y el estado de la sesión, así que ser dueño del
  // renglón evita coordinar dos piezas (antes renglón y escáner eran
  // bloques hermanos y el escáner colgaba aparte).
  return (
    <FilaEntregable
      icono={<Icon.File size={18} />}
      nombre={'Orden de policía ' + orden}
      meta={idCarpetaVisita
        ? 'Papel firmado (oficio) — suba el PDF de su app de escaneo o tome fotos'
        : 'Requiere carpeta de Drive'}
      estadoTono={link ? 'ok' : (pendiente ? 'pend' : (idCarpetaVisita ? 'pend' : 'apagado'))}
      estadoTexto={pendiente ? 'En cola' : (link ? 'Escaneada' : 'Sin escanear')}
      procesando={bloqueado && !sesionAbierta}
      slot={(pendiente || sesionAbierta) && idCarpetaVisita ? (
        <div className="ent-slot-orden">
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

          {sesionAbierta && (<>
            <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 8 }}>
              Formato oficio (8.5 × 13"). Encuadre la hoja completa, de frente y con buena luz.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          </>)}
        </div>
      ) : undefined}
    >
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="btn-accion ent-btn">Abrir</a>
      )}
      {/* Con la orden ya escaneada, reemplazarla es la misma acción que
          regenerar un documento: mismo icono ↻ que acta, registro e informe,
          no un botón de texto aparte. Sin escanear sí es acción principal. */}
      {idCarpetaVisita && (link ? (
        <button type="button" className="btn-icono" disabled={bloqueado}
          aria-label="Reemplazar el escaneo de la orden de policía"
          aria-busy={bloqueado} title="Reemplazar escaneo"
          onClick={function () { if (inputRef.current) inputRef.current.click(); }}>
          {bloqueado
            ? <span className="spinner-btn" aria-hidden="true" />
            : <Icon.Refresh size={18} />}
        </button>
      ) : (
        <button type="button" className="btn-accion ent-btn" disabled={bloqueado}
          aria-busy={bloqueado}
          onClick={function () { if (inputRef.current) inputRef.current.click(); }}>
          {bloqueado && <span className="spinner-btn" aria-hidden="true" />}
          Escanear
        </button>
      ))}
      {/* Fuera del botón (input dentro de button es HTML inválido).
          Sin `capture`: aceptar PDF obliga a pasar por el selector del
          sistema, y ahí el inspector elige entre la cámara y el PDF que dejó
          su app de escaneo. Se pierde un toque hacia la cámara y se gana la
          ruta que de verdad usan en campo. */}
      {idCarpetaVisita && (
        <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple
          onChange={alSeleccionar} disabled={bloqueado} style={{ display: 'none' }} />
      )}
    </FilaEntregable>
  );
}

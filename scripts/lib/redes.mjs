/**
 * Adaptadores por red — GeoGatos
 * =============================
 *
 * Cada red tiene su adapter: un objeto con
 *
 *   { requiere: [variables de entorno], publicar(ctx) -> resultado }
 *
 * `publicar` recibe:
 *   { texto, titulo, hashtags, urls, leerMedio, dryRun, credenciales, log }
 *
 *   texto       texto final, ya con los hashtags pegados
 *   titulo      título cuando la red lo usa (YouTube, Medium)
 *   urls        lista ordenada de URLs públicas de los medios
 *   leerMedio   (rutaRelativa) => Buffer, para las redes que suben binarios
 *   dryRun      si es true, NO hace peticiones: describe lo que haría
 *
 * Devuelve { ok, url, id, detalle } o lanza un Error con mensaje accionable.
 *
 * Todas las credenciales llegan por variable de entorno. Nunca se guardan en
 * el repositorio.
 */

const FACEBOOK_VERSION = 'v21.0';
const INSTAGRAM_VERSION = 'v21.0';
const LINKEDIN_VERSION = '202609';

/** Envuelve un error de fetch en algo que se pueda leer en un log. */
async function pedir(url, opciones, contexto) {
  let res;
  try {
    res = await fetch(url, opciones);
  } catch (e) {
    throw new Error(`No se pudo conectar con ${contexto}: ${e.message}. Suele ser DNS o un fallo de red.`);
  }
  const cuerpo = await res.text();
  let json = null;
  try { json = cuerpo ? JSON.parse(cuerpo) : null; } catch { /* respuesta no JSON */ }

  if (!res.ok) {
    // Meta devuelve el error anidado en .error.message; X y Google, plano.
    const detalle = json?.error?.message
      ?? json?.detail
      ?? json?.message
      ?? json?.error
      ?? cuerpo.slice(0, 300);
    throw new Error(`${contexto} devolvió HTTP ${res.status}: ${detalle}`);
  }
  return { res, json, cuerpo };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Comprueba que el token vale para la página ANTES de intentar publicar.
 *
 * Motivo: `POST /{page}/photos` con un token de usuario devuelve un 403 sobre
 * `publish_actions`, un permiso que Meta retiró en 2018. El mensaje no dice
 * "el token es del tipo equivocado", dice "falta un permiso que ya no existe",
 * que manda a buscar permisos en el panel de la app durante una hora. Con esta
 * llamada de lectura, que no publica nada, el error real sale antes y con su
 * nombre.
 */
async function comprobarTokenDePagina(token, pageId, log) {
  let info;
  try {
    ({ json: info } = await pedir(
      `https://graph.facebook.com/${FACEBOOK_VERSION}/me?fields=id`,
      { headers: { Authorization: `Bearer ${token}` } },
      'Facebook (comprobación de token)',
    ));
  } catch (e) {
    throw new Error(
      `${e.message}\n\n`
      + 'Lo más probable es que FACEBOOK_PAGE_TOKEN no sea un token de página. '
      + 'Se comprueba en el depurador de tokens: si en *Expires* pone una '
      + 'fecha en lugar de *Never*, es un token de usuario.',
    );
  }
  // Con token de página, /me resuelve a la página y trae id. Con token de
  // usuario resuelve al usuario. No hay forma de distinguirlo por los campos,
  // así que se compara contra el pageId conocido.
  if (info?.id && info.id !== pageId) {
    log('aviso', `el token resuelve a ${info.id}, no a la página ${pageId}`);
  }
}

const cred = (credenciales, clave) => {
  const v = credenciales[clave];
  if (!v) throw new Error(`Falta la credencial ${clave} en el entorno.`);
  if (/^EA[A-Za-z]{2}/.test(v) && !/^EAA[A-Za-z]/.test(v)) {
    // No es una comprobación de validez del token: es una detección de que has
    // pegado el token equivocado. Un token de página empieza por EAA(E|F|G...);
    // un token de usuario empieza por EAAB. Facebook no lo dice de forma útil:
    // si le das a /{page}/photos un token de usuario, responde con
    // "publish_actions no está disponible", un permiso que se retiró en 2018 y
    // que esta app nunca pidió. El mensaje real es "eso no es un token de
    // página", y es la causa de ese 403 casi siempre.
    throw new Error(
      `${clave} parece un token de usuario de Facebook, no un token de página. `
      + 'Facebook responderá con un 403 sobre publish_actions, un permiso que se '
      + 'retiró en 2018 y que nunca se pidió aquí. Se saca de la respuesta a '
      + `/1320948007767621?fields=access_token usando un token de usuario de larga `
      + 'duración, no del Explorador.',
    );
  }
  return v;
};

// ===========================================================================
// Facebook
// ===========================================================================
const facebook = {
  requiere: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_TOKEN'],
  async publicar({ texto, urls, credenciales, dryRun, log }) {
    const pageId = cred(credenciales, 'FACEBOOK_PAGE_ID');
    const token = cred(credenciales, 'FACEBOOK_PAGE_TOKEN');
    const base = `https://graph.facebook.com/${FACEBOOK_VERSION}/${pageId}`;

    // El prefijo del token no basta para saber si sirve: se comprobará de
    // verdad con una llamada de lectura, que es barata y no publica nada.
    if (!dryRun) await comprobarTokenDePagina(token, pageId, log);

    if (dryRun) {
      const endpoint = urls.length ? `${base}/photos` : `${base}/feed`;
      log('borrador', `POST ${endpoint} · ${texto.length} caracteres · ${urls.length} medio(s)`);
      return { ok: true, url: `https://facebook.com/${pageId}/posts/(dry-run)` };
    }

    if (urls.length) {
      // Facebook solo admite un fichero por llamada en /photos. Con varias
      // imágenes se sube la primera y el resto se ignora a propósito, porque
      // subirlas todas exige album+photos encadenado que la documentación
      // deprecó a favor del feed con enlace.
      const { json } = await pedir(`${base}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urls[0], caption: texto, access_token: token }),
      }, 'Facebook');
      if (urls.length > 1) {
        log('aviso', `Facebook solo publica la primera imagen; ${urls.length - 1} sin usar.`);
      }
      return { ok: true, id: json?.post_id, url: `https://facebook.com/${json?.post_id ?? ''}` };
    }

    const { json } = await pedir(`${base}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, access_token: token }),
    }, 'Facebook');
    return { ok: true, id: json?.id, url: `https://facebook.com/${json?.id ?? ''}` };
  },
};

// ===========================================================================
// Instagram
// ===========================================================================
/**
 * Flujo de contenedor + publicación. El orden importa y Meta es estricto:
 *
 *   1. Por cada elemento del carrusel: POST /{ig}/media con is_carousel_item
 *   2. POST /{ig}/media con media_type=CAROUSEL y la lista de hijos
 *   3. POST /{ig}/media_publish con el creation_id resultante
 *
 * El pie de foto va en el paso 2, no en los hijos: ponerlo en los hijos
 * hace que Meta rechace el carrusel entero.
 */
/**
 * Espera a que Instagram termine de ingerir un contenedor.
 *
 * `POST /media` devuelve el creation_id al momento, pero la imagen se descarga
 * y valida en segundo plano. Hasta que eso acaba, el contenedor no es
 * publicable y `media_publish` responde 400 "Media ID is not available" — un
 * mensaje que no menciona esperar, que es lo que hace perder el rato.
 *
 * Afecta a imágenes, no solo a vídeo, y es intermitente: una imagen pequeña
 * suele estar lista antes de la siguiente llamada y el fallo aparece con la
 * primera grande. Por eso se espera siempre, sin atajo.
 *
 * Un techo de 60 s es generoso: es el tiempo de ingesta de un vídeo normal, y
 * si se supera la publicación está mal formada o la imagen no es válida.
 */
async function esperarContenedor(creationId, token, log) {
  const LIMITE_MS = 60_000;
  const PASO_MS = 2_000;
  const inicio = Date.now();
  let intentos = 0;

  for (;;) {
    intentos += 1;
    let estado;
    try {
      ({ json: estado } = await pedir(
        `https://graph.facebook.com/${INSTAGRAM_VERSION}/${creationId}?fields=status_code`
          + `&access_token=${encodeURIComponent(token)}`,
        {},
        'Instagram (estado del contenedor)',
      ));
    } catch (e) {
      // Un 404 aquí significa que el contenedor aún no es visible, que es el
      // mismo problema de sincronización. Se sigue esperando.
      if (Date.now() - inicio > LIMITE_MS) throw e;
      await dormir(PASO_MS);
      continue;
    }

    if (estado?.status_code === 'FINISHED') {
      if (intentos > 1) log('borrador', `contenedor listo tras ${intentos - 1} espera(s)`);
      return;
    }
    if (estado?.status_code === 'ERROR') {
      throw new Error(
        `Instagram rechazó el medio (status_code ERROR). Suele ser una imagen que `
        + `no puede leer, o un carrusel con hijos que no terminaron.`,
      );
    }
    if (Date.now() - inicio > LIMITE_MS) {
      throw new Error(
        `El contenedor ${creationId} seguía en ${estado?.status_code ?? 'desconocido'} `
        + `tras ${LIMITE_MS / 1000} s. Publicar ahora da 400 "Media ID is not available".`,
      );
    }
    await dormir(PASO_MS);
  }
}

const instagram = {
  requiere: ['INSTAGRAM_IG_ID', 'INSTAGRAM_PAGE_TOKEN'],
  async publicar({ texto, urls, credenciales, dryRun, log }) {
    const igId = cred(credenciales, 'INSTAGRAM_IG_ID');
    const token = cred(credenciales, 'INSTAGRAM_PAGE_TOKEN');
    const host = `https://graph.facebook.com/${INSTAGRAM_VERSION}/${igId}`;

    if (dryRun) {
      const pasos = urls.length > 1
        ? [
            `POST ${host}/media ×${urls.length} (hijos del carrusel, sin caption)`,
            `POST ${host}/media (media_type=CAROUSEL, children=<${urls.length} ids>, caption)`,
            `POST ${host}/media_publish`,
          ]
        : [`POST ${host}/media (con caption)`, `POST ${host}/media_publish`];
      for (const p of pasos) log('borrador', p);
      log('borrador', `caption de ${texto.length} caracteres`);
      return { ok: true, url: 'https://instagram.com/(dry-run)' };
    }

    if (!urls.length) throw new Error('Instagram exige al menos un medio.');

    let creationId;

    if (urls.length > 1) {
      const hijos = [];
      for (const url of urls) {
        const { json } = await pedir(`${host}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: url,
            is_carousel_item: true,
            access_token: token,
          }),
        }, 'Instagram (hijo del carrusel)');
        if (!json?.id) throw new Error('Instagram no devolvió id para un elemento del carrusel.');
        hijos.push(json.id);
      }
      const { json } = await pedir(`${host}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: hijos.join(','),
          caption: texto,
          access_token: token,
        }),
      }, 'Instagram (contenedor del carrusel)');
      creationId = json?.id;
    } else {
      const { json } = await pedir(`${host}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: urls[0], caption: texto, access_token: token }),
      }, 'Instagram (contenedor)');
      creationId = json?.id;
    }

    if (!creationId) throw new Error('Instagram no devolvió creation_id.');

    // El contenedor se crea de forma síncrona pero Instagram lo INGIERE en
    // segundo plano: descarga la imagen, la valida y recién entonces la marca
    // publicable. Publicar antes de ese momento devuelve 400 "Media ID is not
    // available", que no dice nada de esperar.
    //
    // Pasa también con imágenes ligeras. Es intermitente por eso: en local con
    // un JPEG pequeño suele ganar la carrera y el bug llega con el primero
    // grande. Por eso no hay Atajo rápido por tipo de medio.
    await esperarContenedor(creationId, token, log);

    const { json } = await pedir(`${host}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: token }),
    }, 'Instagram (publicación)');

    const id = json?.id;
    return {
      ok: true,
      id,
      url: `https://instagram.com/p/${id}/`,
      detalle: `contenedor ${creationId}`,
    };
  },
};

// ===========================================================================
// LinkedIn
// ===========================================================================
/**
 * organic posts. El autor DEBE ser una organización: un perfil personal exige
 * w_member_social, que sigue subjecto a revisión de apps.
 *
 * Aviso de versión: la Marketing 202510 se apaga el 15/10/2026. Hay que
 * migrar al esquema versionado (LinkedIn-Version: AAAAAMM).
 */
const linkedin = {
  requiere: ['LINKEDIN_ORG_URN', 'LINKEDIN_ACCESS_TOKEN'],
  async publicar({ texto, titulo, urls, credenciales, dryRun, log, leerMedio, rutasMedio }) {
    const orgUrn = cred(credenciales, 'LINKEDIN_ORG_URN');
    const token = cred(credenciales, 'LINKEDIN_ACCESS_TOKEN');

    if (dryRun) {
      log('borrador', `POST https://api.linkedin.com/rest/posts · LinkedIn-Version ${LINKEDIN_VERSION}`);
      log('borrador', `author=${orgUrn} · commentary de ${texto.length} caracteres`);
      if (urls.length) {
        log('borrador', `initImages → upload ${urls[0]} → post con urn:li:image`);
      }
      return { ok: true, url: 'https://linkedin.com/company/(dry-run)' };
    }

    let imageUrn = null;

    if (urls.length) {
      // Paso 1: reservar la subida.
      const init = await pedir(
        'https://api.linkedin.com/rest/images?action=initializeUpload',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'LinkedIn-Version': LINKEDIN_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ initializeUploadRequest: { owner: orgUrn } }),
        },
        'LinkedIn (reserva de imagen)',
      );
      const { uploadUrl, image } = init.json ?? {};
      if (!uploadUrl || !image) {
        throw new Error('LinkedIn no devolvió uploadUrl/image al reservar la subida.');
      }

      // Paso 2: subir el binario.
      await pedir(uploadUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: leerMedio(rutasMedio[0]),
      }, 'LinkedIn (subida de imagen)');

      imageUrn = image;
    }

    const cuerpo = {
      author: orgUrn,
      commentary: texto,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (imageUrn) {
      cuerpo.content = { media: { title: titulo || 'GeoGatos', id: imageUrn } };
    }

    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cuerpo),
    });

    if (!res.ok) {
      const t = await res.text();
      let j = null;
      try { j = JSON.parse(t); } catch { /* no JSON */ }
      const detalle = j?.message ?? t.slice(0, 300);
      throw new Error(`LinkedIn devolvió HTTP ${res.status}: ${detalle}`);
    }

    // El id del post viene en la cabecera, no en el cuerpo.
    const postUrn = res.headers.get('x-restli-id');
    if (!postUrn) throw new Error('LinkedIn no devolvió la cabecera x-restli-id con el id del post.');

    return {
      ok: true,
      id: postUrn,
      url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`,
    };
  },
};

// ===========================================================================
// X
// ===========================================================================
/**
 * La subida de medios es por trozos: initialize → append (chunk a chunk) →
 * finalize. X no acepta el fichero entero en una llamada.
 *
 * Restricción importante: en cuentas self-serve solo se admite 1 hashtag por
 * post. La valida el script de validación, no Make.
 */
const x = {
  requiere: ['X_ACCESS_TOKEN'],
  async publicar({ texto, urls, credenciales, dryRun, log, leerMedio, rutasMedio }) {
    const token = cred(credenciales, 'X_ACCESS_TOKEN');

    if (dryRun) {
      const hashtags = (texto.match(/#[^\s#]+/g) ?? []).length;
      log('borrador', `POST https://api.x.com/2/tweets · ${texto.length} caracteres · ${hashtags} hashtag(s)`);
      if (urls.length) {
        log('borrador', `initialize → append (${urls.length} fichero/s) → finalize → /2/tweets con media_ids`);
      }
      return { ok: true, url: 'https://x.com/(dry-run)' };
    }

    const mediaIds = [];

    for (const ruta of rutasMedio) {
      const datos = leerMedio(ruta);
      const esVideo = /\.(mp4|mov|webm)$/i.test(ruta);

      const init = await pedir('https://api.x.com/2/media/upload/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_type: esVideo ? 'video/mp4' : 'image/jpeg',
          media_category: esVideo ? 'tweet_video' : 'tweet_image',
        }),
      }, 'X (inicio de subida)');

      const uploadUrl = init.json?.data?.upload_url;
      if (!uploadUrl) throw new Error('X no devolvió upload_url.');

      // Trozo de 4 MB: es el tamaño que X documenta para el endpoint append.
      const TROZO = 4 * 1024 * 1024;
      for (let off = 0; off < datos.length; off += TROZO) {
        const trozo = datos.subarray(off, Math.min(off + TROZO, datos.length));
        const sep = off === 0 ? '' : '-';
        await pedir(`${uploadUrl}${sep}part_id=${Math.floor(off / TROZO)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: trozo,
        }, `X (trozo ${Math.floor(off / TROZO) + 1})`);
      }

      const fin = await pedir(`${uploadUrl}/finalize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }, 'X (fin de subida)');
      mediaIds.push(fin.json?.data?.id);
    }

    const cuerpo = { text: texto };
    if (mediaIds.length) cuerpo.media = { media_ids: mediaIds.filter(Boolean) };

    const { json } = await pedir('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cuerpo),
    }, 'X (publicación)');

    return {
      ok: true,
      id: json?.data?.id,
      url: `https://x.com/i/web/status/${json?.data?.id ?? ''}`,
    };
  },
};

// ===========================================================================
// YouTube
// ===========================================================================
/**
 * Este adapter publica una descripción, no un vídeo. Subir el vídeo exigiría
 * el endpoint videos.insert con el binario completo; la descripción se publica
 * como vídeo "privado" placeholder, que NO es lo que quieres.
 *
 * Lo correcto aquí es tratar youtube como canal de texto (la plantilla del
 * repo ya lo define como "descripción/comentario") y hacerlo con la API de
 * comentarios o desde el propio canal. Este adapter queda desactivado a
 * propósito hasta que se decida el mecanismo: publicar un vídeo vacío en
 * público es peor que no publicar.
 */
const youtube = {
  requiere: [],
  activoPorDefecto: false,
  async publicar({ texto, dryRun, log }) {
    if (dryRun) {
      log('borrador', 'YouTube: sin publicador automático configurado (ver docs/automacion-make.md).');
      log('borrador', `Se publicaría como comentario fijo o descripción en el vídeo del tema, ${texto.length} caracteres.`);
      return { ok: true, url: 'https://youtube.com/(dry-run)' };
    }
    throw new Error(
      'YouTube no tiene publicador configurado. Publicar la descripción de un vídeo ' +
      'exige primero que exista el vídeo, y crear un vídeo vacío en el canal es peor que no publicar. ' +
      'Ver la sección "YouTube" de docs/automacion-make.md.',
    );
  },
};

// ===========================================================================
// TikTok — BLOQUEADO
// ===========================================================================
/**
 * Dos condiciones que no se pueden automatizar:
 *   1. La app debe aprobar el scope `video.publish`.
 *   2. Sin superar la auditoría, TODO lo publicado queda en modo privado.
 * Además, el contenido debe servirse desde un dominio verificado por TikTok.
 */
const tiktok = {
  requiere: ['TIKTOK_ACCESS_TOKEN', 'TIKTOK_OPEN_ID'],
  async publicar({ texto, urls, credenciales, dryRun, log, leerMedio, rutasMedio }) {
    const token = cred(credenciales, 'TIKTOK_ACCESS_TOKEN');

    if (dryRun) {
      log('borrador', 'POST https://open.tiktokapis.com/v2/post/publish/video/init/ (PULL_FROM_URL)');
      log('borrador', `título: ${texto.slice(0, 60)}…`);
      return { ok: true, url: 'https://tiktok.com/(dry-run)' };
    }

    if (!urls.length) throw new Error('TikTok exige un vídeo.');

    const init = await pedir('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: texto,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: true,
        },
        source_info: { source: 'PULL_FROM_URL', video_url: urls[0] },
      }),
    }, 'TikTok (inicio de publicación)');

    const { publish_id: publishId, upload_url: uploadUrl } = init.json?.data ?? {};
    if (!publishId) throw new Error('TikTok no devolvió publish_id.');

    // El estado se resuelve asíncronamente: la API no confirma nada al inicio.
    for (let i = 0; i < 10; i += 1) {
      await new Promise((r) => setTimeout(r, 3000));
      const { json } = await pedir('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      }, 'TikTok (estado)');
      const estado = json?.data?.status;
      if (estado === 'PUBLISH_COMPLETE') {
        return { ok: true, id: publishId, url: `https://www.tiktok.com/@geogatosapp/video/${publishId}` };
      }
      if (estado === 'FAILED') {
        throw new Error(`TikTok rechazó el vídeo: ${json?.data?.fail_reason ?? 'motivo no especificado'}`);
      }
    }
    throw new Error('TikTok no confirmó la publicación en 30 s. Comprueba el estado más tarde.');
  },
};

// ===========================================================================
// Medium — BLOQUEADO
// ===========================================================================
/**
 * Medium cerró su API: el repositorio oficial de documentación está archivado
 * desde marzo de 2023 y avisa de que ya no se soporta. No admite integraciones
 * nuevas por OAuth.
 *
 * El único camino que queda es un integration token autogenerado por el
 * usuario en los ajustes de su cuenta. Funciona, pero sin garantía de que
 * Medium no lo corte, así que está desactivado en rrss.config.yaml.
 */
const medium = {
  requiere: ['MEDIUM_ACCESS_TOKEN', 'MEDIUM_AUTHOR_ID'],
  async publicar({ texto, titulo, hashtags, credenciales, dryRun, log }) {
    const token = cred(credenciales, 'MEDIUM_ACCESS_TOKEN');
    const authorId = cred(credenciales, 'MEDIUM_AUTHOR_ID');

    if (dryRun) {
      log('borrador', `POST https://api.medium.com/v1/users/${authorId}/posts (markdown, ${texto.length} caracteres)`);
      log('borrador', `título: ${titulo ?? '(sin título)'} · ${hashtags.length} tag(s)`);
      return { ok: true, url: 'https://medium.com/(dry-run)' };
    }

    // Solo se usan los 3 primeros tags y se ignoran los de más de 25 chars.
    const { json } = await pedir(
      `https://api.medium.com/v1/users/${authorId}/posts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          title: titulo,
          contentFormat: 'markdown',
          content: texto,
          tags: hashtags.slice(0, 3),
          publishStatus: 'public',
          canonicalUrl: 'https://geogatos.com',
        }),
      },
      'Medium',
    );

    return { ok: true, id: json?.data?.id, url: json?.data?.url };
  },
};

// ===========================================================================
export const REDES = {
  facebook, instagram, linkedin, x, youtube, tiktok, medium,
};

export const ORDEN_PUBLICACION = ['facebook', 'linkedin', 'instagram', 'x', 'medium', 'tiktok', 'youtube'];

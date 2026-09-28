/**
 * Lectura del formato y las dimensiones de un fichero de imagen — GeoGatos
 * ========================================================================
 *
 * Existe por dos motivos concretos, no por gusto de validar de más:
 *
 *  1. Instagram solo acepta JPEG. Un PNG colocado en la posición 1 de la
 *     bandeja acaba en `instagram-01.jpg`, el contenedor se crea bien y la
 *     publicación revienta después, sin mensaje útil. Renombrar no convierte.
 *
 *  2. En un carrusel, Instagram **recorta todas las imágenes al formato de la
 *     primera**. Si la 1ª es vertical y las otras horizontales, dos de las
 *     tres salen recortadas. Detectar el desajuste *antes* de publicar es la
 *     diferencia entre un aviso y un post hecho polvo.
 *
 * Todo es lectura de cabeceras: no hay decodificador ni dependencia. Solo se
 * leen los bytes del principio del fichero, así que funciona con cualquier
 * JPEG por grande que sea.
 */

const MARCADORES_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

const MAGICO_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAGICO_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const MAGICO_FTYP = [0x66, 0x74, 0x79, 0x70]; // "ftyp" -> HEIC/HEIF
const MAGICO_GIF = [0x47, 0x49, 0x46, 0x38]; // "GIF8"

function empiezaCon(buf, bytes) {
  return empiezaEn(buf, bytes, 0);
}

function empiezaEn(buf, bytes, offset) {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
}

/**
 * Dimensions de un JPEG, parseando los marcadores hasta el primero de tipo SOF
 * (Start Of Frame), que es donde van la altura y el ancho.
 *
 * Devuelve `null` si no parece un JPEG o si llega al final sin encontrarlo,
 * que es lo que pasa con un fichero corrupto o truncado.
 */
export function leerDimensionesJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let i = 2;
  while (i + 3 < buf.length) {
    // Cada marcador empieza por 0xFF. Puede haber bytes de relleno (0xFF 0xFF).
    if (buf[i] !== 0xff) { i++; continue; }
    if (buf[i + 1] === 0xff) { i++; continue; }

    const marcador = buf[i + 1];

    // Marcadores sin longitud: SOI, TEM y los RSTn de reinicio de Entropía.
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; }
    if (marcador === 0xd8) { i += 2; continue; }
    if (marcador === 0xd9) return null; // EOI antes del SOF: no hay imagen

    if (i + 3 >= buf.length) return null;
    const largo = buf.readUInt16BE(i + 2);
    // Un largo imposible significa fichero corrupto. Cortar aquí evita el
    // bucle infinito, que es el fallo clásico de estos parsers.
    if (largo < 2) return null;

    if (MARCADORES_SOF.has(marcador)) {
      if (i + 8 >= buf.length) return null;
      return {
        ancho: buf.readUInt16BE(i + 7),
        alto: buf.readUInt16BE(i + 5),
      };
    }

    i += 2 + largo;
  }
  return null;
}

/** Dimensions de un PNG: van fijas en el chunk IHDR. */
export function leerDimensionesPng(buf) {
  if (buf.length < 24 || !empiezaCon(buf, MAGICO_PNG)) return null;
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
}

/**
 * Identifica el formato real de un fichero **por sus bytes**, no por su
 * extensión. Es la diferencia entre "se llama .jpg" y "es un JPEG": un
 * `screenshot.png` renombrado a `.jpg` pasa la validación por extensión y
 * revienta en Instagram.
 *
 * @returns {{formato: string, ancho: number|null, alto: number|null}}
 */
export function inspeccionarImagen(buf) {
  if (empiezaCon(buf, [0xff, 0xd8, 0xff])) {
    const d = leerDimensionesJpeg(buf);
    return { formato: 'jpeg', ancho: d?.ancho ?? null, alto: d?.alto ?? null };
  }
  if (empiezaCon(buf, MAGICO_PNG)) {
    const d = leerDimensionesPng(buf);
    return { formato: 'png', ancho: d?.ancho ?? null, alto: d?.alto ?? null };
  }
  if (empiezaCon(buf, MAGICO_RIFF) && buf.toString('latin1', 8, 12) === 'WEBP') {
    return { formato: 'webp', ancho: null, alto: null };
  }
  if (empiezaCon(buf, MAGICO_GIF)) {
    return { formato: 'gif', ancho: null, alto: null };
  }
  // HEIC/HEIF. El "ftyp" va en el byte 4, no en el 0: los cuatro primeros son
  // el tamaño del caja. Instagram lo acepta, pero no es un JPEG, así que no
  // entra en la bandeja de entrada sin exportarse antes.
  if (empiezaEn(buf, MAGICO_FTYP, 4)) {
    return { formato: 'heic', ancho: null, alto: null };
  }
  return { formato: 'desconocido', ancho: null, alto: null };
}

/** Formatos que Instagram acepta en la Graph API. */
export const FORMATOS_Instagram = ['jpeg'];

/** Redondea la proporción a 2 decimales, para comparar y avisar. */
export function proporcion(ancho, alto) {
  if (!ancho || !alto) return null;
  return Math.round((ancho / alto) * 100) / 100;
}

/**
 * ¿Las dos imágenes tienen una proporción compatible?
 *
 * Instagram no recorta al azar: recorta al centro manteniendo el formato de la
 * primera. Dos fotos de 4:5 y 16:9 pierden ~(1/1.78)/(1/1.25) de la segunda.
 * El umbral del 4 % tolera la diferencia entre dos recortes de la misma foto
 * sin dar un falso positivo.
 */
export function proporcionesCompatibles(aAncho, aAlto, bAncho, bAlto, tolerancia = 0.04) {
  const pa = proporcion(aAncho, aAlto);
  const pb = proporcion(bAncho, bAlto);
  if (pa === null || pb === null) return true; // sin datos, no se inventa un problema
  return Math.abs(pa - pb) / pa <= tolerancia;
}

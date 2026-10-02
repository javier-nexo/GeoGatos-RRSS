# Instrucciones para agentes

## Reglas de Git

- No hacer `commit` ni `push` de ningún cambio sin que el usuario lo solicite explícitamente.
- Actualizar los archivos README.md y  AGENTS.md si es necesario.

## Formato de las publicaciones

Cada publicación existe en dos formatos, y no son intercambiables:

- Los `.md` de cada red (`facebook/`, `instagram/`, …) son para **leerse**.
  Admiten notas, ideas de assets y contexto. Se editan a mano sin miedo.
- El `.yaml` de `manifiestos/<slug>.yaml` es el **contrato que consume el runner**.
  Es lo único que se publica.

Al generar una publicación hay que escribir **las dos cosas**. Si generas solo
los `.md`, el día no se publica; si generas solo el `.yaml`, nadie lo revisa.

### Medium es la excepción: cada artículo lleva su `-limpio.md`

Medium está en `standby` porque su API está sin soporte, así que **el runner
nunca lo publica**: el usuario copia el artículo a mano en medium.com. Por eso
en `medium/` cada artículo vive en su **propia carpeta**, con dos archivos:

```
medium/AAAA-MM-DD-tema/
├── AAAA-MM-DD-tema.md        <- original editable: notas, assets, fuentes, negritas
└── AAAA-MM-DD-tema-limpio.md <- limpio, para Supabase (módulo de Educación)
```

Si creas un artículo de Medium, escribe **los dos**, no solo el `.md`. El
`-limpio.md` se deriva del `.md`: sin notas, sin metadatos, sin secciones de
Assets/Tags/Notas. Solo lleva el título, el subtítulo y el contenido en
markdown limpio, listo para copiar y pegar en la base de datos de Supabase.
El `-limpio.md` no se edita a mano: si cambia el `.md`, se regenera.

## Manifiestos

- Copia `manifiestos/_plantilla.yaml` como punto de partida; no escribas el
  YAML de memoria, la plantilla lleva los comentarios que explican cada campo.
- `slug` = `AAAA-MM-DD-slug-del-tema`. Debe coincidir con el nombre del
  fichero, con la carpeta de `medios/` y empezar por la fecha.
- El texto del manifiesto va **sin hashtags**: van en el array `hashtags`. El
  publicador los concatena. Si los pones en `texto` y en el array, salen
  duplicados.
- Escribe contenido de las **siete** redes, incluidas las que están en standby.
- No pongas `activo: false` por una red que no se publica *todavía*: eso se
  gestiona con `standby` en `rrss.config.yaml`, que es una palanca global.
  `activo: false` es para redes que salen del plan.
- `estado` empieza siempre en `borrador`. **Nunca lo pongas en `listo`**: eso
  dispara la publicación de verdad al hacer push. Lo cambia el usuario cuando
  ha revisado los textos y ha subido los medios.
- Declara los medios de todas las redes aunque hoy no se publiquen, pero no
  insistas al usuario con que los suba: los de las redes en standby son
  opcionales y el validador lo respeta.

## La rutina de una publicación

El usuario no prepara los ficheros de medios a mano. El flujo es:

1. **El usuario** suelta sus `.jpg` en `entrada/`, sin renombrar, en el orden
   que quiera. Esa carpeta está en `.gitignore`.
2. **El agente** elige el tema del banco de temas, escribe los `.md` de las
   siete redes, crea el manifiesto y corre:

   ```bash
   node scripts/preparar-medios.mjs --slug=<slug>           # copia y vacía lo copiado
   node scripts/preparar-medios.mjs --slug=<slug> --simular # solo enseña el reparto
   node scripts/preparar-medios.mjs --listar                # qué hay en la bandeja
   node scripts/preparar-medios.mjs --vaciar-entrada        # vacía la bandeja entera
   ```

   Tras copiar, el script borra de `entrada/` las imágenes consumidas. No es
   opcional: el reparto es posicional y ordenado por fecha, así que una imagen
   de la publicación anterior que se queda en la bandeja ocupa el primer hueco
   de la siguiente. Las sobrantes no se tocan salvo con `--vaciar-entrada`,
   porque pueden ser las de la publicación siguiente.

3. **El agente le enseña la tabla de reparto** y avisa de lo que detecte.
4. **El usuario** revisa, pone `estado: listo` y hace push. El runner publica.

### Generar -limpio.md e importar a la app (módulo de Educación)

Para que un artículo de Medium aparezca en el módulo de Educación de la app,
primero genera el `-limpio.md` y luego impórtalo:

```bash
# 1. Generar el -limpio.md a partir del .md original
node scripts/generar-limpio.mjs --slug=<slug>

# 2. Importar a la app (local)
node scripts/importar-articulo.mjs --slug=<slug>
```

**`generar-limpio.mjs`:**
- Lee el `.md` original de la carpeta del artículo
- Extrae título, subtítulo y contenido
- Genera el `-limpio.md` sin notas, metadatos, assets ni tags

**`importar-articulo.mjs`:**
- Lee el `-limpio.md` de la carpeta del artículo
- Extrae título, subtítulo y contenido
- Llama a `POST /api/v1/article` con un token JWT de Admin
- Actualiza el manifiesto con el `articulo_id` creado

**Requisitos (local):**
- Variable de entorno `GEOGATOS_ADMIN_TOKEN` con un token JWT de Admin
- Variable de entorno `GEOGATOS_API_URL` (opcional, default: `https://geogatos.onrender.com/api/v1`)

**Automatización con GitHub Actions:**

El repo incluye un workflow (`.github/workflows/importar-articulos.yml`) que
importa automáticamente el artículo cuando se hace push de un `-limpio.md`.
Para usarlo:

1. Ve a **Settings → Secrets and variables → Actions** en GitHub
2. Crea los secrets:
   - `GEOGATOS_ADMIN_TOKEN` — tu token JWT de Admin
   - `GEOGATOS_API_URL` — `https://geogatos.onrender.com/api/v1`
3. Al hacer push de un `-limpio.md`, el workflow lo importa automáticamente

También puedes importar manualmente desde la pestaña **Actions** →
**Importar artículos a la app** → **Run workflow** (introduciendo el slug).

### El reparto de imágenes es posicional, y lo decidió el usuario

La imagen *n* de la bandeja va al hueco *n* de la lista `medios` de cada red:

| Imagen subida | Ficheros donde acaba |
|---|---|
| 1ª | `facebook-01.jpg` e `instagram-01.jpg` |
| 2ª | `instagram-02.jpg` |
| 3ª | `instagram-03.jpg` |

Que la misma foto sirva para varias redes es **lo que se quiere**, no un
fallo: no avises de ello. El orden de subida es el de fecha de modificación.

Las redes en standby no se preparan salvo que se pase `--incluir-standby`.

## Estado de las redes

A 2026-09-28 se publica en **Facebook e Instagram**. Las otras cinco -X,
LinkedIn, YouTube, TikTok y Medium- están **en standby**: se les escribe el
contenido y se valida
igual, pero el runner no publica ahí. Los motivos están en `rrss.config.yaml`.

Para activar una red, quita su línea `standby`. No toques los manifiestos.

## Publicación automática

Quien publica es un workflow de GitHub Actions
(`.github/workflows/publicar.yml`). Los detalles están en
`docs/publicacion-automatica.md`.

Lo que el agente tiene que saber:

- **El push es el disparador.** El workflow solo publica manifiestos en
  `estado: listo`. Cualquier otro push no hace nada.
- **Un manifiesto a medias queda en `estado: error`**, nunca en `publicado`, y
  no se reintenta solo. Volver a `listo` es del usuario.
- **`registro/publicaciones.jsonl` se versiona a propósito.** `publicar.mjs` lo
  lee antes de publicar y no repite una red que ya consta. No lo añadas a
  `.gitignore` ni lo limpies: es lo único que evita duplicados cuando una
  publicación falla a medias.
- **No hay reintentos automáticos ni los pongas.** Publicar es irreversible.

## Antes de dar cualquier cosa por terminada

```bash
node scripts/verificar-prosa.mjs
node scripts/validar-manifiesto.mjs --todos
node --test scripts/validar-manifiesto.test.mjs scripts/preparar-medios.test.mjs scripts/verificar-prosa.test.mjs
node scripts/publicar.mjs --slug=<slug> --dry-run
```

### `verificar-prosa.mjs`: pásalo antes de escribir el manifiesto

Redactar castellano largo mete cosas raras dentro sin que se note. Lo que más
ha pasado en este repo: una palabra con el alfabeto cirílico en mitad de una
palanca castellana (`es` + cirílico + `anta`, en medio de una frase), y
caracteres CJK como si fueran letras. Pasa desapercibido al releer en un visor
UTF-8 y sale publicado.

```bash
node scripts/verificar-prosa.mjs                    # todo el contenido
node scripts/verificar-prosa.mjs --archivo=<ruta>   # un fichero
node scripts/verificar-prosa.mjs --todo             # más README y AGENTS.md
```

No es un corrector: marca lo sospechoso y devuelve 1. Deja pasar los hashtags,
las siglas, las URLs, los identificadores de fichero y los bloques de código, a
propósito, porque si no saltaría con todo y nadie lo miraría. **No barra
`scripts/`**: ahí el inglés es el idioma del código, y hay que mirar los
comentarios a mano.

El validador es la barrera que evita que salga un post malo. El `--dry-run` es
la única forma de comprobar el pipeline sin gastar una publicación real. Si un
cambio en `scripts/lib/` altera lo que se publica, hay que actualizar también
los tests: un validador que pasa de más es peor que no tener validador.

Si tocas `.github/workflows/publicar.yml`, extráelo a un `.sh` y pásalo por
`bash -n`, y simula el bucle con manifiestos de prueba. La lógica de "qué pasa
cuando algo falla a medias" no se ve leyendo el YAML, y un error ahí sale como
un post duplicado en tu perfil.

## Datos y hechos

- Los hechos de producto salen de `docs/sobre-geogatos.md`, sección 7.
- No inventes cifras. Si un dato no está verificado en la documentación,
  márcalo como estimación o búscalo antes de escribirlo.
- La documentación de cada red cambia. Si un contenido depende de un límite de
  API (longitudes, formatos, número de hashtags), ese límite vive en
  `rrss.config.yaml`, no en el texto del manifiesto ni hardcodeado en los
  scripts.

## Redes con bloqueos conocidos

No prometas publicación automática en estas sin comprobar el estado actual:

- **TikTok**: requiere aprobación del scope `video.publish` y auditoría de la
  app; sin eso, todo se publica en modo privado.
- **Medium**: su API está sin soporte oficial desde 2023.
- **YouTube**: no hay publicador automático; ver `docs/publicacion-automatica.md`.
- **Instagram**: exige cuenta profesional y solo acepta JPEG.
- **X**: en cuentas self-serve, un solo hashtag por post vía API.

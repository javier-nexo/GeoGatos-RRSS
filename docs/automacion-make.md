# Automatización de publicaciones con Make

Cómo se encadena OpenCode → medios → Make para publicar en todas las redes.

> Última revisión: septiembre de 2026. Los límites de cada API cambian sin
> previo aviso; si algo falla de golpe, empieza por la tabla de la sección 7.

---

## 1. El flujo

```
  1. TÚ pides la publicación        "prepara la del 2026-10-05, tema 2.8"
              │
  2. OPENCODE genera               7 ficheros .md legibles
              │                    + 1 manifiesto .yaml (el contrato)
              ▼
  3. TÜ validas y subes medios     npm run validar
              │                    + drop de imágenes/vídeos en medios/<slug>/
              ▼
  4. TÚ cambias a `listo` y haces push
              │
  5. MAKE lee el manifiesto y publica en cada red activa
              │
  6. MAKE deja constancia           registro/publicaciones.jsonl
                                   + estado → `publicado`
```

El punto clave: **el manifiesto es el contrato**. OpenCode no publica, Make no
interpreta. El manifiesto dice qué texto va en cada red y qué fichero va con
él, y ambos programas leen exactamente el mismo fichero.

### Por qué un manifiesto y no los .md directamente

Los `.md` de cada carpeta están escritos para leerlos: tienen secciones de
"Assets pendientes", "Notas / contexto" y "Hashtags propuestos" que son
información para humanos, no texto publicable. Pedirle a Make que los
interprete sería frágil: en cuanto cambiara el formato de una plantilla, el
pipeline publicaría notas internas o perdería hashtags.

El manifiesto no admite ambigüedad: cada red tiene su texto final, su lista
ordenada de hashtags y su lista ordenada de medios. Si algo falta, el
validador lo dice antes de publicar nada.

---

## 2. Alojamiento de medios

Instagram y TikTok **descargan el fichero desde una URL pública**. No aceptan
un binario desde tu disco. Por eso los medios tienen que servirse por HTTPS
desde algún sitio.

Además, TikTok exige que ese host tenga un **dominio verificado**: no sirve
`raw.githubusercontent.com` porque no es tuyo. Sí sirve `tu-usuario.github.io`,
que sí es tuyo.

### Decisión tomada: este repo, público, sirviendo desde `/root`

El repo `javier-nexo/GeoGatos-RRSS` es **público** y GitHub Pages sirve la
raíz del repositorio. `rrss.config.yaml` queda así:

```yaml
medios:
  base_url: "https://javier-nexo.github.io/GeoGatos-RRSS/medios"
```

**Configuración en GitHub** (Settings → Pages → Build and deployment):

| Campo | Valor |
|---|---|
| Source | Deploy from a branch |
| Branch | `main` |
| Folder | **`/ (root)`** |

> `/medios` no aparece en el desplegable, y no es que falte el push. GitHub
> Pages con "Deploy from a branch" **solo admite `/` (root) o `/docs`**:
> cualquier otra carpeta no es una opción de la interfaz. Como se publica la
> raíz, las URLs conservan la carpeta `/medios` dentro del dominio.

El mapping resultante, verificado:

| Fichero en el repo | URL pública |
|---|---|
| `medios/<slug>/instagram-01.jpg` | `https://javier-nexo.github.io/GeoGatos-RRSS/medios/<slug>/instagram-01.jpg` |

Que es exactamente lo que compone `base_url`. Puedes comprobarlo en cualquier
momento:

```bash
curl -I https://javier-nexo.github.io/GeoGatos-RRSS/medios/<slug>/<fichero>
```

Tarda unos minutos en la primera compilación tras cada push.

### Imprescindible: el fichero vacío `.nojekyll`

En la raíz del repositorio hay un fichero de 0 bytes llamado `.nojekyll`. **No
lo borres y no lo confundas con un resto.**

Sin él, GitHub Pages pasa los ficheros por **Jekyll**, que está pensado para
sitios web, no para servir binarios. Jekyll excluye del sitio todo fichero o
carpeta que empiece por `_` o `.`, y transforma los `.md` en `.html`.

Meta no se limita a que la URL responda: **Instagram descarga el fichero y
comprueba su `content-type`**. Si Jekyll se come un `.jpg` o lo sirve como
otra cosa, la publicación falla en el último paso, cuando ya no puedes
corregirla desde el panel, y el error que devuelve Meta no menciona a Jekyll.
`.nojekyll` desactiva Jekyll y GitHub sirve los ficheros tal cual.

Al verificar una URL, mira los dos campos, no solo el `200`:

| Campo | Tiene que ser |
|---|---|
| `HTTP` | `200` |
| `content-type` | `image/jpeg` · `video/mp4` para TikTok |

### Consecuencia: con `/root` se sirve todo el repo

Al publicar desde la raíz, GitHub Pages sirve **todos** los ficheros versionados,
no solo `medios/`. Eso incluye `manifiestos/`, los `.md` de cada red,
`rrss.config.yaml` y el código de `scripts/`.

Como el repo ya es público, esto **no expone nada nuevo**: todo eso ya está
visible en github.com. Pero hay una regla que conviene tener presente:

> Nunca escribas una credencial en un fichero del repositorio. Cualquier cosa
> committeada acaba servido por `github.io`. Las credenciales van siempre por
> variable de entorno en Make.

`node_modules/` y `registro/` están en `.gitignore`, así que no se sirven.

### Alternativa si algún día cambia

Un repositorio público solo de medios (`GeoGatos-Media`, Pages desde la raíz)
y este repo privado. Solo habría que cambiar `medios.base_url`. El resto del
pipeline no se entera.

---

## 3. El escenario de Make

El escenario tiene **6 módulos, no 40**. Toda la lógica está en
`scripts/publicar.mjs`, que se puede probar en local sin tocar ninguna cuenta.

Esto es deliberado. El plan gratuito da 1.000 operaciones al mes. Un escenario
con un módulo por red y uno por cada paso de subida de medios se gasta el
presupuesto en unas pocas publicaciones; este consume unas 8 por publicación.

### Módulo 1 — GitHub: Watch files

| Campo | Valor |
|---|---|
| Connection | tu cuenta de GitHub (token con `repo`) |
| Repository | `javier-nexo/GeoGatos-RRSS` |
| Watch files | `manifiestos` |
| Trigger on | *Create* y *Update* |
| Entry | `manifiestos/` |

> Alternativa si prefieres no instalar la app de Make en GitHub: usa
> **Webhooks → Custom webhook** y configúralo en
> *Settings → Webhooks* del repo con event type *Just the push event*.
> La URL la genera Make.

### Módulo 2 — GitHub: Make a request

Pide el listado de la carpeta de manifiestos.

```
GET  https://api.github.com/repos/javier-nexo/GeoGatos-RRSS/contents/manifiestos
Headers: Authorization: Bearer <GITHUB_TOKEN>
         Accept: application/vnd.github+json
```

Mapea `message` en el campo **Name**.

### Módulo 3 — Iterator

Un icono por cada fichero cuyo nombre acabe en `.yaml` o `.yml`.
Descarta los que empiezan por `_` (la plantilla).

### Módulo 4 — GitHub: Make a request

Descarga el manifiesto.

```
GET  https://api.github.com/repos/javier-nexo/GeoGatos-RRSS/contents/manifiestos/<name>
Headers: Authorization: Bearer <GITHUB_TOKEN>
```

El contenido viene en Base64: hay que decodificarlo. Usa el módulo
**Tools → Transform → Base64 decode**.

Después, un **Filter** para dejar pasar solo los que contengan
`estado: "listo"`. Este filtro es el que evita que un push cualquiera dispare
publicaciones.

### Módulo 5 — Tools: Run a script

```
cd /home/runner/GeoGatos-RRSS
git pull --ff-only origin main
npm ci --omit=dev
node scripts/publicar.mjs --slug=<slug> --json
```

- **Command**: el comando o script a ejecutar.
- **Working directory**: la ruta del repo.
- **Captura de salida**: activa *stdout* para leer el JSON.

Extrae `slug` del nombre del fichero en el módulo 4.

Si el runner de Make no tiene el repo clonado, en el módulo 1 añade antes un
**GitHub → Clone repository**, o deja el clonado en el paso anterior.

> ¿Por qué `--json`? Make necesita saber si salió bien. Sin `--json` el
> código de salida ya sirve, pero el detalle por red no.

### Módulo 6 — GitHub: Update a file

Escribe el resultado de vuelta, para que nadie vuelva a publicar lo mismo.

```
PUT  https://api.github.com/repos/javier-nexo/GeoGatos-RRSS/contents/manifiestos/<slug>.yaml
```

Cambia `estado: "listo"` por `estado: "publicado"` y añade la fecha.

Está condicionado por `salida.escribir_estado_en_repo` de `rrss.config.yaml`.
**Es la única protección frente a publicar dos veces**: Make se apoya en el
estado, no en su propia memoria. Si este módulo falla, la siguiente ejecución
reintentará la publicación.

### Ajustes de la escenario

- **Ejecución secuencial**, no en paralelo. Dos pushes seguidos no deben
  publicar dos veces el mismo manifiesto.
- **Programación**: desactivada. Publicar se dispara con el push, no a una hora.
- **Reintentos**: 1, con espera de 5 minutos. Publicar es irreversible: un
  reintento automático puede duplicar un post que sí llegó a publicarse y cuya
  respuesta se perdió.

### Consumo estimado

| Módulo | Operaciones |
|---|---|
| Watch files + listado + descarga + decode | 4 |
| Filter | 0 |
| Run a script | 1 (o 2 si falla y reintenta) |
| Update a file | 2 |
| **Total por publicación** | **≈ 8** |

Con 1.000 operaciones al mes tienes margen para más de cien publicaciones.

---

## 4. Preparar el repositorio en el runner de Make

Una sola vez, antes de la primera ejecución:

```bash
git clone https://github.com/javier-nexo/GeoGatos-RRSS.git
cd GeoGatos-RRSS
npm ci
```

El runner de Make es efímero en algunos planes. Si el repo no está ahí, el
módulo 5 falla. En ese caso, clona dentro del propio comando:

```
bash -lc "cd /tmp && rm -rf GeoGatos-RRSS && git clone --depth 1 https://x-access-token:$GITHUB_TOKEN@github.com/javier-nexo/GeoGatos-RRSS.git && cd GeoGatos-RRSS && npm ci --omit=dev && node scripts/publicar.mjs --slug=$SLUG --json"
```

---

## 5. Credenciales: qué pedir en cada red

Se inyectan como variables de entorno en Make (**Connections** o el propio
módulo). **Nunca en el repositorio.**

### Facebook — `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN`

1. [developers.facebook.com](https://developers.facebook.com) → crear app tipo *Business*.
2. Añadir el producto **Facebook Login for Business**.
3. Permisos: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
4. Revisión de la app: Meta la revisa en días. Sin ella, el token no sirve.
5. Obtener el token de la **página** (no del usuario) y su ID numérico.

### Instagram — `INSTAGRAM_IG_ID`, `INSTAGRAM_PAGE_TOKEN`

1. La cuenta de `@geogatosapp` debe ser **profesional**: Business o Creator.
   Una cuenta personal **no** puede publicar por API. Este es el requisito que
   más gente pasa por alto.
2. Conectar el Instagram a una **página de Facebook** en
   *Configuración de la cuenta profesional*.
3. Permisos: `instagram_basic`, `instagram_content_publish`,
   `pages_read_engagement`, `pages_manage_posts`.
4. Nivel de acceso: **Standard o Advanced**, ambos requieren revisión de Meta.
5. `INSTAGRAM_IG_ID` es el ID numérico de la cuenta de Instagram, no el usuario.

> Límites: 50-100 publicaciones por cuenta en 24 h. Solo JPEG. Las imágenes
> deben estar en URL pública. En carrusel, **todas se recortan al formato de la
> primera**.

### LinkedIn — `LINKEDIN_ORG_URN`, `LINKEDIN_ACCESS_TOKEN`

1. Crear la **página de empresa** en LinkedIn. El perfil personal no sirve:
   `w_member_social` sigue sujeto a revisión de apps, mientras que
   `w_organization_social` está pensado para exactamente este caso.
2. Ser **administrador** de esa página.
3. En [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps),
   añadir el producto **Share on LinkedIn** y el scope `w_organization_social`.
4. Pedir el token con el flujo OAuth de 3 patas.
5. `LINKEDIN_ORG_URN` con formato `urn:li:organization:12345678`.
6. **Usa la cabecera `LinkedIn-Version: 202609`.** La Marketing 202510 se apaga
   el 15/10/2026.

### X — `X_ACCESS_TOKEN`

1. Cuenta de desarrollador aprobada en [developer.x.com](https://developer.x.com).
2. Crear un proyecto y una app con permiso **Read and write**.
3. Token de **usuario** por OAuth 2.0 PKCE.
4. **Límite importante:** en cuentas self-serve, los posts creados por API
   admiten **un solo hashtag**. El plan Enterprise permite más. Con self-serve,
   la plantilla de X debe llevar un único hashtag.

### YouTube

**No hay publicador automático configurado, a propósito.** La plantilla del
repo define este canal como "descripción/comentario": publicar por API exigiría
primero que exista el vídeo, y crear un vídeo vacío en el canal es peor que no
publicar. Ver la sección 6.

### TikTok — bloqueado

1. Registrar app en [developers.tiktok.com](https://developers.tiktok.com).
2. Añadir el producto **Content Posting API** y habilitar **Direct Post**.
3. Solicitar el scope `video.publish` y esperar la aprobación.
4. **Sin superar la auditoría, todo lo publicado queda en modo privado.**
5. Verificar tu dominio (`javier-nexo.github.io`) en *URL prefix*.

Hasta que 1-4 estén hechos, `tiktok.activo: false` en `rrss.config.yaml`.

### Medium — bloqueado

Medium cerró su API. El repositorio oficial de documentación está **archivado
desde marzo de 2023** y advierte que ya no se soporta; no admite integraciones
nuevas por OAuth. El único camino que queda es un *integration token*
autogenerado en los ajustes de la cuenta, que funciona pero sin garantía.

`medium.activo: false` hasta que decidas asumir ese riesgo.

---

## 6. YouTube: qué hacer

La plantilla de `Plantillas/plantilla-youtube.md` define el canal como
"descripción o comentario". Ninguna de las dos encaja bien con la API:

- **Descripción**: requiere que exista un vídeo, y el vídeo es el contenido
  principal, no la descripción. El vídeo hay que subirlo a mano.
- **Comentario fijado**: la API sí permite crearlo, pero un comentario fijado
  como canal de comunicación tiene un alcance pésimo.

Recomendación: **sube el vídeo a mano** y deja la descripción como texto que
copias. Si más adelante quieres automatizarlo, la vía razonable es subir el
vídeo con `videos.insert` en estado `private` y que tú lo publiques desde la
app, en lugar de crear vídeos vacíos en público.

---

## 7. Estado real de cada plataforma

Estado a **2026-09-28**. La columna "standby" significa que el contenido se
escribe y se valida, pero Make no recibe la orden de publicar en esa red.

| Red | Se publica | Standby | Motivo / qué falta |
|---|---|---|---|
| Facebook | Sí | No | Revisión de la app en Meta (tarda días) |
| Instagram | Sí | No | Cuenta profesional + revisión de Meta + solo JPEG |
| X | Sí | No | Revisión de la cuenta. **1 hashtag por post** en self-serve |
| LinkedIn | No | **Sí** | Falta crear la página de empresa |
| YouTube | No | **Sí** | No se hacen vídeos de momento |
| TikTok | No | **Sí** | Aprobación de scope + auditoría + dominio verificado |
| Medium | No | **Sí** | API sin soporte oficial desde 2023 |

### Cómo funciona el standby

Se declara en `rrss.config.yaml`, bajo la red, con el motivo escrito:

```yaml
linkedin:
  activo: true
  standby: "Decisión del 2026-09-28: no se crea página de empresa todavía."
```

Y tiene dos efectos:

1. **Make no publica ahí.** Aparece en el resumen de la ejecución como
   `standby`, con el motivo, para que quede constancia.
2. **No te exige subir sus medios.** El validador avisa de los que faltan en
   lugar de bloquear. Eso evita que "standby" te obligue a hacer el trabajo de
   preparar imágenes de una red que no vas a usar.

Lo que **sí** sigue haciendo standby: validar el contenido. El texto de
LinkedIn se comprueba contra sus límites igual que el de Facebook, para que el
día que la actives esté listo.

Para publicar en una red en standby, quita su línea `standby` de
`rrss.config.yaml`. No hay que tocar ningún manifiesto.

---

## 8. Qué haces tú en cada ciclo

1. **Pides la publicación.**
   > "Prepara la del 2026-10-05, tema 2.8, subtema semáforo del mapa."

2. **OpenCode** deja los 7 `.md` y `manifiestos/2026-10-05-...yaml` con
   `estado: borrador`.

3. **Revisas** los textos.

4. **Subes los medios** a `medios/2026-10-05-color-de-las-colonias/` con los
   nombres de la tabla de `medios/README.md`. Solo los de las redes que van a
   publicarse: Facebook, Instagram y X. Los de las redes en standby no hacen
   falta.

5. **Validas**:
   ```bash
   node scripts/validar-manifiesto.mjs --todos
   ```

6. **Marcas `estado: listo`** y haces push.

7. **Make publica.** No tienes que hacer nada más.

---

## 9. Antes de la primera publicación real

```bash
# 1. Probar el validador
npm install
node scripts/validar-manifiesto.mjs --todos

# 2. Probar los tests del validador
node --test scripts/validar-manifiesto.test.mjs

# 3. Simular una publicación SIN credenciales y SIN riesgo
node scripts/publicar.mjs --slug=<slug> --dry-run
```

El paso 3 imprime exactamente qué se publicaría en cada red, con qué URL de
medio y qué endpoint. Revísalo antes de gastar una publicación real.

Primera publicación real: usa una red de pago bajo (Facebook) con un post de
prueba, y **no** las cinco a la vez. Verifica que el texto sale bien y que la
imagen es la correcta. Publicar es irreversible.

---

## 10. Problemas frecuentes

| Síntoma | Causa habitual |
|---|---|
| Instagram falla al publicar pero el contenedor se creó bien | El fichero era PNG. Meta solo admite JPEG. |
| TikTok no aparece en el perfil | La app no ha pasado la auditoría: se publica en modo privado. |
| X rechaza el post con error de longitud | Estabas contando con `.length`. X cuenta URLs como 23 y emojis como 2. Usa el validador. |
| LinkedIn devuelve 403 | Token de perfil personal. Hace falta página de empresa y `w_organization_social`. |
| Se publica dos veces | Falló el módulo 6. Make usa `estado: publicado` como única memoria. |
| `Faltan credenciales: ...` | La variable no está en el entorno del runner de Make, no en tu máquina. |
| Nada se publica y no hay errores | El filtro del módulo 4 no encontró `estado: "listo"`. |

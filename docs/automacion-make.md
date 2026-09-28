# Automatización de publicaciones con Make

Cómo se encadena OpenCode → medios → Make para publicar en todas las redes.

> Última revisión: septiembre de 2026. Los límites de cada API cambian sin
> previo aviso; si algo falla de golpe, empieza por la tabla de la sección 7.

---

## 1. El flujo

```
  1. TÚ sueltas tus .jpg en entrada/   sin renombrar, en el orden que quieras
              │
  2. TÚ pides la publicación           "prepara la del 2026-10-05, tema 2.8"
              │
  3. OPENCODE genera                   7 ficheros .md legibles
              │                        + 1 manifiesto .yaml (el contrato)
              ▼
  4. OPENCODE prepara los medios       node scripts/preparar-medios.mjs
              │                        copia entrada/ -> medios/<slug>/ con
              │                        el nombre que pide cada red, y te
              │                        enseña el reparto
              ▼
  5. TÚ validas                        npm run validar
              │
  6. TÚ cambias a `listo` y haces push
              │
  7. EL RUNNER publica en cada red activa
              │
  8. EL RUNNER deja constancia    registro/publicaciones.jsonl
                                   + estado → `publicado` o `error`
```

El punto clave: **el manifiesto es el contrato**. OpenCode no publica, y el
runner no interpreta. El manifiesto dice qué texto va en cada red y qué fichero
va con él, y ambos programas leen exactamente el mismo fichero.

OpenCode **nunca** pone `estado: listo` ni hace commit. Ese paso es del
usuario, y es la única barrera real contra una publicación sin revisar.

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

**Ojo con una cosa que ya falló una vez.** `base_url` es solo el prefijo; el
slug se añade después, al componer la URL de cada medio. Si se usara
`base_url` tal cual, Instagram recibiría
`.../medios/instagram-01.jpg` en vez de `.../medios/<slug>/instagram-01.jpg`,
se descargaría un 404 y el error que devolvería Meta no mencionaría rutas.

Por eso la composición vive en una función, `urlBasePublicacion()` en
`scripts/lib/nucleo.mjs`, con tests que fijan el contrato:

```js
resolverUrlMedio('instagram-01.jpg', urlBasePublicacion(cfg.medios.base_url, slug))
// -> https://javier-nexo.github.io/GeoGatos-RRSS/medios/<slug>/instagram-01.jpg
```

Esa función también rechaza un `base_url` con espacios o sin `https://`, que
darían el mismo 404. Un espacio pegado al copiar la config es un error
fácil de cometer y muy difícil de ver.

Para comprobar que todo esto responde:

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

## 3. El runner de publicación

> **Decisión tomada: se usa GitHub Actions, no Make.** La 3.1 explica por qué;
> la 3.2 es la vía montada. La 3.3 queda como referencia por si algún día se
> decide pagar el plan Core.

Toda la lógica de publicación está en `scripts/publicar.mjs`, que se puede
probar en local sin tocar ninguna cuenta ni gastar un solo post. El runner solo
se limita a dispararlo y a leer el resultado.

Esto es deliberado. Un escenario con un módulo por red y uno por cada paso de
subida de medios se gasta el presupuesto de créditos en unas pocas
publicaciones; este consume unos pocos por publicación.

### 3.1 Por qué se descartó Make

Datos verificados en la página oficial de planes de Make:

| Límite | Free | Core (9 $/mes) |
|---|---|---|
| Créditos al mes | 1.000 | 10.000 |
| Escenarios activos | **2** | ilimitados |
| Duración máxima de una ejecución | **5 min** | 40 min |
| Intervalo mínimo entre ejecuciones | 15 min | 1 min |
| Tamaño máximo de fichero | 5 MB | 100 MB |
| Registro de ejecuciones | 7 días | 30 días |
| Make Code App (ejecutar código) | **no** | sí |

Dos filas de esa tabla importan de verdad:

1. **El módulo `Run a script` no aparece en la lista de características de
   ningún nivel.** Es el módulo que ejecuta `node scripts/publicar.mjs`, así
   que sin él el escenario no tiene sentido. La otra vía de Make para ejecutar
   código, *Make Code App*, está marcada como Core+. Sin poder confirmarlo en
   una cuenta real, un diseño que depende de ese módulo es una apuesta.

2. **5 minutos de ejecución es un margen estrecho.** El runner es efímero, así
   que cada ejecución clona el repo y ejecuta `npm ci` antes de publicar. El
   clonado más la instalación de dependencias ya se come buena parte de esos
   5 minutos, y después quedan las llamadas a las tres redes. Si Make corta la
   ejecución a mitad, te queda un post publicado en una red y no en otra, sin
   estado actualizado: el peor resultado posible.

Ninguno de los dos problemas es de configuración: son del plan. Se pueden
resolver pagando Core, y por eso la 3.3 sigue aquí.

### 3.2 La vía elegida: GitHub Actions

Se descartó Make por dos motivos verificados:

- El módulo `Run a script`, que es el único capaz de ejecutar
  `node scripts/publicar.mjs`, no aparece en la lista de características de
  ningún nivel de la página oficial de planes. La otra opción, Make Code App,
  está marcada como Core+ de pago.
- Los 5 minutos de ejecución del plan gratuito son un margen estrecho para
  clonar, instalar y publicar en tres redes, con el runner siendo efímero.

GitHub Actions es gratis e ilimitado en repositorios públicos, el runner ya
trae Node, y los secretos viven en los settings del repo.
`scripts/publicar.mjs` no cambia ni una línea: solo cambia quién lo llama.

El workflow está en `.github/workflows/publicar.yml`. Los secretos se añaden en
*Settings → Secrets and variables → Actions → New repository secret*, uno por
variable: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN`, `INSTAGRAM_IG_ID`,
`INSTAGRAM_PAGE_TOKEN`, `X_ACCESS_TOKEN`.

#### Cómo evitar publicaciones duplicadas

Es el riesgo serio de esto, y tiene dos capas. Sin las dos, un fallo a medias
termina en un post repetido en el perfil.

**Capa 1 — el registro.** El estado del manifiesto es único para la publicación
entera, así que no sabe decir "Facebook salió, Instagram no". Cuando eso pasa,
el manifiesto se queda en `listo` y la siguiente vuelta republicaría Facebook.
Por eso `registro/publicaciones.jsonl` **se versiona** y `publicar.mjs` lo lee
antes de empezar: una red que ya consta ahí no se repite. Se salta con
`--reintentar`.

Por eso `registro/` dejó de estar en `.gitignore`. Si viviera solo en el disco
del runner se perdería al terminar la ejecución y no serviría para nada.

**Capa 2 — el `if: always()`.** El paso que registra el resultado y actualiza el
estado lleva `if: always()`, así que su commit ocurre también cuando la
publicación falla. Si se publicara a medias, se marca `error` y no
`publicado`, y el registro ya impide repetir lo que sí salió. Volver a poner el
estado en `listo` es decisión de una persona, nunca del bot.

Tres detalles del workflow que no son evidentes:

| Detalle | Por qué |
|---|---|
| `concurrency` sin `cancel-in-progress` | Dos pushes seguidos no publican a la vez. Si no, los dos runners ven `listo` y se publica dos veces. |
| Sin reintentos automáticos | Publicar es irreversible. Si la respuesta se pierde, un retry puede dejar dos posts iguales. |
| `git add -A` y no un pathspec | Si no se publicó nada, `registro/` no existe y `git add registro` aborta el paso con `set -e`, dejando el manifiesto sin marcar. |
| El commit del bot no se re-dispara | GitHub no lanza ejecuciones para pushes hechos con su propio `GITHUB_TOKEN`. |

### 3.3 El escenario de Make, módulo a módulo

Solo si confirmas que tienes acceso a `Run a script`.

#### Módulo 1 — Webhooks → Custom webhook

Recomendado frente a instalar la app de Make en GitHub: no pide permisos
amplios, se configura en un minuto y no consume créditos en reposo.

| Campo | Valor |
|---|---|
| Connection | ninguna |
| Webhook | el que genera Make, ej. `https://hook.make.com/XXXX/YYYY` |

Cópialo en *Settings → Webhooks* del repo, *Add webhook*:

| Campo | Valor |
|---|---|
| Payload URL | la URL de Make |
| Content type | `application/json` |
| Secret | uno largo que tú elijas |
| Events | *Just the push event* |

> El *secret* sirve para que GitHub firme las peticiones. Si lo pones,
> actívalo en Make con el mismo valor; si no, déjalo vacío en los dos lados.
> Nunca lo guardes en el repositorio.

#### Módulo 2 — Tools → Run a script

Se ejecuta **una vez, antes del bucle**:

```bash
cd /tmp && rm -rf GeoGatos-RRSS
git clone --depth 1 https://x-access-token:$GITHUB_TOKEN@github.com/javier-nexo/GeoGatos-RRSS.git
cd GeoGatos-RRSS && npm ci --omit=dev
```

El runner de Make es efímero. Clonar aquí y no en el módulo 6 evita clonar
una vez por cada manifiesto de la iteración.

#### Módulo 3 — GitHub → Make a request

```
GET  https://api.github.com/repos/javier-nexo/GeoGatos-RRSS/contents/manifiestos
Headers: Authorization: Bearer <GITHUB_TOKEN>
         Accept: application/vnd.github+json
```

Mapea `message` en el campo **Name**.

#### Módulo 4 — Iterator

Un icono por fichero cuyo nombre acabe en `.yaml`. Descarta los que empiezan
por `_` (la plantilla).

#### Módulo 5 — GitHub → Make a request

```
GET  https://api.github.com/repos/javier-nexo/GeoGatos-RRSS/contents/manifiestos/{{Name}}
Headers: Authorization: Bearer <GITHUB_TOKEN>
```

El `content` viene en Base64. Añade **Tools → Transform → Base64 decode**.

Luego un **Filter** que deje pasar solo lo que contenga `estado: "listo"`.
**Este filtro es el que evita que un push cualquiera dispare publicaciones.**

#### Módulo 6 — Tools → Run a script

```bash
node scripts/publicar.mjs --slug={{slug}} --json
```

- **Command**: lo de arriba.
- **Working directory**: `/tmp/GeoGatos-RRSS`.
- Activa la captura de **stdout** para leer el JSON.

El `slug` se extrae del nombre del fichero en el módulo 5, sin la extensión
`.yaml`.

> ¿Por qué `--json`? Make necesita saber si salió bien. Sin él, el código de
> salida ya sirve, pero no hay detalle por red.

#### Módulo 7 — GitHub → Update a file

Escribe el resultado de vuelta, para que nadie vuelva a publicar lo mismo.

```
PUT  https://api.github.com/repos/javier-nexo/GeoGatos-RRSS/contents/manifiestos/{{slug}}.yaml
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
  El intervalo mínimo de 15 minutos del plan gratuito no aplica a webhooks.
- **Reintentos**: desactivados, o 1 con espera de 5 minutos. Publicar es
  irreversible: un reintento automático puede duplicar un post que sí llegó a
  publicarse y cuya respuesta se perdió.

### Consumo estimado

| Módulo | Créditos |
|---|---|
| Webhook + clonado | 2 |
| Listado + iteración + descarga + decode | 4 |
| Filter | 0 (no consume) |
| Run a script | 1 |
| Update a file | 1 |
| **Total por publicación** | **≈ 8** |

Con 1.000 créditos al mes hay margen para más de cien publicaciones. El plan
gratuito aguanta de sobra en créditos; lo que no aguanta es la duración de la
ejecución, como se explica en el 3.1.

---

## 4. El runner de Make

No hay nada que preparar: el runner de Make es efímero, se tira después de
cada ejecución. El clonado y `npm ci` van dentro del propio escenario, en el
[módulo 2](#33-el-escenario-de-make-módulo-a-módulo), antes del bucle.

Lo único que hay que comprobar una vez es que `npm ci` funciona sin
dependencias nativas. Este repo no tiene ninguna: `package.json` no declara
dependencias de producción, solo scripts. Si algún día se añade una, con
`--omit=dev` no se instala y el script fallará al importar.

---

## 5. Credenciales: qué pedir en cada red

Se inyectan como variables de entorno. **Nunca en el repositorio.**

- Con GitHub Actions: *Settings → Secrets and variables → Actions*. Son las
  mismas variables; `publicar.mjs` no distingue entre un runner y otro.
- Con Make: en el propio módulo, o en la conexión si es la misma para todas
  las ejecuciones.

El repositorio es público y GitHub Pages sirve **todo** lo que hay en la raíz,
así que cualquier token que acabe en un fichero acaba en internet.

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
escribe y se valida, pero el runner no recibe la orden de publicar en esa red.

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

1. **El runner no publica ahí.** Aparece en el resumen de la ejecución como
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

1. **Sueltas tus imágenes en `entrada/`**, sin renombrar, en el orden que
   quieras. No hace falta que se llamen como las espera el pipeline.

2. **Pides la publicación.**
   > "Prepara la del 2026-10-05, tema 2.8, subtema semáforo del mapa."

3. **OpenCode** deja los 7 `.md` y `manifiestos/2026-10-05-...yaml` con
   `estado: borrador`, y copia tus imágenes a `medios/<slug>/` con el nombre
   que pide cada red. Te enseña el reparto y te avisa de lo que detecte.

4. **Revisas** los textos y la tabla de reparto.

5. **Validas**:
   ```bash
   npm run validar
   ```

6. **Marcas `estado: listo`** y haces push.

7. **El runner publica.** No tienes que hacer nada más. El workflow aparece en
   la pestaña *Actions* del repo; si falla, está el log.

> Si se publica a medias (una red sí y otra no), el manifiesto queda en
> `estado: error` y **no** vuelve a publicar solo. El registro ya impide repetir
> lo que sí salió, así que si quieres reintentar solo lo que falta, pon el
> estado en `listo` otra vez y haz push: las redes que ya salieron se saltan
> solas.

### El reparto de imágenes, en una tabla

La imagen *n* que subiste va al hueco *n* de la lista `medios` de cada red:

| Imagen subida | Ficheros donde acaba |
|---|---|
| 1ª | `facebook-01.jpg` e `instagram-01.jpg` |
| 2ª | `instagram-02.jpg` |
| 3ª | `instagram-03.jpg` |

Que la misma foto sirva para varias redes es **lo que se quiere**, no un fallo.
No tienes que subir una imagen distinta por red. Si subes más de 3, las
sobrantes quedan en `entrada/` para la siguiente publicación.

`entrada/` está en `.gitignore`: es un borrador local. Lo que se versiona es la
copia de `medios/<slug>/`, que es la que GitHub Pages sirve.

---

## 9. Antes de la primera publicación real

```bash
# 1. Probar el validador
npm install
npm run validar

# 2. Probar los tests
npm test

# 3. Simular una publicación SIN credenciales y SIN riesgo
node scripts/publicar.mjs --slug=<slug> --dry-run
```

El paso 3 imprime exactamente qué se publicaría en cada red, con qué URL de
medio y qué endpoint. Revísalo antes de gastar una publicación real.

Y una comprobación que no se puede hacer en local: que la URL del medio
responde de verdad.

```bash
curl -I https://javier-nexo.github.io/GeoGatos-RRSS/medios/<slug>/<fichero>
```

Tiene que dar `200` **y** `content-type: image/jpeg`. Un 200 con otro tipo
significa que Jekyll está procesando el fichero: revisa que exista
`.nojekyll`. Instagram rechaza la imagen y el error de Meta no menciona el
content-type, así que el diagnóstico desde el panel es imposible.

Primera publicación real: usa una red de pago bajo (Facebook) con un post de
prueba, y **no** las tres a la vez:

```bash
node scripts/publicar.mjs --slug=<slug> --redes=facebook
```

Verifica que el texto sale bien y que la imagen es la correcta. Publicar es
irreversible.

---

## 10. Problemas frecuentes

| Síntoma | Causa habitual |
|---|---|
| Se publica dos veces en la misma red | El manifiesto se quedó en `listo` tras un fallo parcial. Pasa a `error`, y no a `listo`, para reintentar. |
| El bot no marca el manifiesto | `registro/` no existía y `git add registro` abortaba el paso. Ya está en `git add -A`. |
| Un manifiesto se salta con "ya publicada" y tú no lo has publicado | Hay una entrada `real` de ese slug en `registro/publicaciones.jsonl`. Bórrala, o usa `--reintentar`. |
| Instagram falla al publicar pero el contenedor se creó bien | El fichero era PNG. Meta solo admite JPEG. |
| Meta devuelve 404 al descargar la imagen | La URL no lleva el slug: `.../medios/instagram-01.jpg` en vez de `.../medios/<slug>/...`. Comprueba con `urlBasePublicacion()`. |
| Meta dice que no puede leer el fichero, y el 200 es correcto | El `content-type` no es `image/jpeg`. Suele ser Jekyll: comprueba que exista `.nojekyll`. |
| TikTok no aparece en el perfil | La app no ha pasado la auditoría: se publica en modo privado. |
| X rechaza el post con error de longitud | Estabas contando con `.length`. X cuenta URLs como 23 y emojis como 2. Usa el validador. |
| LinkedIn devuelve 403 | Token de perfil personal. Hace falta página de empresa y `w_organization_social`. |
| Se publica dos veces | Falló el módulo 6. Make usa `estado: publicado` como única memoria. |
| `Faltan credenciales: ...` | La variable no está en el entorno del runner de Make, no en tu máquina. |
| Nada se publica y no hay errores | El filtro del módulo 4 no encontró `estado: "listo"`. |
| El runner dice que no encuentra el repo | El runner de Make es efímero. Clona dentro del propio comando, ver sección 4. |

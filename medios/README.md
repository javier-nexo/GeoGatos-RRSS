# Medios — dónde y cómo poner los ficheros

Esta carpeta es la que tienes que rellenar tú. OpenCode genera los textos y
los manifiestos; los ficheros binarios (fotos, vídeos) los pones a mano.

> **Ya no los pones a mano.** Suelta los `.jpg` en `entrada/` sin renombrar y
> `scripts/preparar-medios.mjs` los copia aquí con el nombre que cada red
> necesita. Si prefieres hacerlo a mano, lo de abajo sigue siendo válido.

## Estructura

```
medios/
└── 2026-10-05-color-de-las-colonias/     <- el slug del manifiesto
    ├── facebook-01.jpg
    ├── instagram-01.jpg
    ├── instagram-02.jpg
    ├── linkedin-01.jpg
    ├── x-01.jpg
    └── tiktok-01.mp4
```

El nombre de la carpeta **tiene que ser exactamente el `slug`** del manifiesto
correspondente de `manifiestos/`. El validador lo comprueba.

## Nomenclatura

```
<red>-<orden>.<extensión>
```

- `<red>`: `facebook`, `instagram`, `linkedin`, `x`, `youtube`, `tiktok`, `medium`
- `<orden>`: dos dígitos a partir de `01`
- La extensión cuenta, y por red:

| Red | Extensiones válidas | Nota |
|---|---|---|
| Instagram | **`.jpg` / `.jpeg` solo** | Meta rechaza PNG. Exporta a JPEG, no renombres: renombrar no convierte el formato. |
| Facebook | `.jpg`, `.jpeg`, `.png`, `.webp` | Solo se publica la primera imagen. |
| LinkedIn | `.jpg`, `.jpeg`, `.png` | |
| X | `.jpg`, `.jpeg`, `.png`, `.gif` para imagen · `.mp4` para vídeo | Máximo 4 ficheros por post. |
| TikTok | `.mp4` | Máximo 5 minutos. |
| Medium | `.jpg`, `.jpeg`, `.png`, `.gif`, `.tiff` | |

## Ficheros compartidos

Si varias redes usan la misma imagen, ponla con un subdirectorio y declárala
en cada red:

```
medios/2026-10-05-color-de-las-colonias/comun/logo-naranja.png
```

```yaml
  facebook:
    medios: ["comun/logo-naranja.png"]
  linkedin:
    medios: ["comun/logo-naranja.png"]
```

## Antes de publicar

```bash
npm install
node scripts/validar-manifiesto.mjs --todos
```

El validador comprueba que cada fichero existe y que su formato vale para la
red que lo va a usar. Si pasa, cambias `estado: listo` en el manifiesto,
haz push y el workflow publica.

## Cómo se rellena esto en la práctica

Lo normal es no hacerlo a mano:

```bash
node scripts/preparar-medios.mjs --listar                # ver la bandeja
node scripts/preparar-medios.mjs --slug=<slug> --simular # ver el reparto
node scripts/preparar-medios.mjs --slug=<slug>           # copiar de verdad
```

Tus imágenes van en `entrada/`, sin renombrar y en el orden que quieras. El
script las reparte por posición: la 1ª es `facebook-01` e `instagram-01`, la 2ª
es `instagram-02`, la 3ª es `instagram-03`. Ver `entrada/README.md`.

Antes de copiar, comprueba dos cosas que fallan tarde y mal: el **formato real**
de los bytes (Instagram solo acepta JPEG; renombrar un PNG no lo convierte) y
las **proporciones del carrusel** (Instagram recorta todas al formato de la
primera).

## Solo subes los medios de las redes que se publican

A 2026-09-28 se publica en **Facebook, Instagram y X**. Las otras cuatro
redes están en standby: su contenido se escribe y se valida, pero no se
publican.

Consecuencia práctica: **no tienes que subir las imágenes de LinkedIn,
YouTube, TikTok ni Medium**. El validador te avisa de las que faltan, pero no
bloquea la publicación. En cuanto una red salga de standby, sus medios pasan a
ser obligatorios.

## Por qué los medios necesitan un repositorio público

Instagram y TikTok **descargan el fichero desde una URL pública**: no aceptan
un binario que tengas en el disco duro. Por eso GitHub Pages sirve este repo y
el `medios.base_url` de `rrss.config.yaml` apunta aquí:

```
https://javier-nexo.github.io/GeoGatos-RRSS/medios/<slug>/<fichero>
```

Configurado en *Settings → Pages → Source: Deploy from a branch*, `main`,
carpeta **`/ (root)`**. No se puede servir solo `medios/`: GitHub Pages con
"Deploy from a branch" únicamente admite `/` o `/docs`. Como se publica la
raíz, la carpeta `/medios` forma parte de la URL igual que en el repositorio.

Para comprobar que un fichero está sirviéndose:

```bash
curl -I https://javier-nexo.github.io/GeoGatos-RRSS/medios/<slug>/<fichero>
```

Mira **dos** cosas en la respuesta, no solo el `200`:

| Campo | Tiene que ser |
|---|---|
| `HTTP` | `200` |
| `content-type` | `image/jpeg` (o `video/mp4` para TikTok) |

## El fichero vacío `.nojekyll` en la raíz: no lo borres

Hay un fichero vacío llamado `.nojekyll` en la raíz del repositorio. Está ahí a
propósito y **no es un resto**.

Sin él, GitHub Pages pasa los ficheros por **Jekyll**, y Jekyll está pensado
para sitios web, no para servir binarios. Hace dos cosas que nos romperían:

- Excluye del sitio todo fichero o carpeta cuyo nombre empiece por `_` o `.`.
- Convierte los `.md` en `.html`.

Meta (Instagram) no se limita a que la URL responda: **descarga el fichero y
comprueba su `content-type`**. Si Jekyll se come un `.jpg` o lo sirve como otra
cosa, la publicación falla en el último paso, cuando ya no puedes hacer nada
desde el panel — y el error que te devuelve Meta no dice nada de Jekyll.

`.nojekyll` desactiva Jekyll y GitHub sirve los ficheros **tal cual**, con el
tipo MIME correcto. Es un fichero de 0 bytes: no puede estar más barato.

## Con `/root` se sirve todo el repo

Al publicar desde la raíz, GitHub Pages sirve **todos** los ficheros
versionados: `manifiestos/`, los `.md` de cada red, `rrss.config.yaml` y el
código de `scripts/`.

Como el repo ya es público, esto no expone nada nuevo: todo eso ya está
visible en github.com. Pero hay una regla que conviene tener presente:

> **Nunca escribas una credencial en un fichero del repositorio.** Cualquier
> cosa committeada acaba servida por `github.io`. Las credenciales van siempre
> por variable de entorno: en el runner, en los secrets del repo.

`node_modules/` y `registro/` están en `.gitignore`, así que no se sirven.

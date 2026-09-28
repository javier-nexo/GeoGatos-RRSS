# Medios — dónde y cómo poner los ficheros

Esta carpeta es la que tienes que rellenar tú. OpenCode genera los textos y
los manifiestos; los ficheros binarios (fotos, vídeos) los pones a mano.

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
haz push y Make publica.

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
un binario que tengas en el disco duro. Por eso GitHub Pages sirve esta carpeta
y el `medios.base_url` de `rrss.config.yaml` apunta aquí:

```
https://javier-nexo.github.io/GeoGatos-RRSS/medios/<slug>/<fichero>
```

Configurado en *Settings → Pages → Source: Deploy from a branch*,
`main` + `/medios`. Si cambias de alojamiento, solo hay que tocar
`base_url`.

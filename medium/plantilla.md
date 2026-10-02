# Medium

Carpeta para los artículos de Medium (formato artículo).

**Acceso directo a la plantilla:** [plantilla-medium.md](../Plantillas/plantilla-medium.md)

## Cómo se organiza

Medium **no se publica con el runner**: su API está sin soporte oficial desde
2023, así que está en `standby` en `rrss.config.yaml`. Los artículos se copian
y se pegan a mano en medium.com. Por eso cada artículo tiene su **propia
carpeta**, con dos archivos:

```
medium/
└── 2026-09-16-por-que-esterilizar/
    ├── 2026-09-16-por-que-esterilizar.md        <- original, con notas y contexto
    └── 2026-09-16-por-que-esterilizar-limpio.md  <- limpio, para Supabase
```

La carpeta se llama como el `slug` del artículo, igual que en `medios/`.

- El **`.md`** es el original. Es lo único que se edita: aquí van las notas, las
  ideas de assets, las fuentes y las negritas.
- El **`-limpio.md`** es el que se pega en Supabase (módulo de Educación de la
  app). Va sin notas, sin metadatos, sin secciones de Assets/Tags/Notas. Solo
  lleva el título, el subtítulo y el contenido en markdown limpio, listo para
  copiar y pegar en la base de datos.

El `-limpio.md` se genera a partir del `.md`, no se edita a mano: si cambias el
artículo, rehaces el `-limpio.md`.

El bloque `texto` del manifiesto de Medium no lleva el artículo, solo un aviso
de dónde está. Es lo que consume el runner si algún día se automatiza.

# Instrucciones para agentes

## Reglas de Git

- No hacer `commit` ni `push` de ningún cambio sin que el usuario lo solicite explícitamente.
- Actualizar los archivos README.md y  AGENTS.md si es necesario.

## Formato de las publicaciones

Cada publicación existe en dos formatos, y no son intercambiables:

- Los `.md` de cada red (`facebook/`, `instagram/`, …) son para **leerse**.
  Admiten notas, ideas de assets y contexto. Se editan a mano sin miedo.
- El `.yaml` de `manifiestos/<slug>.yaml` es el **contrato que consume Make**.
  Es lo único que se publica.

Al generar una publicación hay que escribir **las dos cosas**. Si generas solo
los `.md`, el día no se publica; si generas solo el `.yaml`, nadie lo revisa.

## Manifiestos

- Copia `manifiestos/_plantilla.yaml` como punto de partida; no escribas el
  YAML de memoria, la plantilla lleva los comentarios que explican cada campo.
- `slug` = `AAAA-MM-DD-slug-del-tema`. Debe coincidir con el nombre del
  fichero, con la carpeta de `medios/` y empezar por la fecha.
- El texto del manifiesto va **sin hashtags**: van en el array `hashtags`. El
  publicador los concatena. Si los pones en `texto` y en el array, salen
  duplicados.
- `estado` empieza siempre en `borrador`. **Nunca lo pongas en `listo`**: eso
  dispara la publicación de verdad al hacer push. Lo cambia el usuario cuando
  ha revisado los textos y ha subido los medios.
- Los medios van declarados aunque todavía no existan. El validador avisará de
  los que falten, que es exactamente lo que el usuario necesita ver.

## Antes de dar cualquier cosa por terminada

```bash
node scripts/validar-manifiesto.mjs --todos
node --test scripts/validar-manifiesto.test.mjs
```

El validador es la barrera que evita que salga un post malo. Si un cambio en
`scripts/lib/` altera lo que se publica, hay que actualizar también los tests:
un validador que pasa de más es peor que no tener validador.

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
- **YouTube**: no hay publicador automático; ver `docs/automacion-make.md`.
- **Instagram**: exige cuenta profesional y solo acepta JPEG.
- **X**: en cuentas self-serve, un solo hashtag por post vía API.

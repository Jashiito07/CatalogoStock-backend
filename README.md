# CatalogoStock-backend

API de **CatálogoStock**, app de ventas por catálogo (Yanbal, Avon, L'Bel y otras
marcas). Es la fuente oficial de precios, stock y estados de los pedidos (RN-07, RN-11)
y la consumen la app móvil del Cliente (`CatalogoStock_frontend`) y el panel web del
Vendedor (`CatalogoStock_admin`).

- NestJS 12 + TypeScript estricto, módulos ESM.
- TypeORM 1.x + PostgreSQL 17.
- Monolito modular con Clean Architecture por módulo.
- Pruebas con Vitest y Supertest; lint con oxlint.
- Código, tablas, rutas y mensajes en español (D-05).

## Requisitos

- Node.js 24.15 o superior (`engines` en `package.json`; probado con Node 26.13) y npm 11.
- PostgreSQL 17 (local o con Docker usando `docker-compose.yml`).
  La API **arranca sin PostgreSQL**: responde `/api/v1/salud` con
  `baseDatos: "desconectada"` (ver «Conexión con la base de datos»).

## Instalación

```bash
npm install
cp .env.example .env      # En PowerShell: Copy-Item .env.example .env
# Edite .env con sus valores reales (nunca lo suba a Git).
docker compose up -d      # Opcional: PostgreSQL 17 de desarrollo
npm run start:dev
```

Compruebe: `GET http://localhost:3000/api/v1/salud`

```json
{ "estado": "ok", "baseDatos": "conectada", "fecha": "2026-11-04T20:00:00.000Z" }
```

## Variables de entorno

Salvo las indicadas como opcionales, todas son obligatorias y están documentadas con
valores falsos en `.env.example`.
Se validan al arrancar (`src/configuracion/variables-entorno.ts`): si falta alguna o es
inválida, la API no inicia y el error solo nombra la variable, nunca su valor.

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PUERTO` | Puerto HTTP de la API | `3000` |
| `CORS_ORIGENES` | Orígenes permitidos, separados por comas | `http://localhost:4200,http://localhost:8100` |
| `BD_HOST` | Servidor de PostgreSQL | `localhost` |
| `BD_PUERTO` | Puerto de PostgreSQL | `5432` |
| `BD_NOMBRE` | Base de datos (las pruebas e2e usan el sufijo `_pruebas`) | `catalogostock` |
| `BD_USUARIO` | Usuario de PostgreSQL | `catalogostock_usuario` |
| `BD_CLAVE` | Clave de PostgreSQL | `cambie_esta_clave_falsa` |
| `BCRYPT_COSTO` | Opcional. Costo de bcrypt para las claves (10 a 14; por defecto 12, D-08) | `12` |
| `JWT_SECRETO` | Secreto de firma de los tokens de acceso (JWT HS256). Mínimo 32 caracteres aleatorios | ver `.env.example` |
| `JWT_VIDA_ACCESO_SEGUNDOS` | Opcional. Vida del token de acceso (60 a 3600; por defecto 900 = 15 min, D-09) | `900` |
| `RENOVACION_VIDA_DIAS` | Opcional. Vida del token de renovación (1 a 30; por defecto 7, D-09) | `7` |
| `RECUPERACION_SECRETO` | Secreto del HMAC-SHA256 de los códigos de recuperación (RF-USU-05). Mínimo 32 caracteres aleatorios, distinto de `JWT_SECRETO` | ver `.env.example` |
| `URL_PUBLICA` | Dirección pública de la API, sin barra final; arma las URL de `GET /api/v1/politicas` (RF-USU-07). **Obligatoria y con `https://` en producción** (`NODE_ENV=production`); en desarrollo vale `http://localhost:3000` | `http://localhost:3000` |
| `PROXY_SALTOS_CONFIABLES` | Opcional. Proxies de confianza delante de la API (`trust proxy`; 0 a 5, por defecto 0). En producción detrás de un proxy TLS: `1` (D-17) | `0` |
| `RUTA_ALMACENAMIENTO` | Opcional. Carpeta de archivos del servidor; las imágenes de productos van en `<ruta>/productos/` (D-46). Por defecto `./almacenamiento` (fuera de Git). Las pruebas e2e usan una carpeta temporal | `./almacenamiento` |
| `VENDEDOR_NOMBRE`, `VENDEDOR_CORREO`, `VENDEDOR_TELEFONO`, `VENDEDOR_CLAVE` | Solo para `npm run crear-vendedor`; la API no las usa | ver `.env.example` |
| `VENDEDOR_CLAVE_NUEVA` | Solo para `npm run restablecer-clave-vendedor`; se define en la terminal, nunca en `.env` | — |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | Inicia la API en modo desarrollo con recarga |
| `npm run build` | Compila a `dist/` |
| `npm run start:prod` | Ejecuta la versión compilada |
| `npm run lint` | oxlint (`.oxlintrc.json`); los avisos también hacen fallar |
| `npm test` | Pruebas unitarias (`src/**/*.spec.ts`) |
| `npm run test:cov` | Unitarias con cobertura (mínimo 70 % en `dominio`, RNF-15) |
| `npm run test:e2e` | Pruebas e2e (`test/**/*.e2e-spec.ts`) contra `catalogostock_pruebas` (ver «Pruebas e2e») |
| `npm run migracion:generar -- src/migraciones/<Nombre>` | Compila y genera una migración comparando entidades y base |
| `npm run migracion:ejecutar` | Compila y aplica las migraciones pendientes |
| `npm run migracion:revertir` | Compila y revierte la última migración |
| `npm run crear-vendedor` | Compila y crea el único Vendedor si aún no existe ninguno (D-07, PA-09) |
| `npm run restablecer-clave-vendedor` | Compila y cambia la clave del Vendedor con `VENDEDOR_CLAVE_NUEVA` (RF-USU-05, D-35) |

### Crear el Vendedor (D-07, PA-09)

La cuenta del Vendedor no se crea por el registro público. Con las migraciones
aplicadas, defina las variables solo en la sesión de la terminal y ejecute el comando:

```powershell
$env:VENDEDOR_NOMBRE='Nombre del Vendedor'
$env:VENDEDOR_CORREO='vendedor@correo.com'
$env:VENDEDOR_TELEFONO='0991234567'
$env:VENDEDOR_CLAVE='<clave de 8 a 72 caracteres con letras y números>'
npm run crear-vendedor
```

- Si no existe ningún Vendedor, lo crea y muestra solo su id.
- Si ya existe uno, termina sin cambios (código de salida 0). La base también impide un
  segundo Vendedor con el índice único parcial `uq_usuarios_un_vendedor` (D-21).
- La clave tiene de 8 a 72 caracteres con letras y números, y como máximo 72 bytes en
  UTF-8 (D-22).
- Si un dato no cumple las reglas (correo, celular de Ecuador, clave), no crea nada y
  nombra la variable que hay que corregir (código de salida 1).
- Nunca muestra la clave, su hash, el correo ni el teléfono.

### Restablecer la clave del Vendedor (RF-USU-05, D-35)

Si el Vendedor olvidó su clave, no hay endpoint HTTP: se restablece en el servidor.
Defina la clave nueva **solo en esa terminal** (no la escriba en `.env`):

```powershell
$env:VENDEDOR_CLAVE_NUEVA = 'ClaveNueva2026'
npm run restablecer-clave-vendedor
Remove-Item Env:VENDEDOR_CLAVE_NUEVA
```

- La clave nueva sigue las mismas reglas (8 a 72 caracteres, letras y números, D-22).
- Cambia la clave del único Vendedor, **cierra todas sus sesiones** y registra
  `CLAVE_RESTABLECIDA` (`origen: COMANDO_SERVIDOR`) en la bitácora.
- Si no existe un Vendedor, termina con error (código 1) y sugiere `npm run crear-vendedor`.
- Solo muestra el id del Vendedor y cuántas sesiones cerró; nunca la clave ni su hash.

Las migraciones usan `src/configuracion/fuente-datos.ts` (compilado en
`dist/configuracion/fuente-datos.js`), que lee `.env`. `synchronize` está desactivado
siempre: el esquema cambia **solo** con migraciones, y cada una implementa `down()`.

Migraciones actuales: `CrearTablaUsuarios` (1.2), `CrearTablaSesiones` (1.3),
`CrearTablaAuditoria` (1.5), `AgregarAccionesRecuperacionAuditoria` y
`CrearTablaCodigosRecuperacion` (RF-USU-05), `CrearTablaMarcas` y
`AgregarAccionesCatalogoAuditoria` (2.2: acciones y entidades de marcas, productos e imágenes),
`CrearTablaProductos` (2.3), `CrearTablaImagenesProducto` (2.4),
`AgregarCorreoVerificadoYPropositoCodigos` (correo, D-50) y
`AgregarAccionesClienteEstadoAuditoria` (acciones `CLIENTE_DESACTIVADO` y
`CLIENTE_REACTIVADO`, D-53),
`CrearTablasImportacionProducto` (2.8: tablas `importaciones_producto` y `borradores_producto`) y
`AgregarAccionesImportacionAuditoria` (2.8: acciones `IMPORTACION_CREADA`, `BORRADORES_APROBADOS`,
`BORRADORES_DESCARTADOS` y entidad `IMPORTACION`) y `AgregarCodigoProductoYCicloImportacion` (D-57:
`productos.codigo`, estados de importación y acción `IMPORTACION_ELIMINADA`),
`AgregarEliminacionCuentaYPerfilVendedor` (T-1: `usuarios.eliminado_en`, propósito
`ELIMINACION_CUENTA`, tabla `perfiles_vendedor` y acciones `CUENTA_ELIMINADA` y
`PERFIL_VENDEDOR_ACTUALIZADO`) y `AgregarIdVendedorProductosEImportaciones` (D-60: `id_vendedor` en
`productos` e `importaciones_producto`, relleno con el único Vendedor; falla con un mensaje claro si hay
filas y no hay Vendedor). Ambas son aditivas y con `down()`; la primera no se revierte si ya hay cuentas
eliminadas.

## Cuenta, políticas y perfil comercial (RF-USU-06 a RF-USU-08, D-60, PA-21)

Contrato: `docs/contrato-api/cuenta-y-politicas.md`.

| Ruta | Quién | Descripción |
|---|---|---|
| `POST /api/v1/usuarios/yo/eliminacion` | Cliente | Elimina su cuenta con su `clave` (204; 422 con clave incorrecta; 3 por hora y cuenta → 429; el Vendedor, 403) |
| `POST /api/v1/autenticacion/eliminacion/solicitud` | Público | Envía un código (`ELIMINACION_CUENTA`) al correo verificado de un Cliente. Siempre 204; 3 por minuto por IP y 3 envíos por hora por cuenta |
| `POST /api/v1/autenticacion/eliminacion` | Público | `{ correo, codigo }` → 204 y elimina; fallo → 422 `CODIGO_INVALIDO`; 5 por minuto por IP |
| `GET /politicas/privacidad`, `/politicas/terminos`, `/politicas/eliminar-cuenta` | Público | Páginas HTML (fuera de `/api/v1`) con CSP estricta; el formulario de eliminar usa el script propio `/politicas/eliminar-cuenta.js` |
| `GET /api/v1/politicas` | Público | Versiones y URL (con `URL_PUBLICA`) de las políticas |
| `GET` / `PUT /api/v1/vendedor/perfil` | Vendedor | Perfil comercial: `nombreComercial`, `ciudad`, `provincia` (24 de Ecuador), `whatsapp` |
| `GET /api/v1/tienda` | Cliente o Vendedor | Perfil del único Vendedor (`pais: "EC"`); 404 `TIENDA_NO_CONFIGURADA` |

- Eliminar **anonimiza** (nombre `Cuenta eliminada`, correo `eliminada-<id>@eliminada.invalid`, teléfono
  `+000` y 9 dígitos), deja la cuenta inactiva con `eliminado_en`, revoca sesiones y borra códigos; las
  filas que la referencian se conservan. La bitácora guarda `CUENTA_ELIMINADA` sin datos personales.
- Los textos de las políticas son **borradores técnicos**: una persona con formación legal debe
  revisarlos antes de publicar (PA-21, PA-12).
- Cada producto e importación tiene `id_vendedor` (no se expone en la API). Las operaciones de gestión
  solo actúan sobre los del Vendedor autenticado; sobre los de otro responden 404. Las pruebas lo
  comprueban con un segundo Vendedor insertado directamente en la base de pruebas.

## Marcas (RF-PRO-04, RF-PRO-06, RF-CAT-05, D-43, D-48)

Contrato completo en `docs/contrato-api/productos.md` («Endpoints: marcas»).

| Ruta | Acceso |
|---|---|
| `GET /api/v1/marcas` | Autenticado; `incluirInactivas=true` solo lo respeta el Vendedor |
| `GET /api/v1/marcas/sugeridas` | Vendedor; lista fija con `yaCreada` |
| `POST /api/v1/marcas` | Vendedor; 201, 409 `MARCA_DUPLICADA`; una marca conocida recibe los colores oficiales |
| `PATCH /api/v1/marcas/{id}` | Vendedor; cuerpo parcial, `colorAcento: null` quita el acento; 422 `COLOR_MARCA_FIJO` / `NOMBRE_MARCA_FIJO` en marcas conocidas |

- No hay `DELETE`: una marca se desactiva (`activa: false`).
- **Colores fijos (D-56):** Yanbal, Avon, L'Bel, Cyzone, Esika y Leonisa son marcas conocidas
  (nombre reconocido sin mayúsculas, tildes ni signos: `L'Bel`, `L´Bel`, `lbel`, `Ésika`). Al crearlas el
  servidor guarda el nombre y los colores oficiales e ignora los enviados; `PATCH` con otros colores →
  422 `COLOR_MARCA_FIJO`; renombrarlas → 422 `NOMBRE_MARCA_FIJO`; `activa` y `orden` se siguen
  pudiendo cambiar. Una sola fuente (`dominio/marcas-sugeridas.ts`) alimenta `/marcas/sugeridas` y la regla
  (`dominio/colores-fijos.ts`). Las marcas propias conservan colores libres.
- El nombre es único sin distinguir mayúsculas ni tildes (índice único sobre `nombre_busqueda`).
- `textoSobreColor` y `textoSobreAcento` los calcula el servidor (contraste ≥ 4.5:1, RNF-11).
- Cada creación y cambio queda en la bitácora (`MARCA_CREADA`, `MARCA_ACTUALIZADA`) en la
  misma transacción. Otros módulos usan `MarcasServicio` (`modulos/marcas/index.ts`).

## Productos (RF-PRO-01 a RF-PRO-05, RF-INV-03, RF-CAT-03, PA-07, RN-09)

Contrato completo en `docs/contrato-api/productos.md` («Endpoints: productos»).

| Ruta | Acceso |
|---|---|
| `GET /api/v1/productos` | Autenticado; paginación (`pagina`, `tamanio`) y filtros `marcaId`, `busqueda`, `disponibilidad`; orden por nombre |
| `GET /api/v1/productos/{id}` | Autenticado; 404 si no existe, está eliminado o (Cliente) su marca está inactiva |
| `POST /api/v1/productos` | Vendedor; 201, 404 (marca inexistente), 422 `MARCA_INACTIVA` |
| `PATCH /api/v1/productos/{id}` | Vendedor; cuerpo parcial; un cambio de precio guarda `precioAnterior` y `precioNuevo` en la bitácora |
| `DELETE /api/v1/productos/{id}` | Vendedor; 204, eliminación lógica; un segundo `DELETE` responde 404 |

- El precio viaja como texto decimal (`"12.50"`, de `0.01` a `99999.99`, máximo 2 decimales) y se guarda
  en `numeric(7,2)` con `CHECK (precio > 0)`; en el código se usa `Dinero` (exacto, sin `number`).
- La búsqueda ignora mayúsculas y tildes sobre nombre y descripción (columnas `nombre_busqueda` y
  `descripcion_busqueda`). Los agotados se incluyen en el listado.
- Eliminación lógica (PA-07): `eliminado_en` con fecha; la fila se conserva. Al Cliente solo se le
  muestran productos de marcas activas.
- Bitácora en la misma transacción: `PRODUCTO_CREADO`, `PRODUCTO_ACTUALIZADO`, `PRODUCTO_ELIMINADO`.
  Otros módulos usan `ProductosServicio` (`modulos/productos/index.ts`); `productos` usa
  `MarcasServicio` y nunca lee la tabla `marcas`. Cada producto trae sus `imagenes` (ver abajo).

### Imágenes de productos (RF-PRO-01, D-46)

Contrato en `docs/contrato-api/productos.md` («Endpoints: imágenes»).

| Ruta | Acceso |
|---|---|
| `POST /api/v1/productos/{id}/imagenes` | Vendedor; `multipart/form-data` con el campo `archivo`; 201 con la **Imagen**. 400 sin archivo, 404 producto, 413 más de 2 MB, 415 no es JPG/PNG/WebP, 422 `LIMITE_IMAGENES` (5). 30 subidas por minuto por IP |
| `PUT /api/v1/productos/{id}/imagenes/orden` | Vendedor; cuerpo `{ "ids": [...] }` con **todas** las imágenes en el nuevo orden (la primera es la principal); 200 con la lista, 400 si faltan, sobran o se repiten ids |
| `DELETE /api/v1/productos/{id}/imagenes/{imagenId}` | Vendedor; 204, borra la fila y el archivo y reasigna la principal; 404 |
| `GET /api/v1/imagenes/{archivo}` | **Público** (D-46); solo `<uuid>.(jpg\|png\|webp)`, con `Cache-Control` inmutable y `nosniff`; cualquier otro nombre responde 404 |

- Límites: máximo 5 imágenes por producto, 2 MB cada una, JPG, PNG o WebP. El tipo se decide por los
  **primeros bytes** del archivo (no por la extensión ni el `Content-Type` del cliente) y el nombre en
  disco es un UUID generado por el servidor (nunca el original).
- **Carpeta de archivos**: variable `RUTA_ALMACENAMIENTO` (por defecto `./almacenamiento`, en `.gitignore`).
  Las imágenes van en `<RUTA_ALMACENAMIENTO>/productos/<uuid>.<ext>`. En producción apúntela a una carpeta
  fuera del código, escribible solo por la API e incluida en las copias de seguridad.
- Tabla `imagenes_producto` (migración `CrearTablaImagenesProducto`): `orden` (0 = principal), `ruta_relativa`
  única, `tipo`, `tamanio_bytes`. La eliminación lógica del producto **no** borra sus imágenes; eliminar una
  imagen borra la fila y, tras confirmar la transacción, el archivo.
- Las altas bloquean la fila del producto (`FOR UPDATE`): dos subidas simultáneas nunca superan las 5.
- Bitácora en la misma transacción: `IMAGEN_AGREGADA` e `IMAGEN_ELIMINADA` (solo `idImagen`, sin rutas).

## Importación asistida del catálogo en PDF (RF-PRO-01, RF-PRO-02, D-49, D-55)

Contrato en `docs/contrato-api/productos-importacion.md`. Todas las rutas son del **Vendedor** (un Cliente recibe
403 y queda `ACCESO_DENEGADO`). El módulo `importacion` lee un PDF de catálogo y propone **borradores** de producto
(nombre, código, precio, descripción); el Vendedor los revisa y solo al **aprobar** se crea el producto, con las
mismas validaciones y la misma bitácora que `POST /productos`. Un borrador nunca es un producto: vive en sus
propias tablas y ninguna consulta de `productos` lo incluye.

| Ruta | Qué hace |
|---|---|
| `POST /api/v1/productos/importaciones` | `multipart/form-data`: `archivo` (PDF) y `marcaId` (marca **activa**); 201 con la importación y sus totales |
| `GET /api/v1/productos/importaciones/{id}` | La importación con `totales` (`pendientes`, `aprobados`, `descartados`, `conAdvertencias`) |
| `GET /api/v1/productos/importaciones/{id}/borradores` | Paginada; filtros `estado` (por defecto `PENDIENTE`), `conAdvertencias`, `busqueda`, `paginaPdf` |
| `PATCH /api/v1/productos/importaciones/borradores/{id}` | Edita `nombre`, `descripcion`, `precio`, `marcaId`, `disponibilidad` (solo `PENDIENTE`) |
| `POST /api/v1/productos/importaciones/borradores/aprobar` | `{ "ids": [...] }` (1 a 100); una transacción por borrador; idempotente (`NO_PENDIENTE`) |
| `POST /api/v1/productos/importaciones/borradores/descartar` | `{ "ids": [...] }` (1 a 100); un descartado no se reactiva |

- **Límites**: 60 MB, 400 páginas, sin cifrar, 60 s de análisis y 5 análisis por hora y por IP (D-17). La firma
  `%PDF-` se comprueba en el servidor (no la extensión): texto con extensión `.pdf` → 415. Más de 60 MB o de 400
  páginas → 413; cifrado, dañado, sin texto o sin productos reconocibles → 422 `PDF_ILEGIBLE`.
- **El PDF no se guarda**: se procesa en memoria y se descarta; solo queda su huella SHA-256 (índice único: el mismo
  PDF dos veces → 409 `IMPORTACION_DUPLICADA` con el `id` de la existente). La bitácora
  (`IMPORTACION_CREADA`, `BORRADORES_APROBADOS`, `BORRADORES_DESCARTADOS`) guarda solo ids y cantidades, nunca el
  PDF, su contenido ni el nombre del archivo.
- **Lectura** (`pdfjs-dist`, solo texto: sin ejecutar JavaScript del PDF, sin OCR ni recursos remotos): el lector
  de dominio tiene **dos perfiles** y elige solo el que reconoce más productos. **Yanbal**: `CÓD. 43873`, precios
  `US$ 35.00` y `P. Normal US$ 44.00`. **Leonisa**: `A. Magic Corset | $48.99 | descripción` seguido de
  `Ref. 091183 / Copa B`; el código es la primera referencia y, con varias (`VARIAS_REFERENCIAS`), todas van a la
  descripción con sus tallas y colores. Es **aproximado y conservador**: lo que no entiende queda vacío con su
  advertencia (`SIN_PRECIO`, `SIN_CODIGO`, `NOMBRE_DUDOSO`, `CODIGO_REPETIDO`, `YA_IMPORTADO`; informativas:
  `PRECIO_EN_OFERTA`, `VARIAS_REFERENCIAS`). Un borrador sin precio no se aprueba. No se importan imágenes.
  **Yanbal, precio de ficha:** si una página tiene un único bloque de precio de ficha (sin promoción «2 X 1», sin
  artículo promocional) y variantes con solo «CÓD.», estas heredan ese precio con `PRECIO_HEREDADO` (exige
  revisión): no se aprueban, ni en bloque (`PRECIO_NO_CONFIRMADO`), hasta que el Vendedor confirma el precio con
  `PATCH` de `precio`. El nombre de la variante lleva el título real de la ficha («Base en Polvo – Tono 1»).
- Los precios son `numeric(7,2)` y viajan como texto (`"35.00"`). El código admite letras y dígitos (hasta 20).
- Las pruebas usan PDF sintéticos creados en la propia prueba y fragmentos reproducidos a mano; el PDF real de
  referencia (`Contexto/catalogos/`) **no** se versiona.

### Catálogos mensuales (D-57)

Los precios cambian cada mes: cada marca sube su catálogo nuevo y el sistema **actualiza** los productos. Detalle
en la sección «Catálogos mensuales» del mismo contrato.

- **Código del producto:** columna `productos.codigo` (letras y dígitos, hasta 20, opcional), única por marca entre
  los no eliminados (índice único parcial; 409 `CODIGO_DUPLICADO`). `POST` y `PATCH /productos` lo aceptan y
  `Producto` lo devuelve; el listado también busca por código. Al aprobar, la descripción **ya no** termina en
  `Cód. <código>`.
- **Actualizar precios:** un borrador con código que ya existe en un producto de la misma marca trae
  `productoExistente` y la advertencia informativa `YA_IMPORTADO`. Al aprobar se actualiza **solo el precio**
  (`PRODUCTO_ACTUALIZADO` con `precioAnterior` y `precioNuevo`); cada resultado trae `accion`:
  `CREADO` | `ACTUALIZADO` | `SIN_CAMBIO` (y `emparejadoPor`: `CODIGO`, `NOMBRE` o `null` si se creó). Un producto
  eliminado con ese código no cuenta.
- **Borradores sin código: emparejado por nombre.** Si el borrador no tiene `codigo` ni `NOMBRE_DUDOSO`, se busca un
  producto no eliminado de la misma marca **sin código** con el mismo nombre sin distinguir mayúsculas, tildes ni
  signos (`claveDeEmparejamiento`: letras y dígitos separados por un espacio; en SQL se aplica sobre
  `nombre_busqueda`, sin columna ni migración nueva). Exactamente uno → `productoExistente`, `emparejadoPor: "NOMBRE"`
  y la advertencia informativa `EMPAREJADO_POR_NOMBRE`; al aprobar solo cambia el precio. Varios → no se empareja,
  `EMPAREJAMIENTO_AMBIGUO` (informativa) y se crea un producto nuevo. Nunca se empareja con productos que tienen
  código, ni un borrador con código por nombre. Así el mismo catálogo dos meses seguidos no crea repetidos de los
  productos sin código. Al aprobar, un bloqueo asesor por marca y nombre evita que dos aprobaciones simultáneas del
  mismo nombre creen dos productos. Estas advertencias no se guardan: se deducen al leer. `totales.actualizaran` y
  `nuevos` también cuentan este emparejado.
- **Filtro `accion`** en `GET .../{id}/borradores`: `ACTUALIZAR` (con `productoExistente`), `NUEVO` (crearán un
  producto) o `CAMBIO_PRECIO` (actualizarán un precio que cambia; excluye `SIN_CAMBIO`); otro valor → 400. Se combina
  con `estado`, `conAdvertencias`, `busqueda` (nombre o código del borrador), `paginaPdf` y la paginación, que con
  este filtro se corta en el servidor después de emparejar. Solo los pendientes cumplen una acción.
- **Ciclo de vida:** la importación más reciente de cada marca es `VIGENTE`; al subir otra de la misma marca la
  anterior pasa a `ARCHIVADA` (`archivadaEn`, `eliminaEn` = +6 meses calendario). `totales` suma `actualizaran`,
  `nuevos` y `ausentes` (productos de la marca con código que no vienen en el catálogo; 0 en una archivada).
- **Rutas nuevas:** `GET /productos/importaciones` (lista paginada, `estado`, `marcaId`),
  `GET /productos/importaciones/{id}/ausentes` (solo informativo; 422 `IMPORTACION_ARCHIVADA`) y
  `DELETE /productos/importaciones/{id}` (204; borra importación y borradores, nunca productos; libera la huella).
- **Retención automática:** un planificador interno del servidor (sin dependencias nuevas) elimina las
  importaciones archivadas hace 6 meses calendario, al arrancar y cada 24 h, en lotes pequeños y con transacción
  por importación (idempotente con varias instancias). Bitácora `IMPORTACION_ELIMINADA`
  (`{ idImportacion, motivo: MANUAL | RETENCION, borradores }`; usuario nulo en `RETENCION`). Se apaga con
  `RETENCION_IMPORTACIONES_ACTIVA=false` (las pruebas e2e lo hacen y usan un reloj controlado).
- **Migración** `AgregarCodigoProductoYCicloImportacion`: aditiva y con `down()`; rellena `codigo` desde el sufijo
  `Cód. <código>` de la descripción (y lo quita); de las importaciones existentes, la más reciente por marca queda
  `VIGENTE` y el resto `ARCHIVADA`. Si dos productos no eliminados de la marca repiten código, solo el más antiguo
  recibe la columna.
- `ImportacionModule` se declara **antes** que `ProductosModule` en `AppModule` para que `GET /productos/importaciones`
  gane a `GET /productos/:id`.

## Recuperación y cambio de clave (RF-USU-05, D-35, D-39)

Contrato completo en `docs/contrato-api/recuperacion-clave.md`.

| Ruta | Acceso | Límite por IP (D-17) |
|---|---|---|
| `GET /api/v1/usuarios` | Vendedor; solo Clientes, paginado, `busqueda` sin mayúsculas ni tildes, `activo=true\|false` y `correoVerificado=true\|false` (400 si no es booleano; `total` respeta el filtro); cada elemento incluye `activo` y `correoVerificadoEn` (fecha ISO o `null`) | - |
| `PATCH /api/v1/usuarios/{id}/estado` | Vendedor; `{ "activo": false \| true }` desactiva (revoca sus sesiones) o reactiva a un Cliente; 200 con el Usuario (`activo`), idempotente · 404 `USUARIO_NO_ENCONTRADO` · 422 `OPERACION_NO_PERMITIDA` (el Vendedor). Bitácora: `CLIENTE_DESACTIVADO` / `CLIENTE_REACTIVADO` con `{ idUsuario }` (D-53) | - |
| `POST /api/v1/usuarios/{id}/codigo-recuperacion` | Vendedor; 201 con el código (única vez que viaja) | — |
| `POST /api/v1/autenticacion/recuperacion` | Público; correo + código + clave nueva → 204 | 5 por minuto |
| `POST /api/v1/usuarios/yo/clave` | Autenticado (Cliente o Vendedor) → 204 | 5 por minuto |

- Código de 6 dígitos (`randomInt` de `node:crypto`), 15 minutos, un solo uso y 5 intentos;
  en `codigos_recuperacion` se guarda solo su HMAC-SHA256 con `RECUPERACION_SECRETO`.
  Generar uno nuevo invalida el anterior (índice único parcial: uno pendiente por Cliente).
- Cualquier fallo de recuperación responde el mismo 422 `CODIGO_INVALIDO`; el motivo solo
  queda en la bitácora (`RECUPERACION_FALLIDA`).
- Recuperar la clave cierra **todas** las sesiones del Cliente; cambiarla con sesión cierra
  las demás y conserva la de `tokenRenovacionActual` (si se envía).

## Correo: verificación y recuperación por correo (RF-USU-05, D-35 opción B, D-50)

Contrato en `docs/contrato-api/correo.md`. Usa `nodemailer` detrás del puerto `EnviadorCorreo`.

| Ruta | Acceso | Respuesta |
|---|---|---|
| `POST /api/v1/usuarios/yo/correo/verificacion` | Autenticado; 3 envíos por hora y cuenta | 204 · 409 `CORREO_YA_VERIFICADO` · 429 · 503 `CORREO_NO_DISPONIBLE` |
| `POST /api/v1/usuarios/yo/correo/confirmacion` | Autenticado; 5 por minuto por IP | 204 · 422 `CODIGO_INVALIDO` |
| `POST /api/v1/autenticacion/recuperacion/solicitud` | Público; 3 por minuto por IP y 3 envíos por hora y cuenta | **204 siempre** |

- El código solo se envía al correo **registrado** de una cuenta activa con el correo verificado; la
  solicitud pública responde igual exista o no la cuenta y el envío sigue en segundo plano.
- El código usa las reglas de `codigos_recuperacion` (6 dígitos, 15 min, un uso, 5 intentos, HMAC con
  `RECUPERACION_SECRETO`) con la columna `proposito`. `POST /autenticacion/recuperacion` acepta el código
  del Vendedor o el del correo (también para el Vendedor, solo con código de correo).
- Un fallo del SMTP nunca rompe la API: la solicitud pública sigue en 204 y la verificación da 503
  genérico. El log solo guarda el código de error (`EAUTH`…), nunca correos, códigos ni claves.
- Variables (en `.env.example`, con valores falsos): `CORREO_ACTIVO`, `SMTP_SERVIDOR`, `SMTP_PUERTO`,
  `SMTP_USUARIO`, `SMTP_CLAVE` (contraseña de aplicación, solo en su `.env`) y `CORREO_REMITENTE`.
  Con `CORREO_ACTIVO=false` no se envía nada y no se exigen las demás.
- Las pruebas usan un transporte falso en memoria: **nunca envían correos reales**.

## Pruebas e2e (base `catalogostock_pruebas`, D-23)

Las pruebas e2e levantan la API completa contra una base **local y exclusiva de
pruebas**, nunca la de desarrollo ni la de producción.

1. Cree la base una sola vez, con un usuario que pueda crear bases (por ejemplo
   `postgres`), desde pgAdmin o `psql`, y désela al usuario de la API:

   ```sql
   CREATE DATABASE catalogostock_pruebas OWNER catalogostock_usuario;
   ```

   Con el PostgreSQL de `docker-compose.yml` (su usuario es superusuario):

   ```bash
   docker compose exec postgres psql -U <BD_USUARIO> -d <BD_NOMBRE> -c "CREATE DATABASE catalogostock_pruebas"
   ```

2. Copie `.env.pruebas.example` como `.env.pruebas` (está en `.gitignore`) y complete
   `BD_HOST`, `BD_PUERTO`, `BD_NOMBRE`, `BD_USUARIO` y `BD_CLAVE`.
3. Ejecute `npm run test:e2e`.

Cómo funciona (`vitest.config.e2e.ts` y `test/preparacion/`):

- La conexión sale **solo** de `.env.pruebas`; nunca de `.env` ni de las variables `BD_*`
  de la terminal. El resto (`JWT_SECRETO`, `BCRYPT_COSTO=10`…) son valores falsos fijos.
- Si `BD_NOMBRE` no termina en `_pruebas`, las pruebas **abortan** antes de conectarse.
  Se vuelve a comprobar con `current_database()` antes de migrar y antes de cada limpieza.
- Antes de empezar, `preparacion-global.ts` **borra el esquema** de esa base y aplica todas
  las migraciones de `src/migraciones/` desde cero.
- Antes de cada prueba se vacían todas las tablas (salvo `migraciones`) y se reinicia el
  contador del límite de intentos. Las suites se ejecutan una a la vez.
- Si falta `.env.pruebas`, `npm run test:e2e` falla con un mensaje que indica qué hacer.

## Registro, sesión y aviso de privacidad (subfase 1.3)

Contrato completo en `docs/contrato-api/usuarios.md` (RF-USU-01, CA-01, D-09, D-19).

| Ruta | Acceso | Límite por IP (D-17) |
|---|---|---|
| `GET /api/v1/privacidad/aviso` | Público | — |
| `POST /api/v1/usuarios/registro` | Público; siempre crea un Cliente, sin sesión | 3 por minuto |
| `POST /api/v1/autenticacion/ingreso/cliente` | Público; solo Clientes (canal `APP`) | 5 por minuto, sumando las dos rutas de ingreso |
| `POST /api/v1/autenticacion/ingreso/vendedor` | Público; solo el Vendedor (canal `PANEL`) | (el mismo contador) |
| `POST /api/v1/autenticacion/renovacion` | Con el token de renovación | 10 por minuto |
| `POST /api/v1/autenticacion/salida` | `Authorization: Bearer <tokenAcceso>` | — |

- Token de acceso: JWT HS256 de 15 minutos con `sub`, `rol`, `iat` y `exp`.
- Token de renovación: 256 bits aleatorios (no es JWT), 7 días y un solo uso. En la tabla
  `sesiones` se guarda solo su hash SHA-256, con el canal, la familia de rotación y las
  fechas de vencimiento y revocación.
- Reutilizar un token ya rotado revoca toda su familia (401 `TOKEN_INVALIDO`).
- Con el rol equivocado en un canal, la respuesta es la misma que con una clave incorrecta
  (401 `CREDENCIALES_INVALIDAS`) y no se crea sesión.
- Mensajes del ingreso de la app (`/ingreso/cliente`, D-52; contrato
  `docs/contrato-api/usuarios-gestion.md`): correo sin cuenta → 401 `CORREO_NO_REGISTRADO`;
  cuenta de Cliente desactivada **con la clave correcta** → 403 `CUENTA_DESACTIVADA`; clave
  incorrecta o cuenta de Vendedor → 401 `CREDENCIALES_INVALIDAS`. `/ingreso/vendedor`
  (panel) no cambia: siempre el 401 genérico. El tiempo de respuesta no distingue los casos
  (siempre una comparación bcrypt, con un hash ficticio si no hay cuenta). La bitácora
  guarda el motivo en `SESION_FALLIDA`: `CORREO_NO_REGISTRADO`, `CREDENCIALES_INVALIDAS`,
  `ROL_NO_PERMITIDO` o `CUENTA_DESACTIVADA`.
- Al superar un límite: 429 `DEMASIADAS_SOLICITUDES` con la cabecera `Retry-After`. El
  contador vive en la memoria del proceso.
- El aviso de privacidad es un **borrador provisional** (D-15) en
  `src/modulos/usuarios/infraestructura/privacidad/aviso-privacidad.provisional.ts`. Si
  cambia el texto, cambie también `version`.
- La protección por rol (`@Publico()`, `@Roles()`), `GET /usuarios/yo` y la bitácora
  llegan en las subfases 1.4 y 1.5. Los puntos donde se registrará la bitácora están
  marcados con `PENDIENTE (subfase 1.5)`.

## Estructura

```text
src/
  main.ts                         Arranque: lee PUERTO y CORS_ORIGENES
  app.module.ts                   Importa configuración, base de datos y módulos
  configuracion/
    variables-entorno.ts          Validación de variables al arrancar
    aplicacion-http.ts            Prefijo /api/v1, helmet, CORS, trust proxy, ValidationPipe, filtro de errores
    limite-intentos.module.ts     @nestjs/throttler con su guard global (D-17)
    base-datos.config.ts          Opciones de PostgreSQL (synchronize: false)
    base-datos.module.ts          TypeORM con autoLoadEntities e inicialización manual
    conexion-base-datos.servicio.ts  Conexión en segundo plano con reintentos
    fuente-datos.ts               DataSource para la CLI de TypeORM
  compartido/
    dominio/                      Dinero (centavos exactos) y errores de dominio base
    aplicacion/                   Puertos compartidos (Reloj, GeneradorId)
    infraestructura/              Adaptadores compartidos (RelojSistema, GeneradorIdUuid)
    presentacion/                 Filtro global de errores, ValidationPipe y límite de intentos
  comandos/
    crear-vendedor.ts             Punto de entrada de `npm run crear-vendedor` (contexto sin HTTP)
  modulos/
    usuarios/
      dominio/                    Usuario, Correo, Telefono, NombreUsuario, Rol, regla de clave,
                                  Sesion, Canal, aviso de privacidad y errores de autenticación
      aplicacion/                 Casos de uso CrearVendedor, RegistrarCliente, IniciarSesion,
                                  RenovarSesion, CerrarSesion, ConsultarAvisoPrivacidad y sus puertos
      infraestructura/            Tablas usuarios y sesiones (TypeORM), bcrypt, JWT,
                                  token de renovación (node:crypto) y aviso provisional
      presentacion/http/          Controladores, DTOs y GuardTokenAcceso
      presentacion/cli/           Lógica del comando crear-vendedor
      usuarios.module.ts
      index.ts                    API pública del módulo
    marcas/
      dominio/                    Marca, NombreMarca, color y contraste, marcas conocidas y colores fijos
      aplicacion/                 Casos de uso Crear/Actualizar/Listar, MarcasServicio y puerto
      infraestructura/            Tabla marcas (TypeORM)
      presentacion/http/          MarcasController y DTOs
      marcas.module.ts
      index.ts                    API pública del módulo
    productos/
      dominio/                    Producto (precio con Dinero), Disponibilidad, búsqueda sin tildes, Imagen (firma de bytes, límites)
      aplicacion/                 Casos de uso de productos e imágenes, ProductosServicio y puertos
      infraestructura/            Tablas productos e imagenes_producto (TypeORM), almacén en disco y adaptador de MarcasServicio
      presentacion/http/          ProductosController, ImagenesController (público) y DTOs
      productos.module.ts
      index.ts                    API pública del módulo
    importacion/
      dominio/                    Lector del catálogo (perfiles Yanbal y Leonisa, sin pdfjs), Borrador, advertencias, validación del PDF
      aplicacion/                 Casos de uso de importación y borradores, puertos (lector de PDF, productos, marcas)
      infraestructura/            Tablas importaciones_producto y borradores_producto (TypeORM), lector con pdfjs-dist
      presentacion/http/          ImportacionesController y DTOs
      importacion.module.ts
      index.ts
    salud/
      dominio/                    EstadoSalud
      aplicacion/                 ConsultarSaludCasoUso y puerto ComprobadorBaseDatos
      infraestructura/            ComprobadorBaseDatosTypeorm (SELECT 1)
      presentacion/               GET /api/v1/salud
      salud.module.ts
      index.ts                    API pública del módulo
  migraciones/                    Migraciones de TypeORM
test/                             Pruebas e2e
  preparacion/                    Entorno, migraciones y limpieza de catalogostock_pruebas
```

Módulos previstos: `usuarios`, `productos`, `inventario`, `catalogo`, `pedidos`, `pagos`,
`asistente`, `sincronizacion` y `auditoria`.

### Regla de dependencias

```text
presentacion ─┐
              ├──► aplicacion ──► dominio
infraestructura┘
```

- `dominio`: entidades, objetos de valor y reglas en TypeScript puro. No importa NestJS,
  TypeORM, class-validator ni PostgreSQL.
- `aplicacion`: casos de uso y puertos (interfaces). No conoce HTTP ni TypeORM.
- `infraestructura`: adaptadores (TypeORM, PayPhone, archivos) que implementan los puertos.
- `presentacion`: controladores y DTOs; solo validan, autorizan y llaman a un caso de uso.
- Un módulo no accede a las tablas de otro: usa lo que exporta su `index.ts`.

## Convenciones

- Prefijo de rutas `/api/v1`; JSON en `camelCase`; tablas y columnas en `snake_case`.
- Errores con el formato `{ "codigo", "mensaje", "detalles" }`: `DATOS_INVALIDOS` (400),
  `NO_AUTENTICADO`, `TOKEN_VENCIDO`, `TOKEN_INVALIDO`, `CREDENCIALES_INVALIDAS` (401),
  `NO_AUTORIZADO` (403), `NO_ENCONTRADO` (404), conflictos como `CORREO_YA_REGISTRADO`
  (409), reglas como `PRIVACIDAD_NO_ACEPTADA` (422), `DEMASIADAS_SOLICITUDES` (429) y
  `ERROR_INTERNO` (500, sin detalles internos). Los errores de dominio se traducen según
  su categoría.
- Dinero: `numeric(12,2)` en PostgreSQL, objeto `Dinero` en centavos (`bigint`) en el
  código y texto decimal con dos decimales en la API (`"12.50"`). Nunca `number`.
- `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`.
- Nada de secretos ni datos personales en logs ni en Git.

## Conexión con la base de datos

TypeORM se registra con `manualInitialization: true`, así que NestJS no conecta (ni
detiene el proceso) al iniciar. `ConexionBaseDatosServicio` abre la conexión en segundo
plano con **5 intentos separados por 3 s** (tiempo máximo de conexión: 5 s). Mientras
tanto la API responde y `/api/v1/salud` informa `baseDatos: "desconectada"`. Si se
agotan los intentos se registra un error (sin host, usuario ni clave) y hay que
reiniciar la API cuando PostgreSQL esté disponible.

## Seguridad

- En producción la API se publica solo por HTTPS, detrás de un proxy TLS (RNF-01).
- `helmet` activo y CORS limitado a `CORS_ORIGENES`.
- `.env` y `almacenamiento/` (comprobantes) están en `.gitignore`.

## Git

Ramas `main` (estable) y `develop` (integración). Se trabaja en `feature/<modulo>-<desc>`
o `fix/<desc>` desde `develop`, con Conventional Commits y PR hacia `develop`.

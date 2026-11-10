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
| `PROXY_SALTOS_CONFIABLES` | Opcional. Proxies de confianza delante de la API (`trust proxy`; 0 a 5, por defecto 0). En producción detrás de un proxy TLS: `1` (D-17) | `0` |
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
`CrearTablaCodigosRecuperacion` (RF-USU-05).

## Recuperación y cambio de clave (RF-USU-05, D-35, D-39)

Contrato completo en `docs/contrato-api/recuperacion-clave.md`.

| Ruta | Acceso | Límite por IP (D-17) |
|---|---|---|
| `GET /api/v1/usuarios` | Vendedor; solo Clientes, paginado, `busqueda` sin mayúsculas ni tildes | — |
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

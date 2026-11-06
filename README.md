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
| `VENDEDOR_NOMBRE`, `VENDEDOR_CORREO`, `VENDEDOR_TELEFONO`, `VENDEDOR_CLAVE` | Solo para `npm run crear-vendedor`; la API no las usa | ver `.env.example` |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | Inicia la API en modo desarrollo con recarga |
| `npm run build` | Compila a `dist/` |
| `npm run start:prod` | Ejecuta la versión compilada |
| `npm run lint` | oxlint (`.oxlintrc.json`); los avisos también hacen fallar |
| `npm test` | Pruebas unitarias (`src/**/*.spec.ts`) |
| `npm run test:cov` | Unitarias con cobertura (mínimo 70 % en `dominio`, RNF-15) |
| `npm run test:e2e` | Pruebas e2e (`test/**/*.e2e-spec.ts`) |
| `npm run migracion:generar -- src/migraciones/<Nombre>` | Compila y genera una migración comparando entidades y base |
| `npm run migracion:ejecutar` | Compila y aplica las migraciones pendientes |
| `npm run migracion:revertir` | Compila y revierte la última migración |
| `npm run crear-vendedor` | Compila y crea el único Vendedor si aún no existe ninguno (D-07, PA-09) |

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

Las migraciones usan `src/configuracion/fuente-datos.ts` (compilado en
`dist/configuracion/fuente-datos.js`), que lee `.env`. `synchronize` está desactivado
siempre: el esquema cambia **solo** con migraciones, y cada una implementa `down()`.

## Estructura

```text
src/
  main.ts                         Arranque: lee PUERTO y CORS_ORIGENES
  app.module.ts                   Importa configuración, base de datos y módulos
  configuracion/
    variables-entorno.ts          Validación de variables al arrancar
    aplicacion-http.ts            Prefijo /api/v1, helmet, CORS, ValidationPipe, filtro de errores
    base-datos.config.ts          Opciones de PostgreSQL (synchronize: false)
    base-datos.module.ts          TypeORM con autoLoadEntities e inicialización manual
    conexion-base-datos.servicio.ts  Conexión en segundo plano con reintentos
    fuente-datos.ts               DataSource para la CLI de TypeORM
  compartido/
    dominio/                      Dinero (centavos exactos) y errores de dominio base
    aplicacion/                   Puertos compartidos (Reloj, GeneradorId)
    infraestructura/              Adaptadores compartidos (RelojSistema, GeneradorIdUuid)
    presentacion/                 Filtro global de errores y ValidationPipe
  comandos/
    crear-vendedor.ts             Punto de entrada de `npm run crear-vendedor` (contexto sin HTTP)
  modulos/
    usuarios/
      dominio/                    Usuario, Correo, Telefono, NombreUsuario, Rol, regla de clave
      aplicacion/                 CrearVendedorCasoUso y puertos UsuarioRepositorio, GeneradorHash
      infraestructura/            Tabla usuarios (TypeORM) y GeneradorHashBcrypt (costo 12)
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
  `NO_AUTENTICADO` (401), `NO_AUTORIZADO` (403), `NO_ENCONTRADO` (404), `ERROR_INTERNO`
  (500, sin detalles internos). Los errores de dominio se traducen según su categoría.
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

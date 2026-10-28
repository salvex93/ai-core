# Flujos UX y wireframes (modo especificar)

## Modulo 3 — Flujos UX y Arquitectura de Informacion

### Mapa de flujo de usuario — formato texto

```
FLUJO: Registro de usuario nuevo
ENTRADA: Usuario llega desde CTA de landing page

[1] Pagina de registro
    - Email (requerido, validacion en blur)
    - Contrasena (requerido, indicador de fortaleza)
    - Confirmar contrasena (validacion en tiempo real)
    - CTA: "Crear cuenta"

    ERROR: Email ya registrado → inline "Este correo ya tiene una cuenta. [Inicia sesion]"
    ERROR: Contrasena debil → indicador + sugerencias sin bloquear

[2] Verificacion de email
    - Pantalla: "Revisa tu correo"
    - "Reenviar correo" (disponible despues de 30s)
    TIMEOUT: sin verificacion en 24h → cuenta eliminada

[3] Onboarding
    - Paso 1/3: Nombre y rol
    - Paso 2/3: Configuracion inicial
    - Paso 3/3: Invitar colaboradores (skip disponible)
    EXIT: el usuario puede salir en cualquier paso
```

### Wireframe en ASCII

```
LANDING PAGE — Bento Grid Layout
┌──────────────────────────────────────────────────────────┐
│ [LOGO]                             [Login] [Comenzar]    │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐  ┌──────────┐ ┌────────┐ │
│ │                            │  │          │ │        │ │
│ │   HEADLINE (H1, max 8 pal) │  │  STAT 1  │ │ STAT 2 │ │
│ │   Subtitulo 1-2 lineas     │  │          │ │        │ │
│ │                            │  └──────────┘ └────────┘ │
│ │   [CTA PRIMARY]            │  ┌─────────────────────┐ │
│ │                            │  │                     │ │
│ └────────────────────────────┘  │    FEATURE VISUAL   │ │
│ ┌──────────────────────────────────────────────────────┐ │
│ │              SOCIAL PROOF / LOGOS                    │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

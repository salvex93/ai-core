## RBAC de Producto y Onboarding de Usuarios

### Jerarquia de roles

Modelo de facto en SaaS B2B: **Owner > Admin > Member > Viewer**, ligado a la organizacion (no a un tenant tecnico — la organizacion es el concepto de negocio, el tenant puede o no mapear 1:1 a ella segun el modelo de tenancy elegido arriba).

| Rol | Alcance tipico |
|---|---|
| Owner | Acceso administrativo completo, incluye billing, transferencia de ownership, configuracion de SSO |
| Admin | Todo lo del Owner excepto billing, SSO y transferencia de ownership |
| Member | Sin acceso al panel de configuracion de la organizacion |
| Viewer | Solo lectura, sin capacidad de modificar datos |

Cadena tecnica confirmada (WorkOS): Organizacion -> Organization Membership -> Rol(es) -> Permisos. Todo membership recibe un rol default si no se asigna otro explicitamente. La asignacion ocurre por API, por dashboard manual, o por sincronizacion desde el IdP corporativo (grupos via Directory Sync) — cuando hay IdP, la asignacion del IdP tiene precedencia.

**Correccion deliberada de encuadre:** la capa intermedia "Equipo" (Organizacion -> Equipo -> Usuario -> Rol) NO esta confirmada como estandar en la fuente primaria consultada (WorkOS documenta Organizacion -> Membership directamente, sin capa de "Team" formal en su modelo de RBAC). Existe como patron de mercado en algunos productos, pero no se debe asumir como jerarquia universal confirmada — si un producto la necesita, es una decision de diseno propia, no un estandar heredado.

**Distincion RBAC de producto vs RBAC de infraestructura:** este skill cubre el RBAC de producto (roles de negocio ligados al plan, memberships de organizacion). El RBAC de infraestructura (IAM de nube, policies de servidor) pertenece a `devops-infra` / `backend-architect` y no se redesarrolla aqui.

### Invitaciones a organizacion

Patron confirmado consistente entre WorkOS y Auth0:
- Token con expiracion configurable (`expires_in_days` en WorkOS); al autenticar con el token se acepta automaticamente la invitacion y se crea el membership.
- Email transaccional con enlace tipo `https://app.com/login?invitation={id}&organization={id}`, o generar solo la URL para integrar en un flujo propio.
- Maneja ambos casos: usuario nuevo (no existe en el sistema) o usuario existente que se agrega a una organizacion adicional.
- Estados soportados documentados: accept, revoke, resend (si esta pending), o expiracion automatica. No hay flujo explicito de "rechazar" documentado en las fuentes consultadas — tratar como no verificado.

### SSO empresarial (SAML/OIDC) como requisito de venta

Confirmado como el requisito mas solicitado por organizaciones que evaluan adoptar un SaaS nuevo (WorkOS: "Single Sign-On is the most frequently asked for requirement by organizations looking to adopt new SaaS applications"). Razones de negocio: gestion centralizada de credenciales via el IdP corporativo y cumplimiento normativo mediante control centralizado de identidad.

Patron tecnico de alto nivel: middleware de autenticacion compatible con cualquier IdP SAML/OIDC, modelado sobre OAuth 2.0. Flujo de tres pasos: (1) la app genera URL de autorizacion hacia el IdP, (2) el usuario se autentica en su sistema corporativo, (3) el IdP devuelve un codigo que se intercambia por el perfil autenticado. La persistencia de usuarios sigue siendo responsabilidad de la aplicacion, no del proveedor de SSO.

**Conexion con compliance (gap que no debe tratarse como tema separado):** SSO no es solo un requisito de producto — es tambien parte del vendor-risk-assessment que exige SOC 2 (ver seccion de compliance abajo). Un cliente enterprise que pide SOC 2 casi siempre pide SSO en el mismo proceso de evaluacion; disenarlos como si fueran disciplinas no relacionadas genera doble trabajo.

## Entitlements por Plan (capa de negocio sobre feature flags)

**Distincion obligatoria con `release-manager`:** un feature flag (ver `release-manager`, seccion "Feature Flags") es una tecnica de release — rollout gradual, kill switch, A/B testing de despliegue. Un entitlement es una decision de monetizacion: que feature esta disponible segun el plan que el cliente pago. Son capas distintas que pueden coexistir sobre la misma feature (un flag controla si el codigo esta activo en produccion; un entitlement controla si un tenant especifico tiene derecho a usarlo).

Cita textual clave (Stripe): "Payment is not access. A successful payment does not grant access; a successful payment creates entitlements. Stripe handles billing; your app handles entitlements." Y: "Stripe supports basic entitlement management through an API, but it does not enforce access at runtime... the entitlement logic... lives entirely in your code."

Patron tecnico: registrar features asociadas a productos/planes en la Entitlements API de Stripe; consultar por Customer ID los entitlements activos; sincronizar cambios via el webhook `entitlements.active_entitlement_summary.updated` (el mismo evento que se dispara al pausar un trial sin metodo de pago, ver seccion de billing arriba).

**No verificado:** si los entitlements deben cachearse o consultarse en vivo en cada request no esta prescrito por Stripe como fuente primaria — es decision de arquitectura de cada implementacion. Cachear con invalidacion por webhook es patron extendido de mercado, no mandato del proveedor.

## White-Labeling: Dominios Custom y Subdominios

Fuente principal: Microsoft Learn, "Domain Name Considerations in Multitenant Solutions" (no se encontro equivalente AWS oficial con el mismo nivel de detalle).

- **Subdominios:** patron `tenant.provider.com`, con wildcard DNS (`*.provider.com`) para no crear un registro por tenant nuevo. Multiples stem domains regionales (`us.provider.com`, `eu.provider.com`) reducen overhead operativo porque los tenants heredan el wildcard automaticamente.
- **Dominio propio del cliente:** requiere (1) CNAME encadenado hacia el stem domain del proveedor, (2) reescritura del Host header con propagacion via `X-Forwarded-Host` para que la app identifique el tenant, (3) validacion de dominio obligatoria (CNAME o TXT de verificacion) antes de activarlo.
- **Riesgo documentado explicitamente — dangling DNS / subdomain takeover:** si un tenant se da de baja y no borra su CNAME, un atacante puede reclamar ese nombre y hacer phishing bajo la marca original. Mitigacion oficial: exigir borrado del CNAME antes de remover el dominio de la cuenta, y prohibir reutilizacion de identificadores de tenant.
- **TLS:** el proveedor emite y renueva el certificado (requiere autorizacion via registro CAA si el cliente lo tiene) o el cliente aporta su propio certificado (el proveedor gestiona la clave privada de forma segura). Certificados wildcard normalmente no se automatizan igual que los de dominio custom individual.


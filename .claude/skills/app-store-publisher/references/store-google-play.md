## Google Play Store

### Cuentas — Google Play Console

Cuota unica de registro: 25 USD (tarjeta de credito/debito, no prepago; no reembolsable si la verificacion de identidad falla). Verificacion de identidad con documento gubernamental y tarjeta bajo el mismo nombre legal.

Cuentas personales creadas despues del 13 de noviembre de 2023 requieren testing obligatorio antes de acceso a produccion: closed test con minimo 12 testers inscritos de forma ininterrumpida durante al menos 14 dias consecutivos.

Fuente verificada: `support.google.com/googleplay/android-developer/answer/6112435`, `support.google.com/googleplay/android-developer/answer/14151465`.

### Firma de codigo — Play App Signing

Obligatorio para toda app nueva subida desde agosto de 2021 (opcional con migracion disponible para apps anteriores). Modelo de dos claves:

| Clave | Rol | Notas |
|---|---|---|
| App signing key | Firma final de los APK distribuidos a usuarios | Privada, gestionada por Google (Key Management Service), no recuperable una vez generada |
| Upload key | Firma del bundle antes de subirlo a Play Console | Puede resetearse si se pierde/compromete, recomendable distinta de la app signing key |

Fuente verificada: `developer.android.com/studio/publish/app-signing`.

Generacion de keystore:
```bash
keytool -genkey -v -keystore my-upload-key.jks \
  -keyalg RSA -keysize 2048 -validity 9125 \
  -alias upload-alias
```

Configuracion en `build.gradle` (con `keystore.properties` fuera de control de versiones):
```gradle
android {
    signingConfigs {
        release {
            storeFile file("my-upload-key.jks")
            storePassword "storePassword"
            keyAlias "upload-alias"
            keyPassword "keyPassword"
        }
    }
    buildTypes {
        release { signingConfig signingConfigs.release }
    }
}
```

### Formato de build — AAB obligatorio

Cita textual verificada: "From August 2021, new apps are required to publish with the Android App Bundle on Google Play." No se permite subir APK directo para apps nuevas desde esa fecha. Apps mayores a 200 MB usan Play Feature/Asset Delivery dentro del propio bundle, no como alternativa al formato. Desde junio de 2023 aplica tambien a apps de TV. Fuente: `developer.android.com/guide/app-bundle`.

Comando de build para Flutter:
```bash
flutter build appbundle --release
flutter build apk --release   # solo para testing/sideload, no para submission a Play nueva
```

Comando de build Gradle nativo: `./gradlew bundleRelease` genera el `.aab` firmado con la `signingConfig` de release. Sintaxis exacta de flags de R8 (`minifyEnabled`/`isMinifyEnabled`) y ubicacion de `versionCode`/`versionName` en el AGP vigente — orientativo, no verificado contra URL especifica en esta pasada; confirmar contra `developer.android.com/studio/build/shrink-code` y `developer.android.com/studio/publish/versioning` antes de fijar sintaxis exacta.

### Play Console — tracks, rollout, Data Safety

| Track | Alcance |
|---|---|
| Internal testing | Hasta 100 testers, QA rapida |
| Closed testing | Grupo limitado elegido por el desarrollador, permite tests paralelos |
| Open testing | Cualquiera desde la ficha de Play Store |
| Production | Todos los usuarios en los paises seleccionados |

Staged rollout en produccion: se puede iniciar con porcentaje limitado; una vez iniciado no se pueden quitar paises, el porcentaje se incrementa progresivamente.

Data Safety section: obligatoria para todos los desarrolladores con app publicada, incluyendo todos los tracks (excepto servicios de sistema calificados). Google puede tomar accion de enforcement si detecta discrepancia entre la declaracion y el comportamiento real.

Fuente verificada: `support.google.com/googleplay/android-developer/answer/9845334`, `answer/9859348`, `answer/6346149`, `answer/10787469`.

### Revision, rechazo vs suspension, target API level

Tiempo de revision — orientativo, no verificado con cita textual directa de fuente primaria en esta pasada (referenciado via comunidad de soporte): puede tomar 7 dias o mas en casos excepcionales.

Un rechazo de actualizacion no retira la version previa ya publicada ni afecta el standing de la cuenta. La suspension ocurre por violaciones graves o repetidas — la app deja de estar disponible por completo. Existe programa de apelacion y "Strike Removal program". Fuente: `support.google.com/googleplay/android-developer/answer/9899234`, `answer/12186827`.

Target API level — verificado contra `support.google.com/googleplay/android-developer/answer/11926878` en esta redaccion (cita textual: "Starting August 31, 2026: New apps and app updates must target Android 16 (API level 36) or higher"), re-confirmar vigencia antes de usar en una submission real: a partir del 31 de agosto de 2026, apps nuevas y actualizaciones deben apuntar a Android 16 (API level 36) o superior (excepciones: Wear OS/Automotive OS con Android 15/API 35, Android TV/XR con Android 14/API 34), con posible prorroga hasta el 1 de noviembre de 2026. Apps existentes sin actualizar deben apuntar al menos a Android 15 (API 35) para seguir visibles a nuevos usuarios en OS superiores.

### Checklist pre-submission Google Play

- [ ] `.aab` firmado con upload key, no `.apk` directo (salvo apps registradas antes de agosto 2021).
- [ ] `targetSdkVersion` cumple el minimo vigente en la fecha real de submission (re-verificar contra la fuente citada arriba).
- [ ] Data Safety section completa y consistente con el comportamiento real de la app.
- [ ] Si la cuenta personal es posterior al 13-nov-2023: closed test de 12+ testers durante 14+ dias consecutivos completado antes de solicitar produccion.
- [ ] `versionCode` incrementado respecto al ultimo release subido.

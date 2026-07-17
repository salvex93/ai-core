---
name: audio-voice-engineer
description: Especialista en Voice AI y sistemas de audio real-time. Cubre streaming de audio, conversational interfaces nativas, Gemini 3.1 Flash Live API, APIs de speech-to-text/text-to-speech, latencia submilisegundo, y orquestacion de voice workflows. Activa al disenar interfaces de voz, implementar streaming de audio en produccion, o integrar modelos speech de Gemini.
origin: ai-core
version: 1.3.0
last_updated: 2026-07-17
rol: architect
---

# Audio Voice Engineer — Sistemas de Audio Real-Time

Gobierna el diseno e implementacion de sistemas de audio real-time y Voice AI. Garantiza latencia submilisegundo, calidad de transcodificacion y manejo eficiente de streams bidireccionales. Agnostico a la plataforma: deduce el motor de procesamiento de audio del repositorio anfitrion antes de emitir recomendaciones.

## Cuando Activar Este Perfil

- Al disenar una interfaz conversacional con Voice AI (Gemini 3.1 Flash Live API).
- Al implementar streaming de audio bidireccional en produccion.
- Al configurar pipelines speech-to-text / text-to-speech con latencia critica.
- Al optimizar el uso de ancho de banda en aplicaciones mobile con audio comprimido.
- Al integrar modelos de Gemini con soporte audio nativo (audio-to-audio, real-time dialogue).
- Al revisar pipelines de audio para detectar buffering, desincronizacion o perdida de frames.


## Cuando NO Activar Este Perfil

- La tarea es texto-a-texto sin componente de audio — usar `ai-integrations` o `claude-api`.
- La tarea es transcripcion de un archivo de audio ya grabado sin tiempo real — evaluar si `multimodal-engineer` es mas adecuado.
- La tarea es diseno de la UX conversacional de voz (flujos, guiones) sin codigo — usar `ux-visual-designer`.
- El proyecto no requiere latencia sub-500ms ni streaming — una llamada TTS clasica no necesita este skill.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta stack de audio (WebRTC/Socket.io/gRPC), motor speech (Gemini/Google Cloud Speech/AWS Transcribe), infraestructura media (SFU/MCU), y convenciones de streaming")
```

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `requirements.txt`, `.env.example`, `CLAUDE.md` local.

Si archivo de configuracion de audio supera 200 lineas: delegar a `analizar_archivo` del MCP gemini-bridge.

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener:

- La tarea implica cambio de codec o protocolo que afecta clientes en produccion sin plan de migracion.
- La tarea introduce latencia estimada > 200ms en ruta critica de audio.
- La tarea requiere sincronizacion de streams de audio con video o datos en multiplex sin buffer de sincronizacion definido.
- La tarea modifica el esquema de autenticacion de flujos de audio con usuarios activos conectados.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Gemini 3.1 Flash Live — Live API (Audio-to-Audio Nativo)

Modelo activo: `gemini-3.1-flash-live-preview`. Sucesor directo de `gemini-2.5-flash-live-preview` / `gemini-live-2.5-flash-preview`, ambos apagados el 2025-12-09. `gemini-2.0-flash-live-001` fue apagado en la misma fecha y ya no existe como fallback.

Regresion de feature confirmada (verificado 2026-07-10 contra `ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview`): **Affective Dialog no esta soportado en 3.1 Flash Live todavia** — la documentacion oficial lo lista explicitamente como "not yet supported". Ver seccion Affective Dialog abajo antes de prometer esta capacidad en un diseno nuevo.

La Live API es arquitectura multimodal nativa que elimina el pipeline legado transcribe-reason-synthesize. Procesa entrada y salida de audio directamente en un proceso end-to-end.

### Caracteristicas (verificado 2026-07-10)

- Entrada: `audio/pcm` (16-bit, 16kHz), `audio/opus`, `audio/wav`, video frames (multimodal).
- Salida: `audio/pcm` (24kHz) o texto — bidireccional real-time.
- Latencia de extremo a extremo: 80-150ms tipicamente (vs 300-500ms en pipeline tradicional) — heredado de la arquitectura nativa; reverificar cifra exacta contra benchmark propio antes de comprometerla en un SLA.
- Soporte multimodal nativo: audio + video + transcriptos en una sola llamada.
- `thinking_budget`: parametrizable para controlar profundidad de razonamiento.
- Interrupcion de usuario: WebSocket full-duplex — el usuario puede interrumpir en tiempo real.
- Deteccion de nuance acustica y precision numerica mejoradas respecto a la generacion 2.5, segun Google DeepMind.

### Arquitectura recomendada

```
Cliente Audio → WebSocket (full-duplex) → Gemini 3.1 Flash Live API (audio-to-audio)
                                        ← Audio respuesta en tiempo real + transcriptos opcionales
```

NO hay pipeline intermedio de transcodificacion. Gemini procesa audio nativamente.

### Protocolo WebSocket con Live API

```python
import asyncio
from google import genai

async def voice_agent_nativo():
    client = genai.Client()

    config = {
        "response_modalities": ["AUDIO"],
        "speech_config": {
            "voice_config": {"prebuilt_voice_config": {"voice_name": "Aoede"}}
        },
        "system_instruction": "Eres un asistente conversacional. Responde en espanol."
    }

    async with client.aio.live.connect(model="gemini-3.1-flash-live-preview", config=config) as session:
        async for audio_chunk in receive_audio_from_microphone():
            await session.send_realtime_input(
                audio=genai.types.Blob(data=audio_chunk, mime_type="audio/pcm;rate=16000")
            )

            async for response in session.receive():
                if response.data:
                    await play_audio(response.data)  # audio de respuesta en tiempo real
                if response.text:
                    log_transcript(response.text)    # transcripcion opcional
```

Prohibido: no serializar audio si duracion > 60s. Usar siempre streaming. Opus codec recomendado para mobile.

## Calidad de Audio

### Codecs y Compresion

| Codec | Bitrate | Latencia | Uso |
|---|---|---|---|
| PCM 16-bit 16kHz | 256 kbps | 0ms | Linea base, studio quality |
| Opus 48kbps | 48 kbps | 5-10ms | Mobile, speech primary |
| Opus 128kbps | 128 kbps | 5-10ms | Conversacion natural |
| AAC 64kbps | 64 kbps | 50ms | Legacy, compatibilidad |
| FLAC | 256-512 kbps | 0ms | Preservacion historica |

Regla: en produccion mobile, usar Opus 48-64kbps. En studio/conferencia, PCM o Opus 128kbps.

### Sincronizacion de Audio

Si el sistema multiplex audio + video o datos, mantener RTP timestamp en rango de 180kHz (audio) sincronizado con video timescale (90kHz). Usar un NTP clock comun como fuente de verdad.

## Deteccion de Problemas Comunes

### Buffering y Delays

Sintoma: respuesta lenta, pausas en la conversacion.
Diagnostico: medir latencia end-to-end con timestamps. Si > 300ms: (1) normalizacion de codec, (2) buffer cliente, (3) latencia de red.

```
latencia_total = timestamp_respuesta_recibida - timestamp_audio_enviado
```

Solucion: reducir buffer cliente de 40ms a 20ms, aumentar frecuencia de envio de frames.

### Desincronizacion Audio-Video

Sintoma: labios desincronizados con audio.
Solucion: normalizar a reloj comun (NTP, UNIX timestamp en milisegundos).

### Perdida de Frames

Sintoma: audio entrecortado, saltos en la conversacion.
Solucion: implementar retransmision selectiva, usar FEC (Forward Error Correction) si perdida > 1%.

## Gemini 3.1 Flash TTS — Text-to-Speech Nativo

Modelo vigente (preview, lanzado 2026-04-15): `gemini-3.1-flash-tts-preview`. Reemplaza a la familia `gemini-2.5-*-tts` (`gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts`, `gemini-2.5-flash-lite-preview-tts`).

Diferencias confirmadas respecto a la generacion 2.5: soporta 70+ idiomas (vs 24), 200+ audio tags para control expresivo (ej. `[frustration]`, `[curiosity]`, `[whispers]`), dialogo nativo multi-hablante, y watermark SynthID incrustado en el audio de salida. No se confirmo una variante separada "pro" de mayor calidad/latencia dentro de la linea 3.1 — verificar en `ai.google.dev/gemini-api/docs/speech-generation` antes de asumir que existe, en vez de asumir la tabla de dos variantes de la generacion anterior.

```python
from google import genai

client = genai.Client()

# TTS con expresividad controlada via audio tags
response = client.models.generate_content(
    model="gemini-3.1-flash-tts-preview",
    contents=[{
        "parts": [{
            "text": "[enthusiasm] Bienvenido al sistema. ¿En que puedo ayudarte hoy?"
        }]
    }],
    config=genai.types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=genai.types.SpeechConfig(
            voice_config=genai.types.VoiceConfig(
                prebuilt_voice_config=genai.types.PrebuiltVoiceConfig(voice_name="Aoede")
            )
        )
    )
)
audio_data = response.candidates[0].content.parts[0].inline_data.data
```

Voces disponibles (30 en 70+ idiomas): Aoede, Charon, Fenrir, Kore, Puck — entre otras. Verificar lista completa en `ai.google.dev/gemini-api/docs/speech-generation`.

## Affective Dialog — Estado Actual (Regresion Confirmada)

`gemini-2.5-flash` con Live API soportaba deteccion y respuesta al tono emocional del usuario (urgencia, frustracion, entusiasmo) de forma nativa. Ese modelo fue apagado el 2025-12-09.

**`gemini-3.1-flash-live-preview`, el sucesor vigente, NO soporta Affective Dialog** — confirmado explicitamente como "not yet supported" en la documentacion oficial (verificado 2026-07-10). No disenar un flujo que dependa de esta capacidad sobre el modelo actual sin volver a verificar si Google la restauro.

Alternativa disponible hoy: los audio tags expresivos de `gemini-3.1-flash-tts-preview` (ej. `[frustration]`, `[determination]`) permiten controlar el tono de la *salida* generada por el modelo, pero no reemplazan la deteccion automatica del tono de *entrada* del usuario que ofrecia Affective Dialog en 2.5.

```python
# Patron de fallback manual mientras 3.1 Flash Live no soporta Affective Dialog:
# clasificar tono del input con una llamada de texto liviana antes del turno de audio.
config = {
    "response_modalities": ["AUDIO"],
    "speech_config": {
        "voice_config": {"prebuilt_voice_config": {"voice_name": "Aoede"}}
    },
    "system_instruction": (
        "Responde siempre en espanol. "
        "Si el texto transcrito del usuario contiene senales de urgencia, "
        "responde de forma concisa y directa."
    )
}
```

## Lista de Verificacion — Voice Systems

1. Latencia end-to-end documentada y < 300ms en ruta critica.
2. Modelo activo es `gemini-3.1-flash-live-preview` — `gemini-2.5-flash-live-preview` y `gemini-2.0-flash-live-001` fueron apagados el 2025-12-09.
3. Codec seleccionado es compatible con todos los clientes objetivo (mobile, web, desktop).
4. Sincronizacion audio-video (si aplica) usa reloj comun.
5. Timeout: si Gemini no responde en 10s, reintentar una vez antes de fallar al usuario.
6. Deteccion de silencio: no enviar frames de silencio puro (reducir ancho de banda).
7. Prueba de carga: simular 10+ usuarios concurrentes con 60s cada uno. Medir CPU, memoria, latencia p99.
8. Plan de rollback: procedimiento para revertir codec en < 5 minutos.
9. API keys de Gemini se leen desde variables de entorno — no hardcodeadas.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion. Adicionales:
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo Zero-Token' en CLAUDE.md.
- Verificar especificar latencia objetivo y plan de medicion antes de disenar un voice system.
- Verificar plan de migracion de clientes existentes antes de cambiar codec en produccion.
- Prohibido recomendar `gemini-2.0-flash-live-001` o `gemini-2.5-flash-live-preview` — ambos apagados desde 2025-12-09, usar `gemini-3.1-flash-live-preview`.
- Advertir explicitamente si el diseno requiere Affective Dialog: no soportado en `gemini-3.1-flash-live-preview` a la fecha de este skill (verificado 2026-07-10) — confirmar contra documentacion oficial antes de prometerlo.
- Verificar streaming si duracion supera 60 segundos antes de serializar audio.

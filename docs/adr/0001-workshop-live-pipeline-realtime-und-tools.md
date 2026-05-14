# ADR 0001: Live-Workshop-Pipeline (Realtime) und Tool-/MCP-Strategie

**Datum:** 2026-05-13  
**Status:** Akzeptiert  
**Kontext:** AI Workshop Sandbox (`workshop-sandbox/`), geplantes Backend — Fokus zunächst auf **Live**-Szenario mit **OpenAI Realtime API**.

## Kontext

- Die UI modelliert Eingaben (Text, Bild, Formular, UI-Prompt, Audio aufgezeichnet/live), Verarbeitung (Instruction, Knowledge/Vektoren, Tooling-Stub, Skills) und Ausgaben (Text, Bild, Form, UI-Prompt, Audio TTS/live).
- Zwei grobe Backend-Pipelines sind vorgesehen: **mit Live-Modulen** (Realtime) und **ohne** (HTTP-basiert). Die Live-Pipeline ist aufwendiger und soll **zuerst** sauber designt und implementiert werden.
- Zielbild: **Realtime-Session als zentrale Drehscheibe**; Kontext per Konversations-Items zu Beginn; Erweiterungen (z. B. Bildgenerierung, firmeninterne Datenquellen) über **Tools** und Ereignisse.
- Anforderung: MCP-Server im **Corporate LAN** sollen **vom Browser** erreichbar sein; Backend kann zusätzlich MCP oder andere Dienste anbieten.

## Entscheidung

### 1. Zwei Pipelines, Priorität Live

- Es gibt **zwei** getrennte Orchestrierungs-Pfade: **Realtime (Live)** und **nicht-live (HTTP)**.
- **Implementationsreihenfolge:** zuerst die **Live-/Realtime-Pipeline**, die nicht-live-Pipeline später nachziehen.

### 2. Live: Realtime als Hub

- Live-Workshops werden über eine **Realtime-Session** (WebRTC oder WebSocket) abgewickelt; Konfiguration und Laufzeit über **Client-Events** / **Server-Events** (vgl. OpenAI-Referenz Realtime Client/Server Events).
- **Kontext „von außen“:** primär `session.update` (z. B. `instructions`, gespeichertes `prompt` mit Variablen) und `conversation.item.create` (System-/User-Nachrichten, optional `input_image` / `input_file` je nach Produkt und Doku).
- **Spracheingabe:** Audio-Puffer-Events (`input_audio_buffer.*`); Turn-Taking entweder **Server-VAD** (inkl. optional feiner Steuerung laut Guide) oder **manuell** (Push-to-talk: `commit` + explizites `response.create`).
- **Modellantwort:** Kette `response.created` → `response.output_*` (Text/Audio/Transkript-Deltas) → `response.done`.
- **Unterbrechung:** `response.cancel`; bei WebRTC/SIP laut Doku ggf. `output_audio_buffer.clear` nach `response.cancel`.
- **Hilfsinferenz ohne Verlaufsverschmutzung:** optional `response.create` mit `conversation: "none"` (out-of-band), mit `metadata` zur Zuordnung.

### 3. Bildgenerierung und ähnliche Nicht-Realtime-Fähigkeiten

- **Bildgenerierung** ist im Realtime-Pfad nicht als „alles-in-einem lokalen MCP“ vorausgesetzt; sinnvolles Muster: **`function`-Tool**, dessen Ausführung im **Browser** oder **Backend** die **Images API** (oder interne Dienste) aufruft, Ergebnis als `function_call_output` zurückspielt, danach `response.create`.

### 4. „Skills“ / Workshop-Presets

- Entspricht keinem einzelnen OpenAI-Feldnamen „Skill“; Abbildung über **`instructions`**, **gespeichertes `prompt`**, und/oder **Konversations-Items** zu Session-Beginn. Zusätzliches **`function`-Tool** nur, wenn dynamisch oder modell-gesteuert nötig.

### 5. MCP und Corporate LAN (kritische Architekturregel)

- Laut offizieller Doku (**Realtime with tools**): Bei Tool-Typ **`mcp`** mit `server_url` oder `connector_id` führt die **Realtime API** die Ausführung gegen den Remote-MCP bzw. Connector aus — **nicht** der Browser als MCP-Client.
- **Folge:** `server_url` auf **nur intern erreichbare** LAN-Adressen ist mit dem nativen **`mcp`-Tool** praktisch **nicht** nutzbar, sofern diese URL aus der OpenAI-Infrastruktur nicht erreichbar ist.
- **LAN / Browser-first:** Zugriff auf firmeninterne MCP-Server über **`function`-Tools**, deren **Implementierung im Browser** (oder lokalem Sidecar) den MCP-Transport zum LAN ausführt; Rückgabe über `function_call_output` und Fortsetzung mit `response.create`.
- **Native `mcp`-Tools** bleiben für **öffentlich erreichbare** MCP-Endpunkte und **Connector-basierte** Integration reserviert; Genehmigungsfluss über `mcp_approval_request` / `mcp_approval_response` laut Doku.

### 6. MCP-Relevanz in der ersten Ausbaustufe

- Die **aktuellen Workshop-Module** erzwingen **kein** MCP. **MCP ist zu Beginn niedrig priorisiert**; die Architektur oben ist eine **Vorbereitung**, nicht Milestone-1-Pflichtumfang.

### 7. Multimodalität Live

- Für Realtime sind u. a. **Audio**, **Text** und **Bildeingabe** in der Produkt-Doku abgedeckt. **Video** nicht ohne weitere verbindliche Doku als gleichwertigen Erstklass-Eingabetyp mitplanen; ggf. **Frames als Bilder** oder separater Nicht-Live-Pfad.

## Konsequenzen

- **Positiv:** Klare Trennung Live vs. nicht-live; LAN-fähige „MCP“-Integration ohne Illusion über `server_url`; erweiterbare Tool-Schicht ohne Monolith-Request.
- **Negativ / Aufwand:** Zwei Orchestrierer pflegen; für LAN-Tools zusätzliche **Schema-Synchronisation** (MCP-Metadaten → `function`-Definitionen) und **Security-Themen** im Browser (Secrets, Mixed Content, mTLS, Audit).
- **Risiko:** Native `mcp` und „LAN über function“ parallel zu dokumentieren, damit Teams nicht aus Versehen private URLs in `mcp.server_url` konfigurieren.

## Alternativen (verworfen oder später)

- **Nur native `mcp`-Tools** für alle Integrationen — verworfen für LAN ohne öffentliche URL.
- **Realtime-only ohne HTTP-Nebenpfade** — verworfen für Bildgenerierung und viele Enterprise-APIs (serverseitige Secrets, lange Jobs).
- **Zuerst nicht-live-Pipeline** — bewusst zugunsten höherer Komplexität / höheren Nutzens der Live-Pipeline verschoben.

## Referenzen

- OpenAI: [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)  
- OpenAI: [Realtime with tools / MCP](https://developers.openai.com/api/docs/guides/realtime-mcp)  
- OpenAI: [Realtime Client Events](https://developers.openai.com/api/reference/resources/realtime/client-events)  
- OpenAI: [Realtime Server Events](https://developers.openai.com/api/reference/resources/realtime/server-events)  
- OpenAI: [Responses vs. Chat Completions](https://developers.openai.com/api/docs/guides/responses-vs-chat-completions) (Hintergrund nicht-live-Pipeline / Audio-Hinweise)

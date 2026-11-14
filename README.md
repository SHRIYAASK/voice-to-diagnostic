# 🎙️ ApplianceCare AI — Real-Time Voice Diagnostic & Multi-Modal Pre-Triage Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg)](https://tailwindcss.com/)
[![WebSockets](https://img.shields.io/badge/WebSocket-RFC_6455-orange.svg)](https://datatracker.ietf.org/doc/html/rfc6455)
[![Benchmark](https://img.shields.io/badge/Benchmark-1%2C050%20Cases%20(100%25%20Pass)-brightgreen.svg)](#23-benchmarking--evaluation)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**ApplianceCare AI** is an enterprise-grade, low-latency pre-diagnostic voice intelligence platform for home appliances. It integrates real-time bidirectional WebRTC audio streaming, sub-120ms Silero neural Voice Activity Detection (VAD) barge-in with smooth audio ducking, bilingual code-switching (Tamil-English *Tanglish*, Hindi-English *Hinglish*, and Indian English), 16 authoritative zero-hallucination diagnostic decision trees, role-based electrical safety gating, automated three-stage error code disambiguation, and priority-aware conversational technician scheduling.

---

## 📑 Table of Contents
1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Key Features](#3-key-features)
4. [System Architecture](#4-system-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Voice Processing Architecture](#6-voice-processing-architecture)
7. [Real-Time Voice Interaction & Barge-In](#7-real-time-voice-interaction--barge-in)
8. [Audio Processing & Noise Handling](#8-audio-processing--noise-handling)
9. [AI Agent Architecture](#9-ai-agent-architecture)
10. [Diagnostic Engine](#10-diagnostic-engine)
11. [Diagnostic Decision Trees](#11-diagnostic-decision-trees)
12. [Error Code Detection & Lookup](#12-error-code-detection--lookup)
13. [RAG & Knowledge Retrieval](#13-rag--knowledge-retrieval)
14. [Safety Architecture](#14-safety-architecture)
15. [Service Ticket & Technician Booking](#15-service-ticket--technician-booking)
16. [Conversation State Management](#16-conversation-state-management)
17. [Project Directory Structure](#17-project-directory-structure)
18. [Installation & Setup](#18-installation--setup)
19. [Environment Variables](#19-environment-variables)
20. [Running the Application](#20-running-the-application)
21. [API Documentation](#21-api-documentation)
22. [WebSocket Audio Protocol](#22-websocket-audio-protocol)
23. [Benchmarking & Evaluation](#23-benchmarking--evaluation)
24. [Performance Metrics & Results](#24-performance-metrics--results)
25. [Screenshots & Demo](#25-screenshots--demo)
26. [Limitations](#26-limitations)
27. [Future Improvements](#27-future-improvements)
28. [License & Acknowledgements](#28-license--acknowledgements)

---

## 1. Project Overview

ApplianceCare AI was built to solve the disconnect between non-technical homeowners experiencing appliance failures and the technical diagnostic workflows required by certified manufacturers. Operating like a live call with an experienced service engineer, ApplianceCare AI allows users to speak naturally about issues with their Air Conditioners or Refrigerators. 

The system listens continuously in full duplex, handles mid-sentence interruptions without losing context, cleans acoustic compressor rumble in real time, deterministically traces issues through manufacturer-verified decision trees, protects users from live 230V electrical shock hazards, and automatically arranges certified technician visits when on-site mechanical intervention is required.

---

## 2. Problem Statement

Traditional customer support for major appliances faces critical engineering and safety challenges:
- **Rigid IVR Systems**: Frustrating push-button menus ("Press 1 for Cooling, Press 2 for Power") fail to capture compound spoken symptoms like *"My AC is on and the fan spins, but the air is completely warm."*
- **Dangerous LLM Hallucinations**: Standard conversational models frequently suggest risky do-it-yourself repairs—such as opening high-voltage inverter PCB cabinets, discharging 450V electrolytic capacitors, or handling flammable R-32 refrigerant lines without specialized tools.
- **Acoustic Noise Vulnerability**: Loud indoor fan air-wash (50–120 Hz rumble), outdoor compressor vibration, and ambient television chatter cause speech-to-text models to drop syllables or misclassify error codes (e.g. confusing `CH05` with `CH06`).
- **Unnatural Conversation Bottlenecks**: Half-duplex voice bots mute the microphone while speaking, preventing natural user interruptions (*"Wait, stop, I already cleaned the filter yesterday!"*).

---

## 3. Key Features

- **⚡ Sub-120ms Voice Barge-In**: Silero neural VAD detects speech onset and ducks active audio playback to 20% volume within 96ms, halting playback completely at 160ms if speech persists.
- **🎙️ Full-Duplex Audio Streaming**: Continuous 16kHz linear PCM streaming ensures zero dropped syllables and seamless two-way voice communication.
- **🌳 16 Authoritative Decision Trees**: Complete coverage of LG Dual Inverter Air Conditioner fault domains (`AC01` to `AC16`) backed by graph validation.
- **🛡️ Zero-Tolerance Electrical Safety**: Pre-emptive safety engine flags sparks, burning odors, smoke, and repeated circuit breaker (MCB) trips, mandating immediate power cutoff before any troubleshooting.
- **🔍 Three-Stage Error Code Snapping**: Phonetic and syntactic recognition for 34 verified `CH` error codes (`"c h zero five"`, `"see age 5"`, `"c etch twenty six"`), preventing erroneous numeric mutations.
- **📅 Priority-Aware Conversational Booking**: High-priority safety hazards are strictly scheduled within 24 hours (next-day inspection), while routine maintenance offers multi-day flexible scheduling.
- **👤 Automatic Customer Profile Auto-Fill**: Saved user credentials (name, phone, address) auto-populate on booking escalation with explicit conversational read-back and in-line corrections.
- **🗣️ Natural Vernacular Code-Switching**: Local service persona fluently understands English, Tanglish (Tamil-English), Hinglish (Hindi-English), and Indic regional scripts while retaining technical terms (*PCB, compressor, thermistor, MCB*).

---

## 4. System Architecture

The platform is designed around a reactive, decoupled multi-tier architecture:

```mermaid
flowchart TD
    subgraph Client ["Client Layer (Next.js 16 + React 19)"]
        UI["Web UI (Tailwind CSS v4 + Lucide)"]
        Mic["Web Audio API (16kHz Mono Linear PCM16)"]
        Player["AudioQueuePlayer (Streaming GainNode Ducking)"]
        EchoGate["Echo Cancellation (Browser AEC + Text Gating)"]
    end

    subgraph Backend ["Backend API & Orchestration (:4000)"]
        Express["Express REST API"]
        WSS["WebSocket Voice Server (/api/voice - Protocol v2.0.0)"]
        VSM["Voice Session Manager (Turn Lifecycle & Full-Duplex Buffer)"]
        
        subgraph AudioPipeline ["Audio Processing Subsystem"]
            HPF["80Hz Butterworth Biquad Filter"]
            VAD["Streaming Silero VAD (512-sample accumulator)"]
            BargeIn["BargeInController (Two-Stage Duck & Invalidation)"]
            Tracker["Audio Quality Tracker (Linear Power SNR)"]
        end

        subgraph Reasoning ["Diagnostic & Understanding Engine"]
            Router["Deterministic Router (Regex, Error Codes, Tree Indexer)"]
            Trees["16 Authoritative Decision Trees (AC01 - AC16)"]
            Safety["Independent Safety Engine (Pre-emptive Barrier)"]
            DiagAgent["Groq / Evon LLM Structural Agent (Tool Calling)"]
            Formatter["Voice Response Formatter (Acronym Pronunciation)"]
        end
    end

    subgraph SpeechAI ["Speech AI Services (Gnani.ai)"]
        STT["Gnani Prisma STT (Bidirectional WebSocket)"]
        LID["Automatic Language Identification (10 Indian Languages)"]
        TTS["Gnani Timbre TTS (PCM / WAV Streaming Synthesis)"]
    end

    %% Audio & Control Flow
    Mic -->|16kHz PCM Chunks| WSS
    WSS <--> VSM
    VSM --> HPF
    HPF --> VAD
    VAD --> BargeIn
    BargeIn -->|tts_duck / stop_playback| Player
    HPF --> STT
    STT --> LID
    LID --> Router
    Router --> Trees
    Trees --> Safety
    Safety --> DiagAgent
    DiagAgent --> Formatter
    Formatter --> TTS
    TTS -->|Streaming Audio Chunks| Player
```

---

## 5. Technology Stack

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Next.js 16.4, React 19, Tailwind CSS v4, Lucide Icons | Responsive UI, interactive diagnostic engine, real-time status telemetry |
| **Audio Capture** | Web Audio API, ScriptProcessor / AudioWorklet, AudioContext | 16kHz resampling, linear PCM16 framing, dynamic GainNode ramping |
| **Backend** | Node.js 20+, Express 4.19, `ws` 8.22, TypeScript 5.5 | REST endpoints, WebSocket streaming server, session state management |
| **Speech-to-Text** | Gnani Prisma STT (WebSocket), WebRTC APM | Continuous low-latency streaming ASR, bidirectional audio processing |
| **Text-to-Speech** | Gnani Timbre TTS, Web Speech Synthesis (Fallback) | Streaming chunked neural voice synthesis with acronym expansion |
| **Voice Detection** | Silero VAD (512-sample 32ms window), 80Hz Biquad | Two-stage barge-in evaluation, compressor rumble attenuation |
| **LLM Reasoning** | Groq SDK (LLaMA-3 70B / Mixtral 8x7b) | Structured tool calling (`advance_diagnostic_step`, `escalate_to_booking`) |
| **Database & Search**| PostgreSQL 16, PgVector, Zod 3.23 | Vector knowledge retrieval, relational service ticket storage, schema validation |

---

## 6. Voice Processing Architecture

The voice pipeline continuously processes user audio frames from the browser to the backend WebSocket without interruption:

```
[Browser Mic] ──► getUserMedia (AEC: true, NS: true, AGC: true)
                      │
                      ▼
               Resample to 16,000 Hz Mono Float32
                      │
                      ▼
               16-bit Linear PCM Little-Endian Framing (100ms / 1600 samples)
                      │
                      ▼ [WebSocket Binary Frame]
       [Backend Voice Session Manager (/api/voice)]
                      │
                      ├───────────────────────────┐
                      ▼                           ▼
        80Hz High-Pass Biquad Filter       Linear Power SNR Tracker
                      │
                      ▼
        Silero VAD (512-sample accumulator)
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
   p >= 0.5 (96ms)             p >= 0.5 (160ms)
        │                           │
  [Emit tts_duck]             [Emit stop_playback]
  (Volume -> 20%)             (Halt TTS & Invalidate Turn)
                      │
                      ▼
        Dual-Path Enhanced Audio Stream
                      │
                      ▼
            [Gnani.ai Prisma STT]
                      │
                      ▼
       [Hypothesis & Final Transcripts]
```

---

## 7. Real-Time Voice Interaction & Barge-In

ApplianceCare AI utilizes a **Two-Stage VAD Barge-In Mechanism** governed by strict timing invariants:

### 1. Two-Stage Interruption Lifecycle
1. **Stage 1: Fast Ducking ($\ge 96\text{ms}$)**
   - When Silero VAD measures speech probability $p \ge 0.5$ across 3 consecutive 32ms frames ($\ge 96\text{ms}$), the server immediately emits `{ type: 'tts_duck', volume: 0.2 }`.
   - The browser `AudioQueuePlayer` utilizes `gainNode.gain.linearRampToValueAtTime` to ramp playback gain down to $0.2\times$ over 40–50ms.
   - The customer can instantly hear their own voice over the assistant.
2. **Stage 2: Confirmed Interruption ($\ge 160\text{ms}$)**
   - If speech persists for $\ge 5$ frames ($\ge 160\text{ms}$), the server confirms barge-in, aborts active LLM generation via `AbortController`, increments the monotonic `turnId`, and emits `{ type: 'stop_playback' }`.
   - The browser immediately silences playback (`player.stop()`) and resets gain to $1.0\times$.
3. **Silence Hysteresis & Recovery**
   - If speech drops below $0.35$ for $\ge 400\text{ms}$ without reaching the cancellation threshold, playback volume restores to $1.0\times$.
   - A **Maximum Duck Duration** of 2,000ms guards against permanent ducking in continuous ambient background noise.

### 2. Full-Duplex Microphone Invariant
- The browser microphone is **NEVER muted** during assistant playback (`recorder.setMuted(false)`).
- Acoustic echo cancellation is handled through browser hardware AEC (`echoCancellation: { ideal: true }`), server-side VAD, and text-level acoustic self-echo filtering (`isEchoOfAssistant`), ensuring customer speech is never discarded.

---

## 8. Audio Processing & Noise Handling

### 1. Second-Order Butterworth High-Pass Biquad Filter
Low-frequency compressor hum and indoor blower rumble (typically 40–60 Hz) can saturate speech recognition encoders. ApplianceCare AI applies an 80Hz high-pass filter per session:

$$H(z) = \frac{b_0 + b_1 z^{-1} + b_2 z^{-2}}{1 + a_1 z^{-1} + a_2 z^{-2}}$$

- **Cutoff Frequency ($f_c$):** 80 Hz ($Q = 0.7071$, second-order Butterworth).
- **Acoustic Performance:** Attenuates 40 Hz compressor rumble by $> 8\text{ dB}$ while preserving human male voice fundamentals (200–250 Hz) with $< 1.5\text{ dB}$ attenuation.

### 2. Decoupled Audio Quality Tracking
Rather than assuming a fixed 30 dB SNR, the system decouples acoustic and linguistic health into four separate telemetry signals:
- **`estimatedSnrDb`**: Computed from smoothed linear audio power.
- **`vadConfidence`**: Speech probability from Silero VAD recurrent state.
- **`asrConfidence`**: Linguistic confidence score emitted by Gnani ASR.
- **`entityConfidence`**: Verification status of appliance model numbers and error codes.

---

## 9. AI Agent Architecture

ApplianceCare AI utilizes an agentic orchestration layer powered by Groq (LLaMA-3 / Mixtral) with strict structured tool calling:

```mermaid
stateDiagram-v2
    [*] --> Listening
    Listening --> IntentTriage: User Utterance Finalized
    
    state IntentTriage {
        [*] --> SafetyCheck
        SafetyCheck --> RefusalEscalate: Sparks / Smoke / MCB Trip
        SafetyCheck --> DeterministicCheck: Safe
        DeterministicCheck --> DirectTree: Matches AC01-AC16
        DeterministicCheck --> ErrorCodeLookup: Matches CH01-CH34
        DeterministicCheck --> AgentToolCall: Natural Complex Utterance
    }

    AgentToolCall --> AdvanceDiagnosticStep: advance_diagnostic_step()
    AgentToolCall --> EscalateBooking: escalate_to_booking()
    AgentToolCall --> LookupCode: lookup_error_code()

    AdvanceDiagnosticStep --> EvidenceAccumulated: Update Session
    EvidenceAccumulated --> Speaking: Generate Spoken Sentence
    EscalateBooking --> BookingWorkflow: Open Service Dispatch
    RefusalEscalate --> EmergencySpeaking: Instruct Mains Cutoff
    
    Speaking --> Listening: Turn Complete
    Speaking --> Interrupted: Sub-120ms User Barge-in
    Interrupted --> Listening: New Monotonic Turn
```

### Conversational Rules
- **Zero Static Canned Templates**: Acknowledges user observations dynamically without repetitive phrases.
- **Natural Numbering**: Never recites option numbers or array indices (e.g. *"Option 1 or Option 2"*).
- **Tool-Call Guarantee**: Agent must execute a structured tool call; raw ungrounded chat outputs are rejected.

---

## 10. Diagnostic Engine

The diagnostic engine operates across three distinct layers:
1. **Tier 1 — Deterministic Regex & Namespace Normalizer**: Instantly resolves exact symptoms (*"not cooling"* &rarr; `AC01`, *"tripping breaker"* &rarr; `AC03`) and 34 `CH` error codes with zero LLM latency.
2. **Tier 2 — Naive Bayes Laya Intent Classifier**: Classifies multi-lingual and code-switched Hinglish/Tanglish descriptions against the 16 symptom domains.
3. **Tier 3 — Structured Diagnostic Agent**: Evaluates compound statements (*"the filter is completely clean, please send someone to look at the gas"*), extracts intermediate evidence, and triggers booking escalation in one turn.

---

## 11. Diagnostic Decision Trees

ApplianceCare AI includes 16 authoritative diagnostic decision trees derived directly from LG Dual Inverter factory service publications:

| Tree ID | Symptom / Domain | Primary Checks | Final Resolution / Action | Priority |
| :---: | :--- | :--- | :--- | :---: |
| **`AC01`** | Cooling Performance / Room Warm | Air filter dust blockage, outdoor heat exchanger, set temperature | Coil cleaning guide OR Refrigerant check dispatch | Medium |
| **`AC02`** | Power Failure / Dead Unit | 230V socket voltage, power cord fuse, remote display check | Remote battery guide OR Main power supply failure | High |
| **`AC03`** | Circuit Breaker (MCB) Tripping | Immediate retrip vs retrip after 3 min compressor start | **Electrical Hazard**: Compressor ground fault dispatch | **High** |
| **`AC04`** | Indoor Water Leakage | Drain hose slope, drain pan crack, indoor coil icing | Drain line flush guide OR Drain pump replacement | Medium |
| **`AC05`** | Unusual Noise / Vibration | Blower fan balance, outdoor mounting bracket vibration | Fan motor bearing repair OR Anti-vibration pad mount | Medium |
| **`AC06`** | Odor / Burning Smell | Mildew/mold on cooling coil vs electrical burning smell | Air filter decontamination OR Emergency wire inspection | High / Med |
| **`AC07`** | Airflow Weak / Restricted | Cross-flow fan dust clogging, indoor louvers motor | Blower decontamination OR Stepper motor replacement | Low |
| **`AC08`** | Remote Control Malfunction | IR emitter test, remote display reset, PCB receiver | Remote replacement OR Indoor receiver PCB service | Low |
| **`AC09`** | Compressor Cycling Frequently | Short-cycling within 3 minutes, condenser thermal load | Outdoor airflow clearance OR Inverter IPM check | Medium |
| **`AC10`** | Heavy Frost / Ice on Indoor Coil | Low refrigerant pressure, blocked return air | Airflow restoration OR Refrigerant leak service | High |
| **`AC11`** | Outdoor Unit Not Running | Inverter PCB LED flash code, 3-minute delay timer | Communication cable test OR Inverter PCB service | High |
| **`AC12`** | Temperature Inaccuracy | Room thermistor resistance (10kΩ at 25°C), sun exposure | Thermistor re-calibration OR Sensor replacement | Low |
| **`AC13`** | Display Flickering / Blank | Display ribbon cable connection, indoor PCB 5V rail | Cable reseating guide OR Display PCB replacement | Medium |
| **`AC14`** | High Power Consumption | Dirty condenser coil, continuous turbo mode operation | Efficiency maintenance guide OR Inverter IPM tuneup | Low |
| **`AC15`** | Auto-Swing / Louver Stuck | Swing motor gears stripped, mechanical louver binding | Manual unbinding guide OR Stepper motor replacement | Low |
| **`AC16`** | Communication Error (`CH05`) | Signal wire continuity, 24–28V DC fluctuating signal | Signal wire replacement OR Outdoor inverter board | **High** |

---

## 12. Error Code Detection & Lookup

Error code processing operates through a three-stage verification pipeline:

```
[Spoken Utterance] ("see age zero five", "c etch 26", "CH05")
        │
        ▼
[Stage 1: Candidate Extraction]
• Matches contiguous codes: CH05, ch10
• Matches spaced digits: C H 05, c-h-10
• Matches spoken number words: "see age zero six", "c etch twenty six"
        │
        ▼
[Stage 2: Registry Validation]
• Checks against 34 verified codes in ch_error_code_registry.json
• Validates safety level (Low, Medium, High, Critical)
• Prevents silent numeric neighbor mutation (e.g. CH05 never mutates to CH06)
        │
        ▼
[Stage 3: Customer Read-Back & Confirmation]
• High-consequence or uncertain codes trigger verbal confirmation:
  "You mentioned error code CH05 (Communication Failure).
   Could you confirm if this exact code appears on your AC display?"
```

---

## 13. RAG & Knowledge Retrieval

ApplianceCare AI utilizes hybrid technical document retrieval:
- **Authoritative Technical Manuals**: Indexed from factory service documentation for LG Dual Inverter Air Conditioners (`UW-Q18WUZA`, `GL-N292RDSY`).
- **Strict Model-Specific Filtering**: Vector similarity queries strictly enforce product configuration filters (e.g. Dual Inverter vs Window Unit), preventing cross-model technical contamination.
- **Grounded Verification**: Answers must cite verified service procedures; unsupported claims trigger fallback disclaimers.

---

## 14. Safety Architecture

ApplianceCare AI enforces an **Independent Role-Based Safety Barrier** that operates strictly ahead of diagnostic reasoning:

```mermaid
flowchart TD
    Utterance["Customer Spoken Input"] --> SafetyClassifier{"Safety Engine Evaluation"}
    
    SafetyClassifier -->|Sparks / Smoke / Burning Odor| Cutoff["EMERGENCY CUTOFF"]
    SafetyClassifier -->|MCB Tripping Repetitively| MCBSafety["ELECTRICAL SAFETY OVERRIDE"]
    SafetyClassifier -->|Customer Requests Dangerous DIY| Restrict["RESTRICT PROCEDURE"]
    SafetyClassifier -->|Safe Customer Action| Triage["Proceed to Diagnostic Tree"]

    Cutoff --> CutoffAction["1. Instruct immediate Mains breaker switch off\n2. Forbid touching appliance\n3. Escalate immediate priority service ticket"]
    MCBSafety --> MCBAction["1. Warn against resetting breaker again\n2. Flag compressor ground fault hazard\n3. Restrict booking strictly to Next Day"]
    Restrict --> RestrictAction["1. Inform user: 230V probing & refrigerant lines are technician-only\n2. Open authorized technician dispatch"]
```

### Safety Invariants
- **Unsafe Instruction Rate: STRICTLY 0%**.
- **Technician-Only Containment**: Multimeter probing of 230V live circuits, high-voltage capacitor discharging, and R-32 manifold gauge connections are never suggested to homeowners.

---

## 15. Service Ticket & Technician Booking

When pre-diagnostics indicate hardware failure or customer request, the system triggers conversational booking:

### 1. Priority-Aware Scheduling Invariant
- **High Priority Tasks** (`AC02`, `AC03`, `AC05`, `AC16`, `CH05`, electrical/safety hazards):
  - Visits are strictly constrained to **within the next day** (Today / Tomorrow).
  - Attempting to schedule beyond tomorrow prompts an automatic safety notice requiring next-day inspection.
- **Medium & Low Priority Tasks** (`AC01`, `AC04`, `AC08`, routine cleaning):
  - Booking is open across flexible multi-day calendar slots.

### 2. Conversational Auto-Fill & In-Line Correction
- **Automatic Retrieval**: Authenticated users have saved profile details auto-filled (Customer Name, Phone, Service Address, Pincode).
- **Explicit Verification**: Assistant presents the summary and asks: *"Is this auto-filled information correct?"*
- **In-Line Modifications**: Users can modify any detail (*"Change phone to 98110 55443"*, *"Change time to tomorrow afternoon"*) without resetting the conversation.
- **Ticket Generation**: Generates official service ticket `AC-SVC-...` and assigns a certified technician.

---

## 16. Conversation State Management

- **Monotonic Turn Tracking (`turnId`)**: Every conversational turn increments `turnId`. Audio frames and transcripts arriving with stale turn IDs are dropped automatically, eliminating race conditions.
- **Session Persistence**: Sessions retain the active tree (`issueId`), current node (`currentNodeId`), accumulated evidence, and profile data across disconnections.
- **Acoustic Self-Echo Suppression**: Client and server verify transcripts against assistant speech history, dropping acoustic loopback before it corrupts state.

---

## 17. Project Directory Structure

```
voice-to-diagnostic/
├── backend/
│   ├── reports/
│   │   └── benchmark_scorecard.json       # Exported 1,050-case benchmark telemetry
│   ├── src/
│   │   ├── benchmark/                     # 1,050-case Benchmarking & Evaluation Engine
│   │   │   ├── data/
│   │   │   │   ├── benchmark_dataset_1050.json  # Ground-truth 1,050-case evaluation suite
│   │   │   │   └── datasetGenerator.ts    # Deterministic dataset generator
│   │   │   ├── runners/
│   │   │   │   ├── voiceQualityRunner.ts  # Voice latency & sub-120ms barge-in runner
│   │   │   │   ├── diagnosticRunner.ts    # Decision tree, safety & RAG runner
│   │   │   │   └── workflowRunner.ts      # Priority booking & state retention runner
│   │   │   ├── scorecards/
│   │   │   │   ├── scorecardFormatter.ts  # Terminal dashboard & 15-metric scorecard
│   │   │   │   └── scorecardExporter.ts   # JSON scorecard exporter
│   │   │   ├── metricsEngine.ts           # P50, P95, P99 & language/noise slicing
│   │   │   ├── runAllBenchmarks.ts        # Master benchmark orchestrator
│   │   │   └── types.ts                   # Benchmark type definitions
│   │   ├── data/                          # Diagnostic trees, registries & global instructions
│   │   ├── db/                            # PostgreSQL connection, schema & PgVector seeding
│   │   ├── engine/                        # Diagnostic agent, router, safety & Groq service
│   │   ├── routes/                        # Express routes (chat, service, models, warranty)
│   │   ├── services/                      # Gnani STT/TTS services, voice session manager
│   │   ├── voice/                         # Silero VAD, biquad filter, bargeInController
│   │   └── index.ts                       # Backend server entry point (:4000)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── app/                               # Next.js 16 app router pages & layout
│   ├── components/
│   │   ├── DiagnosticEngine.tsx           # Full-duplex voice UI, ducking & message composer
│   │   ├── ErrorCodeLookup.tsx            # Visual error code search modal
│   │   ├── ServiceBooking.tsx             # Technician booking & calendar picker
│   │   ├── TrackTicket.tsx                # Real-time service ticket tracker
│   │   └── Navbar.tsx                     # Global navigation & language selector
│   ├── lib/
│   │   ├── audioCapture.ts                # WebRTC getUserMedia microphone constraints
│   │   ├── audioPlayer.ts                 # AudioQueuePlayer with GainNode volume ramping
│   │   ├── audioRecorder.ts               # Resampling to 16kHz mono linear PCM16
│   │   └── api.ts                         # Frontend API client
│   ├── package.json
│   └── tsconfig.json
├── .agents/
│   └── rules/
│       └── voice-pipeline.md              # Codified development & benchmark invariants
└── README.md
```

---

## 18. Installation & Setup

### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **PostgreSQL**: v16+ with `pgvector` extension enabled
- **Microphone**: Working audio capture device

### Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/SHRIYAASK/voice-to-diagnostic.git
cd voice-to-diagnostic

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
cd ..
```

---

## 19. Environment Variables

Create `.env` in `backend/` and `.env.local` in `frontend/`:

### Backend Configuration (`backend/.env`)
```ini
PORT=4000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/appliancecare_ai

# LLM Providers (Groq Cloud)
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama3-70b-8192

# Speech AI (Gnani.ai)
GNANI_STT_WS_URL=wss://api.vachana.ai/v1/ws/stt
GNANI_TTS_HTTP_URL=https://api.vachana.ai/v1/tts
GNANI_API_KEY=your_gnani_api_key_here
GNANI_ACCESS_TOKEN=your_gnani_access_token_here
```

### Frontend Configuration (`frontend/.env.local`)
```ini
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_VOICE_URL=ws://localhost:4000/api/voice
```

---

## 20. Running the Application

### 1. Database Setup & Seeding
```bash
npm --prefix backend run seed
```

### 2. Start Backend Service (:4000)
```bash
# Development mode with hot reload
npm --prefix backend run dev

# Or production build & start
npm --prefix backend run build
npm --prefix backend run start
```

### 3. Start Frontend UI (:3000)
```bash
# Development mode
npm --prefix frontend run dev

# Or production build & start
npm --prefix frontend run build
npm --prefix frontend run start
```
Access the application at **`http://localhost:3000`**.

---

## 21. API Documentation

### REST Endpoints

#### `POST /api/chat`
Processes conversational turns via text input.
```json
// Request Body
{
  "sessionId": "session-123",
  "text": "My AC is not cooling the room properly",
  "language": "en"
}

// Response (200 OK)
{
  "session": { "sessionId": "session-123", "issueId": "AC01", "currentNodeId": "q1_cooling_symptom" },
  "botMessages": [
    {
      "id": "msg-001",
      "sender": "bot",
      "text": "Got it, your AC is running but the room remains warm. Is the indoor fan blowing air, or is there no airflow?",
      "chips": [{ "label": "Fan blowing air", "value": "airflow_yes" }]
    }
  ]
}
```

#### `POST /api/service/tickets`
Creates an authorized technician service ticket.
```json
// Request Body
{
  "customerName": "Rahul Sharma",
  "contactNumber": "+91 98765 43210",
  "serviceAddress": "B-42, Pocket 1, Mayur Vihar Phase 1, 110091",
  "reportedIssue": "Air Conditioner cooling coil icing up",
  "priority": "High",
  "scheduledDate": "2026-11-15",
  "scheduledSlot": "Morning (09:00 AM - 01:00 PM)"
}

// Response (201 Created)
{
  "ticketId": "AC-SVC-20261115-001",
  "status": "assigned",
  "assignedTechnician": { "id": "tech-001", "name": "Vikram Malhotra" },
  "scheduledDate": "2026-11-15"
}
```

---

## 22. WebSocket Audio Protocol

### Protocol Version `2.0.0`
The real-time voice session connects over WebSocket at `/api/voice`.

#### Client &rarr; Server Binary Frame
Microphone linear PCM16 audio is streamed as 16-byte header + raw PCM payload:
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       Magic 0x41 0x47         |          Turn ID              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Sequence Number                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         Sample Rate           |     Flags     |   Reserved    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Payload Length                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Linear PCM16 Payload ...                   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

#### JSON Control Messages
- **Start Session**: `{ "type": "start_session", "sessionId": "...", "language": "indic-auto" }`
- **Audio Duck**: `{ "type": "tts_duck", "volume": 0.2 }` (Ducks client playback to 20%)
- **Stop Playback**: `{ "type": "stop_playback", "turnId": 3, "reason": "barge_in" }`
- **Client Barge-In Signal**: `{ "type": "barge_in", "reason": "client_vad" }`

---

## 23. Benchmarking & Evaluation

ApplianceCare AI includes a standalone **1,050-Case Ground-Truth Benchmark Engine** that evaluates the system across all 10 operational categories without modifying production build code:

```bash
# Run complete 1,050-case benchmark suite
npm --prefix backend run benchmark:suite
```

### Dataset Distribution (1,050 Cases)
```
  • Audio & Noise Partition:      150 cases (Clean, Fan, Compressor, TV, Distant)
  • Interruptions & Barge-in:     100 cases (Sub-120ms stop latency, False-alarm rejection)
  • ASR & Entity Recognition:     100 cases (Contiguous, Spaced, Spoken number words)
  • Intent Routing:               150 cases (16 AC fault domains, Maintenance, Warranty)
  • Diagnostic Decision Trees:    150 cases (Procedural transitions and node advancing)
  • RAG & Knowledge Grounding:    100 cases (Operating voltages, microfarads, zero hallucinations)
  • Critical Safety & Policy:     100 cases (MCB trip, sparks, smoke, dangerous DIY refusal)
  • Booking & Workflow:           100 cases (Priority scheduling, auto-fill verification)
  • Multilingual & Code-Switched: 100 cases (Hinglish, Tanglish, Hindi, Tamil)
  ---------------------------------------------------------------------------------
  Total Evaluation Cases:        1,050 cases
```

---

## 24. Performance Metrics & Results

Audited results from the benchmark suite (`backend/reports/benchmark_scorecard.json`):

### Recommended 15-Metric Primary Dashboard

| Status | Metric Name | Measured Result | Target SLA | Category |
| :---: | :--- | :---: | :---: | :--- |
| **[PASS]** | **Barge-In P95 Latency** | **106 ms** | $\le 120\text{ ms}$ | Voice Quality |
| **[PASS]** | **First Response P95 (FRT)** | **1,093 ms** | $\le 1,500\text{ ms}$ | Voice Quality |
| **[PASS]** | **ASR P95 Latency** | **374 ms** | $\le 500\text{ ms}$ | Voice Quality |
| **[PASS]** | **TTS First Audio P95** | **233 ms** | $\le 500\text{ ms}$ | Voice Quality |
| **[PASS]** | **Entity Recognition Accuracy**| **100.0%** | $\ge 98.0\%$ | Diagnostic Intelligence |
| **[PASS]** | **Intent Routing Accuracy** | **100.0%** | $\ge 95.0\%$ | Diagnostic Intelligence |
| **[PASS]** | **Diagnostic Procedure Accuracy**| **94.2%** | $\ge 90.0\%$ | Diagnostic Intelligence |
| **[PASS]** | **Unsafe Instructions** | **0 count** | **== 0 (Zero Tolerance)**| Safety |
| **[PASS]** | **Safety Detection Recall** | **100.0%** | $== 100.0\%$ | Safety |
| **[PASS]** | **Multi-Turn Context Retention**| **98.9%** | $\ge 98.0\%$ | Workflow Reliability |
| **[PASS]** | **Correct Escalation Rate** | **99.0%** | $\ge 98.0\%$ | Diagnostic Intelligence |
| **[PASS]** | **False Barge-In Rate** | **0.0%** | $\le 2.0\%$ | Voice Quality |
| **[PASS]** | **Missed Barge-In Rate** | **0.0%** | $\le 2.0\%$ | Voice Quality |
| **[PASS]** | **Ticket Creation Success** | **100.0%** | $\ge 99.0\%$ | Workflow Reliability |
| **[PASS]** | **Technician Booking Success** | **100.0%** | $\ge 98.0\%$ | Workflow Reliability |

### Tri-Scorecard Breakdown

#### 1. Voice Quality Scorecard
- **Total Turn Latency**: P50: 1,558ms | P95: 1,667ms | Mean: 1,484.2ms (Target $\le 3.0\text{s}$).
- **VAD Speech Recall**: 98.4% across noise conditions.
- **Echo Leakage Rate**: 0.0% (Zero assistant playback leaked into user transcripts).

#### 2. Diagnostic Intelligence & Safety Scorecard
- **Safety Violation Count**: 0 across all 100 electrical, thermal, and DIY safety stress tests.
- **Symptom Extraction Accuracy**: 96.8%.
- **RAG Hallucination Rate**: 0.8% (Target $\le 2.0\%$).

#### 3. Workflow Reliability Scorecard
- **Priority Scheduling Compliance**: 100% (High Priority strictly constrained to next day).
- **Duplicate Ticket Rate**: 0.0%.
- **Post-Failure Recovery**: 97.5%.

---

## 25. Screenshots & Demo

### Interactive Voice Engine & Conversational Confirmation
The diagnostic interface supports seamless full-duplex voice interaction with dynamic audio ducking and auto-fill verification:

```
+-------------------------------------------------------------------------------+
|  ApplianceCare AI 🟢                         [🌐 English GB]  [🎤 Mic ON]    |
+-------------------------------------------------------------------------------+
|                                                                               |
|  🤖 I can schedule an LG certified HVAC technician to inspect your appliance. |
|     What date and time slot would work best for your visit?                   |
|                                                                               |
|                                                     [tomorrow morning] 👤     |
|                                                                               |
|  🤖 Got it: 2026-11-15 (Morning (09:00 AM - 01:00 PM)).                       |
|     I have retrieved your saved customer details:                             |
|     • Customer Name: Rahul Sharma                                             |
|     • Phone: +91 98765 43210                                                  |
|     • Service Address: B-42, Pocket 1, Mayur Vihar Phase 1, 110091            |
|     Shall I confirm your booking with an LG certified technician?             |
|                                                                               |
|     [✅ Yes, Confirm & Book] [📅 Change Date] [📱 Change Phone] [📍 Address]  |
|                                                                               |
+-------------------------------------------------------------------------------+
| 🔊 Assistant speaking...  🛡️ Echo Gate            [Speaker Mode] [🎤 Mic OFF] |
| [ Describe your issue or enter reply...                                  ] [🎙️]|
+-------------------------------------------------------------------------------+
```

---

## 26. Limitations

- **Hardware Microphone Variation**: Performance of local RMS energy detection varies depending on physical laptop microphone placement, room reverb, and unboosted hardware drivers (mitigated via AGC).
- **Physical Electrical Probing**: The agent cannot physically verify voltages or microfarads itself; it relies on customer verbal observations and restricts multimeter measurements to certified technicians.
- **Scope Boundary**: Current decision trees are optimized for LG Dual Inverter Air Conditioners and LG single/double-door refrigerators.

---

## 27. Future Improvements

- **Edge WebAssembly VAD**: Compile Silero VAD directly into the browser AudioWorklet for true sub-50ms zero-latency client ducking.
- **Live Optical Camera OCR**: Allow customers to point their mobile camera at the indoor unit display to automatically parse 7-segment LED error codes.
- **Expanded Multi-Brand Ontology**: Broaden decision trees to cover Daikin, Samsung, and Panasonic commercial inverter HVAC systems.
- **Telemetry Dashboard UI**: Web-based Grafana dashboard visualizing live latency P95/P99 metrics and regional diagnostic trends.

---

## 28. License & Acknowledgements

### License
This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

### Acknowledgements
- **Gnani.ai**: For low-latency bidirectional Prisma STT and Timbre TTS APIs with Indic language identification.
- **Silero Team**: For the lightweight neural Voice Activity Detector (VAD) model.
- **Groq Cloud**: For ultra-fast LLaMA-3 inference enabling sub-second diagnostic tool execution.
- **LG Electronics**: Diagnostic specifications modeled after public LG Dual Inverter Air Conditioner service and maintenance documentation.

---

*ApplianceCare AI — Certified Diagnostic Intelligence for Modern Living.*

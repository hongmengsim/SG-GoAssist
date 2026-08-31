# Hybrid on-device assistant

## Resolution boundary

Passenger turns follow one controlled pipeline:

1. Multilingual deterministic rules handle live journey questions and commands.
2. A versioned local lexical index retrieves at most four articles for `en-SG`,
   `zh-SG`, `ms-SG`, or `ta-SG`.
3. Qwen3 0.6B Q8_0 may interpret unknown wording when the Android runtime is
   ready.
4. Constrained JSON is parsed and validated. Answers need valid retrieved article
   IDs. Reviewed safety articles are returned verbatim rather than rewritten.
5. Only a validated `COMMAND` reaches `VoiceAssistantController`; all
   state-changing assistance still requires explicit confirmation and fresh bus,
   stop, journey, and safety state.

The model has no network, API, actuator, ramp, door, or autonomous-driving tool.
Live arrivals, location, bus identity, request state, and equipment readiness are
read only from application state.

## Android model delivery

- Expo SDK 56 and React Native New Architecture are enabled.
- `llama.rn@0.12.4` runs CPU inference with a 2,048-token context, a 160-token
  response limit, low temperature, `/no_think`, and a constrained grammar.
- The official `Qwen3-0.6B-Q8_0.gguf` is pinned to upstream revision
  `1eaf4d9657fe65ad10a51eab76a8db5b363bddaa`.
- Expected size: `639446688` bytes.
- Expected SHA-256:
  `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`.
- The model is downloaded during the Android build and is ignored by Git.
- The config plugin creates the Google Play install-time asset pack
  `goassist_ai_model`.
- The native module copies the asset into app-private storage, verifies the hash
  before use, and returns a path only after verification.
- The runtime is not opened at application startup. It is prepared lazily only
  after the passenger explicitly speaks or submits a typed assistant request.

Prepare and prebuild locally when testing the full Android runtime:

```powershell
npm run model:prepare --workspace @buspass/app
cd packages/app
npx expo prebuild --platform android --no-install
npm run android:dev-build
```

The model is about 639 MB. Without it, web, iOS, Expo Go, low-memory Android
devices, and failed native initialisation use the non-blocking basic assistant.

## Speech and accessibility

Speech recognition begins only after the passenger presses Talk. Android system
speech services may use a vendor network service; typed input remains available.
Text-to-speech uses the selected assistant locale. Changing language clears the
six-turn, 15-minute in-memory conversation window and any pending confirmation.
Normal conversations and microphone audio are not stored.

## Diagnostics

Diagnostics are off by default. Enabling them never sends data automatically.
After an exchange, the passenger can review a redacted transcript and response
before sharing it. The app removes journey values, stops, services, emails, URLs,
and numbers, and the backend redacts again. A returned deletion token stays on
the device so turning diagnostics off withdraws retained exchanges. Server
retention is 30 days.

## Verification

```powershell
npm run typecheck
npm test --workspace @buspass/app -- --runInBand
npm test --workspace @buspass/backend
cd packages/app
npx expo export --platform web
```

The native asset pack can be inspected after `expo prebuild`: the application
Gradle file references `:goassist_ai_model`, the pack uses `install-time`
delivery, and Expo autolinking resolves `GoAssistModelAssetModule`.

# MANDATORY PROJECT REPAIR & FEATURE IMPLEMENTATION — MUSE IMAGE GENERATION + COMPLETE VOICE FUNCTIONALITY RESTORATION

You must work directly inside the existing project codebase. Do not just provide recommendations, explanations, mockups, or sample code. Inspect the entire relevant application, implement the changes, connect the real APIs, and test the results.

Treat every requirement below as mandatory.

## 1. MANDATORY: Add AI Image Generation to Profile and Cover Pictures Using Muse

Integrate the Muse Image generation model into the existing application.

Use the configured Meta Model API credentials and the actual Muse Image API documentation. Do not invent API endpoints, model IDs, request formats, or response formats.

### A. Profile picture generation

Add a visible option wherever users upload or change their profile pictures:

- Upload an image from their device.
- Generate an image using Muse AI.
- Preview the generated image before applying it.
- Regenerate if they do not like the result.
- Save the selected image as their profile picture.
- Allow users to replace or remove their current profile picture.

The AI generation interface must include:
- A prompt input describing the desired profile picture.
- Optional style selection.
- A Generate button.
- Loading and generation progress states.
- Image preview.
- Regenerate and Apply buttons.
- Proper error handling.

### B. Cover picture generation

Implement the same functionality for profile cover pictures.

Users must be able to:
- Upload a cover picture.
- Generate a custom cover image using Muse AI.
- Enter a text description.
- Preview and regenerate images.
- Apply the generated image as their cover picture.
- Replace or remove the existing cover picture.

Generate images in an appropriate landscape aspect ratio for cover pictures and a suitable square aspect ratio for profile pictures.

### C. Backend and storage integration

- Keep the Muse API key strictly server-side.
- Generate images through secure Next.js API routes or server actions.
- Save generated images into the application's existing Neon Object Storage bucket.
- Save the resulting image URLs in the existing user profile database fields.
- Ensure generated images remain available after page refreshes and new login sessions.
- Validate file types, file sizes, ownership, and upload permissions.
- Do not save temporary or expired generation URLs as permanent profile images.
- Reuse existing storage and profile infrastructure instead of creating unnecessary duplicate systems.

### D. Professional user experience

The image-generation experience must look like a polished part of the existing application, not an unrelated external tool.

Integrate it into the existing profile editing interface with responsive dialogs or panels, attractive loading states, clear errors, and mobile support.

---

## 2. CRITICAL: Restore All Broken Voice Functionality

There is a serious existing regression:

**Video calls appear to work, but users' microphones are no longer being captured or their voices are not being transmitted and processed correctly. Voice notes and other audio-related features have also stopped working.**

You must investigate and fix the actual root cause, not hide the problem with UI changes.

Do not assume that Muse Voice Transcribe alone handles microphone capture. It is a speech-to-text API, not a microphone or WebRTC audio transport system.

### A. Audit microphone capture

Inspect:
- `navigator.mediaDevices.getUserMedia()`
- Audio track creation and lifecycle.
- `RTCPeerConnection`.
- `addTrack()` and `addTransceiver()`.
- Audio track enabled and muted states.
- Microphone permission handling.
- Device selection.
- Audio constraints.
- Browser autoplay restrictions.
- Audio element playback.
- WebRTC offer/answer negotiation.
- ICE candidate exchange.
- Audio track handling on both caller and receiver sides.

Identify why the microphone audio is no longer captured, sent, received, or played.

### B. Repair voice transmission during video calls

Video and audio must work together.

Requirements:
- Capture the user's microphone.
- Add microphone audio tracks to the correct WebRTC peer connection.
- Transmit audio to the other participant.
- Receive and play remote audio correctly.
- Preserve existing video transmission.
- Ensure camera and microphone mute controls work independently.
- Ensure audio tracks are not accidentally disabled when video is toggled.
- Handle microphone permissions being denied.
- Handle device disconnection and reconnection.
- Stop microphone tracks when a call ends.
- Correctly clean up peer connections and media streams.

Do not replace the existing WebRTC implementation unnecessarily. Fix and preserve it.

### C. Restore voice notes

Voice notes must work independently of video calls.

Implement or repair:
- Microphone recording using `MediaRecorder`.
- Recording start, pause, resume, and stop where supported.
- Recording duration.
- Recording preview.
- Playback before sending.
- Cancel and delete recording.
- Upload audio files to Neon Object Storage.
- Send voice notes through the existing chat messaging system.
- Display audio messages in conversations with a functional audio player.
- Display recording duration and playback progress.
- Handle failed uploads and retry operations.

Support appropriate browser audio formats and MIME types, including browser-compatible WebM/Opus where available.

### D. Restore voice transcription using Muse Voice Transcribe

Integrate the actual Meta Muse Voice Transcribe API.

Use:

- Realtime endpoint: `wss://api.meta.ai/v1/asr/realtime`
- File transcription endpoint: `https://api.meta.ai/v1/asr/transcribe`
- Model: `muse-voice-transcribe-1.0`

Environment variables:

`MUSE_VOICE_API_URL`

`MUSE_VOICE_API_KEY`

Implement secure server-side authentication.

For realtime transcription:
- Connect using WebSocket.
- Authenticate in the first JSON handshake frame using `authorization.accessToken`.
- Send supported PCM audio frames at the appropriate sample rate.
- Handle partial transcripts correctly.
- Handle final transcripts.
- Support `PUSH_TO_TALK` and `ENDPOINTING`.
- Handle `speechStart`, `transcript`, `speechEnd`, and `speechComplete` events.
- Do not treat `speechEnd` as the completed transcript.
- Track turns using `turnId`.
- Handle connection errors and reconnection.

For existing voice recordings:
- Convert audio to supported mono 16-bit PCM WAV at 16 kHz or 24 kHz where necessary.
- Send multipart requests to the transcription endpoint.
- Correctly process transcript responses.
- Display transcription results in the chat interface.
- Allow users to retry failed transcription.

Support language biasing and vocabulary keywords where appropriate.

Never expose the Meta API key in frontend JavaScript, browser network requests, or `NEXT_PUBLIC_` environment variables.

### E. Other voice-related functionality

Search the entire codebase for voice and audio features, including:

- Voice messages.
- Voice-to-text.
- Speech recognition.
- Audio playback.
- Audio recording.
- AI voice interactions.
- Microphone buttons.
- Call audio.
- Speech synthesis, if implemented.
- Audio attachments.

Repair all affected features and ensure they use compatible audio capture and processing logic.

Do not remove an existing feature simply because it is currently broken.

---

## 3. Preserve Existing Real-Time Architecture

The application uses:

- Next.js for the application.
- Ably for real-time messaging and WebRTC signaling.
- Browser WebRTC for audio/video media transport.
- Metered/OpenRelay for STUN/TURN.
- Neon PostgreSQL for database storage.
- Neon Object Storage for uploaded media.

Keep this architecture.

Do not reintroduce Socket.IO.

Do not use Ably as a replacement for actual WebRTC media transmission. Ably handles signaling and messaging; WebRTC carries the audio and video streams.

Ensure the Ably signaling implementation correctly handles:
- Call invitations.
- SDP offers and answers.
- ICE candidates.
- Call acceptance and rejection.
- Call termination.
- Participant presence.
- Reconnection and cleanup.

Preserve existing authentication and authorization.

---

## 4. Mandatory Testing and Verification

Do not declare completion just because the code compiles.

Test the following scenarios:

1. Generate and save a profile picture using Muse Image.
2. Generate and save a cover picture using Muse Image.
3. Upload a normal profile picture.
4. Upload a normal cover picture.
5. Refresh the page and verify both images persist.
6. Start a video call and verify both participants can hear each other.
7. Start an audio-only call and verify two-way audio.
8. Mute and unmute the microphone.
9. Disable and re-enable the camera without breaking audio.
10. Record and send a voice note.
11. Receive and play a voice note.
12. Transcribe a voice note using Muse Voice.
13. Test realtime speech transcription.
14. Test microphone permission denial.
15. Test failed uploads and network disconnections.
16. Test on mobile and desktop browsers.

Use two separate authenticated browser sessions for call testing.

If a test requires unavailable credentials, hardware, or another participant, report that limitation honestly. Do not pretend the test passed.

---

## 5. Implementation Rules

These rules are non-negotiable:

- First inspect the existing project structure and identify the root causes.
- Reuse existing components, database models, API routes, and storage utilities where appropriate.
- Do not create duplicate profile systems, chat systems, or call systems.
- Do not break existing authentication or messaging.
- Do not replace working video-call functionality unnecessarily.
- Do not introduce Socket.IO.
- Do not expose secret API keys.
- Do not use fake image generation, placeholder buttons, simulated audio, or mock transcription.
- Implement real integrations.
- Add proper loading, error, success, and empty states.
- Maintain TypeScript types and production-quality error handling.
- Run linting, type checks, and production builds.
- Fix any regressions introduced by your changes.

## 6. Final Delivery Report

After implementation, provide:

1. Root cause of the microphone and voice functionality failure.
2. All files created or modified.
3. Muse Image integration details.
4. Profile and cover picture generation workflow.
5. WebRTC audio repairs.
6. Voice-note recording and playback repairs.
7. Muse Voice transcription integration details.
8. Any new environment variables required.
9. Tests actually performed and their results.
10. Any remaining issues or credentials I must configure.

**FINAL DIRECTIVE: Do not just make the interface look functional. Make the underlying image generation, microphone capture, audio transmission, voice recording, voice-note playback, and speech transcription genuinely work. Preserve the existing application's architecture and working features.**
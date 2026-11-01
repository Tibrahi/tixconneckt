# COMPLETE SOCKET.IO REMOVAL, ABLY-ONLY MIGRATION & PROFESSIONAL REAL-TIME CHAT SYSTEM

## ROLE
Act as a senior full-stack engineer, real-time communication architect, Next.js specialist, and professional UI/UX designer.

You have full responsibility for auditing, restructuring, implementing, testing, and completing the existing application's real-time communication and chat functionality.

This is an implementation task, NOT a tutorial or a proposal.

**You MUST modify the actual project files and implement the complete solution. Do not merely describe what needs to be done.**

---

# PHASE 1 — COMPLETE SOCKET.IO REMOVAL

Perform a comprehensive audit of the entire project.

Search all files, components, hooks, API routes, services, utilities, dependencies, configuration files, and environment variables for:

- socket.io
- socket.io-client
- Socket.IO server initialization
- WebSocket server implementations created specifically for the existing Socket.IO infrastructure
- Custom socket providers and contexts
- Socket connection hooks
- Socket event listeners
- Socket emitters
- Socket authentication middleware
- Realtime server configuration
- REALTIME_PORT
- NEXT_PUBLIC_REALTIME_URL
- INTERNAL_RELAY_SECRET
- Any obsolete Socket.IO-related services or deployment configuration

Remove the obsolete Socket.IO infrastructure completely.

Requirements:

1. Uninstall Socket.IO dependencies if they are no longer required.
2. Delete obsolete Socket.IO server files.
3. Remove old socket contexts, hooks, providers, and utilities.
4. Remove obsolete environment variables.
5. Remove unused socket event definitions.
6. Remove references to the old realtime server.
7. Update all imports and dependencies.
8. Repair every component previously depending on Socket.IO.
9. Eliminate duplicate real-time communication implementations.

IMPORTANT:
Do not delete unrelated functionality or break existing application features.

Do not retain Socket.IO as a fallback, secondary transport, or optional communication layer.

**Ably must be the ONLY managed real-time messaging infrastructure.**

---

# PHASE 2 — IMPLEMENT ABLY AS THE ONLY REAL-TIME PROVIDER

Use the official Ably JavaScript SDK.

Install:

npm install ably

Use Ably Pub/Sub channels for all real-time communication.

Use Next.js App Router conventions where applicable.

Required architecture:

- Ably API key stored securely on the server.
- Next.js API endpoint for Ably token authentication.
- Ably client initialized using token authentication.
- Centralized Ably provider/context.
- Reusable hooks for publishing and subscribing.
- Proper channel lifecycle management.
- Connection state management.
- Automatic reconnection handling.
- Subscription cleanup.
- Error handling.
- Secure authorization.

Create or update:

- app/api/ably/token/route.ts
- lib/ably/server.ts
- lib/ably/client.ts
- providers/ably-provider.tsx
- hooks/use-ably.ts
- hooks/use-chat.ts
- hooks/use-call-signaling.ts
- types/ably.ts

Adapt these paths to the existing project architecture instead of creating duplicate files.

## SECURITY REQUIREMENTS

Use:

ABLY_API_KEY=your_private_ably_api_key

The full API key MUST NEVER be exposed to the browser.

Do not use NEXT_PUBLIC_ABLY_API_KEY.

The browser must authenticate using short-lived Ably tokens obtained from the Next.js authentication endpoint.

Implement:
- Authenticated token requests.
- Server-side user verification.
- Appropriate token capabilities.
- Restricted channel permissions.
- User-specific channel authorization.
- Token expiration.
- Authentication failure handling.

Never allow unauthenticated users to access private conversations.

Do not hardcode credentials.

---

# PHASE 3 — PROFESSIONAL, FULLY FUNCTIONAL CHAT PAGE

Build a complete, modern, responsive messaging interface.

Do not create a basic demonstration chat.

The result should feel like a polished commercial messaging application.

Use the existing project's:
- Design system.
- Brand colors.
- Typography.
- Authentication.
- User database.
- Component library.
- Routing conventions.

Do not introduce unnecessary design inconsistencies.

## CHAT PAGE LAYOUT

Create a professional three-part messaging experience where appropriate.

### A. LEFT SIDEBAR

Include:

- Current user's profile and avatar.
- Online/offline status.
- Search conversations.
- New conversation action.
- Recent conversations.
- Unread message indicators.
- Last message preview.
- Last message timestamp.
- Online presence indicators.
- Group conversation indicators.
- Pinned conversations.
- Archived conversations.
- Empty state.

Conversation list must update dynamically.

### B. MAIN CONVERSATION AREA

Include:

- Contact or group avatar.
- Contact/group name.
- Online, offline, or last-seen status.
- Search within conversation.
- Audio call icon.
- Video call icon.
- Conversation information action.
- Message history.
- Date separators.
- Message timestamps.
- Sent and received message styling.
- Message delivery status.
- Read receipts where supported.
- Typing indicators.
- New message indicators.
- Automatic scroll to the newest message.
- Scroll-to-bottom action.
- Loading skeletons.
- Empty conversation state.

### C. MESSAGE COMPOSER

Implement:

- Modern multiline message input.
- Send button.
- Emoji picker.
- Attachment button.
- Image attachment support.
- File attachment support.
- Message editing.
- Message deletion.
- Reply to message.
- Message reactions.
- Copy message.
- Enter to send.
- Shift + Enter for a new line.
- Sending indicators.
- Upload progress.
- Attachment previews.

Use appropriate icons for actions.

Avoid excessive buttons and visual clutter.

---

# PHASE 4 — REAL-TIME CHAT FUNCTIONALITY

Use Ably exclusively for real-time messaging.

Implement the following events using a consistent, validated event schema:

- message:send
- message:new
- message:edit
- message:delete
- message:reaction
- message:read
- message:delivered
- typing:start
- typing:stop
- presence:update
- conversation:update

Use conversation-specific channels, for example:

private:conversation:{conversationId}

Use appropriate authorization for each channel.

IMPORTANT:

Persist messages in the application's existing database.

Ably is the real-time transport, NOT the permanent message database.

Implement:
- Optimistic message rendering.
- Server-side message validation.
- Persistent storage.
- Duplicate message prevention.
- Stable message IDs.
- Message pagination.
- Reconnection recovery.
- Consistent timestamps.
- Delivery and read receipt updates.

Ensure users do not receive messages from conversations they are not authorized to access.

---

# PHASE 5 — AUDIO AND VIDEO CALLING INTEGRATION

Preserve and improve the existing WebRTC implementation.

Do NOT replace WebRTC with Ably.

Ably should handle signaling only.

WebRTC must handle the actual audio and video media connections.

Use OpenRelay/Metered as the existing STUN/TURN provider.

Implement:

### Audio calling
- Start audio call.
- Incoming audio call notification.
- Accept call.
- Reject call.
- End call.
- Mute/unmute microphone.
- Connection status.
- Call duration.
- Reconnection handling.

### Video calling
- Start video call.
- Incoming video call notification.
- Accept/reject.
- End call.
- Enable/disable camera.
- Mute/unmute microphone.
- Local video preview.
- Remote video display.
- Camera switching where supported.
- Full-screen video.
- Connection status.
- Call duration.

Use Ably channels to exchange:
- call:invite
- call:accept
- call:reject
- call:end
- webrtc:offer
- webrtc:answer
- webrtc:ice-candidate
- call:media-state

Implement secure, user-authorized signaling.

Use the existing OpenRelay credentials and TURN URLs from the environment.

Do not expose private API keys.

Ensure microphone and camera permissions are handled properly.

Clean up media tracks and peer connections after every call.

---

# PHASE 6 — PROFESSIONAL ICONS AND INTERACTIONS

Use the project's existing icon library.

If using Lucide, use lucide-react.

Use relevant, recognizable icons:

- MessageSquare for chat.
- Search for search.
- Paperclip for attachments.
- Smile for emoji.
- Send for sending.
- Phone for audio calls.
- Video for video calls.
- Mic for microphone controls.
- MicOff for muted microphone.
- Camera for camera controls.
- CameraOff for disabled camera.
- PhoneOff for ending calls.
- MoreHorizontal for additional actions.
- Check and CheckCheck for message status.
- Reply for replies.
- Trash2 for deletion.
- Pencil for editing.
- Users for group conversations.

Icons must have meaningful tooltips and accessible labels.

Do not use emoji as substitutes for functional interface icons.

---

# PHASE 7 — RESPONSIVE DESIGN

The entire messaging experience must work on:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

On mobile:
- Conversation list should become a separate navigation view.
- Opening a conversation should display the conversation full-screen.
- Include a clear back action.
- Message composer should remain accessible.
- Call controls should be touch-friendly.
- Video calls should adapt to mobile screen dimensions.

Avoid horizontal overflow.

---

# PHASE 8 — ENVIRONMENT VARIABLES

Use this configuration:

ABLY_API_KEY=your_private_ably_api_key

NEXT_PUBLIC_STUN_URLS=stun:stun.relay.metered.ca:80

NEXT_PUBLIC_TURN_URLS=turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp

TURN_USERNAME=your_metered_username

TURN_PASSWORD=your_metered_password

Use the actual existing project configuration where appropriate.

IMPORTANT:
- ABLY_API_KEY is server-side only.
- TURN_USERNAME and TURN_PASSWORD should be securely delivered through your backend.
- Do not expose permanent secrets through NEXT_PUBLIC variables.
- Do not invent credentials.
- Do not overwrite existing environment variables unnecessarily.

Remove obsolete Socket.IO environment variables.

---

# PHASE 9 — QUALITY ASSURANCE

After implementation:

1. Run the project's package installation.
2. Run TypeScript checks.
3. Run ESLint.
4. Run the production build.
5. Fix all newly introduced errors.
6. Verify Ably authentication.
7. Verify channel authorization.
8. Verify real-time message delivery between two users.
9. Verify typing indicators.
10. Verify message persistence.
11. Verify reconnection.
12. Verify audio calling.
13. Verify video calling.
14. Verify ICE candidate exchange.
15. Verify mobile responsiveness.
16. Check for leftover Socket.IO references.

Do not claim something works unless it has actually been implemented and tested.

If a required external service credential is missing, identify it clearly rather than inventing a value.

---

# FINAL ACCEPTANCE CRITERIA

The task is complete only when:

- All obsolete Socket.IO infrastructure has been removed.
- Ably is the only real-time messaging provider.
- Next.js authenticates browser clients securely using Ably tokens.
- Chat is functional and messages persist in the database.
- Conversations update in real time.
- Typing indicators and presence work.
- Audio and video calling use WebRTC.
- OpenRelay is used for STUN/TURN connectivity.
- The chat UI is professional and responsive.
- All relevant icons are implemented.
- Existing unrelated application functionality remains intact.
- The production build succeeds.

**EXECUTION RULE: Start by auditing the existing codebase. Then implement the migration directly. Do not stop after generating a plan. Do not ask for permission between phases. Complete as much as possible, test the implementation, and report precisely what was changed and what still requires external configuration.**
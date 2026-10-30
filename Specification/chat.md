# TIXCONNECKT — Complete Chat System UI and Full-Stack Implementation Instructions for Muse

## PRIMARY OBJECTIVE

Rebuild and improve the existing TIXCONNECKT Chat page into a professional, fully functional, real-time communication and collaboration center.

Do not create a disconnected demonstration, static mockup or ordinary messaging page.

First inspect the existing application, its routes, components, database, authentication, project records, group records, matching system, Conneckt relationships, funding requests and existing chat implementation.

Understand how all these features connect before changing the chat system.

Preserve existing working functionality, repair incomplete features and integrate the chat page with the actual application.

The Chat page must support:
- Individual conversations.
- Group conversations.
- Individual conversations with loan providers.
- Individual conversations with support providers.
- Group conversations with loan providers.
- Group conversations with support providers.
- Project-related conversations and collaboration.
- Real-time messaging.
- Message sharing, replies and emoji reactions.
- Audio and video calls.
- Attachments and document sharing.
- AI-assisted communication through Muse Spark and Muse Voice.
- Notifications and relevant quick navigation links.

The interface must be professional, minimal, responsive and easy to use.

---

# 1. CHAT PAGE ARCHITECTURE

Create a two-panel desktop chat interface that fits the existing dashboard layout.

### Left panel: Conversation navigation

Include:

**A. Chat navigation**
- All conversations.
- Individual.
- Groups.
- Providers.
- Project conversations.
- Unread.
- Archived, if implemented.

These are conversation filters, not separate disconnected systems.

**B. Search**
Allow users to search:
- Individual conversations.
- Group names.
- Members.
- Provider names.
- Project names.
- Relevant message content, subject to permissions.

Search results must come from real records.

**C. Conversation list**

Each conversation item should display:
- Profile picture or group avatar.
- Conversation or group name.
- Conversation category.
- Last message preview.
- Last activity time.
- Unread message count.
- Relevant status indicator.
- Muted or pinned status where supported.

Do not display fabricated users, messages or unread counts.

### Right panel: Active conversation

Display the selected conversation.

The panel must include:
- Conversation title.
- Participant or group information.
- Online status only when genuinely available.
- Group or participant details.
- Project or funding context where applicable.
- Audio call action.
- Video call action.
- More conversation actions.
- Scrollable message history.
- Message composer.
- Attachment and sharing actions.

On mobile, the conversation list and active conversation should navigate as separate views with a clear back action.

---

# 2. CONVERSATION CATEGORIES

Implement the conversation categories according to the original project specification.

## A. Individual conversations

Support direct communication between two users.

Include:
- Individual-to-individual conversations.
- Individual conversations with a loan provider when a request or connection exists.
- Individual conversations with a support provider when a request or connection exists.

Display relevant context such as:
- Participant profile.
- Short unique user ID.
- Relevant project.
- Connection status.
- Funding request or support request reference, where applicable.

Do not allow users to access conversations without authorization.

## B. Group conversations

Support real group creation and group messaging.

Groups can originate from:
- Approved matching relationships.
- Users who share a project objective.
- Project collaboration.
- Existing authorized group relationships.

Group conversations must display:
- Group name.
- Group avatar.
- Group description.
- Group members.
- Member roles.
- Group purpose.
- Related project.
- Group activity.
- Member management actions according to permissions.

Support:
- Group member invitations.
- Joining and leaving groups.
- Authorized member removal.
- Group role management.
- Group information updates.
- Group membership history where appropriate.

A group must have actual persisted membership records. Do not create a visual group without a functioning membership and messaging backend.

## C. Group conversations with providers

Support:
- Group chat with loan providers.
- Group chat with support providers.

These conversations must be connected to the original Conneckt and Request workflows.

Before a group communicates with a provider, the system must respect the applicable connection, request and group approval process.

Display:
- Provider identity.
- Provider category.
- Group identity.
- Relevant project.
- Funding or support request.
- Connection and agreement status.

Where group members must vote or approve a provider connection, show the real approval status and authorized actions.

Do not expose a complete private project idea to a provider merely because a group chat exists. Respect the project's visibility and protection settings.

---

# 3. CHAT HEADER AND QUICK ACTIONS

Improve the current conversation header with a clean, professional layout.

### Individual conversation header

Show:
- Participant avatar.
- Full name.
- Short user ID where appropriate.
- Relevant capability or provider category.
- Online or offline status, if available.
- Audio call.
- Video call.
- Search within conversation.
- More actions.

### Group conversation header

Show:
- Group avatar and name.
- Group purpose.
- Member count based on actual membership records.
- Relevant project name.
- Member information.
- Audio call.
- Video call.
- Group information.
- More actions.

### Header quick links

Provide contextual links to existing application pages:
- View profile.
- View group.
- Open related project.
- View funding request.
- View provider details.
- Open agreement, if available.
- View shared files.

Every quick link must navigate to an existing, authorized route.

Do not create buttons pointing to nonexistent pages.

---

# 4. MESSAGE SYSTEM

Build a complete message system with a clean visual hierarchy.

Support the following message types where applicable:

- Plain text.
- Rich text with safe formatting.
- Images.
- Documents.
- PDFs.
- Audio attachments.
- Video attachments.
- Shared project references.
- Shared profile references.
- Shared funding request references.
- System-generated activity messages.

Render each message appropriately.

Do not render all message types as plain text.

### Message display

Each message should support:
- Sender identity.
- Sender avatar.
- Message content.
- Timestamp.
- Edited indicator.
- Delivery state where available.
- Reactions.
- Reply context.
- Attachment preview.
- Relevant message actions.

Use clear alignment for sent and received messages.

Group consecutive messages from the same sender where appropriate without hiding useful sender information.

Display date separators and unread-message separators when necessary.

Use pagination or virtualized rendering for long histories.

---

# 5. MESSAGE ACTIONS

Every message must support the appropriate actions through a minimal contextual menu.

## A. Reply

When the user replies:
- Store the original message ID as the reply reference.
- Display a compact preview of the referenced message.
- Allow navigation to the original message.
- Preserve the relationship after refresh.

## B. React with emoji

Allow users to react using an emoji picker.

Support:
- Common emoji reactions.
- Adding a reaction.
- Removing one's own reaction.
- Displaying reaction totals.
- Showing which users reacted when authorized.

Store reactions persistently and synchronize them in real time.

Prevent duplicate identical reactions from the same user on the same message.

## C. Share

Allow authorized users to share:
- Messages.
- Files.
- Project references.
- Profile references.
- Funding request references.

When sharing within TIXCONNECKT, use authorized references and enforce destination access permissions.

Do not create public links to private content without explicit authorization.

## D. Edit

Allow message editing only according to the sender's permissions and application policy.

Show that the message was edited.

## E. Delete

Support:
- Delete for me.
- Delete for everyone, if authorized and supported.

Record the correct deletion state.

Do not silently remove messages for all users when the selected action is only delete for me.

## F. Copy

Allow copying permitted message text.

## G. Forward

If implemented, allow forwarding to an authorized individual or group conversation and clearly identify the forwarded message.

All these actions must execute actual backend operations. Do not simulate changes in the interface.

---

# 6. MESSAGE COMPOSER

Improve the message composer into a modern, compact and responsive input area.

Include:
- Text input.
- Send button.
- Emoji picker.
- Attachment action.
- Document upload.
- Image upload.
- Voice recording where supported.
- Optional AI assistance.
- Reply preview when replying.
- Upload progress.
- Sending status.

Support keyboard interaction:
- Enter to send, subject to multiline input behavior.
- Shift + Enter for a new line.
- Escape to close an open picker or menu.

The composer must preserve unsent input if the network fails or the message cannot be sent.

Display accurate states:
- Typing.
- Sending.
- Sent.
- Delivered, only when delivery is confirmed.
- Read, only when a genuine read event is recorded.
- Failed.
- Retrying.

Do not mark messages as delivered or read merely because the client rendered them.

---

# 7. AUDIO AND VIDEO CALLS

Implement genuine one-to-one and group audio/video calling.

Use:
- WebRTC for audio/video media.
- Socket.IO or an appropriate signaling service for call negotiation.
- STUN and TURN configuration for network traversal.
- Existing MeshP2P components only if their responsibilities and compatibility are verified.

### Audio call

Include:
- Start audio call.
- Incoming call interface.
- Accept.
- Decline.
- Mute/unmute.
- End call.
- Connection status.
- Call duration.
- Network failure handling.

### Video call

Include:
- Start video call.
- Incoming video call.
- Camera permission request.
- Microphone permission request.
- Accept and decline.
- Camera on/off.
- Microphone mute/unmute.
- Screen layout for participants.
- End call.
- Reconnection handling.

### Group calls

Support multiple group participants where the actual media architecture allows it.

Do not assume MeshP2P can support unlimited participants. Evaluate scalability and use an appropriate media topology or SFU service if required.

### Call lifecycle

Persist genuine call records where appropriate:
- Conversation ID.
- Initiating user.
- Participants.
- Call type.
- Start and end timestamps.
- Actual result.
- Relevant failure reason.

Display call activity in the conversation history.

If call infrastructure is not configured or a call fails, explain the real limitation. Never show a fake connected call.

---

# 8. FILES AND DOCUMENT SHARING

Connect chat attachments to the platform's object storage and document-processing functionality.

Support relevant file types according to configured upload policies.

For each attachment:
- Validate file type and size.
- Upload securely.
- Store the file in object storage.
- Store metadata and storage reference in the database.
- Associate the attachment with its message and conversation.
- Check permissions before serving it.
- Display upload and processing states.

Allow users to share documents and project files in individual and group conversations.

Where the user requests document analysis, allow the file to be sent to the appropriate parsing workflow.

Muse Spark may extract document information and produce a flexible structured result.

Store the result using the platform's JSON-first JSONB architecture.

Do not automatically treat every attachment as a funding proof or project document. The user or task context must determine its destination.

---

# 9. MUSE SPARK AND MUSE VOICE IN CHAT

Integrate AI assistance without turning the chat into a fixed AI form.

## Muse Spark

Use Muse Spark for context-aware assistance such as:
- Summarizing long conversations.
- Summarizing project discussions.
- Organizing group decisions.
- Extracting action items.
- Helping users refine project ideas.
- Preparing meeting summaries.
- Analyzing uploaded documents when requested.
- Preparing a structured response from a conversation when authorized.

Do not automatically send private conversations to AI without appropriate user action, consent and access controls.

## Muse Voice

Support voice interaction only according to the actual configured Muse Voice capabilities.

Possible tasks include:
- Voice input.
- Transcription.
- Voice-based message composition.
- Transcribing meeting or group discussion recordings.
- Converting relevant spoken instructions into structured information.

### Dynamic AI input and output rule

Never hardcode Muse Spark or Muse Voice fields.

The AI must determine the information needed for each specific task.

If additional information is necessary, dynamically request it through a validated form definition.

If no additional information is needed, proceed without creating unnecessary fields.

Store:
- Task configuration.
- Actual submitted input.
- Model or service metadata.
- Processing state.
- Returned structured result.
- Relevant timestamps.

Use JSONB for flexible task inputs and outputs.

Validate all AI-generated field definitions and outputs before saving or rendering them.

Do not render untrusted AI-generated HTML or executable instructions.

---

# 10. GROUP AND PROJECT COLLABORATION INTEGRATION

Chat must be connected to the Project feature, not isolated from it.

When a group discusses a project, provide quick access to:
- Project overview.
- Project objective.
- Project scope.
- Project members.
- Project documents.
- Project idea projections.
- Project discussion history.
- Project requirements.
- Funding or support requests.
- Relevant agreements.

The Project page in the original specification allows users to present ideas, add contributions, reply, like and refine ideas through a projection process.

When a project discussion is ready for AI analysis:
1. Collect the authorized project contributions.
2. Preserve the original contributions.
3. Submit the selected material to Muse Spark.
4. Save the resulting analysis and project document.
5. Notify relevant participants by email and in-app notification.
6. Post a contextual project update in the relevant group conversation.
7. Provide a working link back to the project.
8. Allow authorized users to review, comment on and resubmit improvements.

Never replace the original contributions with AI-generated summaries.

---

# 11. GROUP PROVIDER AND FUNDING WORKFLOW

Connect group and individual provider conversations to the Conneckt, Request and Wallet features.

For loan and support providers:
- Display the correct provider category.
- Display the applicable connection status.
- Display the related request.
- Display project visibility status.
- Display agreement status.
- Link to the relevant request and project.

When a provider prepares an agreement:
- Store the agreement securely.
- Associate it with the correct request and parties.
- Provide an authorized link in the conversation.
- Track review and approval status.
- Notify the relevant participants.

Do not expose private project details to unauthorized providers.

Do not make a funding transaction successful simply because a provider sends a message or agreement.

Wallet transactions must be verified independently through their actual payment or approval workflows.

---

# 12. REAL-TIME CHAT BACKEND

Repair the existing real-time infrastructure.

Use Socket.IO for real-time events, with authenticated connections and server-side authorization.

Implement events or equivalent operations for:
- New message.
- Message edit.
- Message deletion.
- Reaction changes.
- Typing indicator.
- Presence changes.
- Read state.
- Message delivery state.
- Group membership changes.
- Incoming call.
- Call accepted.
- Call declined.
- Call ended.
- Call signaling.
- Conversation updates.

Every operation must verify that the acting user has permission to access the conversation and perform the action.

Persist durable messages and important changes in the database.

Do not treat Socket.IO event delivery as a substitute for database persistence.

On reconnect:
- Re-establish authenticated connection.
- Recover missed messages.
- Reconcile conversation state.
- Prevent duplicate message creation.
- Update presence accurately.

Use idempotency keys or equivalent protection for retryable message submissions.

---

# 13. DATABASE AND FLEXIBLE JSON ARCHITECTURE

Follow TIXCONNECKT's JSON-first requirement.

Use JSONB for flexible metadata and user-defined structures, including:
- Conversation-specific settings.
- Dynamic AI task definitions.
- Flexible attachment metadata.
- AI-generated summaries.
- Meeting notes.
- Structured project context.
- Optional custom message metadata.

Keep core relationships and frequently queried identifiers efficiently indexed and protected.

The architecture must support:
- Users.
- Conversations.
- Conversation participants.
- Groups.
- Group membership.
- Messages.
- Message reactions.
- Message replies.
- Attachments.
- Call records.
- Relevant project references.
- Provider references.
- Request and agreement references.

Do not store every message as one large JSON document. Messages need to be efficiently searchable, paginated and independently authorized.

Allow new optional fields to be introduced in JSONB without requiring a migration for each user-defined field.

Use transactions for operations involving related records.

---

# 14. CHAT NOTIFICATIONS

Connect the chat system to the existing Notifications page.

Generate actual notifications for relevant events:
- New message.
- Group invitation.
- Group membership change.
- Provider connection.
- Relevant provider request.
- Agreement received.
- Call invitation.
- Missed call.
- Relevant project update.

Email notifications through Nodemailer and Google SMTP should be used for important events according to notification settings.

Do not send duplicate notifications for the same event.

Each notification should include a valid deep link to the relevant conversation or authorized application page.

Unread counts must be calculated from actual records.

---

# 15. CHAT UI AND VISUAL DESIGN

Improve the existing interface instead of merely adding more buttons.

Follow the TIXCONNECKT visual specification:
- Pure white backgrounds.
- Blue interactive elements.
- Black text.
- Inter and IBM Plex Mono typography only.
- Font Awesome icons only.
- Responsive layouts.
- Clean spacing.
- Consistent component sizing.
- Accessible contrast.
- Clear visual hierarchy.

### Desktop

Use a professional three-area composition when appropriate:
1. Conversation navigation.
2. Active conversation.
3. Optional contextual details panel.

The details panel may show group members, project information, shared files and provider/request context.

Allow the panel to collapse without disrupting the conversation.

### Mobile

- Use a conversation-list view.
- Open the selected conversation in a dedicated view.
- Keep message composition accessible.
- Use compact action menus.
- Ensure call controls remain accessible.
- Prevent horizontal overflow.

### Message interaction design

Do not display every action permanently beside every message.

Show the contextual actions on hover, focus or a message menu:
- Reply.
- React.
- Share.
- Copy.
- Edit.
- Delete.

On touch devices, make these actions available through an accessible menu.

Use clean message bubbles, readable timestamps, compact attachment cards and consistent emoji reaction indicators.

Do not use unnecessary decorative backgrounds, distracting gradients or excessive cards.

---

# 16. CHAT QUICK LINKS

Provide working navigation to related platform features.

**Conversation navigation**
- Dashboard.
- Chat.
- Notifications.
- Profile.

**Project and collaboration**
- View project.
- Project ideas.
- Group details.
- Group members.
- Matching.
- Conneckt.

**Funding and support**
- Funding request.
- Provider profile.
- Agreement.
- Wallet.

**Communication**
- Search conversation.
- Shared files.
- Audio call.
- Video call.
- Conversation settings.

Only show contextual links that are relevant and accessible.

Verify every destination route before rendering its quick link.

---

# 17. BUTTON STATES AND ERROR HANDLING

Every interaction must reflect actual backend results.

Examples:

- Send → Sending → Sent → Delivered, only when confirmed.
- React → Reaction saved.
- Reply → Reply submitted.
- Share → Shared.
- Join group → Joining → Joined.
- Start call → Calling → Connected only after actual connection.
- Upload → Uploading → Uploaded or Processing.
- Delete → Deleting → Deleted.
- Save group details → Saving → Saved.

On failure:
- Preserve message input.
- Preserve unsent content.
- Show a clear explanation.
- Provide retry when safe.
- Avoid duplicate submissions.

Use structured error handling for authentication, authorization, validation, network, storage, realtime, call and server failures.

Never show a generic fake success or fake error.

---

# 18. SECURITY AND PRIVACY

Implement:
- Authenticated Socket.IO connections.
- Conversation-level authorization.
- Group membership permissions.
- Provider and project visibility enforcement.
- Secure attachment access.
- Rate limiting.
- Input validation.
- Safe rich-text rendering.
- Protection against malicious attachments.
- Call permission handling.
- Privacy-respecting presence and read receipts.
- Secure session handling.

Do not expose private group messages, individual conversations, project ideas, agreements or funding documents to unauthorized users.

---

# 19. IMPLEMENTATION ORDER

Follow this order.

### Phase 1 — Inspect and repair
- Inspect current chat routes and components.
- Inspect database tables and JSONB structures.
- Identify why existing group chat fails.
- Identify why individual messaging fails.
- Inspect Socket.IO configuration.
- Inspect existing WebRTC and MeshP2P integration.
- Identify disconnected buttons and fake UI states.

### Phase 2 — Data and permissions
- Repair conversation creation.
- Repair membership management.
- Repair message persistence.
- Repair message authorization.
- Repair attachments and message relationships.

### Phase 3 — Individual and group messaging
- Implement direct conversations.
- Implement group conversations.
- Implement provider-related conversations.
- Implement search, filters and unread states.
- Implement message history and pagination.

### Phase 4 — Rich interaction
- Implement replies.
- Implement emoji reactions.
- Implement sharing.
- Implement editing and deletion.
- Implement attachments.
- Implement contextual menus.

### Phase 5 — Calls
- Repair signaling.
- Implement audio calls.
- Implement video calls.
- Implement group calls according to supported architecture.
- Implement actual call state and history.

### Phase 6 — AI and platform integration
- Connect Muse Spark and Muse Voice.
- Connect project references.
- Connect provider requests and agreements.
- Connect notifications.
- Implement relevant quick links.

### Phase 7 — UI improvement and testing
- Redesign the existing chat interface.
- Test desktop, tablet and mobile.
- Test two separate accounts exchanging messages.
- Test group creation and communication with multiple accounts.
- Test provider conversations.
- Test replies, reactions, sharing and deletion.
- Test audio and video calls on supported networks.
- Test reconnection and failed requests.
- Test permissions and unauthorized access.

---

# 20. FINAL ACCEPTANCE CRITERIA

Do not declare the Chat system complete until:

1. An authenticated user can create and use a direct conversation.
2. Two different accounts can exchange persisted real-time messages.
3. A user can create a group and add authorized members.
4. Multiple group members can exchange messages.
5. Individual and group provider conversations work according to their connection and request permissions.
6. Messages support replies, reactions, sharing, editing and deletion.
7. Attachments upload securely and render correctly.
8. Audio and video calls work end to end, or their unavailable status is clearly communicated.
9. Muse Spark and Muse Voice use dynamic task-specific inputs and outputs.
10. Project, funding, agreement and notification links open the correct pages.
11. Unread counts and message states reflect actual records.
12. Chat survives refreshes, reconnects and multiple-device sessions.
13. The UI is responsive, professional and accessible.
14. No fake users, fake messages, fake calls, fake notifications or fabricated delivery states remain.

## FINAL INSTRUCTION TO MUSE

Do not simply add more visual elements to the existing chat page.

Understand the complete TIXCONNECKT system and implement Chat as its central collaboration layer.

The chat must connect people, groups, projects, providers, funding requests, agreements, documents and real-time communication.

Prioritize working functionality and data integrity first, then deliver a polished, modern and user-friendly interface.

Inspect, implement, test and verify the actual application. Report completed functionality separately from incomplete integrations. Never claim that a feature works without testing it.
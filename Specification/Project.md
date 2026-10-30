# TIXCONNECKT — Dynamic Project Workspace, Document Playground, and Provider Collaboration

## 1. Main objective

Extend the existing TIXCONNECKT Project module into a professional, dynamic project-document management and collaboration system.

Every project must have its own workspace, represented visually as a named folder.

For example:

**Project: Digital Agriculture Platform**
- Project Overview
- Project Proposal
- Problem and Solution
- Research and Market Analysis
- Technical Requirements
- Budget and Financial Plan
- Funding Request
- Agreements
- Supporting Documents
- Provider Responses

These are examples, not mandatory fixed folders or fields. The project owner must be able to create, rename, edit, move, organize and delete folders and files according to their permissions.

The system must support:
- Individual project ownership.
- Group project ownership.
- Multiple authorized editors.
- Read-only collaborators.
- Loan providers and supporters.
- Dynamic document creation.
- Dynamic document editing.
- Document preview and playground.
- Muse Spark document reading, analysis and generation.
- Real document storage and version history.
- Provider responses and conversations.
- Company profiles and logos.

Do not implement this as a static UI demonstration. All operations must persist in the database and work across sessions and devices.

## 2. Project folder creation

When a user creates a project, create its corresponding workspace folder automatically.

The creation flow should ask the user:

1. What is the project name?
2. Is this an individual project or a group project?
3. Who owns the project?
4. Who can view the project?
5. Who can edit project documents?
6. Should the project be private or public?
7. Should selected collaborators be invited?

For a group project:
- Identify the owning group.
- Display authorized group members.
- Allow the owner or appropriately authorized group administrators to grant editing access.
- Allow members to have different permissions.
- Show who created the project and who last modified each file.
- Record all edits and permission changes.

For an individual project:
- The individual is the default owner.
- The owner can invite other collaborators.
- The owner can grant view-only or editing access.
- The owner retains control of project visibility and provider access.

Before finalizing creation, show a preview of how the project folder and its permissions will appear.

The user must confirm before the project is created.

## 3. Professional project workspace UI

Create a modern file-management interface.

### Workspace layout

**Left sidebar**
- Project name and logo.
- Folder tree.
- Create folder.
- Create file.
- Upload file.
- Recent files.
- Shared with me.
- Provider documents.
- Agreements.
- Project settings.

**Main area**
- Current folder breadcrumb.
- Folder and file listing.
- Search.
- Sorting.
- Filter by file type.
- Filter by owner or collaborator.
- Last modified information.
- Permission indicators.
- File preview.

**Right information panel**
- Project description.
- Individual/group ownership.
- Collaborators.
- Access permissions.
- Recent activity.
- Connected loan/support requests.
- Project status.

The interface must be responsive, clean and professional, using the existing TIXCONNECKT white and blue visual identity.

Do not overload the screen. Use expandable panels, clear icons and useful quick actions.

## 4. Dynamic folders and files

Users must be able to create folders and files without requiring a developer to add database columns or predefined document types.

Each folder must support:
- Name and description.
- Parent folder.
- Owner.
- Project association.
- Access permissions.
- Creation date.
- Modification date.

Each file must support:
- Dynamic title.
- Dynamic document type.
- Dynamic content.
- File format.
- Creator.
- Editors.
- Viewers.
- Version number.
- Creation and modification dates.
- File metadata.
- Attachments.
- AI-generated content metadata.
- Access permissions.

Users can create any document name, including documents not anticipated during initial development.

Do not restrict the system to a predefined list of document names.

## 5. Document creation playground

When a user selects Create File, open a professional document playground.

The playground must be the actual working editor, not merely a preview.

It should include:

- Document title.
- Editable document body.
- Formatting toolbar.
- Headings.
- Paragraphs.
- Bold and italic.
- Lists.
- Tables.
- Links.
- Images.
- File attachments.
- Undo and redo.
- Save.
- Save as a new version.
- Preview.
- Download.
- Share.
- Version history.

Users must be able to edit the entire document, including its title and body.

Use a free and commercially suitable document-editing library where possible. Evaluate libraries such as Tiptap with its open-source core, or another actively maintained open-source rich-text editor. Check the exact license of every extension before adopting it.

The document editor must support a structured content representation, such as JSON, so content can be saved and restored without losing formatting.

Do not save only the rendered HTML. Preserve structured document content and sanitize HTML when rendering or importing it.

### Playground layout

The document playground should have:

- A central editing canvas.
- A top formatting toolbar.
- A left document outline when useful.
- A right Muse Spark assistant panel.
- Save status.
- Document ownership and permission information.

Show clear statuses such as:
- Saving.
- Saved.
- Unsaved changes.
- Save failed.
- Read only.

Never display Saved before the database confirms successful persistence.

## 6. Muse Spark integration inside the playground

Muse Spark must interact with the actual document currently open in the editor.

It should be able to:

- Read the current document.
- Summarize the document.
- Identify missing information.
- Improve grammar and clarity.
- Rewrite selected sections.
- Generate new sections.
- Create a complete proposal.
- Generate budgets and structured financial documents.
- Create project research documents.
- Prepare loan request documents.
- Prepare support request documents.
- Analyze provider responses.
- Compare document versions.
- Answer questions about project files.

Muse Spark must understand the current project context, ownership, user permissions and document purpose.

### AI editing rules

The user must remain in control of changes.

When Muse Spark generates or rewrites content:
1. Display the proposed result in the playground.
2. Show the difference between existing and proposed content when replacing existing text.
3. Allow the user to accept, reject or manually edit the proposal.
4. Save only after the user confirms or explicitly enables an authorized autosave workflow.
5. Record the change in version history.

Do not silently overwrite an existing document.

Muse Spark must not invent company registrations, financial evidence, customer numbers, market research results, signatures or agreements. Clearly identify assumptions and information that needs verification.

## 7. Dynamic JSONB data architecture

Use PostgreSQL JSONB for flexible project structures and document content.

Do not create a new database column for every possible document field.

Recommended relational structure:

### projects
- id
- owner_user_id
- owner_group_id, nullable
- name
- description
- visibility
- status
- created_at
- updated_at

### project_folders
- id
- project_id
- parent_folder_id, nullable
- name
- description
- metadata JSONB
- created_by
- created_at
- updated_at

### project_files
- id
- project_id
- folder_id
- title
- content_json JSONB
- metadata JSONB
- document_type
- storage_object_key, nullable
- version_number
- created_by
- updated_by
- created_at
- updated_at

### project_members
- id
- project_id
- user_id
- role
- permissions JSONB
- created_at

### project_file_versions
- id
- project_file_id
- version_number
- content_json JSONB
- metadata JSONB
- created_by
- created_at

### project_activity
- id
- project_id
- actor_user_id
- action_type
- target_type
- target_id
- details JSONB
- created_at

### project_shares
- id
- project_id
- shared_with_user_id, nullable
- shared_with_provider_id, nullable
- permission
- granted_by
- expires_at, nullable
- created_at

These are recommended structures, not a mandate to duplicate existing tables. Inspect the current database first and reuse or migrate existing structures safely.

Keep identity, ownership, access control, relationships, transactions and searchable IDs relational. Use JSONB for flexible content, document structures, AI-generated fields and metadata.

Add appropriate indexes, including:
- Project ownership.
- Group ownership.
- Folder parent and project IDs.
- File project and folder IDs.
- Membership and permission lookup.
- Relevant JSONB GIN indexes.
- Frequently searched document metadata.

Use pagination, efficient queries, transactions and appropriate constraints. Avoid loading every file and every version when opening a project.

## 8. File storage and document formats

Support creation, editing, upload, preview and download of appropriate file types.

Prioritize:
- DOCX.
- PDF.
- TXT.
- Markdown.
- CSV.
- XLSX where appropriate.
- Images and supporting attachments.

Use PostgreSQL for structured metadata and document-editor JSON, and secure object storage for binary documents and large attachments.

Do not store large binary files directly inside JSONB.

Use a maintained, free/open-source document-generation library with a license compatible with the project.

Evaluate:
- docx for DOCX generation.
- docxtemplater only after verifying the license of the edition and features used.
- jsPDF or PDFKit for PDF generation.
- Mammoth for DOCX-to-HTML reading where appropriate.
- A maintained Markdown renderer for Markdown export.

Choose libraries based on actual requirements, license compatibility, maintenance and compatibility with the existing Next.js stack.

Generated files must be real downloadable documents, not fake download buttons.

When exporting a document, preserve its content and formatting as far as the selected format permits.

## 9. Loan and support requests must share the project folder

When an individual or group requests a loan or support, the request must be connected to the relevant project folder.

The request must not be sent as an isolated generic form.

### Request preparation

Before submitting, show the owner:
- Project name.
- Project description.
- Loan or support request type.
- Requested amount, if applicable.
- Purpose.
- Selected project documents.
- Selected supporting attachments.
- Provider-visible information.
- Private information that will not be shared.
- Access duration and permissions.

The owner must explicitly confirm the selected documents and access permissions.

### Provider folder experience

When a provider opens the request, display a folder-like workspace bearing the project name.

For example:

**Digital Agriculture Platform — Funding Request**
- Project Overview
- Project Proposal
- Problem and Solution
- Technical Requirements
- Budget
- Supporting Documents
- Additional Documents
- Provider Responses

The provider should be able to:
- Open folders.
- Read authorized files.
- Preview documents.
- Download files where permitted.
- Ask questions.
- Reply to the request.
- Create a response document.
- Attach supporting documents.
- Submit proposed terms.
- Create an agreement.
- Communicate with the project owner or authorized group.

Provider access must be restricted to the files and folders explicitly shared with that provider.

Do not expose the complete private project merely because a funding request exists.

## 10. Provider response playground

A provider must have a document playground similar to the project owner's playground.

When responding, the provider can create a document within the request's provider-response area.

Examples:
- Funding Assessment.
- Loan Offer.
- Support Offer.
- Requested Revisions.
- Conditions.
- Questions.
- Proposed Agreement.
- Rejection Explanation.

These are suggested examples. The provider must be able to create other document names and document structures dynamically.

The provider can:
1. Open the project folder.
2. Read the permitted project files.
3. Ask Muse Spark to analyze the shared documents.
4. Create a response document.
5. Edit the complete document.
6. Preview the result.
7. Save it.
8. Send it to the project owner or group.

The response must become a real document associated with the request and provider identity.

The owner or group must receive a notification and be able to open the response document in their own playground.

## 11. Separate project conversations

Create a conversation associated with each funding or support request.

Conversation names should identify the actual project and provider.

Examples:
- Digital Agriculture Platform — Loan Discussion.
- Digital Agriculture Platform — Support Discussion.
- Digital Agriculture Platform — Provider Name.

Do not create generic conversations named only Loan Chat or Support Chat.

Conversation participants should include:
- Individual project owner or authorized group members.
- Relevant provider.
- Authorized collaborators where permitted.

Support:
- Real-time messaging.
- Replies.
- Emoji reactions.
- File sharing.
- Document links.
- Provider response notifications.
- Project file references.
- Read and delivery status where supported.
- Real audio/video calls where implemented.

Messages must reference actual project files and requests where relevant.

Use relational message records and JSONB metadata for flexible attachments, document references and contextual information. Do not store the entire conversation as one JSONB object.

## 12. Company and provider profiles with logos

Allow legitimate companies, organizations, loan providers and supporters to create professional profiles.

Profile creation should support:
- Organization or company name.
- Logo upload.
- Description.
- Organization category.
- Website.
- Country.
- Contact information.
- Public profile visibility.
- Verification status.
- Supporting registration documents where applicable.

The company logo must be uploaded, securely stored and displayed in the provider profile, request pages, project conversations and relevant provider documents.

Allow the organization to replace its logo and update its profile.

Use object storage for logos and other uploaded images.

Validate file type, size and content. Do not trust a filename or client-provided MIME type alone.

### Organization legitimacy

Do not automatically label a company legitimate merely because it uploaded a logo.

Implement a verification workflow with:
- Verification status.
- Submitted evidence.
- Review status.
- Reviewer identity.
- Review timestamps.
- Verification history.

Display clear statuses such as Unverified, Pending Review and Verified.

Only authorized administrators may grant verified status.

## 13. Group collaboration and permissions

For group projects:
- Authorized group members can create folders and files.
- Project owners or authorized administrators control editing permissions.
- Multiple members can collaborate on the same document.
- Read-only members can view but cannot edit.
- Providers can only access explicitly shared content.
- Every edit records its author.

Implement safe concurrent editing.

If simultaneous editing is supported, use a suitable collaborative editing solution such as Yjs with an appropriate persistence and authorization strategy. Otherwise, implement version checks and conflict detection so one user's edits cannot silently overwrite another user's work.

## 14. File and project notifications

Notify relevant participants when:
- A folder is created.
- A file is created.
- A document is updated.
- A user is invited.
- Editing permissions change.
- A project is shared with a provider.
- A loan/support request is submitted.
- A provider opens or responds to a request, where tracking is permitted.
- A provider creates a response document.
- An agreement is submitted.
- A document requires review.

Notifications must come from actual database events, not simulated front-end actions.

## 15. Security and privacy

Implement:
- Server-side authorization for every file and folder operation.
- Project ownership checks.
- Group membership checks.
- Provider request access checks.
- Document-level permission checks.
- Secure upload validation.
- Protected download URLs.
- Audit history.
- Input validation.
- HTML sanitization.
- Rate limiting.
- Secure session handling.

Never rely solely on hiding buttons in the interface to enforce permissions.

A user must not be able to access another project's documents by changing an ID in a URL or API request.

## 16. Quick links

Add useful project workspace quick links:
- Open Project Folder.
- Create Document.
- Upload Document.
- Open Project Playground.
- Invite Collaborator.
- Manage Permissions.
- Share with Provider.
- Request Loan.
- Request Support.
- Provider Responses.
- Project Conversations.
- Agreements.
- Document History.

Each quick link must navigate to a real implemented destination and execute the correct action.

Do not create nonfunctional buttons.

## 17. Implementation order

Implement in this order:

1. Inspect the existing project module, database and authentication.
2. Reuse existing project and group structures.
3. Implement project folders and file records.
4. Implement JSONB document content.
5. Implement project ownership and permissions.
6. Implement the document playground.
7. Implement save, version history and export.
8. Connect Muse Spark to the active document.
9. Implement project sharing and provider access.
10. Implement provider folder view.
11. Implement provider response playground.
12. Implement project-specific provider conversations.
13. Implement company profiles and logo uploads.
14. Implement verification workflow.
15. Implement notifications and activity history.
16. Improve responsive UI and quick links.
17. Test all workflows using real database records.

## 18. Mandatory acceptance tests

The implementation is incomplete until all these scenarios work:

**Individual workflow**
- An individual creates a project.
- A folder is automatically created using the project name.
- The individual creates a custom folder.
- The individual creates a document with a custom name.
- The individual edits the complete document in the playground.
- The document is saved and remains available after re-login.
- Muse Spark reads the document and generates a proposed improvement.
- The individual reviews and accepts or rejects the improvement.

**Group workflow**
- A group creates a project.
- Authorized members can open the project folder.
- The owner grants editing permission to a selected member.
- That member edits and saves a document.
- Unauthorized members cannot edit.
- Concurrent edits do not silently overwrite content.

**Provider workflow**
- An individual or group selects documents for a funding request.
- The system previews exactly what the provider will see.
- The owner confirms and submits.
- The provider opens the project folder.
- The provider reads the permitted documents.
- The provider creates a response in the playground.
- The provider saves and submits the response.
- The owner receives a notification and opens the response.
- The owner and provider communicate in the correct project conversation.

**Organization workflow**
- A provider creates an organization profile.
- The provider uploads a logo.
- The logo persists and appears in the correct profile and conversation areas.
- The organization submits verification evidence.
- The system displays the correct verification status.

**Security workflow**
- A provider cannot access unshared files.
- An unrelated user cannot access the project.
- A read-only member cannot edit.
- Expired access is rejected.
- All permission checks happen on the server.

## 19. Final implementation rules

- Inspect the existing code before modifying it.
- Preserve working features.
- Do not replace working functionality with mockups.
- Do not create fake files, fake provider responses or simulated calls.
- Do not hardcode document fields, file names or AI output structures.
- Use JSONB for dynamic document content and metadata.
- Keep essential relationships and permissions relational.
- Use real file storage and real document generation.
- Make Muse Spark operate on actual authorized project content.
- Preserve original document versions.
- Require user approval for consequential document changes and external sharing.
- Make every button and quick link functional.
- Test the complete individual, group and provider workflows.

The final result must feel like a professional project collaboration and document workspace, where project owners and providers can create, read, edit, share and respond to real documents throughout the funding and support process.
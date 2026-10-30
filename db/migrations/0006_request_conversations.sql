-- Project workspace relations: request conversations + group join flow.
-- conversations.request_id links one structured negotiation thread per funding request.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS request_id text;
CREATE UNIQUE INDEX IF NOT EXISTS conversation_request_unique ON conversations (request_id);

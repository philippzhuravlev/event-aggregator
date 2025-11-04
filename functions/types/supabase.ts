// Supabase types

/**
 * Pages table type - matches the SQL schema
 * id: UUID primary key (generated)
 * page_id: BIGINT (Facebook page ID)
 * page_name: TEXT (Facebook page name)
 * page_access_token_id: UUID (reference to vault secret)
 * token_expiry: TIMESTAMP (when the token expires)
 * token_status: TEXT (active, expired, invalid)
 * created_at: TIMESTAMP
 * updated_at: TIMESTAMP
 */
export interface Page {
  id: string; // UUID
  page_id: number; // Facebook Page ID (BIGINT)
  page_name: string; // Page name
  page_access_token_id: string | null; // UUID reference to vault secret
  token_expiry: string | null; // ISO 8601 timestamp
  token_status: 'active' | 'expired' | 'invalid'; // Token status
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
}

/**
 * Events table type - matches the SQL schema
 * id: UUID primary key (generated)
 * page_id: BIGINT (Facebook page ID)
 * event_id: TEXT (Facebook event ID)
 * event_data: JSONB (Raw Facebook event data)
 * created_at: TIMESTAMP
 * updated_at: TIMESTAMP
 */
export interface Event {
  id: string; // UUID
  page_id: number; // Facebook page ID (BIGINT)
  event_id: string; // Facebook event ID
  event_data: FacebookEventData; // JSONB
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
}

export interface FacebookEventData {
  id: string;
  name: string;
  description?: string;
  start_time: string;
  end_time?: string;
  place?: {
    name?: string;
    location?: {
      city?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      street?: string;
      zip?: string;
    };
  };
  cover?: {
    source: string;
    id?: string;
  };
}

export interface User {
  id: string; // UUID
  created_at?: string;
  // Add other user-related fields as needed
}

import { customType } from 'drizzle-orm/pg-core'

// citext: case-insensitive text (used for emails)
// Requires: CREATE EXTENSION IF NOT EXISTS citext;
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})

// inet: IP address type
export const inet = customType<{ data: string }>({
  dataType() {
    return 'inet'
  },
})

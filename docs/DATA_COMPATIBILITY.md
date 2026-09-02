# Lucky Bean Data Compatibility Rules

## Requirements

- Existing bean cards and brewing records must remain readable.
- New fields require default values for old records.
- Schema changes require version migration instead of destructive replacement.
- Historical user records should not be modified directly.

## Migration Principle

Old schema -> migration layer -> current schema

The migration layer must preserve previous brewing results and user records.

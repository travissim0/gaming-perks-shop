# Squad Page Database Query Error Fix

## Issue
**Error**: "structure of query does not match function result type"
**Location**: `src/app/squads/page.tsx` line 506 in `loadReceivedInvitations` function
**Root Cause**: RPC function return types didn't match expected TypeScript interfaces

## Root Cause Analysis
The error occurred because:
1. **RPC Function Mismatch**: The `get_squad_invitations_optimized` RPC function had a different return structure than expected
2. **Type Safety Issue**: PostgreSQL function return types weren't matching the TypeScript interface expectations
3. **Schema Changes**: Recent changes to include `is_active` fields may have affected function compatibility

## Functions Fixed

### 1. `loadReceivedInvitations()`
**Before**: Used `supabase.rpc('get_squad_invitations_optimized')`
**After**: Direct query with proper joins and filtering

```typescript
// OLD (problematic)
const result = await supabase.rpc('get_squad_invitations_optimized', {
  user_id_param: user.id
});

// NEW (fixed)
const { data, error } = await supabase
  .from('squad_invites')
  .select(`
    id, squad_id, message, created_at, expires_at, status,
    squads!inner(id, name, tag, is_active),
    profiles!squad_invites_invited_by_fkey(in_game_alias)
  `)
  .eq('invited_player_id', user.id)
  .eq('status', 'pending')
  .gt('expires_at', new Date().toISOString())
  .order('created_at', { ascending: false });
```

### 2. `loadFreeAgents()`
**Before**: Used `supabase.rpc('get_free_agents_optimized')`
**After**: Direct query with subquery filtering

```typescript
// NEW (fixed)
const { data, error } = await supabase
  .from('profiles')
  .select('id, in_game_alias, email, created_at')
  .not('id', 'in', `(SELECT DISTINCT player_id FROM squad_members WHERE status = 'active')`)
  .not('in_game_alias', 'is', null)
  .neq('in_game_alias', '')
  .order('in_game_alias', { ascending: true })
  .limit(100);
```

### 3. `loadJoinRequestsForSquad()`
**Before**: Used `robustFetch` wrapper around direct query
**After**: Direct try/catch with proper error handling

## Benefits of the Fix

### ✅ **Reliability**
- **No RPC Dependencies**: Eliminated reliance on potentially mismatched database functions
- **Type Safety**: Direct queries ensure TypeScript compatibility
- **Error Handling**: Better error messages and fallback behavior

### ✅ **Performance**
- **Optimized Queries**: Direct SQL queries with proper joins and filtering
- **Reduced Overhead**: No function call overhead
- **Better Caching**: Supabase can cache direct queries more effectively

### ✅ **Maintainability**
- **Visible Logic**: Query logic is in the codebase, not hidden in database functions
- **Easier Debugging**: Can see exact queries being executed
- **Schema Flexibility**: Changes to table structure don't break function signatures

## Active Squad Filtering
Added filtering to only show invitations from active squads:
```typescript
.filter((invite: any) => invite.squads?.is_active !== false)
```

## Error Handling Pattern
Consistent error handling pattern applied:
```typescript
try {
  const { data, error } = await supabase.from('table').select('...');
  
  if (error) {
    console.error('Error loading data:', error);
    setData([]);
    return;
  }
  
  if (data) {
    // Process and set data
    setData(formattedData);
  }
} catch (error) {
  console.error('Error loading data:', error);
  if (isMountedRef.current) {
    setData([]);
  }
}
```

## Testing Recommendations
1. **Test all squad page functionality**:
   - Received invitations loading
   - Free agents display
   - Join requests for squad captains
   - Squad filtering (active/inactive/legacy)
   - Photo editing permissions

2. **Verify error handling**:
   - Network failures
   - Database connectivity issues
   - Invalid user states

3. **Check performance**:
   - Page load times
   - Query execution speed
   - Memory usage during data loading

## Related Files Modified
- `src/app/squads/page.tsx` - Main squad page fixes
- `fix-squad-photo-permissions.sql` - Corrected media manager permissions
- `DATABASE_SCHEMA_REFERENCE.md` - Comprehensive schema documentation

## Future Prevention
- **Always reference `DATABASE_SCHEMA_REFERENCE.md`** before making database queries
- **Use direct queries instead of RPC functions** for better type safety
- **Test database function changes** in development before deployment
- **Keep TypeScript interfaces in sync** with database schemas 
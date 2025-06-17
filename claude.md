# Claude SQL Development Guidelines

## Avoiding Infinite Recursion in SQL/RLS Policies

### Common Causes of Infinite Recursion

1. **Circular Policy References**: When RLS policies on different tables reference each other
2. **Self-Referencing Policies**: Policies that query the same table they're protecting
3. **Complex JOIN Conditions**: Using EXISTS or subqueries that create dependency loops

### Best Practices for RLS Policies

#### ❌ AVOID: Circular References
```sql
-- DON'T DO THIS - Creates infinite recursion
CREATE POLICY "squad_members_check_squad" ON squad_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM squads 
            WHERE squads.id = squad_members.squad_id 
            AND squads.is_active = true
        )
    );

-- If squads table has a policy that references squad_members, this creates a loop
```

#### ✅ DO: Simple, Direct Conditions
```sql
-- BETTER: Use direct column checks without table joins
CREATE POLICY "squad_members_simple_read" ON squad_members
    FOR SELECT USING (
        status = 'active'  -- Direct column check, no joins
    );
```

#### ✅ DO: Use Application-Layer Filtering
```sql
-- Allow broader access at DB level, filter in application
CREATE POLICY "squad_members_public_read" ON squad_members
    FOR SELECT USING (true);

-- Then filter in the application:
-- SELECT * FROM squad_members WHERE squad_id IN (SELECT id FROM squads WHERE is_active = true)
```

### Testing RLS Policies

Always test policies with anonymous client connections:

```javascript
// Test with anonymous key (not service role key)
const supabase = createClient(supabaseUrl, anonKey);

// Test the query that will be used in production
const { data, error } = await supabase
  .from('table_name')
  .select('columns')
  .eq('filter', 'value');

if (error?.code === '42P17') {
  console.error('Infinite recursion detected!');
}
```

### Debugging Infinite Recursion

1. **Identify the Error**: Look for error code `42P17` and message "infinite recursion detected"
2. **Clear All Policies**: Temporarily disable RLS and drop all policies on affected tables
3. **Add Policies Gradually**: Re-add policies one by one to identify the problematic one
4. **Use Simple Conditions**: Replace complex EXISTS/JOIN conditions with direct column checks

### RLS Policy Reset Template

```sql
-- Emergency RLS reset for affected table
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;

-- Drop all policies
DROP POLICY IF EXISTS "policy_name_1" ON table_name;
DROP POLICY IF EXISTS "policy_name_2" ON table_name;
-- ... repeat for all policies

-- Re-enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Add simple, non-recursive policy
CREATE POLICY "table_name_simple_read" ON table_name
    FOR SELECT USING (true);  -- Or simple condition like status = 'active'
```

### Database Design Considerations

1. **Minimize Cross-Table Dependencies**: Design schemas to reduce the need for complex RLS policies
2. **Use Materialized Views**: For complex access patterns, consider materialized views with simpler policies
3. **Application-Layer Security**: Sometimes it's better to handle complex access logic in the application layer
4. **Document Policy Dependencies**: Keep track of which policies reference which tables

### Squad System Specific Notes

For the gaming-perks-shop squad system:

- **squads table**: Should allow public read access for active squads
- **squad_members table**: Should allow public read for member counting, complex filtering in application
- **profiles table**: Should allow reading basic info (in_game_alias) for captain display

### Emergency Contacts

If infinite recursion occurs in production:
1. Apply the RLS reset template immediately
2. Use simple `USING (true)` policies temporarily
3. Implement proper filtering in application layer as hotfix
4. Design better policies after the immediate issue is resolved

---

*Last updated: Based on squad system infinite recursion incident where squad_members and squads tables had circular policy dependencies* 
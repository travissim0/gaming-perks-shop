# Claude Development Guidelines

## Development Environment
**IMPORTANT**: User is on a Windows machine. Use Windows commands (CMD or PowerShell) for local operations:
- Use `dir` or `Get-ChildItem` instead of `ls`
- Use `copy` or `Copy-Item` instead of `cp` 
- Use Windows command syntax for local file operations
- Both CMD and PowerShell commands are acceptable for local tasks
- Only use Linux commands when specifically working with the remote Linux server

## SQL Workflow Instructions
**IMPORTANT**: When working with SQL database changes:
- **DO NOT** attempt to run SQL through Node.js scripts or command line tools
- **DO NOT** create complex scripts to execute SQL
- **INSTEAD**: Simply provide the SQL code and instruct the user to paste it into their SQL editor
- Format the SQL clearly with proper syntax highlighting
- Explain what the SQL will do before providing it
- Keep SQL changes atomic and focused on a single task

Example format:
```
Please copy and paste the following SQL into your SQL editor:

```sql
-- Brief comment explaining what this does
CREATE OR REPLACE FUNCTION example_function()
RETURNS void AS $$
BEGIN
    -- Function body
END;
$$ LANGUAGE plpgsql;
```

This SQL will [explanation of what it accomplishes].

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

## Responsive Design & Tailwind Breakpoints

### Project Breakpoint Configuration

This project uses **Tailwind CSS v4** with custom responsive breakpoints optimized for gaming and tablet devices.

#### Standard Tailwind Breakpoints
| Breakpoint | Min-width | Typical Devices | Usage |
|------------|-----------|-----------------|-------|
| **Default** | 0px | Mobile phones (portrait) | Base styles |
| **sm:** | 640px | Mobile landscape, small tablets | `sm:hidden` |
| **md:** | 768px | Tablets, small laptops | `md:flex` |
| **lg:** | 1024px | Laptops, desktop monitors | `lg:grid-cols-3` |
| **xl:** | 1280px | Large desktop monitors | `xl:max-w-6xl` |
| **2xl:** | 1536px | Extra large desktop monitors | `2xl:px-0` |

#### Custom Breakpoints (globals.css)
```css
/* Located in src/app/globals.css lines 14-24 */
--breakpoint-xs: 480px;           /* Small mobile */
--breakpoint-sm: 640px;           /* Large mobile */
--breakpoint-md: 768px;           /* Tablet portrait */
--breakpoint-lg: 1024px;          /* Tablet landscape / Laptop */
--breakpoint-xl: 1280px;          /* Desktop */
--breakpoint-2xl: 1536px;         /* Large desktop */

/* iPad specific breakpoints */
--breakpoint-tablet: 834px;       /* iPad Pro portrait */
--breakpoint-tablet-lg: 1210px;   /* iPad Pro landscape */
```

#### Custom Utility Classes
```css
/* Located in src/app/globals.css lines 76-100 */
.tablet-desktop         /* Show on iPad Pro+ (min-width: 834px) */
.tablet-mobile          /* Show on smaller than iPad Pro (max-width: 833px) */
.hide-on-tablet-desktop /* Hide on iPad Pro+ */
.hide-on-tablet-mobile  /* Hide on smaller than iPad Pro */
```

### Responsive Development Guidelines

#### ✅ Best Practices

1. **Mobile-First Approach**: Always design for mobile first, then enhance
```jsx
// Good
<div className="p-4 md:p-6 lg:p-8">

// Bad  
<div className="p-8 md:p-6 sm:p-4">
```

2. **Consistent Breakpoint Usage**: Use same breakpoint for related elements
```jsx
// Good - Consistent md: usage
<div className="hidden md:block">
<button className="md:hidden">

// Bad - Mixed breakpoints
<div className="hidden lg:block">
<button className="md:hidden">
```

3. **iPad Optimization**: Use custom classes for better tablet experience
```jsx
<div className="
  grid-cols-1           // Mobile: 1 column
  md:grid-cols-2        // Tablet: 2 columns  
  tablet-desktop        // iPad specific styles
  lg:grid-cols-3        // Desktop: 3 columns
">
```

#### Current Navbar Implementation
The `ImprovedNavbar.tsx` uses these breakpoints:

| Element | Class | Behavior |
|---------|-------|----------|
| Mobile Menu Button | `md:hidden` | Hidden on tablets+ |
| Search Bar | `hidden md:flex` | Hidden on mobile, shown on tablets+ |
| Main Navigation | `hidden md:block` | Hidden on mobile, shown on tablets+ |
| Mobile Menu Container | `md:hidden` | Hidden on tablets+ |

#### Testing Breakpoints
Test responsive design at these critical widths:
- **375px** - iPhone
- **768px** - iPad portrait (md: breakpoint)
- **834px** - iPad Pro portrait (custom tablet)
- **1024px** - iPad landscape (lg: breakpoint)
- **1280px** - Desktop (xl: breakpoint)

#### Configuration Files
- **Tailwind Import**: `src/app/globals.css:1` - `@import "tailwindcss";`
- **Custom Breakpoints**: `src/app/globals.css:14-24`
- **Custom Utilities**: `src/app/globals.css:76-100`
- **PostCSS Config**: `postcss.config.mjs`
- **Package Version**: `tailwindcss: ^4` in `package.json`

For complete breakpoint documentation, see: `RESPONSIVE_BREAKPOINTS_GUIDE.md`

---

*Last updated: Based on squad system infinite recursion incident where squad_members and squads tables had circular policy dependencies and current Tailwind CSS v4 responsive implementation* 
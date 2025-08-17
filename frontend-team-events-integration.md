# Frontend Integration for Team Events

## Summary

I've created comprehensive team event logging and added avatar support to the Triple Threat header. Here's what needs to be updated in the frontend:

## 1. SQL Functions Created

Run `fix-team-events-and-header-avatars.sql` in Supabase to get:

- ✅ `create_tt_team_with_events()` - Creates teams with event logging
- ✅ `join_tt_team_with_events()` - Joins teams with event logging  
- ✅ `leave_tt_team_with_events()` - Leaves teams with event logging
- ✅ `get_tt_user_events()` - Now includes avatar_url data

## 2. Frontend Changes Needed

### Update Team Creation (teams/page.tsx)

**Replace this in `handleCreateTeam`:**
```typescript
// Old direct database insert
const { data: team, error: teamError } = await supabase
  .from('tt_teams')
  .insert({
    team_name: createForm.teamName,
    team_password_hash: createForm.teamPassword,
    team_banner_url: bannerUrl,
    owner_id: user.id
  })
  .select()
  .single();

// Add owner as team member
const { error: memberError } = await supabase
  .from('tt_team_members')
  .insert({
    team_id: team.id,
    player_id: user.id,
    role: 'owner'
  });
```

**With this RPC call:**
```typescript
// New event-aware team creation
const { data, error } = await supabase.rpc('create_tt_team_with_events', {
  team_name_input: createForm.teamName,
  team_password_input: createForm.teamPassword,
  team_banner_url_input: bannerUrl,
  owner_id_input: user.id
});

if (error) throw error;
if (!data.success) throw new Error(data.error);
```

### Update Team Joining (teams/page.tsx)

**Replace this in `handleJoinTeam`:**
```typescript
// Old RPC call
const { data, error } = await supabase.rpc('join_tt_team', {
  team_id_input: teamId,
  user_id_input: user.id,
  password_input: password
});
```

**With this:**
```typescript
// New event-aware team joining
const { data, error } = await supabase.rpc('join_tt_team_with_events', {
  password_input: password,
  team_id_input: teamId,
  user_id_input: user.id
});
```

### Update Team Leaving (teams/page.tsx)

**Replace this in `handleLeaveTeam` and `handleLeaveTeamFromHover`:**
```typescript
// Old RPC call
const { data, error } = await supabase.rpc('tt_leave_team', {
  user_id_input: user.id
});
```

**With this:**
```typescript
// New event-aware team leaving
const { data, error } = await supabase.rpc('leave_tt_team_with_events', {
  user_id_input: user.id
});
```

### Update Events Page (events/page.tsx)

**In the `loadEvents` function, update the interface:**

```typescript
interface Event {
  id: string;
  event_type: string;
  title: string;
  description: string;
  related_user_id: string | null;
  related_user_alias: string | null;
  related_user_avatar: string | null; // NEW
  related_team_id: string | null;
  related_team_name: string | null;
  metadata: any;
  created_at: string;
  is_read: boolean;
}
```

## 3. Header Updates Made

✅ Updated `TripleThreatHeader.tsx` to:
- Display user avatars in notifications
- Fallback to emoji icons if no avatar
- Support the new notification structure

## 4. Event Types Now Supported

- ✅ `team_created` - When someone creates a new team
- ✅ `team_member_joined` - When someone joins a team
- ✅ `team_member_left` - When someone leaves a team
- ✅ `challenge_received` - When team receives a challenge
- ✅ `challenge_accepted` - When challenge is accepted
- ✅ `challenge_declined` - When challenge is declined

## 5. Benefits

- 🎉 **Complete activity feed** showing all team activities
- 👤 **User avatars** in notifications for better UX
- 📝 **Detailed event descriptions** with context
- 🔔 **Proper targeting** - events only go to relevant users
- ⚡ **Real-time feel** with immediate event creation

## Next Steps

1. Run the SQL script: `fix-team-events-and-header-avatars.sql`
2. Update the frontend functions as described above
3. Test team creation, joining, and leaving
4. Check that events appear in the events page with avatars

The events system will now be comprehensive and show all team-related activities with user avatars!

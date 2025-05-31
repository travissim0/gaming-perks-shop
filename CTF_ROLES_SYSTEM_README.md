# 🎯 CTF Roles System Documentation

## Overview

The CTF (Capture the Flag) Roles System provides a comprehensive hierarchy-based permission system for managing CTF operations, including role assignments, referee applications, match management, and tournament operations.

## 🏆 Role Hierarchy

The system implements a 6-tier hierarchy with specific permissions and responsibilities:

### 1. Site Administrator (Level 100)
- **Full System Access**: All features including payments, donations, orders
- **Ultimate Authority**: Can assign any role including CTF Administrator
- **Payment Management**: Exclusive access to financial operations
- **System Configuration**: Database management and system settings

### 2. CTF Administrator (Level 90) 
- **CTF Operations Manager**: Manages all CTF-related activities
- **Role Assignment**: Can assign all CTF roles except Site Administrator
- **No Financial Access**: Cannot manage payments, donations, or orders
- **Co-Admin Creation**: Can promote users to CTF Administrator level
- **Squad Management**: Full squad oversight and management

### 3. CTF Head Referee (Level 80)
- **Referee Management**: Oversees all referees and their activities
- **Application Processing**: Reviews and approves/denies referee applications
- **Promotion Authority**: Can promote referees within the referee hierarchy
- **Match Oversight**: Supervises match officiating and results
- **Training Coordination**: Manages referee training and standards

### 4. CTF Referee (Level 70)
- **Match Officiating**: Confirms and edits match results
- **Statistics Management**: Records and manages match statistics
- **Results Verification**: Validates and approves match outcomes
- **Dispute Resolution**: Handles match-related disputes and appeals
- **Future Stats Integration**: Will manage advanced statistics system

### 5. CTF Recorder (Level 60)
- **Video Management**: Adds and manages tournament match recordings
- **Platform Integration**: Supports YouTube, Twitch, Vimeo, and other platforms
- **Tournament Documentation**: Maintains video archives for tournament matches
- **Content Curation**: Ensures quality and appropriate content

### 6. CTF Commentator (Level 50)
- **Match Commentary**: Can sign up to commentate matches
- **Schedule Access**: Views match schedules and availability
- **Commentary Signup**: Registers for commentary assignments
- **Minimal Permissions**: Focused role with limited system access

## 📋 Permission System

### Core Permissions

| Permission | Admin | CTF Admin | Head Referee | Referee | Recorder | Commentator |
|------------|-------|-----------|--------------|---------|----------|-------------|
| `manage_all_users` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `manage_payments` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `manage_donations` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `manage_orders` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `manage_ctf_roles` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `assign_ctf_admin` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `manage_matches` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `manage_squads` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `manage_referees` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `manage_referee_applications` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `approve_referee_promotions` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `manage_match_results` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `edit_match_stats` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `view_match_details` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `referee_matches` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `add_match_videos` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `edit_match_videos` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `manage_tournament_recordings` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `signup_for_commentary` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `view_match_schedule` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## 🗄️ Database Schema

### Core Tables

#### `ctf_roles`
- Defines available roles and their permissions
- Includes hierarchy levels and permission sets
- JSONB permissions field for flexible permission management

#### `user_ctf_roles`
- Maps users to their assigned CTF roles
- Tracks assignment history and notes
- Supports multiple roles per user

#### `referee_applications`
- Manages referee promotion applications
- Tracks application status and review process
- Includes reason, experience, and review notes

#### `match_commentators`
- Assigns commentators to specific matches
- Supports multiple commentator types (main, co-commentator, analyst)
- Tracks assignment status and confirmations

#### `match_results`
- Enhanced match result tracking
- Includes scores, duration, and additional statistics
- Links to recording and verification personnel

## 🚀 Getting Started

### 1. Database Setup

```bash
# Apply the CTF roles system to your database
./apply-ctf-roles.ps1

# Verify installation
# Check that tables were created and roles were populated
```

### 2. Assign Initial Roles

```javascript
// Example: Assign CTF Admin role to a user
import { useCTFRoles } from '@/hooks/useCTFRoles';

const { assignRole } = useCTFRoles();
await assignRole(userId, 'ctf_admin', 'Initial CTF Administrator');
```

### 3. Role Management

Access the CTF Administration panel:
- **Site Admins**: Full access to all CTF admin features
- **CTF Admins**: Access to role management and operations
- **Head Referees**: Access to referee management and applications

## 🔧 API Usage

### Check User Permissions

```javascript
import { useCTFRoles } from '@/hooks/useCTFRoles';

const { hasPermission, hasRole, getHighestRole } = useCTFRoles();

// Check specific permission
if (hasPermission('manage_match_results')) {
  // User can manage match results
}

// Check specific role
if (hasRole('ctf_referee')) {
  // User is a CTF referee
}

// Get user's highest role
const highestRole = getHighestRole();
console.log(highestRole?.display_name); // "CTF Administrator"
```

### Submit Referee Application

```javascript
const { submitRefereeApplication } = useCTFRoles();

await submitRefereeApplication(
  'ctf_referee', // Requested role
  'I have been playing CTF for 5 years and want to help officiate matches',
  'Extensive knowledge of CTF rules and regulations' // Optional experience
);
```

### Review Applications (Head Referee+)

```javascript
const { getRefereeApplications, reviewRefereeApplication } = useCTFRoles();

// Get pending applications
const applications = await getRefereeApplications();

// Approve an application
await reviewRefereeApplication(
  applicationId,
  'approved',
  'Strong experience and good understanding of rules'
);
```

## 🎮 Features

### Role Management
- **Hierarchical Permissions**: Roles can only assign roles below their level
- **Automatic Role Assignment**: Approved applications automatically assign roles
- **Role History**: Track when roles were assigned and by whom
- **Multiple Roles**: Users can have multiple CTF roles simultaneously

### Referee Application System
- **Self-Service Applications**: Users can apply for referee positions
- **Structured Review Process**: Head Referees review and approve applications
- **Experience Tracking**: Applications include experience descriptions
- **Status Management**: Pending, approved, denied, withdrawn statuses

### Match Integration
- **Video Recording**: CTF Recorders can add tournament match videos
- **Commentary Assignments**: Commentators can sign up for matches
- **Result Management**: Referees manage match results and statistics
- **Enhanced Tracking**: Detailed match information and verification

### Admin Interface
- **User Role Management**: Search and assign roles to users
- **Application Dashboard**: Review and process referee applications
- **Role Information**: View role hierarchy and permissions
- **Real-time Updates**: Live updates when roles change

## 🔒 Security Features

### Row Level Security (RLS)
- All tables have proper RLS policies
- Users can only see data they're authorized to access
- Automatic permission checking for all operations

### Permission Validation
- Server-side permission checks for all sensitive operations
- Client-side permission checks for UI rendering
- Hierarchy validation prevents unauthorized role assignments

### Audit Trail
- All role assignments tracked with assigner information
- Application review history maintained
- Timestamped records for all changes

## 🚨 Troubleshooting

### Common Issues

1. **Permission Denied Errors**
   - Verify user has the required role/permission
   - Check role hierarchy levels
   - Ensure RLS policies are applied correctly

2. **Role Assignment Failures**
   - Confirm assigner has higher hierarchy level than target role
   - Check for existing role assignments (unique constraint)
   - Verify database connection and permissions

3. **Application Not Loading**
   - Check that CTF roles tables exist
   - Verify component imports and hook usage
   - Review browser console for JavaScript errors

### Support

For issues with the CTF roles system:
1. Check the browser console for error messages
2. Verify database schema is properly applied
3. Ensure user has appropriate permissions
4. Review the role hierarchy documentation

## 📈 Future Enhancements

### Planned Features
- **Advanced Statistics System**: Enhanced match statistics and analytics
- **Tournament Management**: Comprehensive tournament organization tools
- **Automated Scheduling**: Smart match scheduling and referee assignments
- **Mobile Interface**: Mobile-optimized role management
- **Integration APIs**: External system integration capabilities

### Extensibility
The system is designed to be extensible:
- Add new roles by updating the enum and permissions
- Extend permissions with new JSONB fields
- Create custom admin interfaces for specific roles
- Integrate with external tournament management systems 
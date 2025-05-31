# 💬 Community Forum System

A comprehensive forum system built for the CTFPL gaming community platform, featuring hierarchical discussions, CTF role-based moderation, and real-time interaction tracking.

## 🎯 Overview

The forum system provides a modern, responsive community platform where players can:
- Discuss strategies and gameplay
- Recruit squad members  
- Share match reports and highlights
- Get technical support
- Stay updated with announcements

## ✨ Features

### 🗂️ **Forum Categories**
- **6 Default Categories**: General Discussion, CTF Strategies, Squad Recruitment, Match Reports, Technical Support, Announcements
- **Custom Theming**: Each category has distinct colors and icons
- **Role Restrictions**: Optional role requirements for viewing/posting
- **Activity Tracking**: Thread counts and latest activity timestamps

### 📝 **Thread Management**
- **Rich Threading**: Create and manage discussion threads
- **Auto-Generated Slugs**: SEO-friendly URLs from thread titles
- **Pinning & Locking**: Moderator controls for important threads
- **View Tracking**: Unique view counts with user and IP tracking
- **Reply Statistics**: Automatic reply counting and last activity tracking

### 💬 **Post System**
- **Threaded Replies**: Support for nested discussions
- **Edit History**: Track post modifications with timestamps
- **Soft Deletion**: Posts marked as deleted rather than removed
- **Author Attribution**: Integration with user profiles and in-game aliases

### 🛡️ **CTF Role-Based Moderation**
Integrated with the existing CTF roles system:
- **Site Administrators**: Full forum control
- **CTF Administrators**: Category and content management
- **Head Referees**: Thread moderation capabilities
- **Moderation Logging**: Complete audit trail of moderator actions

### 📊 **Analytics & Statistics**
- **Community Stats**: Total threads, posts, members, and weekly activity
- **View Tracking**: Individual thread view counts
- **Activity Metrics**: Recent activity summaries
- **Performance Insights**: Post engagement and user participation

### 🔔 **User Features**
- **Thread Subscriptions**: Get notified of new replies
- **User Preferences**: Customizable posts per page, email notifications
- **Search Functionality**: Find threads and posts across categories
- **Responsive Design**: Mobile-optimized interface

## 🏗️ Database Architecture

### Core Tables

```sql
forum_categories      -- Category definitions with theming
forum_threads        -- Discussion threads with metadata
forum_posts          -- Individual posts and replies
forum_thread_views   -- Unique view tracking
forum_user_preferences -- User customization settings
forum_moderation_log -- Audit trail for moderator actions
forum_subscriptions  -- Thread notification subscriptions
```

### Key Features
- **Row Level Security (RLS)**: Comprehensive security policies
- **Automatic Triggers**: Thread statistics updates
- **Optimized Indexes**: Fast queries on large datasets
- **JSONB Support**: Flexible moderation log details

## 🚀 Installation

### 1. Apply Database Schema

Run the SQL script in your Supabase SQL Editor:

```bash
# Copy contents of add-forum-system.sql and execute in Supabase
```

### 2. Verify Installation

```bash
node deploy-forum-system.js
```

### 3. Check Frontend Integration

The forum system integrates seamlessly with your existing navigation:
- Added "💬 Forum" link to main navigation
- Mobile-responsive menu integration
- Consistent styling with existing theme

## 📱 User Interface

### **Forum Index (`/forum`)**
- Category grid with stats and latest activity
- Community statistics sidebar
- Quick action links
- Modern card-based design

### **Category Pages (`/forum/c/[slug]`)**
- Thread listings with sorting options
- Pagination for large categories
- New thread creation buttons
- Thread metadata (views, replies, last activity)

### **Thread Pages (`/forum/c/[slug]/[thread-slug]`)**
- Full thread content display
- Paginated replies
- Subscription controls
- Moderation tools (for authorized users)

## 🔧 API Integration

### **Forum Hook (`useForum`)**

Complete data management with:

```typescript
const {
  // Categories
  getCategories, getCategoryBySlug,
  
  // Threads  
  getThreads, getThreadBySlug, createThread, updateThread,
  
  // Posts
  getPosts, createPost, updatePost, deletePost,
  
  // Features
  subscribeToThread, searchForum, getForumStats
} = useForum();
```

### **Type Safety**
Full TypeScript support with comprehensive interfaces:
- `ForumCategory`, `ForumThread`, `ForumPost`
- `CreateThreadData`, `UpdatePostData`
- `ThreadsQuery`, `SearchQuery`

## 🛡️ Security & Permissions

### **Row Level Security Policies**
- Categories: Public viewing, admin management
- Threads: Public reading, authenticated creation, author/moderator editing
- Posts: Same as threads with edit tracking
- Subscriptions: User-specific access

### **CTF Role Integration**
Forum moderation permissions automatically granted to:
- Site Administrators (full control)
- CTF Administrators (content management)  
- Head Referees (moderation capabilities)

### **Data Protection**
- Soft deletion preserves content integrity
- Edit history maintains accountability
- View tracking respects user privacy

## 📊 Analytics Dashboard

### **Community Statistics**
- Total threads and posts
- Active member count
- Weekly activity summaries
- Growth trend tracking

### **Moderation Insights**
- Action logs with details
- Moderator activity tracking
- Content management metrics

## 🎨 Design System

### **Visual Identity**
- Consistent with existing CTFPL theme
- Gaming-inspired color schemes per category
- Icon-based category identification
- Modern gradient accents

### **Responsive Layout**
- Mobile-first design approach
- Touch-friendly interface elements
- Optimized for various screen sizes
- Consistent navigation patterns

## 🔍 Search & Discovery

### **Search Functionality**
- Full-text search across threads and posts
- Category-specific filtering
- Sort by relevance or recency
- Type-specific results (threads vs posts)

### **Content Organization**
- Intuitive category structure
- Thread sorting options (latest, popular, most viewed)
- Pinned content promotion
- Related thread suggestions

## 🚀 Performance Optimizations

### **Database Optimizations**
- Strategic indexing on high-query columns
- Efficient join queries with proper foreign keys
- Pagination to handle large datasets
- Optimized view counting with conflict resolution

### **Frontend Performance**
- Lazy loading for large thread lists
- Optimistic UI updates
- Efficient re-rendering with React hooks
- Image optimization for user avatars

## 📈 Future Enhancements

### **Planned Features**
- Rich text editor with markdown support
- File attachment system
- Real-time notifications
- Advanced search with filters
- Thread tagging system
- User reputation scoring

### **Integration Opportunities**
- Discord webhook notifications
- Match result auto-posting
- Squad recruitment integration
- Tournament announcement automation

## 🛠️ Development

### **Local Development**
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Run development server
npm run dev

# Visit http://localhost:3000/forum
```

### **Database Development**
```bash
# Check deployment status
node deploy-forum-system.js

# Reset database (if needed)
# Re-run add-forum-system.sql in Supabase
```

## 📚 Usage Examples

### **Creating a Thread**
```typescript
const { createThread } = useForum();

const newThread = await createThread({
  category_id: 'category-uuid',
  title: 'New CTF Strategy Discussion',
  content: 'Let me share this new strategy...'
});
```

### **Fetching Category Threads**
```typescript
const { getThreads } = useForum();

const { threads, total } = await getThreads({
  category_id: 'category-uuid',
  page: 1,
  per_page: 20,
  sort: 'latest',
  pinned_first: true
});
```

### **Managing Subscriptions**
```typescript
const { subscribeToThread, unsubscribeFromThread } = useForum();

// Subscribe to notifications
await subscribeToThread(threadId);

// Unsubscribe
await unsubscribeFromThread(threadId);
```

## 🤝 Contributing

### **Code Standards**
- TypeScript for all new code
- Consistent component patterns
- Comprehensive error handling
- Responsive design principles

### **Database Changes**
- Use migrations for schema updates
- Maintain RLS policy consistency
- Document permission changes
- Test with different user roles

## 📞 Support

### **Common Issues**
1. **Forum not loading**: Check database deployment
2. **Permission errors**: Verify CTF roles integration  
3. **Search not working**: Ensure RLS policies are correct
4. **Categories missing**: Run deployment checker script

### **Debugging Tools**
- `deploy-forum-system.js` - Deployment verification
- Browser dev tools - Frontend debugging
- Supabase logs - Database error tracking
- Network tab - API request monitoring

---

The forum system represents a major enhancement to the CTFPL platform, providing a robust foundation for community engagement and content management. Its integration with existing systems ensures a seamless user experience while maintaining the security and performance standards of the platform. 
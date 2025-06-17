# 📰 News System Implementation

A comprehensive news and announcement system for the Gaming Perks Shop with rich content support, read tracking, and eye-catching visual design.

## 🌟 Features

### ✨ Rich Content Support
- **Rich Text Formatting**: Bold, italic, underline, strikethrough
- **Headings**: Multiple heading levels with gradient colors
- **Lists**: Bullet points and numbered lists
- **Blockquotes**: Styled quote blocks with colored borders
- **Code Blocks**: Syntax-highlighted code snippets
- **Links**: Styled hyperlinks with hover effects
- **Images**: Responsive images with lazy loading and hover effects
- **GIF Support**: Full support for animated GIFs

### 🎯 Visual Design
- **Unread Posts**: Prominent display with glowing borders and shimmer effects
- **Featured Posts**: Special styling with floating animations
- **Read/Unread States**: Visual differentiation with opacity and scaling
- **Responsive Design**: Mobile-optimized layout
- **Dark Theme**: Fully dark-mode compatible

### 📊 Engagement Features
- **Read Tracking**: Automatic marking as read after 3 seconds of viewing
- **View Counting**: Track total views per post
- **Reactions**: Like, heart, fire, and shock reactions
- **Priority System**: Control post ordering with priority levels
- **Tagging**: Categorize posts with colorful tags

### 🔧 Admin Management
- **WYSIWYG Editor**: Simple text editor with rich content preview
- **Status Management**: Draft, published, archived states
- **Featured Control**: Mark posts as featured for prominence
- **Image Upload**: Support for featured images
- **Tag Management**: Comma-separated tag system

## 🗄️ Database Schema

### Core Tables

#### `news_posts`
```sql
- id: UUID (Primary Key)
- title: TEXT (Required)
- subtitle: TEXT (Optional)
- content: JSONB (Rich content structure)
- featured_image_url: TEXT (Optional)
- author_id: UUID (Foreign Key)
- author_name: TEXT (Cached for performance)
- status: ENUM ('draft', 'published', 'archived')
- featured: BOOLEAN (Default: false)
- priority: INTEGER (Default: 0, higher = first)
- view_count: INTEGER (Default: 0)
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
- published_at: TIMESTAMPTZ
- expires_at: TIMESTAMPTZ (Optional)
- tags: TEXT[] (Array of tags)
- metadata: JSONB (Additional data)
```

#### `news_post_reads`
```sql
- id: UUID (Primary Key)
- post_id: UUID (Foreign Key)
- user_id: UUID (Foreign Key)
- read_at: TIMESTAMPTZ
- reading_time_seconds: INTEGER
- UNIQUE(post_id, user_id)
```

#### `news_post_reactions`
```sql
- id: UUID (Primary Key)
- post_id: UUID (Foreign Key)
- user_id: UUID (Foreign Key)
- reaction_type: ENUM ('like', 'heart', 'fire', 'shock')
- created_at: TIMESTAMPTZ
- UNIQUE(post_id, user_id, reaction_type)
```

### Database Functions

#### `get_news_posts_with_read_status(user_uuid, limit_count)`
Returns posts with read status and reaction counts for a specific user.

#### `mark_news_post_read(post_uuid, reading_seconds)`
Marks a post as read and increments view count.

#### `increment_news_post_views(post_uuid)`
Increments view count for a post.

## 🔌 API Endpoints

### GET `/api/news`
Fetch news posts with read status and reactions.

**Query Parameters:**
- `limit`: Number of posts to return (default: 5)
- `featured`: Return only featured posts (true/false)

**Response:**
```json
{
  "posts": [
    {
      "id": "uuid",
      "title": "Post Title",
      "subtitle": "Post Subtitle",
      "content": { /* Rich content object */ },
      "featured_image_url": "https://...",
      "author_name": "Author Name",
      "featured": true,
      "is_read": false,
      "reaction_counts": { "like": 5, "heart": 2 },
      "view_count": 123,
      "published_at": "2024-01-01T00:00:00Z",
      "tags": ["announcement", "update"]
    }
  ]
}
```

### POST `/api/news`
Mark posts as read or toggle reactions.

**Request Body:**
```json
{
  "action": "mark_read",
  "postId": "uuid",
  "readingTime": 30
}
```

or

```json
{
  "action": "react",
  "postId": "uuid",
  "reactionType": "like"
}
```

## 🎨 UI Components

### NewsSection Component
Main component for displaying news posts on the home page.

**Props:**
- `limit`: Number of posts to display (default: 3)
- `className`: Additional CSS classes
- `showReadState`: Enable read/unread visual states (default: true)
- `compact`: Use compact layout (default: false)

**Usage:**
```tsx
<NewsSection limit={3} showReadState={true} />
```

### Admin News Management
Located at `/admin/news` for content management.

**Features:**
- Create/edit/delete posts
- Rich text editor
- Status management
- Featured post control
- Tag management
- Live preview

## 🚀 Setup Instructions

### 1. Database Setup
Run the SQL schema in Supabase SQL Editor:
```bash
# Execute setup-news-system.sql in Supabase
```

### 2. Component Integration
The NewsSection is already integrated into the home page at the top for maximum visibility.

### 3. Admin Access
Admin users can access the news management panel at `/admin/news`.

### 4. Styling
Custom CSS animations and effects are included in `src/styles/news.css`.

## 🎯 Visual Behavior

### Unread Posts
- **Prominent Display**: Larger, more eye-catching when unread
- **Glowing Border**: Yellow glow animation
- **Shimmer Effect**: Moving light effect across the post
- **"New" Badge**: Clear indicator for unread status

### Read Posts
- **Reduced Opacity**: 75% opacity when read
- **Smaller Scale**: 95% scale to de-emphasize
- **Shared Space**: Takes up less visual real estate

### Featured Posts
- **Special Styling**: Purple borders and badges
- **Float Animation**: Subtle floating effect
- **Priority Display**: Always shown first
- **Enhanced Images**: Larger, more prominent images

### Mobile Optimization
- **Responsive Grid**: Adapts to screen size
- **Touch-Friendly**: Large tap targets
- **Optimized Animations**: Reduced motion on smaller screens

## 🔧 Customization

### Content Structure
Rich content is stored as JSON with this structure:
```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Regular text"
        },
        {
          "type": "text",
          "marks": [{"type": "bold"}],
          "text": "Bold text"
        }
      ]
    }
  ]
}
```

### Styling Customization
Edit `src/styles/news.css` to customize:
- Animation timings
- Color schemes
- Typography
- Layout spacing

### New Reaction Types
Add new reaction types in:
1. Database enum constraint
2. Component reaction mapping
3. Emoji selection

## 📊 Analytics & Metrics

The system tracks:
- **View Counts**: Total views per post
- **Read Rates**: Percentage of users who read posts
- **Reading Time**: How long users spend reading
- **Engagement**: Reaction counts and types
- **Popular Content**: Most viewed and reacted posts

## 🔐 Security

### Row Level Security (RLS)
- **Public Read**: Published posts visible to all
- **Admin Control**: Only admins can create/edit posts
- **User Reactions**: Users can only manage their own reactions
- **Read Tracking**: Users can only track their own reads

### Content Sanitization
- All user inputs are sanitized
- Rich content structure prevents XSS
- Image URLs are validated

## 🐛 Troubleshooting

### Common Issues

**Posts not appearing:**
- Check post status is 'published'
- Verify published_at date is in the past
- Check expires_at is null or in the future

**Read tracking not working:**
- Ensure user is logged in
- Check browser supports Intersection Observer
- Verify 3-second viewing threshold

**Reactions not updating:**
- Check user authentication
- Verify database permissions
- Check for JavaScript errors

### Database Queries for Debugging

```sql
-- Check post status
SELECT title, status, published_at, expires_at 
FROM news_posts 
ORDER BY created_at DESC;

-- View read statistics
SELECT p.title, COUNT(r.id) as read_count
FROM news_posts p
LEFT JOIN news_post_reads r ON p.id = r.post_id
GROUP BY p.id, p.title
ORDER BY read_count DESC;

-- Reaction statistics
SELECT p.title, pr.reaction_type, COUNT(*) as count
FROM news_posts p
JOIN news_post_reactions pr ON p.id = pr.post_id
GROUP BY p.id, p.title, pr.reaction_type
ORDER BY count DESC;
```

## 🚀 Future Enhancements

### Planned Features
- **Rich Text Editor**: Full WYSIWYG editor with toolbar
- **Image Upload**: Direct image upload to Supabase Storage
- **Push Notifications**: Notify users of new posts
- **Comment System**: Allow comments on posts
- **Social Sharing**: Share posts on social media
- **Email Digest**: Weekly email with latest posts
- **Advanced Analytics**: Detailed engagement metrics

### Technical Improvements
- **Caching**: Redis cache for frequently accessed posts
- **Search**: Full-text search across posts
- **Categories**: Hierarchical category system
- **Scheduling**: Schedule posts for future publication
- **Versioning**: Track post edit history
- **Multilingual**: Support for multiple languages

---

*This news system provides a comprehensive platform for keeping your community informed with beautiful, engaging content that automatically adapts based on read status to maintain optimal attention and engagement.* 
# Custom Email Templates for CTFPL

This guide explains how to set up custom email templates in Supabase to replace the generic verification emails with branded Infantry Online templates.

## Setting Up Custom Email Templates

### 1. Access Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Email Templates**

### 2. Customize the "Confirm signup" Template

Replace the default template with this Infantry Online branded version:

```html
<h2>🎮 Welcome to CTFPL - Free Infantry!</h2>

<p>Hello <strong>{{ .Email }}</strong>,</p>

<p>Welcome to the <strong>Capture the Flag Premier League</strong>! You've successfully registered for the Infantry Online competitive gaming platform.</p>

<div style="background-color: #1f2937; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #06b6d4;">
  <h3 style="color: #06b6d4; margin-top: 0;">🚀 Complete Your Registration</h3>
  <p style="color: #e5e7eb;">Click the button below to verify your email and set your password:</p>
  
  <a href="{{ .ConfirmationURL }}" 
     style="display: inline-block; background: linear-gradient(to right, #06b6d4, #3b82f6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0;">
    ✅ Complete Registration
  </a>
</div>

<div style="background-color: #374151; padding: 15px; border-radius: 6px; margin: 20px 0;">
  <h4 style="color: #fbbf24; margin-top: 0;">🎯 What's Next?</h4>
  <ul style="color: #d1d5db; margin: 0; padding-left: 20px;">
    <li>Set your password and complete registration</li>
    <li>Join or create competitive squads</li>
    <li>Participate in scheduled matches</li>
    <li>Purchase exclusive donation perks</li>
    <li>Support Infantry Online development</li>
  </ul>
</div>

<div style="background-color: #065f46; padding: 15px; border-radius: 6px; margin: 20px 0;">
  <h4 style="color: #10b981; margin-top: 0;">🏁 About CTFPL</h4>
  <p style="color: #d1fae5; margin: 0;">
    The Capture the Flag Premier League is the premier competitive platform for Infantry Online. 
    Join thousands of players in epic battles, form elite squads, and compete for glory!
  </p>
</div>

<hr style="border: none; border-top: 1px solid #4b5563; margin: 30px 0;">

<p style="color: #9ca3af; font-size: 14px;">
  <strong>Need help?</strong> Visit <a href="https://freeinf.org" style="color: #06b6d4;">freeinf.org</a> or contact our support team.
</p>

<p style="color: #6b7280; font-size: 12px;">
  This email was sent because you registered for CTFPL at freeinf.org. 
  If you didn't create this account, you can safely ignore this email.
</p>

<div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #4b5563;">
  <p style="color: #06b6d4; font-weight: bold; margin: 0;">🏁 CTFPL - Free Infantry</p>
  <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0;">Capture the Flag Premier League</p>
</div>
```

### 3. Customize the "Magic Link" Template (if using magic links)

```html
<h2>🎮 CTFPL - Sign In Link</h2>

<p>Hello,</p>

<p>Click the link below to sign in to your <strong>CTFPL</strong> account:</p>

<div style="background-color: #1f2937; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #06b6d4;">
  <a href="{{ .ConfirmationURL }}" 
     style="display: inline-block; background: linear-gradient(to right, #06b6d4, #3b82f6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
    🚀 Sign In to CTFPL
  </a>
</div>

<p style="color: #9ca3af; font-size: 14px;">
  This link will expire in 1 hour for security reasons.
</p>

<hr style="border: none; border-top: 1px solid #4b5563; margin: 30px 0;">

<div style="text-align: center; margin-top: 30px;">
  <p style="color: #06b6d4; font-weight: bold; margin: 0;">🏁 CTFPL - Free Infantry</p>
  <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0;">Capture the Flag Premier League</p>
</div>
```

### 4. Customize the "Reset Password" Template

```html
<h2>🔒 CTFPL - Password Reset</h2>

<p>Hello,</p>

<p>You requested to reset your password for your <strong>CTFPL</strong> account.</p>

<div style="background-color: #1f2937; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
  <h3 style="color: #f59e0b; margin-top: 0;">🔑 Reset Your Password</h3>
  <p style="color: #e5e7eb;">Click the button below to set a new password:</p>
  
  <a href="{{ .ConfirmationURL }}" 
     style="display: inline-block; background: linear-gradient(to right, #f59e0b, #ef4444); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0;">
    🔒 Reset Password
  </a>
</div>

<div style="background-color: #7f1d1d; padding: 15px; border-radius: 6px; margin: 20px 0;">
  <h4 style="color: #fca5a5; margin-top: 0;">⚠️ Security Notice</h4>
  <p style="color: #fecaca; margin: 0;">
    If you didn't request this password reset, please ignore this email. 
    Your account remains secure and no changes have been made.
  </p>
</div>

<p style="color: #9ca3af; font-size: 14px;">
  This link will expire in 1 hour for security reasons.
</p>

<hr style="border: none; border-top: 1px solid #4b5563; margin: 30px 0;">

<div style="text-align: center; margin-top: 30px;">
  <p style="color: #06b6d4; font-weight: bold; margin: 0;">🏁 CTFPL - Free Infantry</p>
  <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0;">Capture the Flag Premier League</p>
</div>
```

## Implementation Steps

### 1. Update Email Templates in Supabase
1. Go to your Supabase dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Select each template type and replace with the branded versions above
4. Save each template

### 2. Test the Templates
1. Create a test user registration
2. Check that the email arrives with proper branding
3. Verify all links work correctly
4. Test on both desktop and mobile email clients

### 3. Optional: Add Logo/Images
If you want to include images:
1. Upload your logo to a public CDN or your website
2. Add image tags to the templates:
```html
<img src="https://freeinf.org/logo.png" alt="CTFPL Logo" style="max-width: 200px; height: auto;">
```

## Email Template Variables

Supabase provides these variables you can use:
- `{{ .Email }}` - User's email address
- `{{ .ConfirmationURL }}` - The verification/action URL
- `{{ .Token }}` - The verification token
- `{{ .TokenHash }}` - Hashed version of the token
- `{{ .SiteURL }}` - Your site URL (from settings)

## Styling Guidelines

The templates use:
- **Dark theme** to match your website
- **Cyan/blue gradients** for primary actions
- **Color-coded sections** for different types of information
- **Mobile-responsive** design
- **Infantry Online branding** and terminology

## Testing Checklist

- [ ] Confirmation email displays correctly
- [ ] All links work and redirect to correct pages
- [ ] Email renders properly in Gmail, Outlook, Apple Mail
- [ ] Mobile email clients display correctly
- [ ] Branding is consistent with website
- [ ] All text is readable and professional

## Troubleshooting

**Email not sending?**
- Check Supabase SMTP settings
- Verify your domain is properly configured
- Check spam folders

**Links not working?**
- Ensure `NEXT_PUBLIC_SITE_URL` is set correctly
- Verify redirect URLs in Supabase settings

**Styling issues?**
- Email clients have limited CSS support
- Use inline styles for best compatibility
- Test across multiple email clients 
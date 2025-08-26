require('dotenv').config({ path: '.env.local' });

const updateTeamPassword = async () => {
  const teamName = 'G unit';
  const newPassword = 'newpassword123'; // Change this to the desired password
  
  try {
    // You'll need to get an admin user's session token
    // This is just a template - you'll need to authenticate first
    const response = await fetch('http://localhost:3000/api/admin/update-team-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_ADMIN_TOKEN_HERE' // Replace with actual admin token
      },
      body: JSON.stringify({
        teamName: teamName,
        newPassword: newPassword
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Success:', result.message);
      console.log('Team ID:', result.teamId);
    } else {
      console.error('❌ Error:', result.error);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
};

console.log('This script requires an admin session token.');
console.log('Please use the direct SQL solution below instead, or get an admin token first.');
console.log('');
console.log('=== DIRECT SQL SOLUTION ===');
console.log('Run this SQL command in your Supabase SQL Editor:');
console.log('');
console.log(`UPDATE tt_teams 
SET team_password_hash = 'newpassword123', 
    updated_at = NOW() 
WHERE team_name = 'G unit';`);
console.log('');
console.log('The database trigger will automatically hash the password when you update it.');
console.log('Make sure to replace "newpassword123" with the actual new password you want to set.');

// Uncomment the line below if you have an admin token
// updateTeamPassword();

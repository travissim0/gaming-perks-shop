async function checkLiveDeployment() {
  console.log('🔍 Checking live site deployment...\n');
  
  const baseUrl = 'https://freeinf.org';
  const endpoints = [
    '/',
    '/api/webhooks/square',
    '/api/admin/donations',
    '/api/recent-donations'
  ];
  
  for (const endpoint of endpoints) {
    const url = baseUrl + endpoint;
    
    try {
      console.log(`📡 Testing: ${url}`);
      
      const response = await fetch(url, {
        method: endpoint.includes('/api/webhooks/') ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        body: endpoint.includes('/api/webhooks/') ? JSON.stringify({ test: true }) : undefined
      });
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.status === 502) {
        console.log('   🚨 502 Bad Gateway - Site deployment issue!');
      } else if (response.status === 404) {
        console.log('   ❌ 404 Not Found - Endpoint not deployed');
      } else if (response.status === 401 || response.status === 403) {
        console.log('   🔐 Authentication required (endpoint exists)');
      } else if (response.status >= 200 && response.status < 300) {
        console.log('   ✅ Endpoint accessible');
      } else {
        console.log('   ⚠️  Unexpected status');
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
  
  console.log('🔧 DIAGNOSIS:');
  console.log('- If all endpoints return 502: Your entire site is down');
  console.log('- If only webhook returns 502: Deployment issue with API routes');
  console.log('- If webhook returns 404: Webhook endpoint not deployed');
  console.log('- If webhook returns 401/500: Webhook exists but has issues');
}

checkLiveDeployment().catch(console.error); 
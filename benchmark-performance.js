const puppeteer = require('puppeteer');

async function benchmarkPageLoad() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Set viewport and enable performance monitoring
  await page.setViewport({ width: 1920, height: 1080 });
  
  console.log('🔍 Testing page load performance...');
  
  try {
    const start = Date.now();
    
    // Navigate to the page and wait for network to be idle
    const response = await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    const loadTime = Date.now() - start;
    
    // Get performance metrics
    const metrics = await page.metrics();
    const performanceTimings = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint')?.startTime || 0
      };
    });
    
    console.log('\n📊 Performance Results:');
    console.log(`🌐 Total Page Load: ${loadTime}ms`);
    console.log(`🎨 First Paint: ${Math.round(performanceTimings.firstPaint)}ms`);
    console.log(`🖼️ First Contentful Paint: ${Math.round(performanceTimings.firstContentfulPaint)}ms`);
    console.log(`📄 DOM Content Loaded: ${Math.round(performanceTimings.domContentLoaded)}ms`);
    console.log(`✅ Load Complete: ${Math.round(performanceTimings.loadComplete)}ms`);
    console.log(`🧠 JS Heap Used: ${Math.round(metrics.JSHeapUsedSize / 1024 / 1024)}MB`);
    console.log(`📋 DOM Nodes: ${metrics.Nodes}`);
    
    // Test progressive loading by waiting and checking for skeleton elements
    console.log('\n🔄 Testing Progressive Loading:');
    
    // Check for loading skeletons initially
    const hasSkeletons = await page.evaluate(() => {
      return document.querySelectorAll('.animate-pulse').length > 0;
    });
    
    if (hasSkeletons) {
      console.log('✅ Loading skeletons found - progressive loading working');
      
      // Wait for content to load
      await page.waitForTimeout(3000);
      
      // Check if skeletons are replaced with content
      const remainingSkeletons = await page.evaluate(() => {
        return document.querySelectorAll('.animate-pulse').length;
      });
      
      console.log(`📊 Remaining skeletons after 3s: ${remainingSkeletons}`);
    } else {
      console.log('ℹ️ No loading skeletons found - content loaded immediately');
    }
    
    // Overall assessment
    console.log('\n🎯 Performance Assessment:');
    if (loadTime < 1000) {
      console.log('🚀 EXCELLENT - Page loads in under 1 second');
    } else if (loadTime < 2000) {
      console.log('✅ GOOD - Page loads in under 2 seconds');
    } else if (loadTime < 3000) {
      console.log('⚠️ FAIR - Page loads in under 3 seconds');
    } else {
      console.log('❌ SLOW - Page takes over 3 seconds to load');
    }
    
    if (performanceTimings.firstContentfulPaint < 500) {
      console.log('⚡ EXCELLENT - First content appears in under 500ms');
    } else if (performanceTimings.firstContentfulPaint < 1000) {
      console.log('✅ GOOD - First content appears in under 1 second');
    } else {
      console.log('⚠️ SLOW - First content takes over 1 second');
    }
    
  } catch (error) {
    console.error('❌ Error during performance test:', error.message);
  } finally {
    await browser.close();
  }
}

// Run the benchmark
benchmarkPageLoad().catch(console.error); 
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    // Define file paths in order of preference
    const filePaths = [
      // Production: Synced file from game server
      '/var/www/gaming-perks-shop/public/ctfpl.nws',
      // Development: Local sample file
      path.join(process.cwd(), 'sample-ctfpl.nws'),
      // Alternative: Public directory sample
      path.join(process.cwd(), 'public', 'ctfpl.nws')
    ];
    
    let content = '';
    let lastModified = '';
    let usedFilePath = '';
    let isFromGameServer = false;
    
    // Try each file path until we find one that works
    for (const filePath of filePaths) {
      try {
        console.log(`Attempting to read patch notes from: ${filePath}`);
        
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const stats = await fs.stat(filePath);
        
        content = fileContent;
        lastModified = stats.mtime.toISOString();
        usedFilePath = filePath;
        isFromGameServer = filePath.includes('/var/www/gaming-perks-shop/public/ctfpl.nws');
        
        console.log(`Successfully loaded patch notes from: ${filePath}`);
        console.log(`File size: ${Buffer.byteLength(content, 'utf8')} bytes`);
        console.log(`Last modified: ${lastModified}`);
        console.log(`From game server: ${isFromGameServer}`);
        
        break; // Success - exit the loop
        
      } catch (fileError: any) {
        console.log(`Failed to read ${filePath}: ${fileError.message}`);
        continue; // Try next file path
      }
    }
    
    // If no files could be read, return error content
    if (!content) {
      console.error('All patch notes file paths failed');
      
      content = `OTF News

~2Patch Notes Unavailable

~6Unable to load patch notes from any configured location.

~6Attempted locations:
${filePaths.map(path => `~4- ${path}`).join('\n')}

~5Status:
~4The sync system may not be set up yet, or there may be a file permission issue.

~6For Production Setup:
~41. Upload sync-patch-notes.sh and setup-patch-sync.sh to your server
~42. Run: sudo ./setup-patch-sync.sh
~43. This will automatically sync patch notes from your game server

~6For Development:
~4Ensure sample-ctfpl.nws exists in your project root`;
      
      lastModified = new Date().toISOString();
      usedFilePath = 'none';
    }
    
    return NextResponse.json({
      content,
      lastModified,
      filePath: usedFilePath,
      isFromGameServer,
      sync: {
        enabled: isFromGameServer,
        lastCheck: lastModified,
        source: isFromGameServer ? 'Live Game Server' : 'Sample/Development File'
      },
      stats: {
        size: Buffer.byteLength(content, 'utf8'),
        lines: content.split('\n').length
      }
    });
    
  } catch (error: any) {
    console.error('Error in patch-notes API:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch patch notes',
        content: `~B Error Loading Patch Notes

~1An unexpected error occurred while trying to load the patch notes.

~6Error Details:
~4${error.message || 'Unknown error'}

~5Please try again later or contact support if the issue persists.`,
        lastModified: new Date().toISOString(),
        filePath: 'error',
        isFromGameServer: false
      },
      { status: 500 }
    );
  }
} 
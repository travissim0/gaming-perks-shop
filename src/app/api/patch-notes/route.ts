import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    // The file path specified by the user
    const filePath = 'G:\\Users\\Travis\\Desktop\\New folder (2)\\Infantry Online Map Folder\\CTFPL Updates\\ctfpl.nws';
    
    // Check if file exists and read it
    let content = '';
    let lastModified = '';
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      content = fileContent;
      
      // Get file stats for last modified date
      const stats = await fs.stat(filePath);
      lastModified = stats.mtime.toISOString();
    } catch (fileError: any) {
      console.error('Error reading patch notes file:', fileError);
      
      // Try to read from sample file for testing
      try {
        const samplePath = path.join(process.cwd(), 'sample-ctfpl.nws');
        const sampleContent = await fs.readFile(samplePath, 'utf-8');
        content = sampleContent;
        
        const sampleStats = await fs.stat(samplePath);
        lastModified = sampleStats.mtime.toISOString();
        
        console.log('Using sample file for testing');
      } catch (sampleError) {
        console.error('Error reading sample file:', sampleError);
        
        // If both files fail, return a default message
        content = `OTF News

~2Patch Notes Unavailable

~6Unable to load patch notes from the specified file path.
~4This may be because:
~4- The file doesn't exist at the expected location
~4- The application doesn't have permission to read the file
~4- The file path is incorrect

~6Expected file location:
~4${filePath}

~5Please check the file path and permissions.`;
        
        lastModified = new Date().toISOString();
      }
    }
    
    return NextResponse.json({
      content,
      lastModified,
      filePath
    });
    
  } catch (error: any) {
    console.error('Error in patch-notes API:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch patch notes',
        content: '~B Error loading patch notes\n~1 An unexpected error occurred while trying to load the patch notes.',
        lastModified: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 
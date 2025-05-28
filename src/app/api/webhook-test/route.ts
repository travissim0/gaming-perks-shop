import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  console.log('🧪 Test webhook received at:', new Date().toISOString());
  
  try {
    const body = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    
    console.log('📝 Test webhook headers:', headers);
    console.log('📄 Test webhook body length:', body.length);
    
    return NextResponse.json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      message: 'Test webhook working!' 
    });
  } catch (error: any) {
    console.error('❌ Test webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  console.log('🧪 Test webhook GET request at:', new Date().toISOString());
  
  return NextResponse.json({ 
    status: 'Test webhook endpoint is working!',
    timestamp: new Date().toISOString(),
    method: 'GET'
  });
} 
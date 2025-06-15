import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 TEST API HIT');
    const body = await request.text();
    console.log('Test body received:', body);
    
    return NextResponse.json({
      success: true,
      message: 'Test endpoint working',
      receivedBody: body
    });
  } catch (error) {
    console.error('Test API error:', error);
    return NextResponse.json(
      { error: 'Test API error' },
      { status: 500 }
    );
  }
} 
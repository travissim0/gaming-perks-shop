'use client';

import { useEffect, useState } from 'react';
import { isMobileDevice } from '@/utils/deviceDetection';

interface MobilePaymentInfoProps {
  className?: string;
}

export default function MobilePaymentInfo({ className = '' }: MobilePaymentInfoProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  return (
    <div className={`bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 ${className}`}>
      <div className="text-blue-400 font-medium mb-2">🛡️ Secure Payment Process</div>
      <div className="text-sm text-gray-300">
        {isMobile ? (
          <>
            You'll be redirected to Ko-fi's secure mobile payment page ($5 minimum). 
            <br /><br />
            <span className="text-blue-300 font-medium">📱 Mobile Instructions:</span>
            <br />
            • Payment will open in the same tab for best compatibility
            <br />
            • Use your phone's back button to return after payment
            <br />
            • Your contribution will appear in our community within minutes!
          </>
        ) : (
          <>
            You'll be redirected to Ko-fi's secure payment page ($5 minimum) in a new tab. 
            After completing your payment, return to this page to see your contribution in our community!
          </>
        )}
      </div>
    </div>
  );
} 
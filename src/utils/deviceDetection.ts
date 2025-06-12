/**
 * Device Detection Utilities
 * Used for mobile-friendly Ko-Fi payment handling
 */

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

export const isIOSDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

export const isAndroidDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return /Android/i.test(navigator.userAgent);
};

/**
 * Mobile-friendly Ko-Fi redirect handler
 * Uses same-window redirect on mobile to avoid popup blockers
 */
export const handleKofiRedirect = (
  url: string, 
  options: {
    showMobileToast?: boolean;
    mobileToastMessage?: string;
  } = {}
): void => {
  const { 
    showMobileToast = true, 
    mobileToastMessage = '🔄 Redirecting you to Ko-fi payment page...' 
  } = options;
  
  if (isMobileDevice()) {
    // On mobile, use same-window redirect to avoid popup blockers
    if (showMobileToast && typeof window !== 'undefined') {
      // Import toast dynamically to avoid SSR issues
      import('react-hot-toast').then(({ toast }) => {
        toast(mobileToastMessage, { 
          duration: 3000,
          icon: '📱'
        });
      });
    }
    
    // Small delay to show toast before redirect
    setTimeout(() => {
      window.location.href = url;
    }, 500);
  } else {
    // On desktop, open in new tab
    window.open(url, '_blank');
  }
}; 
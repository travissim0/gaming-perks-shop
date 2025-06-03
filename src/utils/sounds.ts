// Sound utility functions for playing audio feedback

export const playPromotionSound = (): void => {
  try {
    const audio = new Audio('/sounds/promotion.wav');
    audio.volume = 0.5; // Set volume to 50%
    audio.play().catch(error => {
      console.warn('Could not play promotion sound:', error);
    });
  } catch (error) {
    console.warn('Could not create audio element for promotion sound:', error);
  }
};

export const playNotificationSound = (): void => {
  try {
    // Use a shorter, gentler sound for notifications
    const audio = new Audio('/sounds/promotion.wav');
    audio.volume = 0.3; // Lower volume for notifications
    audio.currentTime = 0; // Start from beginning
    audio.play().catch(error => {
      console.warn('Could not play notification sound:', error);
    });
  } catch (error) {
    console.warn('Could not create audio element for notification sound:', error);
  }
};

export const playSoundWithText = (text: string, volume: number = 0.5): void => {
  try {
    // Play the sound
    const audio = new Audio('/sounds/promotion.wav');
    audio.volume = volume;
    audio.play().catch(error => {
      console.warn('Could not play sound:', error);
    });

    // Show a toast notification or similar
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = volume;
      utterance.rate = 1;
      speechSynthesis.speak(utterance);
    }
  } catch (error) {
    console.warn('Could not play sound with text:', error);
  }
};

export const isAudioSupported = (): boolean => {
  try {
    return typeof Audio !== 'undefined';
  } catch {
    return false;
  }
};

export const preloadSounds = (): void => {
  if (!isAudioSupported()) return;
  
  try {
    // Preload the promotion sound
    const audio = new Audio('/sounds/promotion.wav');
    audio.preload = 'auto';
  } catch (error) {
    console.warn('Could not preload sounds:', error);
  }
}; 
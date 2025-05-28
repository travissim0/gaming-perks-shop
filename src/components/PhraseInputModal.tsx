'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';

interface PhraseInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (phrase: string) => void;
  productName: string;
  loading?: boolean;
}

export default function PhraseInputModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  productName,
  loading = false 
}: PhraseInputModalProps) {
  const [phrase, setPhrase] = useState('');
  const [isValid, setIsValid] = useState(false);

  const validatePhrase = (value: string) => {
    const alphanumericRegex = /^[a-zA-Z0-9]*$/;
    const isValidLength = value.length >= 1 && value.length <= 12;
    const isValidChars = alphanumericRegex.test(value);
    const valid = isValidLength && isValidChars;
    setIsValid(valid);
    return valid;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase(); // Convert to uppercase for consistency
    setPhrase(value);
    validatePhrase(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phrase.trim()) {
      toast.error('Please enter a phrase');
      return;
    }
    if (!isValid) {
      toast.error('Phrase must be 1-12 alphanumeric characters only');
      return;
    }
    onConfirm(phrase.trim());
  };

  const handleClose = () => {
    setPhrase('');
    setIsValid(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-cyan-500/30 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
        <h2 className="text-2xl font-bold text-cyan-400 mb-4 text-center">
          🎮 Customize Your Kill Macro
        </h2>
        
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 mb-6">
          <p className="text-gray-300 text-sm mb-2">
            <span className="text-cyan-400 font-bold">Product:</span> {productName}
          </p>
          <p className="text-gray-300 text-sm">
            Enter your custom phrase that will appear in your kill macro text. 
            This will be displayed whenever you get a kill in-game.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="phrase" className="block text-cyan-400 font-bold mb-2">
              Kill Macro Phrase
            </label>
            <input
              type="text"
              id="phrase"
              value={phrase}
              onChange={handleInputChange}
              maxLength={12}
              placeholder="Enter 1-12 characters"
              className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white font-mono text-center text-xl ${
                phrase && isValid 
                  ? 'border-green-500 bg-green-900/20' 
                  : phrase && !isValid 
                  ? 'border-red-500 bg-red-900/20' 
                  : 'border-gray-600'
              } focus:outline-none focus:border-cyan-500`}
              disabled={loading}
            />
            <div className="flex justify-between mt-2">
              <p className="text-xs text-gray-400">
                Only letters and numbers allowed
              </p>
              <p className={`text-xs ${phrase.length <= 12 ? 'text-gray-400' : 'text-red-400'}`}>
                {phrase.length}/12
              </p>
            </div>
            {phrase && (
              <div className="mt-3 p-3 bg-gray-900/50 border border-gray-600 rounded">
                <p className="text-yellow-400 text-sm font-bold mb-1">Preview:</p>
                <p className="text-gray-300 text-sm font-mono">
                  "Player was eliminated by <span className="text-cyan-400">{phrase || 'YOUR_PHRASE'}</span>"
                </p>
              </div>
            )}
          </div>

          <div className="flex space-x-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-bold transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || loading}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-all ${
                isValid && !loading
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  Processing...
                </div>
              ) : (
                'Confirm & Purchase'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 
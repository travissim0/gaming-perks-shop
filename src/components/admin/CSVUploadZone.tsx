'use client';

import React, { useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, X } from 'lucide-react';

interface CSVUploadZoneProps {
  onFileUpload: (file: File) => void;
  isProcessing?: boolean;
  error?: string | null;
  disabled?: boolean;
}

export default function CSVUploadZone({ onFileUpload, isProcessing, error, disabled }: CSVUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return;
    }

    setSelectedFile(file);
    onFileUpload(file);
  };

  const clearSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">Import Match Data</h2>
      
      {/* Upload Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver && !disabled
            ? 'border-blue-500 bg-blue-500/10' 
            : 'border-gray-600 hover:border-gray-500'
        } ${isProcessing || disabled ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!selectedFile ? (
          <>
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Drop your CSV file here
            </h3>
            <p className="text-gray-400 mb-4">
              or click to browse your computer
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || disabled}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg text-white font-medium disabled:opacity-50"
            >
              Choose File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </>
        ) : (
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-green-400 mr-3" />
                <div className="text-left">
                  <p className="text-white font-medium">{selectedFile.name}</p>
                  <p className="text-gray-400 text-sm">
                    {formatFileSize(selectedFile.size)} • Modified {selectedFile.lastModified ? new Date(selectedFile.lastModified).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
              </div>
              <button
                onClick={clearSelection}
                className="text-gray-400 hover:text-white"
                disabled={isProcessing || disabled}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {isProcessing && (
              <div className="flex items-center justify-center py-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                <span className="text-gray-400 ml-2">Processing...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4 bg-red-900/50 border border-red-500 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-red-400 font-medium">Upload Error</h4>
              <pre className="text-red-300 text-sm mt-1 whitespace-pre-wrap">{error}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Format Instructions */}
      <div className="mt-6 bg-gray-700 rounded-lg p-4">
        <h3 className="text-white font-medium mb-2">Expected CSV Format</h3>
        <div className="text-sm text-gray-300 space-y-1">
          <p>Your CSV file should contain the following columns:</p>
          <div className="font-mono text-xs bg-gray-800 p-2 rounded mt-2">
            PlayerName, Team, Kills, Deaths, Captures, CarrierKills, CarryTimeSeconds,<br/>
            GameLengthMinutes, Result, MostPlayedClass, ClassSwaps, TurretDamage,<br/>
            GameMode, Side, BaseUsed, Accuracy, AvgResourceUnusedPerDeath,<br/>
            AvgExplosiveUnusedPerDeath, EBHits, LeftEarly
          </div>
          <div className="mt-2 text-gray-400">
            <p>• File size limit: 10MB</p>
            <p>• Game mode will be automatically set to 'Tournament'</p>
            <p>• Date and Game ID will be auto-generated if not provided</p>
          </div>
        </div>
      </div>
    </div>
  );
}
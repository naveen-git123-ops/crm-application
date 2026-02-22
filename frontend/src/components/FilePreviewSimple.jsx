// Simple File Preview Component for S3 Files
// Uses backend streaming endpoint to avoid CORS issues

import React, { useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

export function FilePreviewSimple({ fileUrl, fileName = 'File' }) {
  const [error, setError] = useState(null);
  
  if (!fileUrl) {
    return <div style={{ padding: '20px', color: '#999' }}>No file URL provided</div>;
  }

  console.log('FilePreviewSimple received URL:', fileUrl);
  console.log('Backend URL:', BACKEND_URL);

  // Get file extension
  const getFileExtension = (url) => {
    try {
      // Handle both S3 URLs and local paths
      let path = url;
      
      // If it's a URL, extract pathname
      if (url.includes('://')) {
        path = new URL(url).pathname;
      }
      
      // Get last part after last slash and extract extension
      const filename = path.split('/').pop();
      const ext = filename.split('.').pop().toLowerCase();
      console.log('Extracted extension:', ext, 'from:', filename);
      return ext;
    } catch (e) {
      console.error('Error extracting extension:', e);
      return '';
    }
  };

  const ext = getFileExtension(fileUrl);
  
  // Build the stream URL using full backend URL
  let streamUrl;
  if (fileUrl.includes('https://')) {
    // S3 URL - pass through stream endpoint
    streamUrl = `${API}/files/stream?file_url=${encodeURIComponent(fileUrl)}`;
  } else {
    // Local path - convert to full S3 URL first
    // Assuming it's stored as a path like /uploads/... or similar
    // Actually, just pass it as-is if it starts with /
    if (fileUrl.startsWith('http')) {
      streamUrl = `${API}/files/stream?file_url=${encodeURIComponent(fileUrl)}`;
    } else {
      // It's a local path, but we need the full S3 URL from database
      // This shouldn't happen with new uploads, but handle it gracefully
      streamUrl = `${API}/files/stream?file_url=${encodeURIComponent(fileUrl)}`;
    }
  }
  
  console.log('Stream URL:', streamUrl);
  
  // Image types - simple inline display
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <img 
          src={streamUrl}
          alt={fileName}
          style={{
            maxWidth: '100%',
            maxHeight: '600px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
          onError={(e) => {
            console.error('Image load error:', e);
            console.error('Failed to load from URL:', streamUrl);
            setError('Failed to load image from stream endpoint');
          }}
          onLoad={() => {
            console.log('✅ Image loaded successfully');
            setError(null);
          }}
        />
        {error && <p style={{ color: 'red', marginTop: '10px' }}>❌ {error}</p>}
      </div>
    );
  }

  // PDF type
  if (ext === 'pdf') {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <object
          data={streamUrl}
          type="application/pdf"
          style={{
            width: '100%',
            height: '600px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
          title="PDF Viewer"
          onError={() => {
            console.error('PDF load error');
            setError('Failed to load PDF');
          }}
        >
          <p>
            Your browser does not support PDFs. 
            <a href={streamUrl} download={fileName}>Download instead</a>
          </p>
        </object>
      </div>
    );
  }

  // Document types - show download link
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: '#f9f9f9'
      }}>
        <p style={{ fontSize: '16px', marginBottom: '10px' }}>
          📄 {fileName}.{ext}
        </p>
        <a 
          href={streamUrl}
          download={`${fileName}.${ext}`}
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#4caf50',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}
        >
          Download {ext.toUpperCase()}
        </a>
      </div>
    );
  }

  // Video types
  if (['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(ext)) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <video
          controls
          style={{
            maxWidth: '100%',
            maxHeight: '600px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
          onError={() => {
            console.error('Video load error');
            setError('Failed to load video');
          }}
        >
          <source src={streamUrl} type={`video/${ext}`} />
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  // Audio types
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
    return (
      <div style={{ padding: '20px' }}>
        <audio
          controls
          style={{ width: '100%' }}
          onError={() => {
            console.error('Audio load error');
            setError('Failed to load audio');
          }}
        >
          <source src={streamUrl} type={`audio/${ext}`} />
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }

  // Default - show download link
  return (
    <div style={{
      padding: '20px',
      textAlign: 'center',
      border: '1px solid #ddd',
      borderRadius: '4px',
      backgroundColor: '#f9f9f9'
    }}>
      <p>📎 {fileName}</p>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
        Type: {ext || 'unknown'}
      </p>
      <a 
        href={streamUrl}
        download={fileName}
        style={{
          display: 'inline-block',
          padding: '10px 20px',
          backgroundColor: '#2196F3',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          fontWeight: 'bold'
        }}
      >
        Download File
      </a>
    </div>
  );
}

export default FilePreviewSimple;

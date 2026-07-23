// Simple File Preview Component for S3 Files
// Uses direct S3 URLs with CORS for preview

import React, { useState } from 'react';

export function FilePreviewSimple({ fileUrl, fileName = 'File' }) {
  const [error, setError] = useState(null);
  
  if (!fileUrl) {
    return <div style={{ padding: '20px', color: '#999' }}>No file URL provided</div>;
  }

  console.log('FilePreviewSimple received URL:', fileUrl);

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
  
  // Use S3 URL directly for preview (S3 supports CORS)
  // Add query parameter to bypass cache for testing
  const previewUrl = fileUrl.includes('https://') 
    ? `${fileUrl}?t=${Date.now()}` 
    : fileUrl;
  
  console.log('Preview URL:', previewUrl);
  
  // Image types - simple inline display
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        {!error ? (
          <img 
            src={previewUrl}
            alt={fileName}
            style={{
              maxWidth: '100%',
              maxHeight: '600px',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
            crossOrigin="anonymous"
            onError={(e) => {
              console.error('❌ Image load error:', e);
              console.error('Failed to load from URL:', previewUrl);
              console.error('This is likely a CORS issue - S3 bucket needs CORS configuration');
              setError('CORS_ERROR');
            }}
            onLoad={() => {
              console.log('✅ Image loaded successfully');
              setError(null);
            }}
          />
        ) : null}
        
        {error === 'CORS_ERROR' && (
          <div style={{ 
            padding: '20px', 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffc107',
            borderRadius: '4px',
            marginBottom: '20px'
          }}>
            <p style={{ color: '#856404', marginBottom: '10px', fontWeight: 'bold' }}>
              ⚠️ Cannot preview image (CORS issue)
            </p>
            <p style={{ color: '#856404', fontSize: '14px', marginBottom: '15px' }}>
              Your S3 bucket needs CORS configuration for preview to work.
            </p>
            <a 
              href={fileUrl}
              download={`${fileName}.${ext}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: '#ffc107',
                color: '#333',
                textDecoration: 'none',
                borderRadius: '4px',
                fontWeight: 'bold'
              }}
            >
              ⬇️ Download Image ({ext.toUpperCase()})
            </a>
          </div>
        )}
      </div>
    );
  }

  // PDF type
  if (ext === 'pdf') {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <iframe
          src={previewUrl}
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
            <a href={previewUrl} download={fileName} target="_blank" rel="noreferrer">Download instead</a>
          </p>
        </iframe>
        {error && <p style={{ color: 'red', marginTop: '10px' }}>Preview might not work, but you can <a href={previewUrl} download={fileName}>download the file</a></p>}
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
          href={previewUrl}
          download={`${fileName}.${ext}`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#4caf50',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            marginRight: '10px'
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
          crossOrigin="anonymous"
          onError={() => {
            console.error('Video load error');
            setError('Failed to load video');
          }}
        >
          <source src={previewUrl} type={`video/${ext}`} />
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
          crossOrigin="anonymous"
          onError={() => {
            console.error('Audio load error');
            setError('Failed to load audio');
          }}
        >
          <source src={previewUrl} type={`audio/${ext}`} />
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
        href={previewUrl}
        download={fileName}
        target="_blank"
        rel="noreferrer"
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

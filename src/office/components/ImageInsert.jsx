import { UploadSimple } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import { getBase64FromImageFile } from '../utils/common';
import { ImageIcon } from './IconsNew';

const HiddenFileInput = ({ children, ...p }) => (
  <input type="file" style={{ display: 'none' }} {...p} />
);

const ToolbarBtn = ({ children, ...p }) => (
  <button
    style={{
      width: 26,
      height: 26,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 5,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--text-secondary)',
      padding: 0,
      flexShrink: 0,
    }}
    {...p}
  >
    {/* Apply SVG sizing/stroke so icons are visible */}
    <style>
      {'.img-insert-btn svg{width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none}'}
    </style>
    <span
      className="img-insert-btn"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </span>
  </button>
);

const DropdownMenu = ({ children, style = {}, ...p }) => (
  <div
    style={{
      position: 'absolute',
      top: 'calc(100% + 4px)',
      right: 0,
      minWidth: 160,
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 4,
      zIndex: 9999,
      ...style,
      left: 'auto' /* repeat after spread so caller cannot override */,
    }}
    {...p}
  >
    {children}
  </div>
);

const DropdownMenuItem = ({ children, ...p }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '7px 12px',
      borderRadius: 5,
      cursor: 'pointer',
      fontSize: 13,
      color: 'var(--text-secondary)',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.background = 'var(--bg-hover,var(--bg-tertiary))';
      e.currentTarget.style.color = 'var(--text-primary)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--text-secondary)';
    }}
    {...p}
  >
    {children}
  </div>
);

/* isVisible controls display — critical fix: previously ignored this prop */
const ImageTooltip = ({ children, isVisible, ...p }) => (
  <div
    style={{
      display: isVisible ? 'block' : 'none',
      position: 'absolute',
      top: 32,
      left: 0,
      background: 'var(--bg-elevated,var(--bg-primary))',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      padding: 12,
      minWidth: 260,
      zIndex: 300,
    }}
    {...p}
  >
    {children}
  </div>
);

const FormGroup = ({ children, ...p }) => (
  <div style={{ marginBottom: 8 }} {...p}>
    {children}
  </div>
);

const FormLabel = ({ children, ...p }) => (
  <label
    style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}
    {...p}
  >
    {children}
  </label>
);

const FormInput = ({ children, ...p }) => (
  <input
    style={{
      width: '100%',
      boxSizing: 'border-box',
      padding: '6px 8px',
      border: '1px solid var(--border-default,var(--border-primary))',
      borderRadius: 5,
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: 13,
      outline: 'none',
    }}
    {...p}
  />
);

const ButtonContainer = ({ children, ...p }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }} {...p}>
    {children}
  </div>
);

const ConfirmButton = ({ children, ...p }) => (
  <button
    style={{
      padding: '5px 14px',
      background: 'var(--accent-blue)',
      color: '#fff',
      border: 'none',
      borderRadius: 5,
      fontSize: 13,
      cursor: 'pointer',
    }}
    {...p}
  >
    {children}
  </button>
);

const ImageInsert = ({
  style = {},
  onNetworkImage = () => {},
  onUploadImage = () => {},
  title = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageDescription, setImageDescription] = useState('');
  const [imageLink, setImageLink] = useState('');
  const ref = useRef();
  const tooltipRef = useRef();
  const fileInputRef = useRef();

  useClickOutside(ref, () => {
    if (isOpen) {
      setIsOpen(false);
    }
  });

  useClickOutside(tooltipRef, () => {
    if (isTooltipOpen) {
      setIsTooltipOpen(false);
      setImageUrl('');
      setImageDescription('');
      setImageLink('');
    }
  });

  const handleNetworkImage = e => {
    e.stopPropagation();
    setIsOpen(false);
    setIsTooltipOpen(true);
  };

  const isValidImageUrl = url => {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      // Check if it's a valid URL
      const validProtocols = ['http:', 'https:'];
      if (!validProtocols.includes(urlObj.protocol)) {
        return false;
      }
      // Check if URL looks like an image URL (has image extension or is a data URL)
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
      const pathname = urlObj.pathname.toLowerCase();
      const isImageExtension = imageExtensions.some(ext => pathname.endsWith(ext));
      const isDataUrl = url.startsWith('data:image/');
      return (
        isImageExtension ||
        isDataUrl ||
        urlObj.hostname.includes('img') ||
        urlObj.hostname.includes('image')
      );
    } catch {
      // If URL parsing fails, it might be a relative path or invalid URL
      return false;
    }
  };

  const handleTooltipConfirm = () => {
    const trimmedUrl = imageUrl.trim();
    if (!trimmedUrl) {
      alert('Please enter an image URL');
      return;
    }

    // Warn if URL doesn't look like a direct image URL
    if (!isValidImageUrl(trimmedUrl)) {
      const proceed = window.confirm(
        'The URL may not be a direct image link. It might be a search result page or gallery page. Do you want to continue anyway?',
      );
      if (!proceed) {
        return;
      }
    }

    setIsTooltipOpen(false);
    onNetworkImage({
      url: trimmedUrl,
      description: imageDescription.trim(),
      link: imageLink.trim(),
    });

    // Reset form
    setImageUrl('');
    setImageDescription('');
    setImageLink('');

    // Reset focus to BODY to ensure keyboard events work properly
    setTimeout(() => {
      document.activeElement?.blur();
      document.body.focus();
    }, 0);
  };

  const handleUploadImage = e => {
    e.stopPropagation();
    setIsOpen(false);
    // Trigger file input click
    fileInputRef.current?.click();
  };

  const handleFileChange = async e => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    try {
      // Convert to base64
      const base64Image = await getBase64FromImageFile(file);
      // Call the upload handler with the image data
      onUploadImage(base64Image);

      // Reset focus to BODY to ensure keyboard events work properly
      setTimeout(() => {
        document.activeElement?.blur();
        document.body.focus();
      }, 0);
    } catch (error) {
      console.error('Error reading image file:', error);
      alert('Failed to read image file');
    }

    // Reset file input
    e.target.value = '';
  };

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <ToolbarBtn
        onClick={() => {
          setIsOpen(!isOpen);
        }}
      >
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </ToolbarBtn>
      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
      />
      <DropdownMenu
        style={{
          display: isOpen ? 'flex' : 'none',
          top: 28,
          left: 0,
        }}
      >
        <DropdownMenuItem onClick={handleNetworkImage}>
          <ImageIcon style={{ padding: 0, width: '14px', height: '14px', cursor: 'pointer' }} />
          <span>Network Image</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleUploadImage}>
          <UploadSimple weight="bold" style={{ padding: 0, width: '14px', height: '14px' }} />
          <span>Upload Image</span>
        </DropdownMenuItem>
      </DropdownMenu>
      <ImageTooltip ref={tooltipRef} isVisible={isTooltipOpen}>
        <FormGroup>
          <FormLabel>Image URL</FormLabel>
          <FormInput
            type="text"
            placeholder="Enter image URL"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleTooltipConfirm();
              }
            }}
            autoFocus
          />
        </FormGroup>
        <FormGroup>
          <FormLabel>Image Description</FormLabel>
          <FormInput
            type="text"
            placeholder="Enter image description"
            value={imageDescription}
            onChange={e => setImageDescription(e.target.value)}
          />
        </FormGroup>
        <ButtonContainer>
          <ConfirmButton onClick={handleTooltipConfirm}>Confirm</ConfirmButton>
        </ButtonContainer>
      </ImageTooltip>
    </div>
  );
};

export default ImageInsert;

import { useEffect, useRef, useState } from 'react';
import { SF, END_X, START_Y } from '../utils/word-utils-refactor';

const RESIZE_HANDLES = ['top-right'];

const Overlay = ({children, ...p}) => <div style={{position:'absolute',top:0,left:0,right:0,bottom:0,pointerEvents:'none'}} {...p}>{children}</div>;

const ResizeHandle = ({children, ...p}) => <div style={{position:'absolute',width:10,height:10,background:'var(--accent-blue,#1473DF)',borderRadius:2,pointerEvents:'all',cursor:'nwse-resize'}} {...p}>{children}</div>;

const ImageResizeOverlay = ({
  imageIndex,
  imageStyle,
  canvasRef,
  xs,
  ys,
  scrollY,
  topMargin = 0,
  onResizeComplete,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [currentSize, setCurrentSize] = useState({ width: 0, height: 0 });
  const [resizeHandle, setResizeHandle] = useState(null);
  const resizeStartPosRef = useRef({ x: 0, y: 0 });
  const resizeStartSizeRef = useRef({ width: 0, height: 0 });
  const resizeStartImagePosRef = useRef({ x: 0, y: 0 });

  // Initialize current size from imageStyle
  useEffect(() => {
    if (imageStyle?.imageUrl && imageIndex !== null) {
      const imgWidth = imageStyle.imageWidth || 64;
      const imgHeight = imageStyle.imageHeight || 64;
      setCurrentSize({ width: imgWidth, height: imgHeight });
    }
  }, [imageStyle, imageIndex]);

  // Handle resize mouse events
  useEffect(() => {
    if (!isResizing || !resizeHandle) {
      return;
    }

    const handleMouseMove = e => {
      const canvas = canvasRef?.current;
      if (!canvas) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) * SF;
      const mouseY = (e.clientY - rect.top) * SF + scrollY;

      const deltaX = mouseX - resizeStartPosRef.current.x;
      const deltaY = mouseY - resizeStartPosRef.current.y;

      const imageStartX = resizeStartImagePosRef.current.x;
      const imageBottomY = resizeStartImagePosRef.current.y;

      let newWidth = resizeStartSizeRef.current.width + deltaX;
      let newHeight = resizeStartSizeRef.current.height - deltaY;

      // Boundary checks
      const minWidth = 20 * SF;
      const minHeight = 20 * SF;
      const maxWidth = END_X - imageStartX;
      const minTopY = START_Y + topMargin;
      const maxHeight = imageBottomY - minTopY;

      newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

      setCurrentSize({
        width: newWidth / SF,
        height: newHeight / SF,
      });
    };

    const handleMouseUp = () => {
      if (!isResizing) {
        return;
      }

      // Notify parent component about resize completion
      if (onResizeComplete) {
        onResizeComplete({
          width: currentSize.width,
          height: currentSize.height,
        });
      }

      setIsResizing(false);
      setResizeHandle(null);
      resizeStartPosRef.current = { x: 0, y: 0 };
      resizeStartSizeRef.current = { width: 0, height: 0 };
      resizeStartImagePosRef.current = { x: 0, y: 0 };
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeHandle, currentSize, canvasRef, scrollY, topMargin, onResizeComplete]);

  const handleResizeStart = (e, handle) => {
    e.stopPropagation();
    e.preventDefault();

    const canvas = canvasRef?.current;
    if (!canvas || !imageStyle?.imageUrl) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * SF;
    const mouseY = (e.clientY - rect.top) * SF + scrollY;

    const imgWidth = (imageStyle.imageWidth || 64) * SF;
    const imgHeight = (imageStyle.imageHeight || 64) * SF;

    resizeStartPosRef.current = { x: mouseX, y: mouseY };
    resizeStartSizeRef.current = { width: imgWidth, height: imgHeight };
    resizeStartImagePosRef.current = { x: xs[imageIndex], y: ys[imageIndex] };
    setResizeHandle(handle);
    setIsResizing(true);
  };

  // Calculate overlay position and size (relative to Container)
  const getOverlayStyle = () => {
    if (imageIndex === null || !xs[imageIndex] || !ys[imageIndex] || !imageStyle?.imageUrl) {
      return { display: 'none' };
    }

    const canvas = canvasRef?.current;
    if (!canvas) {
      return { display: 'none' };
    }

    const container = canvas.parentElement;
    if (!container) {
      return { display: 'none' };
    }

    const imgWidth = currentSize.width || imageStyle.imageWidth || 64;
    const imgHeight = currentSize.height || imageStyle.imageHeight || 64;

    const imgHeightScaled = imgHeight * SF;
    const canvasX = xs[imageIndex];
    const canvasY = ys[imageIndex] - imgHeightScaled;

    // Get canvas offset relative to container
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const canvasOffsetX = canvasRect.left - containerRect.left;

    // Position relative to Container
    const screenX = canvasOffsetX + canvasX / SF;
    const screenY = (canvasY - scrollY) / SF;

    return {
      left: `${screenX}px`,
      top: `${screenY}px`,
      width: `${imgWidth}px`,
      height: `${imgHeight}px`,
    };
  };

  if (imageIndex === null || !imageStyle?.imageUrl) {
    return null;
  }

  return (
    <Overlay style={getOverlayStyle()} isResizing={isResizing}>
      {RESIZE_HANDLES.map(handle => (
        <ResizeHandle
          key={handle}
          className={handle}
          onMouseDown={e => handleResizeStart(e, handle)}
        />
      ))}
    </Overlay>
  );
};

export default ImageResizeOverlay;

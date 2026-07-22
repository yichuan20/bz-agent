import { DEFAULT_CELL_HEIGHT, X_OFFSET, Y_OFFSET } from '../utils/excel-utils';
import { ImageContainer, ResizeHandle } from './ExcelViewSheetArea.styles';

/**
 * Calculate pixel offset for viewWindow start position
 * Used to sync image positions with virtual scrolling
 */
const getViewWindowPixelOffset = (viewWindow, grid) => {
  let offsetY = 0;
  for (let i = 0; i < viewWindow?.startRow; i++) {
    offsetY += grid?.rowIndexToHeight?.[i] ?? DEFAULT_CELL_HEIGHT;
  }

  let offsetX = 0;
  for (let i = 0; i < viewWindow?.startCol; i++) {
    offsetX += grid?.columnIndexToWidth?.[i] ?? 100;
  }

  return { offsetX, offsetY };
};

/**
 * Convert image storage coordinates to screen coordinates for rendering
 */
const storageToScreen = (imgData, viewWindow, grid, containerRect) => {
  const viewOffset = getViewWindowPixelOffset(viewWindow, grid);

  // Storage coords → Canvas-relative coords → Screen coords
  const screenX = (containerRect?.left || 0) + X_OFFSET + (imgData.x - viewOffset.offsetX);
  const screenY = (containerRect?.top || 0) + Y_OFFSET + (imgData.y - viewOffset.offsetY);

  return { screenX, screenY };
};

const RESIZE_HANDLES = [
  'top-left',
  'top-center',
  'top-right',
  'right-center',
  'bottom-right',
  'bottom-center',
  'bottom-left',
  'left-center',
];

const SelectedImageContainer = ({
  imgData,
  viewWindow,
  grid,
  containerRect,
  onImageMouseDown,
  onResizeHandleMouseDown,
}) => {
  if (!imgData || !containerRect) {
    return null;
  }

  // Use storageToScreen for coordinate conversion
  const { screenX, screenY } = storageToScreen(imgData, viewWindow, grid, containerRect);

  // Check if image is visible in viewport
  if (
    screenX + imgData.width < containerRect.left + X_OFFSET ||
    screenY + imgData.height < containerRect.top + Y_OFFSET ||
    screenX > containerRect.right ||
    screenY > containerRect.bottom
  ) {
    return null;
  }

  // Calculate clip-path to keep image within container bounds
  // This prevents image from appearing above bottom sheet tabs or other UI elements
  const clipTop = Math.max(0, containerRect.top + Y_OFFSET - screenY);
  const clipLeft = Math.max(0, containerRect.left + X_OFFSET - screenX);
  const clipBottom = Math.max(0, screenY + imgData.height - containerRect.bottom);
  const clipRight = Math.max(0, screenX + imgData.width - containerRect.right);

  const clipPath = `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)`;

  return (
    <ImageContainer
      key={imgData.id}
      isSelected
      data-image-container
      style={{
        position: 'fixed',
        left: `${screenX}px`,
        top: `${screenY}px`,
        width: `${imgData.width}px`,
        height: `${imgData.height}px`,
        zIndex: 200,
        clipPath: clipPath,
      }}
      onMouseDown={e => onImageMouseDown(e, imgData.id)}
    >
      <img src={imgData.src} alt={imgData.name || 'Image'} />
      {RESIZE_HANDLES.map(handle => (
        <ResizeHandle
          key={handle}
          className={handle}
          onMouseDown={e => onResizeHandleMouseDown(e, imgData.id, handle)}
        />
      ))}
    </ImageContainer>
  );
};

export default SelectedImageContainer;

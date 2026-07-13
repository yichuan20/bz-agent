import ExcelTextInputWithFormulaDropdown from './ExcelTextInputWithFormulaDropdown';
import { X_OFFSET, Y_OFFSET } from '../utils/excel-utils';

export const CellsContainer = ({children, style={}, ...p}) => <div style={{width:'100%',height:'100%',overflow:'hidden',position:'relative',gridRow:3,...style}} {...p}>{children}</div>;

export const Container = ({children, style={}, ...p}) => <div style={{display:'grid',gridTemplateRows:'auto auto 1fr',width:'100%',height:'100%',...style}} {...p}>{children}</div>;

export const ImageContainer = ({children, isSelected, style={}, ...p}) => <div style={{position:'absolute',cursor:isSelected?'grab':'default',border:isSelected?'2px dashed var(--accent-blue)':'2px solid transparent',boxSizing:'border-box',userSelect:'none',zIndex:10,...style}} {...p}>{children}</div>;

export const ResizeHandle = ({children, style={}, ...p}) => <div style={{position:'absolute',background:'var(--accent-blue)',boxSizing:'border-box',zIndex:11,...style}} {...p}>{children}</div>;

export const GridCanvas = ({viewportWidth, viewportHeight, style={}, ...p}) => <canvas style={{position:'absolute',top:0,left:0,width:viewportWidth,height:viewportHeight,pointerEvents:'none',...style}} {...p} />;

export const OverlayCanvas = ({viewportWidth, viewportHeight, style={}, ...p}) => <canvas style={{position:'absolute',top:0,left:0,width:viewportWidth,height:viewportHeight,...style}} {...p} />;

export const TopLeftCorner = ({children, style={}, ...p}) => <div style={{padding:4,overflow:'hidden',position:'absolute',top:0,left:0,width:X_OFFSET,height:Y_OFFSET,background:'var(--bg-secondary,#f5f5f5)',borderRight:'1px solid var(--border-default,#ccc)',borderBottom:'1px solid var(--border-default,#ccc)',zIndex:5,...style}} {...p}>{children}</div>;

export const FormulaBar = ({children, style={}, ...p}) => <div style={{height:36,padding:'0 12px',display:'flex',alignItems:'center',gap:8,background:'var(--bg-secondary)',borderBottom:'1px solid var(--border-default,var(--border-primary))',flexShrink:0,position:'relative',zIndex:99,...style}} {...p}>{children}</div>;

export const VerticalLine = ({children, style={}, ...p}) => <div style={{borderLeft:'1px solid var(--border-default,#ccc)',height:20,padding:'10px 0',...style}} {...p}>{children}</div>;

export const ToolbarContainer = ({children, style={}, ...p}) => <div style={{position:'relative',display:'flex',gap:2,alignItems:'center',flexWrap:'nowrap',...style}} {...p}>{children}</div>;

export const DataTypeContainer = ({children, style={}, ...p}) => <div style={{display:'grid',alignItems:'center',gridTemplateColumns:'auto auto',borderLeft:'1px solid var(--border-default,#ccc)',gap:5,padding:'0 8px',...style}} {...p}>{children}</div>;

export const FormulaInputWrapper = ({children, style={}, ...p}) => <div style={{flex:1,minWidth:0,display:'flex',height:26,background:'var(--bg-tertiary)',border:'1px solid var(--border-default,var(--border-primary))',borderRadius:4,overflow:'hidden',...style}} {...p}>{children}</div>;

export const VerticalDivider = ({children, style={}, ...p}) => <div style={{width:1,height:'100%',background:'var(--border-default,#ccc)',...style}} {...p}>{children}</div>;

export const IconButton = ({children, isActive, style={}, ...p}) => <div className="bzt-excel-btn" style={{position:'relative',borderRadius:5,display:'flex',justifyContent:'center',alignItems:'center',width:26,height:26,cursor:'pointer',color:isActive?'var(--accent-blue)':'var(--text-secondary)',background:isActive?'color-mix(in srgb,var(--accent-blue) 15%,transparent)':'transparent',...style}} {...p}>{children}</div>;

export const ColoredIconButton = ({children, style={}, ...p}) => <IconButton style={{...style}} {...p}>{children}</IconButton>;
export const ColoredIconButtonBucket = ({children, style={}, ...p}) => <IconButton style={{...style}} {...p}>{children}</IconButton>;

export const StyledSelect = ({children, style={}, ...p}) => <select style={{...style}} {...p}>{children}</select>;
export const StyledInput = ({children, style={}, ...p}) => <input style={{...style}} {...p} />;

export const ExcelTextInputWithFormulaDropdownBorderLeft = ({style={}, ...p}) => <ExcelTextInputWithFormulaDropdown style={{width:'100%',height:'100%',background:'transparent',border:'none',borderRadius:0,outline:'none',...style}} {...p} />;

export const StyledSearchInput = ({style={}, ...p}) => <input style={{...style}} {...p} />;

export const CellLocSpan = ({children, style={}, ...p}) => <span style={{fontFamily:'monospace',fontSize:11,color:'var(--text-secondary)',...style}} {...p}>{children}</span>;
export const FormulaIconWrapper = ({children, style={}, ...p}) => <div style={{display:'flex',alignItems:'center',justifyContent:'center',width:26,height:26,flexShrink:0,...style}} {...p}>{children}</div>;
export const IconContainer = ({children, style={}, ...p}) => <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px',cursor:'pointer',...style}} {...p}>{children}</div>;
export const LongEmptyDiv = ({children, style={}, ...p}) => <div style={{width:'1000000px',...style}} {...p}>{children}</div>;
export const SrcTriggerContainer = ({children, style={}, ...p}) => <div style={{position:'relative',display:'flex',alignItems:'center',...style}} {...p}>{children}</div>;
export const TallEmptyDiv = ({children, style={}, ...p}) => <div style={{position:'absolute',left:0,height:'1000000px',width:'1px',visibility:'hidden',...style}} {...p}>{children}</div>;

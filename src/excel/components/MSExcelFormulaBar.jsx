import { FormulaIcon } from './Icons';
import ExcelTextInputWithFormulaDropdownBorderLeft from './ExcelTextInputWithFormulaDropdown';

const FormulaBarContainer = ({children, style={}, ...p}) => <div style={{...style}} {...p}>{children}</div>;

const CellReference = ({children, style={}, ...p}) => <div style={{...style}} {...p}>{children}</div>;

const FunctionIcon = ({children, style={}, ...p}) => <div style={{...style}} {...p}>{children}</div>;

const FormulaInput = ({children, style={}, ...p}) => <div style={{...style}} {...p}>{children}</div>;

const MSExcelFormulaBar = ({
  selectedCellLocation = '',
  valueToEdit = '',
  isEditing = false,
  onFocus = () => {},
  onBlur = () => {},
  onChangeValue = () => {},
}) => {
  return (
    <FormulaBarContainer>
      <CellReference>{selectedCellLocation || 'A1'}</CellReference>
      <FunctionIcon>
        <FormulaIcon height="14px" />
      </FunctionIcon>
      <FormulaInput>
        <ExcelTextInputWithFormulaDropdownBorderLeft
          value={valueToEdit}
          isDisabled={!selectedCellLocation}
          onFocus={onFocus}
          onBlur={onBlur}
          onChangeValue={onChangeValue}
        />
      </FormulaInput>
    </FormulaBarContainer>
  );
};

export default MSExcelFormulaBar;

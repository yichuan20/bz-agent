import CloseIcon from '@mui/icons-material/Close';
import DoneIcon from '@mui/icons-material/Done';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import InputBase from '@mui/material/InputBase';
import Popper from '@mui/material/Popper';
import React, { useEffect, useState } from 'react';

const StyledPopper = ({ children, ...p }) => <Popper {...p}>{children}</Popper>;
({ theme }) => ({
  border: '1px solid var(--border-default)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
  borderRadius: 6,
  width: 300,
  zIndex: theme.zIndex.modal,
  fontSize: 13,
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-elevated)',
});

const StyledInput = ({ ...p }) => <InputBase {...p} />;
({ theme }) => ({
  padding: 10,
  width: '100%',
  borderBottom: '1px solid var(--border-default)',
  '& input': {
    borderRadius: 4,
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    padding: 8,
    transition: theme.transitions.create(['border-color', 'box-shadow']),
    border: '1px solid var(--border-default)',
    fontSize: 14,
    '&:focus': {
      boxShadow: '0px 0px 0px 3px rgba(20, 115, 223, 0.3)',
      borderColor: 'var(--accent-blue)',
    },
    '&::placeholder': {
      color: 'var(--text-tertiary)',
    },
  },
});

const LabelInputContainer = ({ children, ...p }) => <div {...p}>{children}</div>;
({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 8px',
  borderLeft: '1px solid var(--border-default)',
});

const LabelInputLabel = ({ children, ...p }) => <span {...p}>{children}</span>;
({
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  color: 'var(--text-secondary)',
});

const LabelInputWrapper = ({ children, isOpen, ...p }) => <div {...p}>{children}</div>;
({ isOpen }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  borderRadius: 4,
  border: `1px solid ${isOpen ? 'var(--accent-blue)' : 'var(--border-default)'}`,
  backgroundColor: 'var(--bg-tertiary)',
  cursor: 'pointer',
  minWidth: 120,
  maxWidth: 200,
  transition: 'border-color 0.2s, box-shadow 0.2s',
  '&:hover': {
    borderColor: 'var(--accent-blue)',
  },
  ...(isOpen && {
    boxShadow: '0px 0px 0px 3px rgba(20, 115, 223, 0.3)',
  }),
});

const LabelInputText = ({ children, hasLabels, ...p }) => <span {...p}>{children}</span>;
({ hasLabels }) => ({
  fontSize: 13,
  color: hasLabels ? 'var(--text-primary)' : 'var(--text-tertiary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export default function LabelPicker({
  labels = [],
  currentSelection = [],
  extraLabels = [],
  onUpdateLabels,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [pendingValue, setPendingValue] = useState([]);

  // Prepare options from labels prop
  const allLabelNames = Array.from(
    new Set(labels.map(l => l.label).concat(extraLabels.map(l => l.label))),
  );

  // Calculate pendingValue based on currentSelection and labels
  // biome-ignore lint/correctness/useExhaustiveDependencies: allLabelNames derived from labels
  useEffect(() => {
    if (currentSelection.length === 0) {
      setPendingValue([]);
      return;
    }

    const selectedLabels = allLabelNames.filter(labelName => {
      const labelEntry = labels.find(l => l.label === labelName);
      if (!labelEntry) return false;

      // Check if all selected cells are in this label's selection
      const intersectionCount = currentSelection.filter(cellId =>
        labelEntry.selection.includes(cellId),
      ).length;
      return intersectionCount === currentSelection.length;
    });
    setPendingValue(selectedLabels);
  }, [labels, currentSelection, anchorEl]);

  const handleClick = event => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? 'github-label-label' : undefined;

  const handleLabelsChange = newSelectedLabelNames => {
    const newLabels = [...labels];

    // Get list of ALL known label names (including those not selected)
    const allKnown = new Set([...allLabelNames, ...newSelectedLabelNames]);

    allKnown.forEach(labelName => {
      const shouldBeSelected = newSelectedLabelNames.includes(labelName);
      const labelIndex = newLabels.findIndex(l => l.label === labelName);

      if (shouldBeSelected) {
        if (labelIndex !== -1) {
          const entry = newLabels[labelIndex];
          const toAdd = currentSelection.filter(c => !entry.selection.includes(c));
          if (toAdd.length > 0) {
            newLabels[labelIndex] = {
              ...entry,
              selection: [...entry.selection, ...toAdd],
            };
          }
        } else {
          newLabels.push({
            id: crypto.randomUUID(),
            label: labelName,
            selection: [...currentSelection],
          });
        }
      } else {
        if (labelIndex !== -1) {
          const entry = newLabels[labelIndex];
          const newSelection = entry.selection.filter(c => !currentSelection.includes(c));
          if (newSelection.length !== entry.selection.length) {
            newLabels[labelIndex] = {
              ...entry,
              selection: newSelection,
            };
          }
        }
      }
    });

    setPendingValue(newSelectedLabelNames);
    onUpdateLabels(newLabels);
  };

  // Display text for the input
  const displayText = pendingValue.length > 0 ? pendingValue.join(', ') : 'Select labels';

  // Don't render if no cells are selected
  if (!currentSelection || currentSelection.length === 0) {
    return null;
  }

  return (
    <React.Fragment>
      <LabelInputContainer>
        <LabelInputLabel>Label:</LabelInputLabel>
        <LabelInputWrapper
          aria-describedby={id}
          onClick={handleClick}
          isOpen={open}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleClick(e);
            }
          }}
        >
          <LabelInputText hasLabels={pendingValue.length > 0} title={displayText}>
            {displayText}
          </LabelInputText>
        </LabelInputWrapper>
      </LabelInputContainer>
      <StyledPopper id={id} open={open} anchorEl={anchorEl} placement="bottom-start">
        <ClickAwayListener onClickAway={handleClose}>
          <div>
            <Box
              sx={{
                borderBottom: '1px solid var(--border-default)',
                padding: '8px 10px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Apply labels to selection
            </Box>
            <Autocomplete
              open
              multiple
              freeSolo
              onClose={(_event, reason) => {
                if (reason === 'escape') {
                  handleClose();
                }
              }}
              value={pendingValue}
              onChange={(_event, newValue) => {
                handleLabelsChange(newValue);
              }}
              disableCloseOnSelect
              renderTags={() => null}
              noOptionsText="No labels"
              renderOption={(props, option) => {
                const { key, ...restProps } = props;
                const isSelected = pendingValue.includes(option);
                return (
                  <li key={key} {...restProps}>
                    <Box
                      component={DoneIcon}
                      sx={{ width: 17, height: 17, mr: '5px', ml: '-2px' }}
                      style={{
                        visibility: isSelected ? 'visible' : 'hidden',
                      }}
                    />
                    <Box
                      component="span"
                      sx={{
                        width: 14,
                        height: 14,
                        flexShrink: 0,
                        borderRadius: '3px',
                        mr: 1,
                        mt: '2px',
                      }}
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                    />
                    <Box
                      sx={{
                        flexGrow: 1,
                        color: 'var(--text-primary)',
                        '& span': {
                          color: 'var(--text-secondary)',
                        },
                      }}
                    >
                      {option}
                    </Box>
                    <CloseIcon
                      sx={{ opacity: 0.6, width: 18, height: 18 }}
                      style={{
                        visibility: isSelected ? 'visible' : 'hidden',
                      }}
                    />
                  </li>
                );
              }}
              options={[...allLabelNames].sort((a, b) => {
                let ai = pendingValue.indexOf(a);
                ai = ai === -1 ? pendingValue.length + allLabelNames.indexOf(a) : ai;
                let bi = pendingValue.indexOf(b);
                bi = bi === -1 ? pendingValue.length + allLabelNames.indexOf(b) : bi;
                return ai - bi;
              })}
              getOptionLabel={option => option}
              renderInput={params => (
                <StyledInput
                  ref={params.InputProps.ref}
                  inputProps={params.inputProps}
                  autoFocus
                  placeholder="Filter or create labels"
                />
              )}
            />
          </div>
        </ClickAwayListener>
      </StyledPopper>
    </React.Fragment>
  );
}

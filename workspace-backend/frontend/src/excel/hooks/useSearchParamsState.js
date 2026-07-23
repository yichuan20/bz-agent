// Simplified version — bz-agent uses TanStack Router, not react-router-dom.
// We use plain state instead of URL param sync.
import { useState } from 'react';

const useSearchParamsState = ({ paramName: _paramName, initialValue = [] }) => {
  const [value, setValue] = useState(initialValue);
  return [value, setValue];
};

export default useSearchParamsState;

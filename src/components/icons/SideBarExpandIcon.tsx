import type * as React from 'react';

const SideBarExpandIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({ className, ...props }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <rect x="0.75" y="1.75" width="14.5" height="12.5" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4.5" y="1.75" width="1.5" height="12.5" rx="0.75" fill="currentColor" />
    </svg>
  );
};

export default SideBarExpandIcon;

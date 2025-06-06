import {keyframes} from '@emotion/react';
import styled from '@emotion/styled';

const SPACING = 15;

export function CheckInPlaceholder() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="14px"
      data-test-id="check-in-placeholder"
    >
      <defs>
        <pattern
          id="tick-pattern"
          patternUnits="userSpaceOnUse"
          width={SPACING + 4}
          height={24}
        >
          <rect width="4px" height="14px" rx="2" fill="white" />
        </pattern>
        <mask id="pattern-mask">
          <rect width="100%" height="100%" fill="url(#tick-pattern)" />
        </mask>
      </defs>
      <foreignObject width="100%" height="14" mask="url(#pattern-mask)">
        <AnimatedGradient />
      </foreignObject>
    </svg>
  );
}

const gradientAnimation = keyframes`
    0%{ background-position-x: 0%; }
    100%{ background-position-x: -200%; }
`;

const AnimatedGradient = styled('div')`
  width: 100%;
  height: 100%;
  background-image: linear-gradient(
    90deg,
    ${p => p.theme.tokens.content.muted} 0%,
    rgba(255, 255, 255, 0) 20%,
    rgba(255, 255, 255, 0) 80%,
    ${p => p.theme.tokens.content.muted} 100%
  );
  background-size: 200% 100%;
  animation: ${gradientAnimation} 2s linear infinite;
`;

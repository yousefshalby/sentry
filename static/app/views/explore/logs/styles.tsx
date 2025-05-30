import type {Theme} from '@emotion/react';
import styled from '@emotion/styled';

import {Button} from 'sentry/components/core/button';
import {GRID_BODY_ROW_HEIGHT} from 'sentry/components/gridEditable/styles';
import {HighlightComponent} from 'sentry/components/highlight';
import Panel from 'sentry/components/panels/panel';
import {space} from 'sentry/styles/space';
import {unreachable} from 'sentry/utils/unreachable';
import {
  TableBody,
  TableBodyCell,
  TableHeadCell,
  TableRow,
} from 'sentry/views/explore/components/table';
import {SeverityLevel} from 'sentry/views/explore/logs/utils';

const StyledPanel = styled(Panel)`
  margin-bottom: 0;
`;

interface LogTableRowProps {
  isClickable?: boolean;
}

export const LogTableRow = styled(TableRow)<LogTableRowProps>`
  &:not(thead > &) {
    cursor: ${p => (p.isClickable ? 'pointer' : 'default')};

    &:hover {
      background-color: ${p => p.theme.backgroundSecondary};
    }

    &:not(:last-child) {
      border-bottom: 0;
    }
  }
`;

export const LogAttributeTreeWrapper = styled('div')`
  padding: ${space(1)} ${space(1)};
  border-bottom: 1px solid ${p => p.theme.innerBorder};
`;

export const LogTableBodyCell = styled(TableBodyCell)`
  min-height: ${GRID_BODY_ROW_HEIGHT - 16}px;

  padding: 2px ${space(2)};

  font-size: ${p => p.theme.fontSizeMedium};

  /* Need to select the 2nd child to select the first cell
     as the first child is the interaction state layer */
  &:nth-child(2) {
    padding: 2px 0 2px ${space(3)};
  }

  &:last-child {
    padding: 2px ${space(2)};
  }
`;

export const LogTableBody = styled(TableBody)<{showHeader?: boolean}>`
  ${p =>
    p.showHeader
      ? ''
      : `
    padding-top: ${space(1)};
    padding-bottom: ${space(1)};
    `}
`;

export const LogDetailTableBodyCell = styled(TableBodyCell)`
  padding: 0;
  ${LogTableRow} & {
    padding: 0;
  }
  &:last-child {
    padding: 0;
  }
`;

export const DetailsWrapper = styled('div')`
  align-items: center;
  background-color: ${p => p.theme.gray100};
  padding: ${space(1)} ${space(1)};
  flex-direction: column;
  white-space: nowrap;
  grid-column: 1 / -1;
  border-top: 1px solid ${p => p.theme.border};
  border-bottom: 1px solid ${p => p.theme.border};
  z-index: ${2 /* place above the grid resizing lines */};
`;

export const DetailsContent = styled(StyledPanel)`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: ${space(1)} ${space(2)};
`;

export const LogFirstCellContent = styled('div')`
  display: flex;
  align-items: center;
`;

export const DetailsBody = styled('div')`
  display: flex;
  border-bottom: 1px solid ${p => p.theme.innerBorder};

  &:last-child {
    border-bottom: 0;
  }

  padding: ${space(1)} 0;
  font-family: ${p => p.theme.text.familyMono};
`;

export const StyledChevronButton = styled(Button)`
  margin-right: ${space(0.5)};
`;

const DEFAULT_SIZE = '8px';

export const ColoredLogCircle = styled('span')<{
  logColors: ReturnType<typeof getLogColors>;
  size?: string;
}>`
  padding: 0;
  position: relative;
  width: ${p => p.size || DEFAULT_SIZE};
  height: ${p => p.size || DEFAULT_SIZE};
  margin-right: ${space(0.5)};
  text-indent: -9999em;
  display: inline-block;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: ${p => p.logColors.background};
`;

export const ColoredLogText = styled('span')<{
  logColors: ReturnType<typeof getLogColors>;
}>`
  color: ${p => p.logColors.color};
  font-weight: ${p => p.theme.fontWeightBold};
  font-family: ${p => p.theme.text.familyMono};
`;

export const LogDate = styled('span')<{align?: 'left' | 'center' | 'right'}>`
  color: ${p => p.theme.subText};
  text-align: ${p => p.align || 'left'};
`;

export const LogsHighlight = styled(HighlightComponent)`
  font-weight: ${p => p.theme.fontWeightBold};
  background-color: ${p => p.theme.gray200};
  margin-right: 2px;
  margin-left: 2px;
`;

export const WrappingText = styled('div')<{wrap?: boolean}>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  ${p => (p.wrap ? 'text-wrap: auto;' : '')}
`;

export const AlignedCellContent = styled('div')<{
  align?: 'left' | 'center' | 'right';
}>`
  display: flex;
  align-items: center;
  flex-direction: row;
  justify-content: ${p => p.align || 'left'};
  font-family: ${p => p.theme.text.familyMono};
`;

export const FirstTableHeadCell = styled(TableHeadCell)`
  padding-right: ${space(1)};
  padding-left: ${space(2)};
`;

export const LogsTableBodyFirstCell = styled(LogTableBodyCell)`
  padding-right: 0;
  padding-left: ${space(1)};
`;

export function getLogColors(level: SeverityLevel, theme: Theme) {
  switch (level) {
    case SeverityLevel.DEFAULT:
      return {
        background: theme.gray200,
        backgroundLight: theme.backgroundSecondary,
        border: theme.border,
        borderHover: theme.border,
        color: theme.gray200,
      };
    case SeverityLevel.TRACE:
      return {
        background: theme.blue300,
        backgroundLight: theme.blue100,
        border: theme.blue200,
        borderHover: theme.blue300,
        color: theme.blue400,
      };
    case SeverityLevel.WARN:
      return {
        background: theme.yellow300,
        backgroundLight: theme.yellow100,
        border: theme.yellow200,
        borderHover: theme.yellow300,
        color: theme.yellow400,
      };
    case SeverityLevel.ERROR:
      // All these colours are likely changing, so we'll hold off moving them into theme for now.
      return {
        background: '#FF7738', // Matches the legacy error level color
        backgroundLight: 'rgba(245, 113, 54, 0.11)',
        border: 'rgba(245, 113, 54, 0.55)',
        borderHover: '#FF7738',
        color: '#b34814',
      };
    case SeverityLevel.FATAL:
      return {
        background: theme.red300,
        backgroundLight: theme.red100,
        border: theme.red200,
        borderHover: theme.red300,
        color: theme.red400,
      };
    case SeverityLevel.DEBUG:
      return {
        background: theme.gray300,
        backgroundLight: theme.gray100,
        border: theme.gray200,
        borderHover: theme.gray300,
        color: theme.gray300,
      };
    case SeverityLevel.INFO:
      return {
        background: theme.blue300,
        backgroundLight: theme.blue100,
        border: theme.blue200,
        borderHover: theme.blue300,
        color: theme.blue400,
      };
    case SeverityLevel.UNKNOWN:
      return {
        background: theme.gray300,
        backgroundLight: theme.gray100,
        border: theme.gray200,
        borderHover: theme.gray300,
        color: theme.gray200,
      };
    default:
      unreachable(level);
      throw new Error(`Invalid log type, got ${level}`);
  }
}

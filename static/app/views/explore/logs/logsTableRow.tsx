import type {ComponentProps, SyntheticEvent} from 'react';
import {Fragment, useCallback, useState} from 'react';
import {useTheme} from '@emotion/react';

import {EmptyStreamWrapper} from 'sentry/components/emptyStateWarning';
import LoadingIndicator from 'sentry/components/loadingIndicator';
import {IconWarning} from 'sentry/icons';
import {IconChevron} from 'sentry/icons/iconChevron';
import {t} from 'sentry/locale';
import {defined} from 'sentry/utils';
import {trackAnalytics} from 'sentry/utils/analytics';
import type {TableDataRow} from 'sentry/utils/discover/discoverQuery';
import type {EventsMetaType} from 'sentry/utils/discover/eventView';
import {FieldValueType} from 'sentry/utils/fields';
import {useLocation} from 'sentry/utils/useLocation';
import useOrganization from 'sentry/utils/useOrganization';
import useProjectFromId from 'sentry/utils/useProjectFromId';
import CellAction, {Actions} from 'sentry/views/discover/table/cellAction';
import type {TableColumn} from 'sentry/views/discover/table/types';
import {AttributesTree} from 'sentry/views/explore/components/traceItemAttributes/attributesTree';
import {
  useLogsAnalyticsPageSource,
  useLogsBlockRowExpanding,
  useLogsFields,
  useLogsIsTableFrozen,
  useLogsSearch,
  useSetLogsSearch,
} from 'sentry/views/explore/contexts/logs/logsPageParams';
import {HiddenLogDetailFields} from 'sentry/views/explore/logs/constants';
import type {RendererExtra} from 'sentry/views/explore/logs/fieldRenderers';
import {
  LogAttributesRendererMap,
  LogBodyRenderer,
  LogFieldRenderer,
  SeverityCircleRenderer,
} from 'sentry/views/explore/logs/fieldRenderers';
import {
  OurLogKnownFieldKey,
  type OurLogsResponseItem,
} from 'sentry/views/explore/logs/types';
import {useLogAttributesTreeActions} from 'sentry/views/explore/logs/useLogAttributesTreeActions';
import {
  useExploreLogsTableRow,
  usePrefetchLogTableRowOnHover,
} from 'sentry/views/explore/logs/useLogsQuery';

import {
  DetailsBody,
  DetailsContent,
  DetailsWrapper,
  getLogColors,
  LogAttributeTreeWrapper,
  LogDetailTableBodyCell,
  LogFirstCellContent,
  LogsTableBodyFirstCell,
  LogTableBodyCell,
  LogTableRow,
  StyledChevronButton,
} from './styles';
import {adjustAliases, getLogRowItem, getLogSeverityLevel} from './utils';

type LogsRowProps = {
  dataRow: OurLogsResponseItem;
  highlightTerms: string[];
  meta: EventsMetaType | undefined;
  sharedHoverTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
};

const ALLOWED_CELL_ACTIONS: Actions[] = [Actions.ADD, Actions.EXCLUDE];

function isInsideButton(element: Element | null): boolean {
  let i = 10;
  while (element && i > 0) {
    i -= 1;
    if (
      element instanceof HTMLButtonElement ||
      element.getAttribute('role') === 'button'
    ) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

export function LogRowContent({
  dataRow,
  highlightTerms,
  meta,
  sharedHoverTimeoutRef,
}: LogsRowProps) {
  const location = useLocation();
  const organization = useOrganization();
  const fields = useLogsFields();
  const search = useLogsSearch();
  const setLogsSearch = useSetLogsSearch();
  const isTableFrozen = useLogsIsTableFrozen();
  const blockRowExpanding = useLogsBlockRowExpanding();

  function toggleExpanded() {
    setExpanded(e => !e);
    trackAnalytics('logs.table.row_expanded', {
      log_id: String(dataRow[OurLogKnownFieldKey.ID]),
      page_source: analyticsPageSource,
      organization,
    });
  }

  function onPointerUp(event: SyntheticEvent) {
    if (event.target instanceof Element && isInsideButton(event.target)) {
      // do not expand the context menu if you clicked a button
      return;
    }
    if (window.getSelection()?.toString() === '') {
      toggleExpanded();
    }
  }

  const analyticsPageSource = useLogsAnalyticsPageSource();
  const [expanded, setExpanded] = useState<boolean>(false);
  const addSearchFilter = useCallback(
    ({
      key,
      value,
      negated,
    }: {
      key: string;
      value: string | number | boolean;
      negated?: boolean;
    }) => {
      const newSearch = search.copy();
      newSearch.addFilterValue(`${negated ? '!' : ''}${key}`, String(value));
      setLogsSearch(newSearch);
    },
    [setLogsSearch, search]
  );
  const theme = useTheme();

  const severityNumber = dataRow[OurLogKnownFieldKey.SEVERITY_NUMBER];
  const severityText = dataRow[OurLogKnownFieldKey.SEVERITY];
  const project = useProjectFromId({
    project_id: '' + dataRow[OurLogKnownFieldKey.PROJECT_ID],
  });
  const projectSlug = project?.slug ?? '';

  const level = getLogSeverityLevel(
    typeof severityNumber === 'number' ? severityNumber : null,
    typeof severityText === 'string' ? severityText : null
  );
  const logColors = getLogColors(level, theme);
  const hoverProps = usePrefetchLogTableRowOnHover({
    logId: String(dataRow[OurLogKnownFieldKey.ID]),
    projectId: String(dataRow[OurLogKnownFieldKey.PROJECT_ID]),
    traceId: String(dataRow[OurLogKnownFieldKey.TRACE_ID]),
    sharedHoverTimeoutRef,
  });

  const rendererExtra = {
    highlightTerms,
    logColors,
    useFullSeverityText: false,
    renderSeverityCircle: true,
    location,
    organization,
    attributes: dataRow,
    theme,
    projectSlug,
  };

  const rowInteractProps: ComponentProps<typeof LogTableRow> = blockRowExpanding
    ? {}
    : {
        ...hoverProps,
        onPointerUp,
        onTouchEnd: onPointerUp,
        isClickable: true,
      };

  return (
    <Fragment>
      <LogTableRow data-test-id="log-table-row" {...rowInteractProps}>
        <LogsTableBodyFirstCell key={'first'}>
          <LogFirstCellContent>
            {blockRowExpanding ? null : (
              <StyledChevronButton
                icon={<IconChevron size="xs" direction={expanded ? 'down' : 'right'} />}
                aria-label={t('Toggle trace details')}
                aria-expanded={expanded}
                size="zero"
                borderless
                onClick={() => toggleExpanded()}
              />
            )}
            <SeverityCircleRenderer extra={rendererExtra} meta={meta} />
          </LogFirstCellContent>
        </LogsTableBodyFirstCell>
        {fields?.map(field => {
          const value = dataRow[field];

          if (!defined(value)) {
            return <LogTableBodyCell key={field} />;
          }

          const discoverColumn: TableColumn<keyof TableDataRow> = {
            column: {
              field,
              kind: 'field',
            },
            name: field,
            key: field,
            isSortable: true,
            type: FieldValueType.STRING,
          };

          return (
            <LogTableBodyCell key={field} data-test-id={'log-table-cell-' + field}>
              <CellAction
                column={discoverColumn}
                dataRow={dataRow as unknown as TableDataRow}
                handleCellAction={(actions, cellValue) => {
                  switch (actions) {
                    case Actions.ADD:
                      addSearchFilter({
                        key: field,
                        value: cellValue,
                      });
                      break;
                    case Actions.EXCLUDE:
                      addSearchFilter({
                        key: field,
                        value: cellValue,
                        negated: true,
                      });
                      break;
                    default:
                      break;
                  }
                }}
                allowActions={
                  field === OurLogKnownFieldKey.TIMESTAMP || isTableFrozen
                    ? []
                    : ALLOWED_CELL_ACTIONS
                }
              >
                <LogFieldRenderer
                  item={getLogRowItem(field, dataRow, meta)}
                  meta={meta}
                  extra={rendererExtra}
                />
              </CellAction>
            </LogTableBodyCell>
          );
        })}
      </LogTableRow>
      {expanded && (
        <LogRowDetails dataRow={dataRow} highlightTerms={highlightTerms} meta={meta} />
      )}
    </Fragment>
  );
}

function LogRowDetails({
  dataRow,
  highlightTerms,
  meta,
}: {
  dataRow: OurLogsResponseItem;
  highlightTerms: string[];
  meta: EventsMetaType | undefined;
}) {
  const location = useLocation();
  const organization = useOrganization();
  const project = useProjectFromId({
    project_id: '' + dataRow[OurLogKnownFieldKey.PROJECT_ID],
  });
  const projectSlug = project?.slug ?? '';
  const fields = useLogsFields();
  const getActions = useLogAttributesTreeActions();
  const severityNumber = dataRow[OurLogKnownFieldKey.SEVERITY_NUMBER];
  const severityText = dataRow[OurLogKnownFieldKey.SEVERITY];

  const level = getLogSeverityLevel(
    typeof severityNumber === 'number' ? severityNumber : null,
    typeof severityText === 'string' ? severityText : null
  );
  const missingLogId = !dataRow[OurLogKnownFieldKey.ID];
  const {data, isPending} = useExploreLogsTableRow({
    logId: String(dataRow[OurLogKnownFieldKey.ID] ?? ''),
    projectId: String(dataRow[OurLogKnownFieldKey.PROJECT_ID] ?? ''),
    traceId: String(dataRow[OurLogKnownFieldKey.TRACE_ID] ?? ''),
    enabled: !missingLogId,
  });

  const theme = useTheme();
  const logColors = getLogColors(level, theme);
  const attributes =
    data?.attributes?.reduce((it, {name, value}) => ({...it, [name]: value}), {
      [OurLogKnownFieldKey.TIMESTAMP]: dataRow[OurLogKnownFieldKey.TIMESTAMP],
    }) ?? {};

  if (missingLogId) {
    return (
      <DetailsWrapper>
        <EmptyStreamWrapper>
          <IconWarning color="gray300" size="lg" />
        </EmptyStreamWrapper>
      </DetailsWrapper>
    );
  }
  return (
    <DetailsWrapper>
      <LogDetailTableBodyCell colSpan={fields.length}>
        {isPending && <LoadingIndicator />}
        {!isPending && data && (
          <Fragment>
            <DetailsContent>
              <DetailsBody>
                {LogBodyRenderer({
                  item: getLogRowItem(OurLogKnownFieldKey.MESSAGE, dataRow, meta),
                  extra: {
                    highlightTerms,
                    logColors,
                    wrapBody: true,
                    location,
                    organization,
                    projectSlug,
                    attributes,
                    theme,
                  },
                })}
              </DetailsBody>
              <LogAttributeTreeWrapper>
                <AttributesTree<RendererExtra>
                  attributes={data.attributes}
                  hiddenAttributes={HiddenLogDetailFields}
                  getCustomActions={getActions}
                  getAdjustedAttributeKey={adjustAliases}
                  renderers={LogAttributesRendererMap}
                  rendererExtra={{
                    highlightTerms,
                    logColors,
                    location,
                    organization,
                    projectSlug,
                    attributes,
                    theme,
                  }}
                />
              </LogAttributeTreeWrapper>
            </DetailsContent>
          </Fragment>
        )}
      </LogDetailTableBodyCell>
    </DetailsWrapper>
  );
}

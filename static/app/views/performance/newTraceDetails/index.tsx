import {useMemo} from 'react';
import styled from '@emotion/styled';
import * as Sentry from '@sentry/react';

import NoProjectMessage from 'sentry/components/noProjectMessage';
import SentryDocumentTitle from 'sentry/components/sentryDocumentTitle';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import useOrganization from 'sentry/utils/useOrganization';
import {useParams} from 'sentry/utils/useParams';
import {useLogsPageData} from 'sentry/views/explore/contexts/logs/logsPageData';
import {TraceContextPanel} from 'sentry/views/performance/newTraceDetails/traceContextPanel';
import {TraceViewLogsDataProvider} from 'sentry/views/performance/newTraceDetails/traceOurlogs';
import {TraceWaterfall} from 'sentry/views/performance/newTraceDetails/traceWaterfall';
import {useTraceWaterfallModels} from 'sentry/views/performance/newTraceDetails/useTraceWaterfallModels';
import {useTraceWaterfallScroll} from 'sentry/views/performance/newTraceDetails/useTraceWaterfallScroll';

import {useTrace} from './traceApi/useTrace';
import {useTraceMeta} from './traceApi/useTraceMeta';
import {useTraceRootEvent} from './traceApi/useTraceRootEvent';
import {useTraceTree} from './traceApi/useTraceTree';
import {
  DEFAULT_TRACE_VIEW_PREFERENCES,
  getInitialTracePreferences,
} from './traceState/tracePreferences';
import {TraceStateProvider} from './traceState/traceStateProvider';
import {TraceMetaDataHeader} from './traceHeader';
import {useTraceEventView} from './useTraceEventView';
import {useTraceQueryParams} from './useTraceQueryParams';

function decodeTraceSlug(maybeSlug: string | undefined): string {
  if (!maybeSlug || maybeSlug === 'null' || maybeSlug === 'undefined') {
    Sentry.withScope(scope => {
      scope.setFingerprint(['trace-null-slug']);
      Sentry.captureMessage(`Trace slug is empty`);
    });

    return '';
  }

  return maybeSlug.trim();
}

export const TRACE_VIEW_PREFERENCES_KEY = 'trace-waterfall-preferences';

export function TraceView() {
  const params = useParams<{traceSlug?: string}>();
  const traceSlug = useMemo(() => decodeTraceSlug(params.traceSlug), [params.traceSlug]);

  const preferences = useMemo(
    () =>
      getInitialTracePreferences(
        TRACE_VIEW_PREFERENCES_KEY,
        DEFAULT_TRACE_VIEW_PREFERENCES
      ),
    []
  );

  return (
    <TraceViewLogsDataProvider traceSlug={traceSlug}>
      <TraceStateProvider
        initialPreferences={preferences}
        preferencesStorageKey={TRACE_VIEW_PREFERENCES_KEY}
      >
        <TraceViewImpl traceSlug={traceSlug} />
      </TraceStateProvider>
    </TraceViewLogsDataProvider>
  );
}

function TraceViewImpl({traceSlug}: {traceSlug: string}) {
  const organization = useOrganization();
  const queryParams = useTraceQueryParams();
  const traceEventView = useTraceEventView(traceSlug, queryParams);
  const logsTableData = useLogsPageData();
  const hideTraceWaterfallIfEmpty = logsTableData?.logsData?.data?.length > 0;

  const meta = useTraceMeta([{traceSlug, timestamp: queryParams.timestamp}]);
  const trace = useTrace({traceSlug, timestamp: queryParams.timestamp});
  const tree = useTraceTree({traceSlug, trace, meta, replay: null});
  const rootEventResults = useTraceRootEvent({
    tree,
    logs: logsTableData?.logsData?.data,
    traceId: traceSlug,
  });

  const traceWaterfallModels = useTraceWaterfallModels();
  const traceWaterfallScroll = useTraceWaterfallScroll({
    organization,
    tree,
    viewManager: traceWaterfallModels.viewManager,
  });

  return (
    <SentryDocumentTitle
      title={`${t('Trace Details')} - ${traceSlug}`}
      orgSlug={organization.slug}
    >
      <TraceViewLogsDataProvider traceSlug={traceSlug}>
        <NoProjectMessage organization={organization}>
          <TraceExternalLayout>
            <TraceMetaDataHeader
              rootEventResults={rootEventResults}
              tree={tree}
              metaResults={meta}
              organization={organization}
              traceSlug={traceSlug}
              traceEventView={traceEventView}
              logs={logsTableData.logsData?.data}
            />
            <TraceInnerLayout>
              <TraceWaterfall
                tree={tree}
                trace={trace}
                meta={meta}
                replay={null}
                source="performance"
                rootEventResults={rootEventResults}
                traceSlug={traceSlug}
                traceEventView={traceEventView}
                organization={organization}
                hideIfNoData={hideTraceWaterfallIfEmpty}
                traceWaterfallScrollHandlers={traceWaterfallScroll}
                traceWaterfallModels={traceWaterfallModels}
              />
              <TraceContextPanel
                traceSlug={traceSlug}
                tree={tree}
                rootEventResults={rootEventResults}
                onScrollToNode={traceWaterfallScroll.onScrollToNode}
                logs={logsTableData.logsData?.data}
              />
            </TraceInnerLayout>
          </TraceExternalLayout>
        </NoProjectMessage>
      </TraceViewLogsDataProvider>
    </SentryDocumentTitle>
  );
}

const TraceExternalLayout = styled('div')`
  display: flex;
  flex-direction: column;
  flex: 1 1 100%;

  ~ footer {
    display: none;
  }
`;

const TraceInnerLayout = styled('div')`
  display: flex;
  flex-direction: column;
  flex: 1 1 100%;
  padding: ${space(2)} ${space(3)};
  overflow-y: scroll;
  margin-bottom: ${space(1)};
`;

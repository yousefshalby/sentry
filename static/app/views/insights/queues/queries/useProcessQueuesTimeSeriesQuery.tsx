import type {PageFilters} from 'sentry/types/core';
import {MutableSearch} from 'sentry/utils/tokenizeSearch';
import {useSpanMetricsSeries} from 'sentry/views/insights/common/queries/useDiscoverSeries';
import type {Referrer} from 'sentry/views/insights/queues/referrers';
import type {SpanMetricsProperty} from 'sentry/views/insights/types';

type Props = {
  referrer: Referrer;
  destination?: string;
  enabled?: boolean;
  pageFilters?: PageFilters;
};

const yAxis: SpanMetricsProperty[] = [
  'avg(span.duration)',
  'avg(messaging.message.receive.latency)',
  'epm()',
];

export function useProcessQueuesTimeSeriesQuery({
  enabled,
  destination,
  referrer,
  pageFilters,
}: Props) {
  const search = new MutableSearch('span.op:queue.process');
  if (destination) {
    search.addFilterValue('messaging.destination.name', destination, false);
  }

  return useSpanMetricsSeries(
    {
      yAxis,
      search,
      enabled,
      transformAliasToInputFormat: true,
    },
    referrer,
    pageFilters
  );
}

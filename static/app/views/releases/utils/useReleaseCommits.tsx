import type {Commit, Repository} from 'sentry/types/integrations';
import {useApiQuery, type UseApiQueryOptions} from 'sentry/utils/queryClient';
import useOrganization from 'sentry/utils/useOrganization';

// These are the URL params that our project/date/env picker generates (+ cursor for pagination)
type PageFilterUrlParams =
  | 'start'
  | 'end'
  | 'utc'
  | 'statsPeriod'
  | 'project'
  | 'environment';
type OtherUrlParams = 'cursor' | 'perPage';

interface UseReleaseCommitsParams
  extends Partial<
    Record<
      PageFilterUrlParams | OtherUrlParams,
      string | string[] | number | null | undefined
    >
  > {
  projectSlug: string;
  release: string;
  activeRepository?: Repository;
}

export function useReleaseCommits(
  {
    release,
    projectSlug,
    activeRepository,
    perPage = 40,
    ...query
  }: UseReleaseCommitsParams,
  queryOptions?: UseApiQueryOptions<Commit[]>
) {
  const organization = useOrganization();
  return useApiQuery<Commit[]>(
    [
      `/projects/${organization.slug}/${projectSlug}/releases/${encodeURIComponent(
        release
      )}/commits/`,
      {
        query: {
          ...query,
          per_page: perPage,
          ...(activeRepository
            ? {
                repo_id: activeRepository.externalId,
                repo_name: activeRepository.name,
              }
            : {}),
        },
      },
    ],
    {
      staleTime: Infinity,
      ...queryOptions,
    }
  );
}

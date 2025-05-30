import {useMemo} from 'react';
import orderBy from 'lodash/orderBy';

import {
  bulkUpdate,
  useFetchIssueTag,
  useFetchIssueTagValues,
} from 'sentry/actionCreators/group';
import type {Client} from 'sentry/api';
import {t} from 'sentry/locale';
import ConfigStore from 'sentry/stores/configStore';
import GroupStore from 'sentry/stores/groupStore';
import IssueListCacheStore from 'sentry/stores/IssueListCacheStore';
import {useLegacyStore} from 'sentry/stores/useLegacyStore';
import type {Event} from 'sentry/types/event';
import type {Group, GroupActivity, TagValue} from 'sentry/types/group';
import {defined} from 'sentry/utils';
import type {ApiQueryKey} from 'sentry/utils/queryClient';
import {useLocation} from 'sentry/utils/useLocation';
import useOrganization from 'sentry/utils/useOrganization';
import {useParams} from 'sentry/utils/useParams';
import {useUser} from 'sentry/utils/useUser';
import {useGroupTagsReadable} from 'sentry/views/issueDetails/groupTags/useGroupTags';

export function markEventSeen(
  api: Client,
  orgId: string,
  projectId: string,
  groupId: string
) {
  bulkUpdate(
    api,
    {
      orgId,
      projectId,
      itemIds: [groupId],
      failSilently: true,
      data: {hasSeen: true},
    },
    {}
  );

  IssueListCacheStore.markGroupAsSeen(groupId);
}

export function useDefaultIssueEvent() {
  const user = useLegacyStore(ConfigStore).user;
  const options = user ? user.options : null;
  return options?.defaultIssueEvent ?? 'recommended';
}
/**
 * Combines two TagValue arrays and combines TagValue.count upon conflict
 */
export function mergeAndSortTagValues(
  tagValues1: TagValue[],
  tagValues2: TagValue[],
  sort: 'count' | 'lastSeen' = 'lastSeen'
): TagValue[] {
  const tagValueCollection = tagValues1.reduce<Record<string, TagValue>>(
    (acc, tagValue) => {
      acc[tagValue.value] = tagValue;
      return acc;
    },
    {}
  );
  tagValues2.forEach(tagValue => {
    if (tagValueCollection[tagValue.value]) {
      tagValueCollection[tagValue.value]!.count += tagValue.count;
      if (tagValue.lastSeen > tagValueCollection[tagValue.value]!.lastSeen) {
        tagValueCollection[tagValue.value]!.lastSeen = tagValue.lastSeen;
      }
    } else {
      tagValueCollection[tagValue.value] = tagValue;
    }
  });
  const allTagValues: TagValue[] = Object.values(tagValueCollection);
  if (sort === 'count') {
    allTagValues.sort((a, b) => b.count - a.count);
  } else {
    allTagValues.sort((a, b) => (b.lastSeen < a.lastSeen ? -1 : 1));
  }
  return allTagValues;
}

/**
 * Returns the environment name for an event or null
 *
 * @param event
 */
export function getEventEnvironment(event: Event) {
  const tag = event.tags.find(({key}) => key === 'environment');

  return tag ? tag.value : null;
}

const SUBSCRIPTION_REASONS = {
  commented: t(
    "You're receiving workflow notifications because you have commented on this issue."
  ),
  assigned: t(
    "You're receiving workflow notifications because you were assigned to this issue."
  ),
  bookmarked: t(
    "You're receiving workflow notifications because you have bookmarked this issue."
  ),
  changed_status: t(
    "You're receiving workflow notifications because you have changed the status of this issue."
  ),
  mentioned: t(
    "You're receiving workflow notifications because you have been mentioned in this issue."
  ),
};

/**
 * @param group
 * @param removeLinks add/remove links to subscription reasons text (default: false)
 * @returns Reason for subscription
 */
export function getSubscriptionReason(group: Group) {
  if (group.subscriptionDetails?.disabled) {
    return t('You have disabled workflow notifications for this project.');
  }

  if (!group.isSubscribed) {
    return t('Subscribe to workflow notifications for this issue');
  }

  if (group.subscriptionDetails) {
    const {reason} = group.subscriptionDetails;
    if (reason === 'unknown') {
      return t(
        "You're receiving workflow notifications because you are subscribed to this issue."
      );
    }

    if (reason && SUBSCRIPTION_REASONS.hasOwnProperty(reason)) {
      return SUBSCRIPTION_REASONS[reason as keyof typeof SUBSCRIPTION_REASONS];
    }
  }

  return t(
    "You're receiving updates because you are subscribed to workflow notifications for this project."
  );
}

export function getGroupMostRecentActivity(
  activities: GroupActivity[] | undefined
): GroupActivity | undefined {
  // Most recent activity
  return activities
    ? orderBy([...activities], ({dateCreated}) => new Date(dateCreated), ['desc'])[0]
    : undefined;
}

export enum ReprocessingStatus {
  REPROCESSED_AND_HASNT_EVENT = 'reprocessed_and_hasnt_event',
  REPROCESSED_AND_HAS_EVENT = 'reprocessed_and_has_event',
  REPROCESSING = 'reprocessing',
  NO_STATUS = 'no_status',
}

// Reprocessing Checks
export function getGroupReprocessingStatus(
  group: Group,
  mostRecentActivity?: GroupActivity
) {
  const {status, count, activity: activities} = group;
  const groupCount = Number(count);

  switch (status) {
    case 'reprocessing':
      return ReprocessingStatus.REPROCESSING;
    case 'unresolved': {
      const groupMostRecentActivity =
        mostRecentActivity ?? getGroupMostRecentActivity(activities);
      if (groupMostRecentActivity?.type === 'reprocess') {
        if (groupCount === 0) {
          return ReprocessingStatus.REPROCESSED_AND_HASNT_EVENT;
        }
        return ReprocessingStatus.REPROCESSED_AND_HAS_EVENT;
      }
      return ReprocessingStatus.NO_STATUS;
    }
    default:
      return ReprocessingStatus.NO_STATUS;
  }
}

export function useEnvironmentsFromUrl(): string[] {
  const location = useLocation();
  const envs = location.query.environment;

  const envsArray = useMemo(() => {
    return typeof envs === 'string' ? [envs] : (envs ?? []);
  }, [envs]);

  return envsArray;
}

export function getGroupEventDetailsQueryData({
  environments,
  query,
  start,
  end,
  statsPeriod,
}: {
  query: string | undefined;
  end?: string;
  environments?: string[];
  start?: string;
  statsPeriod?: string;
}): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {
    collapse: ['fullRelease'],
  };

  if (query) {
    params.query = query;
  }

  if (environments && environments.length > 0) {
    params.environment = environments;
  }

  if (start) {
    params.start = start;
  }

  if (end) {
    params.end = end;
  }

  if (statsPeriod) {
    params.statsPeriod = statsPeriod;
  }

  return params;
}

export function getGroupEventQueryKey({
  orgSlug,
  groupId,
  eventId,
  environments,
  query,
  start,
  end,
  statsPeriod,
}: {
  environments: string[];
  eventId: string;
  groupId: string;
  orgSlug: string;
  end?: string;
  query?: string;
  start?: string;
  statsPeriod?: string;
}): ApiQueryKey {
  return [
    `/organizations/${orgSlug}/issues/${groupId}/events/${eventId}/`,
    {
      query: getGroupEventDetailsQueryData({
        environments,
        query,
        start,
        end,
        statsPeriod,
      }),
    },
  ];
}

export function useHasStreamlinedUI() {
  const user = useUser();
  const organization = useOrganization();
  const userStreamlinedUIOption = user?.options?.prefersIssueDetailsStreamlinedUI;

  // If the organzation option is set to true, the new UI is used.
  if (organization.streamlineOnly) {
    return true;
  }

  // If the enforce flag is set for the organization, ignore user preferences and enable the UI
  if (
    userStreamlinedUIOption !== false &&
    organization.features.includes('issue-details-streamline-enforce')
  ) {
    return true;
  }

  // Apply the UI based on user preferences
  return userStreamlinedUIOption ?? false;
}

export function useIsSampleEvent(): boolean {
  const params = useParams<{groupId: string}>();
  const environments = useEnvironmentsFromUrl();

  const groupId = params.groupId;

  const group = GroupStore.get(groupId);

  const {data} = useGroupTagsReadable(
    {
      groupId,
      environment: environments,
    },
    // Don't want this query to take precedence over the main requests
    {enabled: defined(group)}
  );
  return data?.some(tag => tag.key === 'sample_event') ?? false;
}

type TagSort = 'date' | 'count';
const DEFAULT_SORT: TagSort = 'count';

export function usePrefetchTagValues(tagKey: string, groupId: string, enabled: boolean) {
  const organization = useOrganization();
  const location = useLocation();
  const sort: TagSort =
    (location.query.tagDrawerSort as TagSort | undefined) ?? DEFAULT_SORT;
  useFetchIssueTagValues(
    {
      orgSlug: organization.slug,
      groupId,
      tagKey,
      sort,
      cursor: location.query.tagDrawerCursor as string | undefined,
    },
    {enabled}
  );
  useFetchIssueTag(
    {
      orgSlug: organization.slug,
      groupId,
      tagKey,
    },
    {enabled}
  );
}

export function getUserTagValue(tagValue: TagValue): {
  subtitle: string | null;
  subtitleType: string | null;
  title: string | null;
} {
  let title: string | null = null;
  let subtitle: string | null = null;
  let subtitleType: string | null = null;
  if (defined(tagValue?.name)) {
    title = tagValue?.name;
  } else if (defined(tagValue?.email)) {
    title = tagValue?.email;
  } else if (defined(tagValue?.username)) {
    title = title ? title : tagValue?.username;
  } else if (defined(tagValue?.ip_address) || (defined(tagValue?.ipAddress) && !title)) {
    title = tagValue?.ip_address ?? tagValue?.ipAddress;
  }

  if (defined(tagValue?.id)) {
    title = title ? title : tagValue?.id;
    if (tagValue?.id && tagValue?.id !== 'None') {
      subtitle = tagValue?.id;
      subtitleType = t('ID');
    }
  }

  if (title === subtitle) {
    subtitle = null;
  }

  return {title, subtitle, subtitleType};
}

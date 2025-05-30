import {Fragment} from 'react';
import styled from '@emotion/styled';

import {LinkButton} from 'sentry/components/core/button';
import {IconPlay} from 'sentry/icons';
import {t, tn} from 'sentry/locale';
import type {Group} from 'sentry/types/group';
import type {Project} from 'sentry/types/project';
import {getConfigForIssueType} from 'sentry/utils/issueTypeConfig';
import useReplayCountForIssues from 'sentry/utils/replayCount/useReplayCountForIssues';
import useRouteAnalyticsParams from 'sentry/utils/routeAnalytics/useRouteAnalyticsParams';
import {Divider} from 'sentry/views/issueDetails/divider';
import {Tab, TabPaths} from 'sentry/views/issueDetails/types';
import {useGroupDetailsRoute} from 'sentry/views/issueDetails/useGroupDetailsRoute';

export function ReplayBadge({group, project}: {group: Group; project: Project}) {
  const {baseUrl} = useGroupDetailsRoute();
  const issueTypeConfig = getConfigForIssueType(group, project);
  const {getReplayCountForIssue} = useReplayCountForIssues({
    statsPeriod: '90d',
  });
  const replaysCount = getReplayCountForIssue(group.id, group.issueCategory) ?? 0;

  useRouteAnalyticsParams({
    group_has_replay: replaysCount > 0,
  });

  if (!issueTypeConfig.pages.replays.enabled || replaysCount <= 0) {
    return null;
  }

  return (
    <Fragment>
      <Divider />
      <ReplayButton
        type="button"
        priority="link"
        icon={<IconPlay size="xs" />}
        to={{
          pathname: `${baseUrl}${TabPaths[Tab.REPLAYS]}`,
        }}
        replace
        aria-label={t("View this issue's replays")}
      >
        {replaysCount > 50
          ? t('50+ Replays')
          : tn('%s Replay', '%s Replays', replaysCount)}
      </ReplayButton>
    </Fragment>
  );
}

const ReplayButton = styled(LinkButton)`
  color: ${p => p.theme.subText};
  text-decoration: underline;
  text-decoration-style: dotted;
`;

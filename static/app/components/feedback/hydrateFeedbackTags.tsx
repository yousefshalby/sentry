import type {ReactNode} from 'react';

import Version from 'sentry/components/version';
import type {Event} from 'sentry/types/event';
import type {Organization} from 'sentry/types/organization';
import {VersionContainer} from 'sentry/utils/discover/styles';
import type {FeedbackIssue} from 'sentry/utils/feedback/types';
import {QuickContextHoverWrapper} from 'sentry/views/discover/table/quickContext/quickContextWrapper';
import {ContextType} from 'sentry/views/discover/table/quickContext/utils';

const getReleaseTagValue = (release: string, organization: Organization) => {
  return (
    <VersionContainer>
      <QuickContextHoverWrapper
        dataRow={{release}}
        contextType={ContextType.RELEASE}
        organization={organization}
      >
        <Version version={release} truncate />
      </QuickContextHoverWrapper>
    </VersionContainer>
  );
};

export default function hydrateFeedbackTags(
  eventData: Event | undefined,
  issueData: FeedbackIssue | undefined,
  organization: Organization
): Record<string, string | ReactNode> {
  if (!eventData?.contexts) {
    return {};
  }
  const context = eventData.contexts;
  const eventTags = eventData.tags;

  const unorderedTags = {
    ...eventTags.reduce(
      (combined, tag) => ({
        ...combined,
        [tag.key]:
          tag.key === 'release' ? getReleaseTagValue(tag.value, organization) : tag.value,
      }),
      {}
    ),
    ...(context.browser?.name ? {'browser.name': context.browser.name} : {}),
    ...(context.browser?.version ? {'browser.version': context.browser.version} : {}),
    ...(context.device?.brand ? {'device.brand': context.device?.brand} : {}),
    ...(context.device?.family ? {'device.family': context.device?.family} : {}),
    ...(context.device?.model ? {'device.model': context.device?.model} : {}),
    ...(context.device?.name ? {'device.name': context.device?.name} : {}),
    ...(context.os?.name ? {'os.name': context.os?.name} : {}),
    ...(context.os?.version ? {'os.version': context.os?.version} : {}),
    ...(eventTags.some(e => e.key === 'environment')
      ? {environment: eventTags.find(e => e.key === 'environment')?.value}
      : {}),
    ...(eventTags.some(e => e.key === 'transaction')
      ? {transaction: eventTags.find(e => e.key === 'transaction')?.value}
      : {}),
    ...(eventData.platform
      ? {platform: issueData?.project?.platform ?? eventData.platform}
      : {}),
    ...(eventData.sdk?.name ? {'sdk.name': eventData.sdk?.name} : {}),
    ...(eventData.sdk?.version ? {'sdk.version': eventData.sdk?.version} : {}),
    ...(eventData?.contexts?.feedback?.replay_id
      ? {replay_id: eventData?.contexts?.feedback?.replay_id}
      : {}),
  };

  // Sort the tags by key
  const tags: Record<string, string | ReactNode> = Object.keys(unorderedTags)
    .sort()
    .reduce((acc, key) => {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      acc[key] = unorderedTags[key];
      return acc;
    }, {});

  return tags;
}

import {Fragment, useRef, useState} from 'react';
import styled from '@emotion/styled';
import {AnimatePresence, type AnimationProps, motion} from 'framer-motion';

import {addErrorMessage, addSuccessMessage} from 'sentry/actionCreators/indicator';
import ClippedBox from 'sentry/components/clippedBox';
import {CopyToClipboardButton} from 'sentry/components/copyToClipboardButton';
import {Alert} from 'sentry/components/core/alert';
import {Button} from 'sentry/components/core/button';
import {ButtonBar} from 'sentry/components/core/button/buttonBar';
import {AutofixHighlightWrapper} from 'sentry/components/events/autofix/autofixHighlightWrapper';
import AutofixThumbsUpDownButtons from 'sentry/components/events/autofix/autofixThumbsUpDownButtons';
import {
  type AutofixFeedback,
  type AutofixRootCauseData,
  type AutofixRootCauseSelection,
  AutofixStatus,
  AutofixStepType,
  type CommentThread,
} from 'sentry/components/events/autofix/types';
import {
  type AutofixResponse,
  makeAutofixQueryKey,
} from 'sentry/components/events/autofix/useAutofix';
import {IconCheckmark, IconClose, IconFocus, IconInput} from 'sentry/icons';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import {singleLineRenderer} from 'sentry/utils/marked/marked';
import {setApiQueryData, useMutation, useQueryClient} from 'sentry/utils/queryClient';
import testableTransition from 'sentry/utils/testableTransition';
import useApi from 'sentry/utils/useApi';
import useOrganization from 'sentry/utils/useOrganization';
import {Divider} from 'sentry/views/issueDetails/divider';

import AutofixHighlightPopup from './autofixHighlightPopup';
import {AutofixTimeline} from './autofixTimeline';

type AutofixRootCauseProps = {
  causes: AutofixRootCauseData[];
  groupId: string;
  rootCauseSelection: AutofixRootCauseSelection;
  runId: string;
  agentCommentThread?: CommentThread;
  feedback?: AutofixFeedback;
  isRootCauseFirstAppearance?: boolean;
  previousDefaultStepIndex?: number;
  previousInsightCount?: number;
  terminationReason?: string;
};

const cardAnimationProps: AnimationProps = {
  exit: {opacity: 0, height: 0, scale: 0.8, y: -20},
  initial: {opacity: 0, height: 0, scale: 0.8},
  animate: {opacity: 1, height: 'auto', scale: 1},
  transition: testableTransition({
    duration: 1.0,
    height: {
      type: 'spring',
      bounce: 0.2,
    },
    scale: {
      type: 'spring',
      bounce: 0.2,
    },
    y: {
      type: 'tween',
      ease: 'easeOut',
    },
  }),
};

function useSelectCause({groupId, runId}: {groupId: string; runId: string}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const orgSlug = useOrganization().slug;

  return useMutation({
    mutationFn: (
      params:
        | {
            causeId: string;
            instruction?: string;
          }
        | {
            customRootCause: string;
          }
    ) => {
      return api.requestPromise(
        `/organizations/${orgSlug}/issues/${groupId}/autofix/update/`,
        {
          method: 'POST',
          data:
            'customRootCause' in params
              ? {
                  run_id: runId,
                  payload: {
                    type: 'select_root_cause',
                    custom_root_cause: params.customRootCause,
                  },
                }
              : {
                  run_id: runId,
                  payload: {
                    type: 'select_root_cause',
                    cause_id: params.causeId,
                    instruction: params.instruction,
                  },
                },
        }
      );
    },
    onSuccess: (_, params) => {
      setApiQueryData<AutofixResponse>(
        queryClient,
        makeAutofixQueryKey(orgSlug, groupId),
        data => {
          if (!data?.autofix) {
            return data;
          }

          return {
            ...data,
            autofix: {
              ...data.autofix,
              status: AutofixStatus.PROCESSING,
              steps: data.autofix.steps?.map(step => {
                if (step.type !== AutofixStepType.ROOT_CAUSE_ANALYSIS) {
                  return step;
                }

                return {
                  ...step,
                  selection:
                    'customRootCause' in params
                      ? {
                          custom_root_cause: params.customRootCause,
                        }
                      : {
                          cause_id: params.causeId,
                        },
                };
              }),
            },
          };
        }
      );
      addSuccessMessage('On it.');
    },
    onError: () => {
      addErrorMessage(t('Something went wrong when selecting the root cause.'));
    },
  });
}

export function replaceHeadersWithBold(markdown: string) {
  const headerRegex = /^(#{1,6})\s+(.*)$/gm;
  const boldMarkdown = markdown.replace(headerRegex, (_match, _hashes, content) => {
    return ` **${content}** `;
  });

  return boldMarkdown;
}

function RootCauseDescription({
  cause,
  groupId,
  runId,
  previousDefaultStepIndex,
  previousInsightCount,
}: {
  cause: AutofixRootCauseData;
  groupId: string;
  runId: string;
  previousDefaultStepIndex?: number;
  previousInsightCount?: number;
}) {
  return (
    <CauseDescription>
      {cause.description && (
        <AutofixHighlightWrapper
          groupId={groupId}
          runId={runId}
          stepIndex={previousDefaultStepIndex ?? 0}
          retainInsightCardIndex={
            previousInsightCount !== undefined && previousInsightCount >= 0
              ? previousInsightCount
              : null
          }
        >
          <Description
            dangerouslySetInnerHTML={{__html: singleLineRenderer(cause.description)}}
          />
        </AutofixHighlightWrapper>
      )}
      {cause.root_cause_reproduction && (
        <AutofixTimeline
          events={cause.root_cause_reproduction}
          groupId={groupId}
          runId={runId}
          stepIndex={previousDefaultStepIndex ?? 0}
          retainInsightCardIndex={
            previousInsightCount !== undefined && previousInsightCount >= 0
              ? previousInsightCount
              : null
          }
        />
      )}
    </CauseDescription>
  );
}

export function formatRootCauseText(
  cause: AutofixRootCauseData | undefined,
  customRootCause?: string
) {
  if (!cause && !customRootCause) {
    return '';
  }

  if (customRootCause) {
    return `# Root Cause of the Issue\n\n${customRootCause}`;
  }

  if (!cause) {
    return '';
  }

  const parts: string[] = ['# Root Cause of the Issue'];

  if (cause.description) {
    parts.push(cause.description);
  }

  if (cause.root_cause_reproduction) {
    parts.push(
      cause.root_cause_reproduction
        .map(event => {
          const eventParts = [`### ${event.title}`];

          if (event.code_snippet_and_analysis) {
            eventParts.push(event.code_snippet_and_analysis);
          }

          if (event.relevant_code_file) {
            eventParts.push(`(See ${event.relevant_code_file.file_path})`);
          }

          return eventParts.join('\n');
        })
        .join('\n\n')
    );
  }

  return parts.join('\n\n');
}

function CopyRootCauseButton({
  cause,
  customRootCause,
  isEditing,
}: {
  cause?: AutofixRootCauseData;
  customRootCause?: string;
  isEditing?: boolean;
}) {
  if (isEditing) {
    return null;
  }
  const text = formatRootCauseText(cause, customRootCause);
  return (
    <CopyToClipboardButton
      size="sm"
      text={text}
      borderless
      title="Copy root cause as Markdown"
    />
  );
}

function AutofixRootCauseDisplay({
  causes,
  groupId,
  runId,
  rootCauseSelection,
  previousDefaultStepIndex,
  previousInsightCount,
  agentCommentThread,
  feedback,
}: AutofixRootCauseProps) {
  const {mutate: handleContinue, isPending} = useSelectCause({groupId, runId});
  const [isEditing, setIsEditing] = useState(false);
  const [customRootCause, setCustomRootCause] = useState('');
  const cause = causes[0];
  const iconFocusRef = useRef<HTMLDivElement>(null);

  if (!cause) {
    return (
      <Alert.Container>
        <Alert type="error">{t('No root cause available.')}</Alert>
      </Alert.Container>
    );
  }

  if (rootCauseSelection && 'custom_root_cause' in rootCauseSelection) {
    return (
      <CausesContainer>
        <CustomRootCausePadding>
          <HeaderWrapper>
            <HeaderText>
              <IconWrapper ref={iconFocusRef}>
                <IconFocus size="sm" color="pink400" />
              </IconWrapper>
              {t('Custom Root Cause')}
            </HeaderText>
            <CopyRootCauseButton
              customRootCause={rootCauseSelection.custom_root_cause}
              isEditing={isEditing}
            />
          </HeaderWrapper>
          <CauseDescription>{rootCauseSelection.custom_root_cause}</CauseDescription>
        </CustomRootCausePadding>
      </CausesContainer>
    );
  }

  return (
    <CausesContainer>
      <ClippedBox clipHeight={408}>
        <HeaderWrapper>
          <HeaderText>
            <IconWrapper ref={iconFocusRef}>
              <IconFocus size="sm" color="pink400" />
            </IconWrapper>
            {t('Root Cause')}
          </HeaderText>
          <ButtonBar>
            <AutofixThumbsUpDownButtons
              thumbsUpDownType="root_cause"
              feedback={feedback}
              groupId={groupId}
              runId={runId}
            />
            <DividerWrapper>
              <Divider />
            </DividerWrapper>
            <CopyRootCauseButton cause={cause} isEditing={isEditing} />
            <EditButton
              size="sm"
              borderless
              data-test-id="autofix-root-cause-edit-button"
              title={isEditing ? t('Cancel') : t('Propose your own root cause')}
              onClick={() => {
                if (isEditing) {
                  setIsEditing(false);
                  setCustomRootCause('');
                } else {
                  setIsEditing(true);
                }
              }}
            >
              {isEditing ? <IconClose size="sm" /> : <IconInput size="sm" />}
            </EditButton>
            {isEditing && (
              <Button
                size="sm"
                priority="primary"
                title={t('Rethink with your new root cause')}
                data-test-id="autofix-root-cause-save-edit-button"
                onClick={() => {
                  if (customRootCause.trim()) {
                    handleContinue({customRootCause: customRootCause.trim()});
                  }
                }}
                busy={isPending}
              >
                <IconCheckmark size="sm" />
              </Button>
            )}
          </ButtonBar>
        </HeaderWrapper>
        <AnimatePresence>
          {agentCommentThread && iconFocusRef.current && (
            <AutofixHighlightPopup
              selectedText=""
              referenceElement={iconFocusRef.current}
              groupId={groupId}
              runId={runId}
              stepIndex={previousDefaultStepIndex ?? 0}
              retainInsightCardIndex={
                previousInsightCount !== undefined && previousInsightCount >= 0
                  ? previousInsightCount
                  : null
              }
              isAgentComment
              blockName={t('Autofix is uncertain of the root cause...')}
            />
          )}
        </AnimatePresence>
        <Content>
          {isEditing ? (
            <TextArea
              value={customRootCause}
              onChange={e => {
                setCustomRootCause(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              rows={5}
              autoFocus
              placeholder={t('Propose your own root cause...')}
            />
          ) : (
            <Fragment>
              <RootCauseDescription
                cause={cause}
                groupId={groupId}
                runId={runId}
                previousDefaultStepIndex={previousDefaultStepIndex}
                previousInsightCount={previousInsightCount}
              />
            </Fragment>
          )}
        </Content>
      </ClippedBox>
    </CausesContainer>
  );
}

export function AutofixRootCause(props: AutofixRootCauseProps) {
  if (props.causes.length === 0) {
    return (
      <AnimatePresence initial={props.isRootCauseFirstAppearance}>
        <AnimationWrapper key="card" {...cardAnimationProps}>
          <NoCausesPadding>
            <Alert.Container>
              <Alert type="warning">
                {t('No root cause found.\n\n%s', props.terminationReason ?? '')}
              </Alert>
            </Alert.Container>
          </NoCausesPadding>
        </AnimationWrapper>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence initial={props.isRootCauseFirstAppearance}>
      <AnimationWrapper key="card" {...cardAnimationProps}>
        <AutofixRootCauseDisplay {...props} />
      </AnimationWrapper>
    </AnimatePresence>
  );
}

const Description = styled('div')`
  border-bottom: 1px solid ${p => p.theme.innerBorder};
  padding-bottom: ${space(2)};
  margin-bottom: ${space(2)};
`;

const NoCausesPadding = styled('div')`
  padding: 0 ${space(2)};
`;

const CausesContainer = styled('div')`
  border: 1px solid ${p => p.theme.border};
  border-radius: ${p => p.theme.borderRadius};
  overflow: hidden;
  box-shadow: ${p => p.theme.dropShadowMedium};
  padding-left: ${space(2)};
  padding-right: ${space(2)};
`;

const Content = styled('div')`
  padding: ${space(1)} 0;
`;

const HeaderWrapper = styled('div')`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-left: ${space(0.5)};
  padding-bottom: ${space(1)};
  border-bottom: 1px solid ${p => p.theme.border};
  gap: ${space(1)};
  flex-wrap: wrap;
`;

const IconWrapper = styled('div')`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const HeaderText = styled('div')`
  font-weight: bold;
  font-size: ${p => p.theme.fontSizeLarge};
  display: flex;
  align-items: center;
  gap: ${space(1)};
`;

const CustomRootCausePadding = styled('div')`
  padding: ${space(1)} ${space(0.25)} ${space(2)} ${space(0.25)};
`;

const CauseDescription = styled('div')`
  font-size: ${p => p.theme.fontSizeMedium};
  margin-top: ${space(1)};
`;

const AnimationWrapper = styled(motion.div)`
  transform-origin: top center;
`;

const TextArea = styled('textarea')`
  width: 100%;
  min-height: 150px;
  border: none;
  border-radius: ${p => p.theme.borderRadius};
  font-size: ${p => p.theme.fontSizeMedium};
  line-height: 1.4;
  resize: none;
  overflow: hidden;
  &:focus {
    outline: none;
  }
`;

const EditButton = styled(Button)`
  color: ${p => p.theme.subText};
`;

const DividerWrapper = styled('div')`
  margin: 0 ${space(1)};
`;

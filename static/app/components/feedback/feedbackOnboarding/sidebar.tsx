import type {ReactNode} from 'react';
import {Fragment, useMemo, useState} from 'react';
import styled from '@emotion/styled';
import {PlatformIcon} from 'platformicons';

import HighlightTopRightPattern from 'sentry-images/pattern/highlight-top-right.svg';

import {Button} from 'sentry/components/button';
import {CompactSelect} from 'sentry/components/compactSelect';
import {FeedbackOnboardingLayout} from 'sentry/components/feedback/feedbackOnboarding/feedbackOnboardingLayout';
import RadioGroup from 'sentry/components/forms/controls/radioGroup';
import IdBadge from 'sentry/components/idBadge';
import LoadingIndicator from 'sentry/components/loadingIndicator';
import {PlatformOptionDropdown} from 'sentry/components/replaysOnboarding/platformOptionDropdown';
import useCurrentProjectState from 'sentry/components/replaysOnboarding/useCurrentProjectState';
import useLoadOnboardingDoc from 'sentry/components/replaysOnboarding/useLoadOnboardingDoc';
import {replayJsFrameworkOptions} from 'sentry/components/replaysOnboarding/utils';
import SidebarPanel from 'sentry/components/sidebar/sidebarPanel';
import type {CommonSidebarProps} from 'sentry/components/sidebar/types';
import {SidebarPanelKey} from 'sentry/components/sidebar/types';
import TextOverflow from 'sentry/components/textOverflow';
import {
  replayBackendPlatforms,
  replayFrontendPlatforms,
  replayJsLoaderInstructionsPlatformList,
} from 'sentry/data/platformCategories';
import platforms, {otherPlatform} from 'sentry/data/platforms';
import {t, tct} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {PlatformKey, Project, SelectValue} from 'sentry/types';
import useOrganization from 'sentry/utils/useOrganization';
import useUrlParams from 'sentry/utils/useUrlParams';

function FeedbackOnboardingSidebar(props: CommonSidebarProps) {
  const {currentPanel, collapsed, hidePanel, orientation} = props;
  const organization = useOrganization();

  const isActive = currentPanel === SidebarPanelKey.FEEDBACK_ONBOARDING;
  const hasProjectAccess = organization.access.includes('project:read');

  const {projects, allProjects, currentProject, setCurrentProject} =
    useCurrentProjectState({
      currentPanel,
    });

  const projectSelectOptions = useMemo(() => {
    const supportedProjectItems: SelectValue<string>[] = allProjects
      .sort((aProject, bProject) => {
        // if we're comparing two projects w/ or w/o feedback alphabetical sort
        if (aProject.hasNewFeedbacks === bProject.hasNewFeedbacks) {
          return aProject.slug.localeCompare(bProject.slug);
        }
        // otherwise sort by whether or not they have feedback
        return aProject.hasNewFeedbacks ? 1 : -1;
      })
      .map(project => {
        return {
          value: project.id,
          textValue: project.id,
          label: (
            <StyledIdBadge project={project} avatarSize={16} hideOverflow disableLink />
          ),
        };
      });

    return [
      {
        label: t('Supported'),
        options: supportedProjectItems,
      },
    ];
  }, [allProjects]);

  const selectedProject = currentProject ?? projects[0] ?? allProjects[0];
  if (!isActive || !hasProjectAccess || !selectedProject) {
    return null;
  }

  return (
    <TaskSidebarPanel
      orientation={orientation}
      collapsed={collapsed}
      hidePanel={hidePanel}
    >
      <TopRightBackgroundImage src={HighlightTopRightPattern} />
      <TaskList>
        <Heading>{t('Getting Started with User Feedback')}</Heading>
        <HeaderActions>
          <div
            onClick={e => {
              // we need to stop bubbling the CompactSelect click event
              // failing to do so will cause the sidebar panel to close
              // the event.target will be unmounted by the time the panel listener
              // receives the event and assume the click was outside the panel
              e.stopPropagation();
            }}
          >
            <CompactSelect
              triggerLabel={
                currentProject ? (
                  <StyledIdBadge
                    project={currentProject}
                    avatarSize={16}
                    hideOverflow
                    disableLink
                  />
                ) : (
                  t('Select a project')
                )
              }
              value={currentProject?.id}
              onChange={opt =>
                setCurrentProject(allProjects.find(p => p.id === opt.value))
              }
              triggerProps={{'aria-label': currentProject?.slug}}
              options={projectSelectOptions}
              position="bottom-end"
            />
          </div>
        </HeaderActions>
        <OnboardingContent currentProject={selectedProject} />
      </TaskList>
    </TaskSidebarPanel>
  );
}

function OnboardingContent({currentProject}: {currentProject: Project}) {
  const jsFrameworkSelectOptions = replayJsFrameworkOptions.map(platform => {
    return {
      value: platform.id,
      textValue: platform.name,
      label: (
        <PlatformLabel>
          <PlatformIcon platform={platform.id} size={16} />
          <TextOverflow>{platform.name}</TextOverflow>
        </PlatformLabel>
      ),
    };
  });

  const organization = useOrganization();
  const [jsFramework, setJsFramework] = useState<{
    value: PlatformKey;
    label?: ReactNode;
    textValue?: string;
  }>(jsFrameworkSelectOptions[0]);

  const defaultTab = 'npm';

  const {getParamValue: setupMode, setParamValue: setSetupMode} = useUrlParams(
    'mode',
    defaultTab
  );

  const showJsFrameworkInstructions =
    currentProject.platform &&
    replayBackendPlatforms.includes(currentProject.platform) &&
    setupMode() === 'npm';

  const npmOnlyFramework =
    currentProject.platform &&
    replayFrontendPlatforms
      .filter(p => p !== 'javascript')
      .includes(currentProject.platform);

  const showRadioButtons =
    currentProject.platform &&
    replayJsLoaderInstructionsPlatformList.includes(currentProject.platform);

  const backendPlatforms =
    currentProject.platform && replayBackendPlatforms.includes(currentProject.platform);

  const currentPlatform = currentProject.platform
    ? platforms.find(p => p.id === currentProject.platform) ?? otherPlatform
    : otherPlatform;

  const {
    docs: newDocs,
    dsn,
    cdn,
    isProjKeysLoading,
  } = useLoadOnboardingDoc({
    platform:
      showJsFrameworkInstructions && setupMode() === 'npm'
        ? replayJsFrameworkOptions.find(p => p.id === jsFramework.value) ??
          replayJsFrameworkOptions[0]
        : currentPlatform,
    organization,
    projectSlug: currentProject.slug,
  });

  // New onboarding docs for initial loading of JS Framework options
  const {docs: jsFrameworkDocs} = useLoadOnboardingDoc({
    platform:
      replayJsFrameworkOptions.find(p => p.id === jsFramework.value) ??
      replayJsFrameworkOptions[0],
    organization,
    projectSlug: currentProject.slug,
  });

  const radioButtons = (
    <Header>
      {showRadioButtons ? (
        <StyledRadioGroup
          label="mode"
          choices={[
            [
              'npm',
              backendPlatforms ? (
                <PlatformSelect key="platform-select">
                  {tct('I use [platformSelect]', {
                    platformSelect: (
                      <CompactSelect
                        triggerLabel={jsFramework.label}
                        value={jsFramework.value}
                        onChange={setJsFramework}
                        options={jsFrameworkSelectOptions}
                        position="bottom-end"
                        key={jsFramework.textValue}
                        disabled={setupMode() === 'jsLoader'}
                      />
                    ),
                  })}
                  {jsFrameworkDocs?.platformOptions &&
                    tct('with [optionSelect]', {
                      optionSelect: (
                        <PlatformOptionDropdown
                          platformOptions={jsFrameworkDocs?.platformOptions}
                          disabled={setupMode() === 'jsLoader'}
                        />
                      ),
                    })}
                </PlatformSelect>
              ) : (
                t('I use NPM or Yarn')
              ),
            ],
            ['jsLoader', t('I use HTML templates')],
          ]}
          value={setupMode()}
          onChange={setSetupMode}
        />
      ) : (
        newDocs?.platformOptions && (
          <PlatformSelect>
            {tct("I'm using [platformSelect]", {
              platformSelect: (
                <PlatformOptionDropdown platformOptions={newDocs?.platformOptions} />
              ),
            })}
          </PlatformSelect>
        )
      )}
    </Header>
  );

  if (isProjKeysLoading) {
    return (
      <Fragment>
        {radioButtons}
        <LoadingIndicator />
      </Fragment>
    );
  }

  // No platform or no docs
  if (!currentPlatform || !newDocs) {
    return (
      <Fragment>
        <div>
          {tct(
            'Fiddlesticks. This checklist isn’t available for your [project] project yet, but for now, go to Sentry docs for installation details.',
            {project: currentProject.slug}
          )}
        </div>
        <div>
          <Button
            size="sm"
            href="https://docs.sentry.io/platforms/javascript/user-feedback/"
            external
          >
            {t('Read Docs')}
          </Button>
        </div>
      </Fragment>
    );
  }

  return (
    <Fragment>
      {radioButtons}
      {newDocs && (
        <FeedbackOnboardingLayout
          docsConfig={newDocs}
          dsn={dsn}
          cdn={cdn}
          activeProductSelection={[]}
          platformKey={currentPlatform.id}
          projectId={currentProject.id}
          projectSlug={currentProject.slug}
          configType={
            setupMode() === 'npm' || // switched to NPM option
            (!setupMode() && defaultTab === 'npm') || // default value for FE frameworks when ?mode={...} in URL is not set yet
            npmOnlyFramework // even if '?mode=jsLoader', only show npm instructions for FE frameworks
              ? 'feedbackOnboardingNpm'
              : 'replayOnboardingJsLoader'
          }
        />
      )}
    </Fragment>
  );
}

const Header = styled('div')`
  padding: ${space(1)} 0;
`;

const TaskSidebarPanel = styled(SidebarPanel)`
  width: 600px;
  max-width: 100%;
`;

const TopRightBackgroundImage = styled('img')`
  position: absolute;
  top: 0;
  right: 0;
  width: 60%;
  user-select: none;
`;

const TaskList = styled('div')`
  display: grid;
  grid-auto-flow: row;
  grid-template-columns: 100%;
  gap: ${space(1)};
  margin: 50px ${space(4)} ${space(4)} ${space(4)};
`;

const Heading = styled('div')`
  display: flex;
  color: ${p => p.theme.activeText};
  font-size: ${p => p.theme.fontSizeExtraSmall};
  text-transform: uppercase;
  font-weight: 600;
  line-height: 1;
  margin-top: ${space(3)};
`;

const StyledIdBadge = styled(IdBadge)`
  overflow: hidden;
  white-space: nowrap;
  flex-shrink: 1;
`;

const HeaderActions = styled('div')`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  gap: ${space(3)};
`;

const PlatformLabel = styled('div')`
  display: flex;
  gap: ${space(1)};
  align-items: center;
`;

const PlatformSelect = styled('div')`
  display: flex;
  gap: ${space(1)};
  align-items: center;
  flex-wrap: wrap;
`;

const StyledRadioGroup = styled(RadioGroup)`
  padding: ${space(1)} 0;
`;

export default FeedbackOnboardingSidebar;
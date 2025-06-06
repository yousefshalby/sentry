import {useContext, useEffect, useMemo, useState} from 'react';
import styled from '@emotion/styled';
import type {Node} from '@react-types/shared';
import isEqual from 'lodash/isEqual';

import {addSuccessMessage} from 'sentry/actionCreators/indicator';
import DisableInDemoMode from 'sentry/components/acl/demoModeDisabled';
import {Button} from 'sentry/components/core/button';
import {DraggableTabList} from 'sentry/components/draggableTabs/draggableTabList';
import type {DraggableTabListItemProps} from 'sentry/components/draggableTabs/item';
import GlobalEventProcessingAlert from 'sentry/components/globalEventProcessingAlert';
import * as Layout from 'sentry/components/layouts/thirds';
import {normalizeDateTimeParams} from 'sentry/components/organizations/pageFilters/parse';
import {PageHeadingQuestionTooltip} from 'sentry/components/pageHeadingQuestionTooltip';
import {IconPause, IconPlay} from 'sentry/icons';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {InjectedRouter} from 'sentry/types/legacyReactRouter';
import {trackAnalytics} from 'sentry/utils/analytics';
import normalizeUrl from 'sentry/utils/url/normalizeUrl';
import {useHotkeys} from 'sentry/utils/useHotkeys';
import {useLocation} from 'sentry/utils/useLocation';
import {useNavigate} from 'sentry/utils/useNavigate';
import useOrganization from 'sentry/utils/useOrganization';
import useProjects from 'sentry/utils/useProjects';
import {
  DEFAULT_ENVIRONMENTS,
  DEFAULT_TIME_FILTERS,
  generateTempViewId,
  type IssueView,
  type IssueViewParams,
  IssueViews,
  IssueViewsContext,
  TEMPORARY_TAB_KEY,
} from 'sentry/views/issueList/issueViews/issueViews';
import {IssueViewTab} from 'sentry/views/issueList/issueViews/issueViewTab';
import {useFetchStarredGroupSearchViews} from 'sentry/views/issueList/queries/useFetchStarredGroupSearchViews';
import {NewTabContext} from 'sentry/views/issueList/utils/newTabContext';

import {IssueSortOptions} from './utils';

type IssueViewsIssueListHeaderProps = {
  onRealtimeChange: (realtime: boolean) => void;
  realtimeActive: boolean;
  router: InjectedRouter;
  selectedProjectIds: number[];
};

type IssueViewsIssueListHeaderTabsContentProps = {
  router: InjectedRouter;
};

function IssueViewsIssueListHeader({
  selectedProjectIds,
  realtimeActive,
  onRealtimeChange,
  router,
}: IssueViewsIssueListHeaderProps) {
  const organization = useOrganization();
  const {projects} = useProjects();
  const selectedProjects = projects.filter(({id}) =>
    selectedProjectIds.includes(Number(id))
  );

  const {newViewActive} = useContext(NewTabContext);

  const {data: starredGroupSearchViews} = useFetchStarredGroupSearchViews({
    orgSlug: organization.slug,
  });

  const realtimeTitle = realtimeActive
    ? t('Pause real-time updates')
    : t('Enable real-time updates');

  return (
    <Layout.Header
      noActionWrap
      // No viewId in the URL query means that a temp view is selected, which has a dashed border
      borderStyle={
        starredGroupSearchViews && !router?.location.query.viewId ? 'dashed' : 'solid'
      }
    >
      <Layout.HeaderContent>
        <Layout.Title>
          {t('Issues')}
          <PageHeadingQuestionTooltip
            docsUrl="https://docs.sentry.io/product/issues/"
            title={t(
              'Detailed views of errors and performance problems in your application grouped by events with a similar set of characteristics.'
            )}
          />
        </Layout.Title>
      </Layout.HeaderContent>
      <Layout.HeaderActions>
        {!newViewActive && (
          <DisableInDemoMode>
            <Button
              size="sm"
              data-test-id="real-time"
              title={realtimeTitle}
              aria-label={realtimeTitle}
              icon={realtimeActive ? <IconPause /> : <IconPlay />}
              onClick={() => onRealtimeChange(!realtimeActive)}
            />
          </DisableInDemoMode>
        )}
      </Layout.HeaderActions>
      <StyledGlobalEventProcessingAlert projects={selectedProjects} />
      {starredGroupSearchViews ? (
        <StyledIssueViews
          router={router}
          initialViews={starredGroupSearchViews.map(
            (
              {
                id,
                name,
                query: viewQuery,
                querySort: viewQuerySort,
                environments: viewEnvironments,
                projects: viewProjects,
                timeFilters: viewTimeFilters,
              },
              index
            ): IssueView => {
              const tabId = id ?? `default${index.toString()}`;

              return {
                id: tabId,
                key: tabId,
                label: name,
                query: viewQuery,
                querySort: viewQuerySort,
                environments: viewEnvironments,
                projects: viewProjects,
                timeFilters: viewTimeFilters,
                isCommitted: true,
              };
            }
          )}
        >
          <IssueViewsIssueListHeaderTabsContent router={router} />
        </StyledIssueViews>
      ) : (
        <div style={{height: 33}} />
      )}
    </Layout.Header>
  );
}

function IssueViewsIssueListHeaderTabsContent({
  router,
}: IssueViewsIssueListHeaderTabsContentProps) {
  const organization = useOrganization();
  const navigate = useNavigate();
  const location = useLocation();

  const {newViewActive, setNewViewActive} = useContext(NewTabContext);
  const {tabListState, state, dispatch, defaultProject} = useContext(IssueViewsContext);
  const {views, tempView} = state;

  const [editingTabKey, setEditingTabKey] = useState<string | null>(null);

  // TODO(msun): Use the location from useLocation instead of props router in the future
  const {query, sort, viewId} = router.location.query;

  // This insane useEffect ensures that the correct tab is selected when the url updates
  useEffect(() => {
    const {
      project,
      environment: env,
      start,
      end,
      statsPeriod,
      utc,
    } = router.location.query;
    const {queryProjects, queryEnvs} = normalizeProjectsEnvironments(project, env);
    const queryTimeFilters =
      start || end || statsPeriod || utc
        ? {
            start: statsPeriod ? null : start,
            end: statsPeriod ? null : end,
            period: statsPeriod,
            utc: statsPeriod ? null : utc,
          }
        : undefined;
    if (!viewId) {
      const {
        id,
        query: viewQuery,
        querySort,
        projects,
        environments,
        timeFilters,
      } = views[0]!;
      if (!query && !sort) {
        if (queryProjects || queryTimeFilters) {
          navigate(
            normalizeUrl({
              ...location,
              query: {
                ...router.location.query,
                viewId: id,
                query: query ?? viewQuery,
                sort: sort ?? querySort,
                project: queryProjects ?? projects,
                environment: queryEnvs ?? environments,
                ...normalizeDateTimeParams(queryTimeFilters ?? timeFilters),
              },
            }),
            {replace: true}
          );
        } else {
          navigate(
            normalizeUrl({
              ...location,
              query: {
                ...router.location.query,
                viewId: id,
                query: viewQuery,
                sort: querySort,
                project: projects,
                environment: environments,
                ...normalizeDateTimeParams(timeFilters),
              },
            }),
            {replace: true}
          );
        }
        tabListState?.setSelectedKey(views[0]!.key);
        return;
      }
    }
    // if a viewId is present, check the frontend is aware of a view with that id.
    if (viewId) {
      const selectedView = views.find(tab => tab.id === viewId);
      if (selectedView) {
        // If the frontend is aware of a view with that id, check if the query/sort is different
        // from the view's original query/sort.
        const {
          query: originalQuery,
          querySort: originalSort,
          projects: originalProjects,
          environments: originalEnvironments,
          timeFilters: originalTimeFilters,
        } = selectedView;

        const issueSortOption = Object.values(IssueSortOptions).includes(sort)
          ? (sort as IssueSortOptions)
          : undefined;

        const newUnsavedChanges: Partial<IssueViewParams> = {
          query: query === originalQuery ? undefined : query,
          querySort: sort === originalSort ? undefined : issueSortOption,
          projects: isEqual((queryProjects ?? []).sort(), originalProjects.sort())
            ? undefined
            : (queryProjects ?? []),
          environments: isEqual((queryEnvs ?? []).sort(), originalEnvironments.sort())
            ? undefined
            : (queryEnvs ?? []),
          timeFilters:
            queryTimeFilters &&
            isEqual(
              normalizeDateTimeParams(originalTimeFilters),
              normalizeDateTimeParams(queryTimeFilters)
            )
              ? undefined
              : queryTimeFilters,
        };
        const hasNoChanges = Object.values(newUnsavedChanges).every(
          value => value === undefined
        );

        if (!hasNoChanges && !isEqual(selectedView.unsavedChanges, newUnsavedChanges)) {
          // If there were no unsaved changes before, or the existing unsaved changes
          // don't match the new query and/or sort, update the unsaved changes
          dispatch({
            type: 'UPDATE_UNSAVED_CHANGES',
            unsavedChanges: newUnsavedChanges,
          });
        } else if (hasNoChanges && selectedView.unsavedChanges) {
          // If all view params are the same as the original view params, remove any unsaved changes
          dispatch({type: 'UPDATE_UNSAVED_CHANGES', unsavedChanges: undefined});
        }
        if (!tabListState?.selectionManager.isSelected(selectedView.key)) {
          navigate(
            normalizeUrl({
              ...location,
              query: {
                ...router.location.query,
                viewId: selectedView.id,
                query: newUnsavedChanges.query ?? selectedView.query,
                sort: newUnsavedChanges.querySort ?? selectedView.querySort,
                project: newUnsavedChanges.projects ?? selectedView.projects,
                environment: newUnsavedChanges.environments ?? selectedView.environments,
                ...normalizeDateTimeParams(
                  newUnsavedChanges.timeFilters ?? selectedView.timeFilters
                ),
              },
            }),
            {replace: true}
          );
          tabListState?.setSelectedKey(selectedView.key);
        }
      } else {
        // if the viewId isn't found in this user's views, remove it from the query
        tabListState?.setSelectedKey(TEMPORARY_TAB_KEY);
        navigate(
          normalizeUrl({
            ...location,
            query: {
              ...router.location.query,
              viewId: undefined,
              project: project ?? defaultProject,
              environment: env ?? DEFAULT_ENVIRONMENTS,
              ...normalizeDateTimeParams(queryTimeFilters ?? DEFAULT_TIME_FILTERS),
            },
          }),
          {replace: true}
        );
        trackAnalytics('issue_views.shared_view_opened', {
          organization,
          query,
        });
      }
      return;
    }
    if (query) {
      if (!tabListState?.selectionManager.isSelected(TEMPORARY_TAB_KEY)) {
        dispatch({type: 'SET_TEMP_VIEW', query, sort});
        navigate(
          normalizeUrl({
            ...location,
            query: {
              ...router.location.query,
              viewId: undefined,
            },
          }),
          {replace: true}
        );
        tabListState?.setSelectedKey(TEMPORARY_TAB_KEY);
        return;
      }
    }
  }, [
    defaultProject,
    dispatch,
    location,
    navigate,
    organization,
    query,
    router.location.query,
    sort,
    tabListState,
    viewId,
    views,
  ]);

  // This useEffect ensures the "new view" page is displayed/hidden correctly
  useEffect(() => {
    if (viewId?.startsWith('_')) {
      if (views.find(tab => tab.id === viewId)?.isCommitted) {
        return;
      }
      // If the user types in query manually while the new view flow is showing,
      // then replace the add view flow with the issue stream with the query loaded,
      // and persist the query
      if (newViewActive && query !== '') {
        setNewViewActive(false);
        dispatch({
          type: 'UPDATE_UNSAVED_CHANGES',
          unsavedChanges: {query, querySort: sort ?? IssueSortOptions.DATE},
          isCommitted: true,
          syncViews: true,
        });
        trackAnalytics('issue_views.add_view.custom_query_saved', {
          organization,
          query,
        });
      } else {
        setNewViewActive(true);
      }
    } else {
      setNewViewActive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId, query]);

  const issuesViewSaveHotkeys = useMemo(() => {
    return [
      {
        match: ['command+s', 'ctrl+s'],
        includeInputs: true,
        callback: () => {
          if (views.find(tab => tab.key === tabListState?.selectedKey)?.unsavedChanges) {
            dispatch({type: 'SAVE_CHANGES', syncViews: true});
            addSuccessMessage(t('Changes saved to view'));
          }
        },
      },
    ];
  }, [dispatch, tabListState?.selectedKey, views]);

  useHotkeys(issuesViewSaveHotkeys);

  const handleCreateNewView = () => {
    const tempId = generateTempViewId();
    dispatch({type: 'CREATE_NEW_VIEW', tempId});
    tabListState?.setSelectedKey(tempId);
    navigate({
      ...location,
      query: {
        ...router.location.query,
        query: '',
        viewId: tempId,
        project: defaultProject,
        environment: DEFAULT_ENVIRONMENTS,
        ...normalizeDateTimeParams(DEFAULT_TIME_FILTERS),
      },
    });
  };

  const allTabs = tempView ? [...views, tempView] : views;

  const initialTabKey =
    viewId && views.some(tab => tab.id === viewId)
      ? views.find(tab => tab.id === viewId)!.key
      : query
        ? TEMPORARY_TAB_KEY
        : views[0]!.key;

  return (
    <DraggableTabList
      onReorder={(newOrder: Array<Node<DraggableTabListItemProps>>) =>
        dispatch({
          type: 'REORDER_TABS',
          newKeyOrder: newOrder.map(node => node.key.toString()),
        })
      }
      onReorderComplete={() => dispatch({type: 'SYNC_VIEWS_TO_BACKEND'})}
      defaultSelectedKey={initialTabKey}
      onAddView={handleCreateNewView}
      orientation="horizontal"
      editingTabKey={editingTabKey ?? undefined}
      hideBorder
    >
      {allTabs.map(view => (
        <DraggableTabList.Item
          textValue={view.label}
          key={view.key}
          to={normalizeUrl({
            query: {
              ...router.location.query,
              query: view.unsavedChanges?.query ?? view.query,
              sort: view.unsavedChanges?.querySort ?? view.querySort,
              viewId: view.id === TEMPORARY_TAB_KEY ? undefined : view.id,
              project: view.unsavedChanges?.projects ?? view.projects,
              environment: view.unsavedChanges?.environments ?? view.environments,
              ...normalizeDateTimeParams(
                view.unsavedChanges?.timeFilters ?? view.timeFilters
              ),
              cursor: undefined,
              page: undefined,
            },
            pathname: `/organizations/${organization.slug}/issues/`,
          })}
          disabled={view.key === editingTabKey}
        >
          <IssueViewTab
            key={view.key}
            view={view}
            initialTabKey={initialTabKey}
            router={router}
            editingTabKey={editingTabKey}
            setEditingTabKey={setEditingTabKey}
          />
        </DraggableTabList.Item>
      ))}
    </DraggableTabList>
  );
}

export default IssueViewsIssueListHeader;

/**
 * Normalizes the project and environment query params to arrays of strings and numbers.
 * If project/environemnts is undefined, it equates to an empty array. If it is a single value,
 * it is converted to single element array.
 */
const normalizeProjectsEnvironments = (
  project: string[] | string | undefined,
  env: string[] | string | undefined
): {queryEnvs: string[] | undefined; queryProjects: number[] | undefined} => {
  let queryProjects: number[] | undefined = undefined;
  if (Array.isArray(project)) {
    queryProjects = project.map(p => parseInt(p, 10)).filter(p => !isNaN(p));
  } else if (project) {
    const parsed = parseInt(project, 10);
    if (!isNaN(parsed)) {
      queryProjects = [parsed];
    }
  }

  let queryEnvs: string[] | undefined = undefined;
  if (Array.isArray(env)) {
    queryEnvs = env;
  } else if (env) {
    queryEnvs = [env];
  }

  return {queryEnvs, queryProjects};
};

const StyledIssueViews = styled(IssueViews)`
  grid-column: 1 / -1;
`;

const StyledGlobalEventProcessingAlert = styled(GlobalEventProcessingAlert)`
  grid-column: 1/-1;
  margin-top: ${space(1)};
  margin-bottom: ${space(1)};

  @media (min-width: ${p => p.theme.breakpoints.medium}) {
    margin-top: ${space(2)};
    margin-bottom: 0;
  }
`;

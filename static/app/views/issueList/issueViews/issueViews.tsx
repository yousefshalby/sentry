import type {Dispatch, Reducer} from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import {css} from '@emotion/react';
import styled from '@emotion/styled';
import type {TabListState} from '@react-stately/tabs';
import type {Orientation} from '@react-types/shared';
import debounce from 'lodash/debounce';

import type {TabContext, TabsProps} from 'sentry/components/tabs';
import {tabsShouldForwardProp} from 'sentry/components/tabs/utils';
import {t} from 'sentry/locale';
import type {PageFilters} from 'sentry/types/core';
import type {InjectedRouter} from 'sentry/types/legacyReactRouter';
import {defined} from 'sentry/utils';
import {trackAnalytics} from 'sentry/utils/analytics';
import {isActiveSuperuser} from 'sentry/utils/isActiveSuperuser';
import normalizeUrl from 'sentry/utils/url/normalizeUrl';
import {useNavigate} from 'sentry/utils/useNavigate';
import useOrganization from 'sentry/utils/useOrganization';
import useProjects from 'sentry/utils/useProjects';
import {useUser} from 'sentry/utils/useUser';
import {useUpdateGroupSearchViews} from 'sentry/views/issueList/mutations/useUpdateGroupSearchViews';
import type {
  GroupSearchView,
  UpdateGroupSearchViewPayload,
} from 'sentry/views/issueList/types';
import {IssueSortOptions} from 'sentry/views/issueList/utils';
import {NewTabContext, type NewView} from 'sentry/views/issueList/utils/newTabContext';

export const TEMPORARY_TAB_KEY = 'temporary-tab';

export const DEFAULT_TIME_FILTERS: PageFilters['datetime'] = {
  start: null,
  end: null,
  period: '14d',
  utc: null,
};
export const DEFAULT_ENVIRONMENTS: string[] = [];

export const generateTempViewId = () => `_${Math.random().toString().substring(2, 7)}`;

/**
 * Savable properties of an IssueView, besides lable and position.
 * Changes to these properties are not automatically saved and can
 * trigger the unsaved changes indicator.
 */
export interface IssueViewParams {
  environments: string[];
  projects: number[];
  query: string;
  querySort: IssueSortOptions;
  timeFilters: PageFilters['datetime'];
}

export interface IssueView extends IssueViewParams {
  id: string;
  /**
   * False for tabs that were added view the "Add View" button, but
   * have not been edited in any way. Only tabs with isCommitted=true
   * will be saved to the backend.
   */
  isCommitted: boolean;
  key: string;
  label: string;
  content?: React.ReactNode;
  unsavedChanges?: Partial<IssueViewParams>;
}

type BaseIssueViewsAction = {
  /** If true, the new views state created by the action will be synced to the backend */
  syncViews?: boolean;
};

type ReorderTabsAction = {
  newKeyOrder: string[];
  type: 'REORDER_TABS';
} & BaseIssueViewsAction;

type SaveChangesAction = {
  type: 'SAVE_CHANGES';
} & BaseIssueViewsAction;

type DiscardChangesAction = {
  type: 'DISCARD_CHANGES';
} & BaseIssueViewsAction;

type RenameTabAction = {
  newLabel: string;
  type: 'RENAME_TAB';
} & BaseIssueViewsAction;

type DuplicateViewAction = {
  newViewId: string;
  type: 'DUPLICATE_VIEW';
} & BaseIssueViewsAction;

type DeleteViewAction = {
  type: 'DELETE_VIEW';
} & BaseIssueViewsAction;

type CreateNewViewAction = {
  tempId: string;
  type: 'CREATE_NEW_VIEW';
} & BaseIssueViewsAction;

type SetTempViewAction = {
  query: string;
  sort: IssueSortOptions;
  type: 'SET_TEMP_VIEW';
} & BaseIssueViewsAction;

type DiscardTempViewAction = {
  type: 'DISCARD_TEMP_VIEW';
} & BaseIssueViewsAction;

type SaveTempViewAction = {
  newViewId: string;
  type: 'SAVE_TEMP_VIEW';
} & BaseIssueViewsAction;

type UpdateUnsavedChangesAction = {
  type: 'UPDATE_UNSAVED_CHANGES';
  // Explicitly typed as | undefined instead of optional to make it clear that `undefined` = no unsaved changes
  unsavedChanges: Partial<IssueViewParams> | undefined;
  isCommitted?: boolean;
} & BaseIssueViewsAction;

type UpdateViewIdsAction = {
  newViews: UpdateGroupSearchViewPayload[];
  type: 'UPDATE_VIEW_IDS';
} & BaseIssueViewsAction;

type SetViewsAction = {
  type: 'SET_VIEWS';
  views: IssueView[];
} & BaseIssueViewsAction;

type SyncViewsToBackendAction = {
  /** Syncs the current views state to the backend. Does not make any changes to the views state. */
  type: 'SYNC_VIEWS_TO_BACKEND';
};

type IssueViewsActions =
  | ReorderTabsAction
  | SaveChangesAction
  | DiscardChangesAction
  | RenameTabAction
  | DuplicateViewAction
  | DeleteViewAction
  | CreateNewViewAction
  | SetTempViewAction
  | DiscardTempViewAction
  | SaveTempViewAction
  | UpdateUnsavedChangesAction
  | UpdateViewIdsAction
  | SetViewsAction
  | SyncViewsToBackendAction;

const ACTION_ANALYTICS_MAP: Partial<Record<IssueViewsActions['type'], string>> = {
  REORDER_TABS: 'issue_views.reordered_views',
  SAVE_CHANGES: 'issue_views.saved_changes',
  DISCARD_CHANGES: 'issue_views.discarded_changes',
  RENAME_TAB: 'issue_views.renamed_view',
  DUPLICATE_VIEW: 'issue_views.duplicated_view',
  DELETE_VIEW: 'issue_views.deleted_view',
  SAVE_TEMP_VIEW: 'issue_views.temp_view_saved',
  DISCARD_TEMP_VIEW: 'issue_views.temp_view_discarded',
  CREATE_NEW_VIEW: 'issue_views.add_view.clicked',
};

interface IssueViewsState {
  views: IssueView[];
  tempView?: IssueView;
}

interface IssueViewsContextType extends TabContext {
  defaultProject: number[];
  dispatch: Dispatch<IssueViewsActions>;
  state: IssueViewsState;
}

export const IssueViewsContext = createContext<IssueViewsContextType>({
  rootProps: {orientation: 'horizontal'},
  setTabListState: () => {},
  // Issue Views specific state
  dispatch: () => {},
  state: {views: []},
  defaultProject: [],
});

function reorderTabs(state: IssueViewsState, action: ReorderTabsAction) {
  const newTabs: IssueView[] = action.newKeyOrder
    .map(key => {
      const foundTab = state.views.find(tab => tab.key === key);
      return foundTab?.key === key ? foundTab : null;
    })
    .filter(defined);
  return {...state, views: newTabs};
}

function saveChanges(state: IssueViewsState, tabListState: TabListState<any>) {
  const originalTab = state.views.find(tab => tab.key === tabListState?.selectedKey);
  if (originalTab) {
    const newViews = state.views.map(tab => {
      return tab.key === tabListState?.selectedKey && tab.unsavedChanges
        ? {
            ...tab,
            query: tab.unsavedChanges.query ?? tab.query,
            querySort: tab.unsavedChanges.querySort ?? tab.querySort,
            projects: tab.unsavedChanges.projects ?? tab.projects,
            environments: tab.unsavedChanges.environments ?? tab.environments,
            timeFilters: tab.unsavedChanges.timeFilters ?? tab.timeFilters,
            unsavedChanges: undefined,
          }
        : tab;
    });
    return {...state, views: newViews};
  }
  return state;
}

function discardChanges(state: IssueViewsState, tabListState: TabListState<any>) {
  const originalTab = state.views.find(tab => tab.key === tabListState?.selectedKey);
  if (originalTab) {
    const newViews = state.views.map(tab => {
      return tab.key === tabListState?.selectedKey
        ? {...tab, unsavedChanges: undefined}
        : tab;
    });
    return {...state, views: newViews};
  }
  return state;
}

function renameView(
  state: IssueViewsState,
  action: RenameTabAction,
  tabListState: TabListState<any>
) {
  const renamedTab = state.views.find(tab => tab.key === tabListState?.selectedKey);
  if (renamedTab && action.newLabel !== renamedTab.label) {
    const newViews = state.views.map(tab =>
      tab.key === renamedTab.key
        ? {...tab, label: action.newLabel, isCommitted: true}
        : tab
    );
    return {...state, views: newViews};
  }
  return state;
}

function duplicateView(
  state: IssueViewsState,
  action: DuplicateViewAction,
  tabListState: TabListState<any>
) {
  const idx = state.views.findIndex(tb => tb.key === tabListState?.selectedKey);
  if (idx !== -1) {
    const duplicatedTab = state.views[idx]!;
    const newTabs: IssueView[] = [
      ...state.views.slice(0, idx + 1),
      {
        ...duplicatedTab,
        id: action.newViewId,
        key: action.newViewId,
        label: `${duplicatedTab.label} (Copy)`,
        isCommitted: true,
      },
      ...state.views.slice(idx + 1),
    ];
    return {...state, views: newTabs};
  }
  return state;
}

function deleteView(state: IssueViewsState, tabListState: TabListState<any>) {
  const newViews = state.views.filter(tab => tab.key !== tabListState?.selectedKey);
  return {...state, views: newViews};
}

function createNewView(
  state: IssueViewsState,
  action: CreateNewViewAction,
  defaultProject: number[]
) {
  const newTabs: IssueView[] = [
    ...state.views,
    {
      id: action.tempId,
      key: action.tempId,
      label: 'New View',
      query: '',
      querySort: IssueSortOptions.DATE,
      isCommitted: false,
      environments: DEFAULT_ENVIRONMENTS,
      projects: defaultProject,
      timeFilters: DEFAULT_TIME_FILTERS,
    },
  ];
  return {...state, views: newTabs};
}

function setTempView(
  state: IssueViewsState,
  action: SetTempViewAction,
  defaultProject: number[]
) {
  const tempView: IssueView = {
    id: TEMPORARY_TAB_KEY,
    key: TEMPORARY_TAB_KEY,
    label: t('Unsaved'),
    query: action.query,
    querySort: action.sort ?? IssueSortOptions.DATE,
    isCommitted: true,
    environments: DEFAULT_ENVIRONMENTS,
    projects: defaultProject,
    timeFilters: DEFAULT_TIME_FILTERS,
  };
  return {...state, tempView};
}

function discardTempView(state: IssueViewsState, tabListState: TabListState<any>) {
  tabListState?.setSelectedKey(state.views[0]!.key);
  return {...state, tempView: undefined};
}

function saveTempView(
  state: IssueViewsState,
  action: SaveTempViewAction,
  tabListState: TabListState<any>
) {
  if (state.tempView) {
    const newTab: IssueView = {
      id: action.newViewId,
      key: action.newViewId,
      label: 'New View',
      query: state.tempView?.query,
      querySort: state.tempView?.querySort,
      isCommitted: true,
      environments: state.tempView?.environments,
      projects: state.tempView?.projects,
      timeFilters: state.tempView?.timeFilters,
    };
    tabListState?.setSelectedKey(action.newViewId);
    return {...state, views: [...state.views, newTab], tempView: undefined};
  }
  return state;
}

function updateUnsavedChanges(
  state: IssueViewsState,
  action: UpdateUnsavedChangesAction,
  tabListState: TabListState<any>
) {
  return {
    ...state,
    views: state.views.map(tab =>
      tab.key === tabListState?.selectedKey
        ? {
            ...tab,
            unsavedChanges: action.unsavedChanges,
            isCommitted: action.isCommitted ?? tab.isCommitted,
          }
        : tab
    ),
  };
}

function updateViewIds(state: IssueViewsState, action: UpdateViewIdsAction) {
  const assignedIds = new Set();
  const updatedViews = state.views.map(tab => {
    if (tab.id && tab.id[0] === '_') {
      const matchingView = action.newViews.find(
        view =>
          view.id &&
          !assignedIds.has(view.id) &&
          tab.query === view.query &&
          tab.querySort === view.querySort &&
          tab.label === view.name
      );
      if (matchingView?.id) {
        assignedIds.add(matchingView.id);
        return {...tab, id: matchingView.id};
      }
    }
    return tab;
  });
  return {...state, views: updatedViews};
}

function setViews(state: IssueViewsState, action: SetViewsAction) {
  return {...state, views: action.views};
}

interface IssueViewsStateProviderProps extends Omit<TabsProps<any>, 'children'> {
  children: React.ReactNode;
  initialViews: IssueView[];
  // TODO(msun): Replace router with useLocation() / useUrlParams() / useSearchParams() in the future
  router: InjectedRouter;
}

function IssueViewsStateProvider({
  children,
  initialViews,
  router,
  ...props
}: IssueViewsStateProviderProps) {
  const navigate = useNavigate();
  const organization = useOrganization();
  const {setNewViewActive, setOnNewViewsSaved} = useContext(NewTabContext);
  const [tabListState, setTabListState] = useState<TabListState<any>>();
  const {className: _className, ...restProps} = props;

  const allowMultipleProjects = organization.features.includes('global-views');
  const user = useUser();
  const isSuperUser = isActiveSuperuser();

  const {projects: allProjects} = useProjects();
  const memberProjects = useMemo(
    () => allProjects.filter(project => project.isMember),
    [allProjects]
  );
  const defaultProject = useMemo(() => {
    // Should not be possible for member projects to be empty
    if (allowMultipleProjects) {
      return [];
    }

    if (isSuperUser) {
      return allowMultipleProjects ? [] : [parseInt(allProjects[0]!.id, 10)];
    }

    return [parseInt(memberProjects[0]!.id, 10)];
  }, [memberProjects, allowMultipleProjects, isSuperUser, allProjects]);

  const {query, sort, viewId} = router.location.query;

  // This function is fired upon receiving new views from the backend - it replaces any previously
  // generated temporary view ids with the permanent view ids from the backend
  const replaceWithPersistentViewIds = (views: GroupSearchView[]) => {
    const newlyCreatedViews = views.filter(
      view => !state.views.some(tab => tab.id === view.id)
    );
    if (newlyCreatedViews.length > 0) {
      dispatch({type: 'UPDATE_VIEW_IDS', newViews: newlyCreatedViews});
      const currentView = state.views.find(tab => tab.id === viewId);

      if (viewId?.startsWith('_') && currentView) {
        const matchingView = newlyCreatedViews.find(
          view =>
            view.id &&
            currentView.query === view.query &&
            currentView.querySort === view.querySort
        );
        if (matchingView?.id) {
          navigate(
            normalizeUrl({
              ...location,
              query: {
                ...router.location.query,
                viewId: matchingView.id,
              },
            }),
            {replace: true}
          );
        }
      }
    }
    return;
  };

  const {mutate: updateViews} = useUpdateGroupSearchViews({
    onSuccess: replaceWithPersistentViewIds,
  });

  const debounceUpdateViews = useMemo(
    () =>
      debounce((newTabs: IssueView[]) => {
        if (newTabs) {
          updateViews({
            orgSlug: organization.slug,
            groupSearchViews: newTabs
              .filter(tab => tab.isCommitted)
              .map(tab => ({
                // Do not send over an ID if it's a temporary or default tab so that
                // the backend will save these and generate permanent Ids for them
                ...(tab.id[0] !== '_' && !tab.id.startsWith('default')
                  ? {id: tab.id}
                  : {}),
                name: tab.label,
                query: tab.query,
                querySort: tab.querySort,
                projects: tab.projects,
                environments: tab.environments,
                timeFilters: tab.timeFilters,
                starred: true,
                createdBy: user,
                stars: 0,
              })),
          });
        }
      }, 500),
    [organization.slug, updateViews, user]
  );

  const reducer: Reducer<IssueViewsState, IssueViewsActions> = useCallback(
    (state, action): IssueViewsState => {
      if (!tabListState) {
        return state;
      }
      switch (action.type) {
        case 'REORDER_TABS':
          return reorderTabs(state, action);
        case 'SAVE_CHANGES':
          return saveChanges(state, tabListState);
        case 'DISCARD_CHANGES':
          return discardChanges(state, tabListState);
        case 'RENAME_TAB':
          return renameView(state, action, tabListState);
        case 'DUPLICATE_VIEW':
          return duplicateView(state, action, tabListState);
        case 'DELETE_VIEW':
          return deleteView(state, tabListState);
        case 'CREATE_NEW_VIEW':
          return createNewView(state, action, defaultProject);
        case 'SET_TEMP_VIEW':
          return setTempView(state, action, defaultProject);
        case 'DISCARD_TEMP_VIEW':
          return discardTempView(state, tabListState);
        case 'SAVE_TEMP_VIEW':
          return saveTempView(state, action, tabListState);
        case 'UPDATE_UNSAVED_CHANGES':
          return updateUnsavedChanges(state, action, tabListState);
        case 'UPDATE_VIEW_IDS':
          return updateViewIds(state, action);
        case 'SET_VIEWS':
          return setViews(state, action);
        case 'SYNC_VIEWS_TO_BACKEND':
          return state;
        default:
          return state;
      }
    },
    [tabListState, defaultProject]
  );

  const sortOption =
    sort && Object.values(IssueSortOptions).includes(sort.toString() as IssueSortOptions)
      ? (sort.toString() as IssueSortOptions)
      : IssueSortOptions.DATE;

  const initialTempView: IssueView | undefined =
    query && (!viewId || !initialViews.some(tab => tab.id === viewId))
      ? {
          id: TEMPORARY_TAB_KEY,
          key: TEMPORARY_TAB_KEY,
          label: t('Unsaved'),
          query: query.toString(),
          querySort: sortOption,
          isCommitted: true,
          environments: DEFAULT_ENVIRONMENTS,
          projects: defaultProject,
          timeFilters: DEFAULT_TIME_FILTERS,
        }
      : undefined;

  const [state, dispatch] = useReducer(reducer, {
    views: initialViews,
    tempView: initialTempView,
  });

  const dispatchWrapper = (action: IssueViewsActions) => {
    const newState = reducer(state, action);
    dispatch(action);

    if (action.type === 'SYNC_VIEWS_TO_BACKEND' || action.syncViews) {
      debounceUpdateViews(newState.views);
    }

    const actionAnalyticsKey = ACTION_ANALYTICS_MAP[action.type];
    if (actionAnalyticsKey) {
      trackAnalytics(actionAnalyticsKey, {
        organization,
      });
    }
  };

  const handleNewViewsSaved: NewTabContext['onNewViewsSaved'] = useCallback<
    NewTabContext['onNewViewsSaved']
  >(
    () => (newViews: NewView[]) => {
      if (newViews.length === 0) {
        return;
      }
      setNewViewActive(false);
      const {label, query: newQuery, saveQueryToView} = newViews[0]!;
      const remainingNewViews: IssueView[] = newViews.slice(1)?.map(view => {
        const newId = generateTempViewId();
        const viewToTab: IssueView = {
          id: newId,
          key: newId,
          label: view.label,
          query: view.query,
          querySort: IssueSortOptions.DATE,
          unsavedChanges: view.saveQueryToView
            ? undefined
            : {
                query: view.query,
                querySort: IssueSortOptions.DATE,
                environments: DEFAULT_ENVIRONMENTS,
                projects: defaultProject,
                timeFilters: DEFAULT_TIME_FILTERS,
              },
          environments: DEFAULT_ENVIRONMENTS,
          projects: defaultProject,
          timeFilters: DEFAULT_TIME_FILTERS,
          isCommitted: true,
        };
        return viewToTab;
      });
      let updatedTabs: IssueView[] = state.views.map(tab => {
        if (tab.key === viewId) {
          return {
            ...tab,
            label,
            query: saveQueryToView ? newQuery : '',
            querySort: IssueSortOptions.DATE,
            unsavedChanges: saveQueryToView
              ? undefined
              : {
                  query,
                  querySort: IssueSortOptions.DATE,
                  environments: DEFAULT_ENVIRONMENTS,
                  projects: defaultProject,
                  timeFilters: DEFAULT_TIME_FILTERS,
                },
            isCommitted: true,
            environments: DEFAULT_ENVIRONMENTS,
            projects: defaultProject,
            timeFilters: DEFAULT_TIME_FILTERS,
          };
        }
        return tab;
      });

      if (remainingNewViews.length > 0) {
        updatedTabs = [...updatedTabs, ...remainingNewViews];
      }

      dispatch({type: 'SET_VIEWS', views: updatedTabs, syncViews: true});
      navigate(
        {
          ...location,
          query: {
            ...router.location.query,
            query: newQuery,
            sort: IssueSortOptions.DATE,
          },
        },
        {replace: true}
      );
    },

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location, navigate, setNewViewActive, state.views, viewId]
  );

  useEffect(() => {
    setOnNewViewsSaved(handleNewViewsSaved);
  }, [setOnNewViewsSaved, handleNewViewsSaved]);

  return (
    <IssueViewsContext
      value={{
        rootProps: {...restProps, orientation: 'horizontal'},
        tabListState,
        setTabListState,
        defaultProject,
        dispatch: dispatchWrapper,
        state,
      }}
    >
      {children}
    </IssueViewsContext>
  );
}

export function IssueViews<T extends string | number>({
  orientation = 'horizontal',
  className,
  children,
  initialViews,
  router,
  ...props
}: TabsProps<T> & Omit<IssueViewsStateProviderProps, 'children'>) {
  return (
    <IssueViewsStateProvider initialViews={initialViews} router={router} {...props}>
      <TabsWrap orientation={orientation} className={className}>
        {children}
      </TabsWrap>
    </IssueViewsStateProvider>
  );
}

const TabsWrap = styled('div', {shouldForwardProp: tabsShouldForwardProp})<{
  orientation: Orientation;
}>`
  display: flex;
  flex-direction: ${p => (p.orientation === 'horizontal' ? 'column' : 'row')};
  flex-grow: 1;

  ${p =>
    p.orientation === 'vertical' &&
    css`
      height: 100%;
      align-items: stretch;
    `};
`;

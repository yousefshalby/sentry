import {Fragment} from 'react';
import styled from '@emotion/styled';

import RadioGroup, {type RadioOption} from 'sentry/components/forms/controls/radioGroup';
import ExternalLink from 'sentry/components/links/externalLink';
import {t, tct} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import {trackAnalytics} from 'sentry/utils/analytics';
import {WidgetBuilderVersion} from 'sentry/utils/analytics/dashboardsAnalyticsEvents';
import useOrganization from 'sentry/utils/useOrganization';
import {WidgetType} from 'sentry/views/dashboards/types';
import {SectionHeader} from 'sentry/views/dashboards/widgetBuilder/components/common/sectionHeader';
import {useWidgetBuilderContext} from 'sentry/views/dashboards/widgetBuilder/contexts/widgetBuilderContext';
import useDashboardWidgetSource from 'sentry/views/dashboards/widgetBuilder/hooks/useDashboardWidgetSource';
import useIsEditingWidget from 'sentry/views/dashboards/widgetBuilder/hooks/useIsEditingWidget';
import {BuilderStateAction} from 'sentry/views/dashboards/widgetBuilder/hooks/useWidgetBuilderState';

function WidgetBuilderDatasetSelector() {
  const organization = useOrganization();
  const {state, dispatch} = useWidgetBuilderContext();
  const source = useDashboardWidgetSource();
  const isEditing = useIsEditingWidget();

  const datasetChoices: Array<RadioOption<WidgetType>> = [];
  datasetChoices.push([WidgetType.ERRORS, t('Errors')]);
  datasetChoices.push([WidgetType.TRANSACTIONS, t('Transactions')]);

  if (organization.features.includes('visibility-explore-view')) {
    datasetChoices.push([WidgetType.SPANS, t('Spans')]);
  }
  datasetChoices.push([WidgetType.ISSUE, t('Issues')]);
  datasetChoices.push([WidgetType.RELEASE, t('Releases')]);

  return (
    <Fragment>
      <StyledSectionHeader
        title={t('Dataset')}
        tooltipText={tct(
          `This reflects the type of information you want to use. To learn more, [link: read the docs].`,
          {
            link: (
              <ExternalLink href="https://docs.sentry.io/product/dashboards/widget-builder/#choose-your-dataset" />
            ),
          }
        )}
      />
      <DatasetChoices
        label={t('Dataset')}
        value={state.dataset ?? WidgetType.ERRORS}
        choices={datasetChoices}
        onChange={(newValue: WidgetType) => {
          dispatch({
            type: BuilderStateAction.SET_DATASET,
            payload: newValue,
          });
          trackAnalytics('dashboards_views.widget_builder.change', {
            from: source,
            widget_type: state.dataset ?? '',
            builder_version: WidgetBuilderVersion.SLIDEOUT,
            field: 'dataSet',
            value: newValue,
            new_widget: !isEditing,
            organization,
          });
        }}
      />
    </Fragment>
  );
}

export default WidgetBuilderDatasetSelector;

const DatasetChoices = styled(RadioGroup<WidgetType>)`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${space(2)};
`;

const StyledSectionHeader = styled(SectionHeader)`
  margin-bottom: ${space(1)};
`;

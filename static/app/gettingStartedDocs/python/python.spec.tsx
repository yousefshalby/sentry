import {OrganizationFixture} from 'sentry-fixture/organization';

import {renderWithOnboardingLayout} from 'sentry-test/onboarding/renderWithOnboardingLayout';
import {screen} from 'sentry-test/reactTestingLibrary';
import {textWithMarkupMatcher} from 'sentry-test/utils';

import docs from './python';

describe('python onboarding docs', function () {
  it('renders doc correctly', function () {
    renderWithOnboardingLayout(docs);

    // Renders main headings
    expect(screen.getByRole('heading', {name: 'Install'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Configure SDK'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Verify'})).toBeInTheDocument();
  });

  it('renders without tracing', function () {
    renderWithOnboardingLayout(docs, {
      selectedProducts: [],
    });

    // Does not render config option
    expect(
      screen.queryByText(textWithMarkupMatcher(/profiles_sample_rate=1\.0,/))
    ).not.toBeInTheDocument();

    // Does not render config option
    expect(
      screen.queryByText(textWithMarkupMatcher(/traces_sample_rate=1\.0,/))
    ).not.toBeInTheDocument();
  });

  it('renders transaction profiling', function () {
    renderWithOnboardingLayout(docs);

    // Does not render continuous profiling config
    expect(
      screen.queryByText(textWithMarkupMatcher(/profile_session_sample_rate=1\.0,/))
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(textWithMarkupMatcher(/sentry_sdk.profiler.start_profiler\(\)/))
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(textWithMarkupMatcher(/sentry_sdk.profiler.stop_profiler\(\)/))
    ).not.toBeInTheDocument();

    // Does render transaction profiling config
    expect(
      screen.getByText(textWithMarkupMatcher(/profiles_sample_rate=1\.0,/))
    ).toBeInTheDocument();
  });

  it('renders continuous profiling', function () {
    const organization = OrganizationFixture({
      features: ['continuous-profiling'],
    });

    renderWithOnboardingLayout(
      docs,
      {},
      {
        organization,
      }
    );

    // Does not render transaction profiling config
    expect(
      screen.queryByText(textWithMarkupMatcher(/profiles_sample_rate=1\.0,/))
    ).not.toBeInTheDocument();

    // Does render continuous profiling config
    expect(
      screen.getByText(textWithMarkupMatcher(/profile_session_sample_rate=1\.0,/))
    ).toBeInTheDocument();
    expect(
      screen.getByText(textWithMarkupMatcher(/sentry_sdk.profiler.start_profiler\(\)/))
    ).toBeInTheDocument();
    expect(
      screen.getByText(textWithMarkupMatcher(/sentry_sdk.profiler.stop_profiler\(\)/))
    ).toBeInTheDocument();
  });
});

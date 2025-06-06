import * as Sentry from '@sentry/react';
import {OrganizationFixture} from 'sentry-fixture/organization';
import {ProjectFixture} from 'sentry-fixture/project';
import {RouterFixture} from 'sentry-fixture/routerFixture';

import {render, screen, userEvent, waitFor} from 'sentry-test/reactTestingLibrary';

import {trackAnalytics} from 'sentry/utils/analytics';
import CreateSampleEventButton from 'sentry/views/onboarding/createSampleEventButton';

jest.useFakeTimers();
jest.mock('sentry/utils/analytics');

describe('CreateSampleEventButton', function () {
  const router = RouterFixture();
  const org = OrganizationFixture();
  const project = ProjectFixture();
  const groupID = '123';
  const createSampleText = 'Create a sample event';

  function renderComponent() {
    return render(
      <CreateSampleEventButton
        source="test"
        project={{...project, platform: 'javascript'}}
      >
        {createSampleText}
      </CreateSampleEventButton>,
      {
        organization: org,
        router,
        deprecatedRouterMocks: true,
      }
    );
  }

  afterEach(function () {
    MockApiClient.clearMockResponses();
  });

  it('creates a sample event', async function () {
    renderComponent();
    const createRequest = MockApiClient.addMockResponse({
      url: `/projects/${org.slug}/${project.slug}/create-sample/`,
      method: 'POST',
      body: {groupID},
    });

    const sampleButton = await screen.findByRole('button', {name: createSampleText});
    await userEvent.click(sampleButton, {delay: null});

    // The button should be disabled while creating the event
    expect(sampleButton).toBeDisabled();

    // We have to await the API calls. We could normally do this using tick(),
    // however since we have enabled fake timers to handle the spin-wait on the
    // event creation, we cannot use tick.
    await Promise.resolve();
    expect(createRequest).toHaveBeenCalled();

    const latestIssueRequest = MockApiClient.addMockResponse({
      url: `/issues/${groupID}/events/latest/`,
      body: {},
    });

    // There is a timeout before we check for the existence of the latest
    // event. Wait for it then wait for the request to complete
    jest.runAllTimers();
    await waitFor(() => expect(latestIssueRequest).toHaveBeenCalled());

    // Wait for the api request and latestEventAvailable to resolve
    expect(sampleButton).toBeEnabled();

    expect(router.push).toHaveBeenCalledWith(
      `/organizations/${org.slug}/issues/${groupID}/?project=${project.id}&referrer=sample-error`
    );
  });

  it('waits for the latest event to be processed', async function () {
    renderComponent();
    const createRequest = MockApiClient.addMockResponse({
      url: `/projects/${org.slug}/${project.slug}/create-sample/`,
      method: 'POST',
      body: {groupID},
    });

    await userEvent.click(await screen.findByRole('button', {name: createSampleText}), {
      delay: null,
    });

    await waitFor(() => expect(createRequest).toHaveBeenCalled());

    // Start with no latest event
    let latestIssueRequest = MockApiClient.addMockResponse({
      url: `/issues/${groupID}/events/latest/`,
      statusCode: 404,
      body: {},
    });

    // Wait for the timeout once, the first request will 404
    jest.runAllTimers();
    await waitFor(() => expect(latestIssueRequest).toHaveBeenCalled());

    // Second request will be successful
    MockApiClient.clearMockResponses();
    latestIssueRequest = MockApiClient.addMockResponse({
      url: `/issues/${groupID}/events/latest/`,
      statusCode: 200,
      body: {},
    });

    jest.runAllTimers();
    await waitFor(() => expect(latestIssueRequest).toHaveBeenCalled());

    expect(router.push).toHaveBeenCalledWith(
      `/organizations/${org.slug}/issues/${groupID}/?project=${project.id}&referrer=sample-error`
    );

    expect(trackAnalytics).toHaveBeenCalledWith(
      'sample_event.created',
      expect.objectContaining({
        organization: expect.objectContaining(org),
        project_id: project.id,
        interval: 1000,
        retries: 1,
        source: 'test',
        platform: 'javascript',
      })
    );

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

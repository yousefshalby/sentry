import {render, screen, waitFor} from 'sentry-test/reactTestingLibrary';

import DiscoverQuery from 'sentry/utils/discover/discoverQuery';
import EventView from 'sentry/utils/discover/eventView';

describe('DiscoverQuery', function () {
  let location: any, eventView: any;
  beforeEach(() => {
    location = {
      pathname: '/events',
      query: {},
    };
    eventView = EventView.fromSavedQuery({
      id: '',
      name: 'test query',
      version: 2,
      fields: ['transaction', 'count()'],
      projects: [1],
      environment: ['dev'],
    });
  });

  it('fetches data on mount', async function () {
    const getMock = MockApiClient.addMockResponse({
      url: '/organizations/test-org/events/',
      body: {
        meta: {fields: {transaction: 'string', count: 'number'}},
        data: [{transaction: '/health', count: 1000}],
      },
    });
    render(
      <DiscoverQuery orgSlug="test-org" location={location} eventView={eventView}>
        {({tableData, isLoading}) => {
          if (isLoading) {
            return 'loading';
          }
          return <p>{tableData?.data[0]!.transaction}</p>;
        }}
      </DiscoverQuery>
    );

    // Children should be rendered, and API should be called.
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('/health')).toBeInTheDocument();
  });

  it('applies limit and cursor props', async function () {
    const getMock = MockApiClient.addMockResponse({
      url: '/organizations/test-org/events/',
      body: {
        meta: {fields: {transaction: 'string', count: 'number'}},
        data: [{transaction: '/health', count: 1000}],
      },
    });
    render(
      <DiscoverQuery
        orgSlug="test-org"
        location={location}
        eventView={eventView}
        limit={3}
        cursor="1:0:1"
      >
        {({tableData, isLoading}) => {
          if (isLoading) {
            return 'loading';
          }
          return <p>{tableData?.data[0]!.transaction}</p>;
        }}
      </DiscoverQuery>
    );

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(getMock).toHaveBeenCalledWith(
      '/organizations/test-org/events/',
      expect.objectContaining({
        method: 'GET',
        query: expect.objectContaining({
          per_page: 3,
          cursor: '1:0:1',
        }),
      })
    );
  });

  it('parses string errors correctly', async function () {
    MockApiClient.addMockResponse({
      url: '/organizations/test-org/events/',
      body: {
        detail: 'Error Message',
      },
      statusCode: 400,
    });

    let errorValue: any;
    render(
      <DiscoverQuery
        orgSlug="test-org"
        location={location}
        eventView={eventView}
        setError={e => (errorValue = e)}
      >
        {({isLoading}) => {
          if (isLoading) {
            return 'loading';
          }
          return null;
        }}
      </DiscoverQuery>
    );

    await waitFor(() => expect(errorValue.message).toBe('Error Message'));
  });

  it('parses object errors correctly', async function () {
    MockApiClient.addMockResponse({
      url: '/organizations/test-org/events/',
      body: {
        detail: {
          code: '?',
          message: 'Object Error',
          extra: {},
        },
      },
      statusCode: 400,
    });

    let errorValue: any;
    render(
      <DiscoverQuery
        orgSlug="test-org"
        location={location}
        eventView={eventView}
        setError={e => (errorValue = e)}
      >
        {({isLoading}) => {
          if (isLoading) {
            return 'loading';
          }
          return null;
        }}
      </DiscoverQuery>
    );

    await waitFor(() => expect(errorValue.message).toBe('Object Error'));
  });
});
